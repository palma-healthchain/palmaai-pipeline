# PalmaAI — API Contracts

> Version: 0.1.0
> Last updated: 2026-05-15

---

## Overview

PalmaAI has three external API surfaces:
1. **Inbound** — three input channels receiving FHIR data
2. **HealthChain Core** — the smart contract interface for Merkle anchoring
3. **Patient Wallet / OID4VCI** — credential delivery to the patient

---

## 1. Inbound: Channel 1 — SMART on FHIR

**Protocol:** SMART on FHIR (HL7 FHIR R4 + OAuth 2.0)
**Standard:** HL7 SMART App Launch Framework 2.0

**Authorization flow:**
```
PalmaAI → [SMART Launch Request] → EHR Authorization Server
EHR Authorization Server → [Access Token] → PalmaAI
PalmaAI → [FHIR API Request + Bearer Token] → EHR FHIR Server
EHR FHIR Server → [FHIR Resource Bundle] → PalmaAI
```

**FHIR endpoints used:**

```
GET /AllergyIntolerance?patient={id}&clinical-status=active
GET /AllergyIntolerance/{id}
GET /Immunization?patient={id}&status=completed
GET /Immunization/{id}
```

**Required FHIR resource fields (AllergyIntolerance):**
```json
{
  "resourceType": "AllergyIntolerance",
  "id": "...",
  "clinicalStatus": {"coding": [{"system": "...", "code": "active"}]},
  "verificationStatus": {"coding": [{"system": "...", "code": "confirmed"}]},
  "type": "allergy",
  "category": ["medication"],
  "criticality": "high",
  "code": {
    "coding": [{"system": "http://snomed.info/sct", "code": "..."}],
    "text": "..."
  },
  "patient": {"reference": "Patient/..."},
  "assertedDate": "2024-03-15"
}
```

**Error handling:**
- 401 Unauthorized → refresh token, retry once
- 403 Forbidden → log, notify issuer, abort
- 404 Not Found → log missing resource, continue with available data
- 429 Too Many Requests → exponential backoff (1s, 2s, 4s, 8s, max 3 retries)

---

## 2. Inbound: Channel 2 — Nphies Gateway

**Protocol:** Nphies REST API (FHIR R4 over HTTPS)
**Authentication:** Nphies PKI certificate + API key

**Note:** Channel 2 uses the Nphies Taameen (insurance) data stream. Clinical resource access requires Nphies Sehey (clinical) authorization, which is on a separate rollout schedule. Channel 2 is initially limited to data types available in Taameen-connected institutions.

**Available resource types via Nphies Taameen (2026):**
- Immunization records (vaccination certificates for insurance purposes)
- AllergyIntolerance (medication allergies relevant to prior authorization)

**Nphies-specific extensions:**
```json
{
  "extension": [
    {
      "url": "http://nphies.sa/fhir/StructureDefinition/ext-provider-id",
      "valueString": "MOH-RYD-042"
    }
  ]
}
```

PalmaAI extracts `recorder.nphiesId` from this extension.

---

## 3. Inbound: Channel 3 — Structured Upload

**Protocol:** HTTPS REST
**Authentication:** Clinician DID authentication (OID4VP-based identity verification)

**Upload endpoint:**
```
POST /api/v1/credentials/upload
Content-Type: multipart/form-data

Fields:
- fhirBundle: FHIR Bundle JSON file (optional)
- structuredForm: JSON form submission (alternative to fhirBundle)
- clinicianDid: DID of the submitting clinician
- issuerInstitution: Name and country of issuing institution
- patientConsent: Signed consent record
```

**Structured form schema (AllergyIntolerance — Channel 3 minimal):**
```json
{
  "patientName": "string (not stored — used only for credential binding)",
  "patientDob": "date",
  "allergen": "string (free text, normalized by Terminology Agent)",
  "allergyType": "allergy | intolerance",
  "category": "food | medication | environment | biologic",
  "criticality": "low | high | unable-to-assess",
  "clinicalStatus": "active | inactive | resolved",
  "verificationStatus": "confirmed | unconfirmed",
  "onsetYear": "integer (optional)",
  "reactions": [{"description": "string", "severity": "mild | moderate | severe"}],
  "clinicianDid": "DID of submitting clinician",
  "institutionName": "string",
  "institutionCountry": "ISO 3166-1 alpha-2",
  "assertedDate": "date"
}
```

**Response:**
```json
{
  "submissionId": "urn:uuid:...",
  "status": "RECEIVED | VALIDATION_FAILED",
  "estimatedProcessingTime": "< 5 minutes for Tier 1, < 48 hours for Tier 2/3",
  "errors": []
}
```

---

## 4. HealthChain Core interface

**Contract:** HealthChainCore.sol at 0xEEd6b1262380e63b184D56E588118d8990A6a35B (Fuji testnet)
**Network:** Avalanche Fuji Testnet (Chain ID 43113) / HealthChain L1 subnet (production)
**Compiler note:** Always use evmVersion: "cancun"

**Functions called by PalmaAI:**

### anchorRoot
```typescript
async function anchorRoot(
  patientDid: string,    // "did:palma:patient:..."
  merkleRoot: bytes32    // computed from patient's full credential set
): Promise<TransactionReceipt>
```

Called after credential signing. The Signing Agent computes the Merkle root including all patient credentials (existing + new), then calls this function.

### getLatestRoot (read-only)
```typescript
async function getLatestRoot(
  patientDid: string
): Promise<{
  merkleRoot: bytes32,
  timestamp: number,
  schemaVersion: number,
  issuerDid: string,
  anchorIndex: number
}>
```

Called before issuing a new credential to retrieve the current Merkle root for root recomputation.

### verifyCredential (read-only, for testing)
```typescript
async function verifyCredential(
  patientDid: string,
  leaf: bytes32,
  proof: bytes32[]
): Promise<{
  valid: boolean,
  timestamp: number,
  revoked: boolean
}>
```

**Merkle leaf construction:**
```typescript
const leaf = keccak256(
  ethers.solidityPackedKeccak256(
    ["string", "string", "string", "bytes32"],
    [credentialId, issuerDid, assertedDate, claimHash]
  )
)
```

Where `claimHash` = SHA-256 of the full SD-JWT credential payload including all disclosure hashes.

---

## 5. Patient Wallet — OID4VCI

**Protocol:** OpenID for Verifiable Credential Issuance (OID4VCI)
**Flow:** Credential Offer (pre-authorized code flow)

**Step 1: Signing Agent generates Credential Offer**
```json
{
  "credential_issuer": "https://palma-issuer.healthchain.sa",
  "credential_configuration_ids": ["PalmaImmunizationCredential"],
  "grants": {
    "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
      "pre-authorized_code": "<one-time-code>",
      "tx_code": {
        "length": 6,
        "input_mode": "numeric",
        "description": "Enter the code sent to your registered mobile number"
      }
    }
  }
}
```

**Step 2: Deliver offer to patient**
- QR code for Patient Wallet app scan
- Deep link for mobile-native delivery
- SMS with redemption code for low-connectivity scenarios

**Step 3: Patient Wallet requests credential**
```http
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code
&pre-authorized_code=<code>
&tx_code=<pin>
```

**Step 4: Issuer returns credential**
```json
{
  "credential": "<SD-JWT credential string>",
  "c_nonce": "<nonce for key binding>",
  "notification_id": "<for delivery confirmation>"
}
```

---

## 6. Error codes

| Code | Meaning | Action |
|---|---|---|
| PALMA-001 | Missing required field in source | Block issuance, notify issuer |
| PALMA-002 | Terminology mapping below minimum confidence | Route to Tier 3 |
| PALMA-003 | Schema validation failed | Block issuance, log error |
| PALMA-004 | Signing failed (HSM unavailable) | Retry 3x, then alert |
| PALMA-005 | Merkle anchor failed (network) | Retry with backoff, queue for manual anchor |
| PALMA-006 | OID4VCI delivery failed | Store in custodial wallet, notify patient |
| PALMA-007 | Human review timeout | Escalate to Tier 3 or senior reviewer |
| PALMA-008 | Patient consent missing | Block issuance, request consent |
| PALMA-009 | Issuer not authorized in HealthChain Core | Block issuance, contact governance |
