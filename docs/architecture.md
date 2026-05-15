# PalmaAI — Agent Architecture Specification

> Version: 0.1.0
> Last updated: 2026-05-15

---

## Design philosophy

PalmaAI is an orchestrated system of specialized AI agents. Each agent has a narrow, well-defined responsibility. The orchestrator coordinates them and manages human-in-the-loop handoffs at defined confidence boundaries.

This is not a pipeline. A pipeline fails silently — one bad step corrupts everything downstream. An agent architecture fails loudly: each agent reports its confidence, routes uncertain cases to human review before proceeding, and produces an independently auditable record of its work.

The architecture is also future-proof: individual agents can be retrained or replaced without touching the others. The Terminology Agent's model can be upgraded without changing the Signing Agent. A new credential type requires only a new mapping rule in the Schema Mapping Agent — the rest of the system is unchanged.

---

## Agent registry

### 1. Workflow Agent (orchestrator)

**Responsibility:** Coordinates all other agents. The only agent that has visibility into the full workflow state. Manages retries, failures, timeouts, and human-in-the-loop routing.

**Inputs:**
- Trigger event: new FHIR resource available (from any channel)
- Patient DID (resolved from issuer system)
- Credential type requested (PalmaAllergyCredential, PalmaImmunizationCredential, etc.)

**Outputs:**
- Workflow state (EXTRACTING / NORMALIZING / MAPPING / REVIEWING / SIGNING / ANCHORING / DELIVERED / FAILED)
- Final credential (on success)
- Failure report with root cause (on failure)

**Key behaviors:**
- Idempotent: calling the same trigger twice produces the same result
- Retries failed agent calls up to 3 times with exponential backoff
- Times out incomplete human reviews after configurable period (default: 48 hours for Tier 2, 7 days for Tier 3)
- Emits workflow events to the Audit Agent at every state transition

**Does NOT:**
- Make clinical decisions
- Modify credential content
- Bypass human review requirements

---

### 2. FHIR Extraction Agent

**Responsibility:** Retrieves and validates FHIR R4 resources from the appropriate input channel. The only agent that communicates with external data sources.

**Inputs:**
- Channel identifier (CH1 / CH2 / CH3)
- Connection credentials (SMART on FHIR token / Nphies API key / structured upload session)
- Patient identifier (MRN, national ID, or DID)
- Resource type requested

**Outputs:**
- Raw FHIR R4 resource bundle (JSON)
- Completeness report: which required fields are present, which are missing
- Source fingerprint: SHA-256 of the raw resource at extraction time
- Channel metadata: source system, extraction timestamp, resource version

**Validation rules (per credential type):**

For AllergyIntolerance:
- Required: AllergyIntolerance.code, .clinicalStatus, .verificationStatus, .type, .category, .criticality
- If .code.coding is empty but .code.text is present: flag for Terminology Agent normalization
- If .criticality is missing: block issuance — minimum disclosure set cannot be satisfied

For Immunization:
- Required: Immunization.vaccineCode, .status, .occurrenceDateTime
- If .vaccineCode.coding system is not SNOMED CT or CVX: flag for Terminology Agent normalization
- If .status is not "completed": flag for human review regardless of confidence

**Does NOT:**
- Modify the FHIR resource
- Make mapping decisions
- Store patient data after extraction

---

### 3. Terminology Agent

**Responsibility:** Resolves coding system inconsistencies. Maps free-text clinical descriptions to standard codes. Produces confidence scores and plain-language reasoning for every mapping decision.

**Inputs:**
- Validated FHIR resource from Extraction Agent
- Target coding system for each field (SNOMED CT, CVX, LOINC, ICD-10, UCUM)

**Outputs for each mapped field:**
```json
{
  "field": "substanceCode",
  "inputValue": "penicillin allergy",
  "inputSystem": "free-text",
  "outputCode": "764146007",
  "outputSystem": "http://snomed.info/sct",
  "outputDisplay": "Penicillin (substance)",
  "confidence": 0.94,
  "reasoning": "Free text 'penicillin allergy' maps to SNOMED CT concept 764146007 (Penicillin). High confidence: exact substance name match. Note: this maps to penicillin class, not amoxicillin specifically — verify if patient record specifies a specific penicillin compound.",
  "alternativeMappings": [
    {"code": "372687004", "display": "Amoxicillin", "confidence": 0.61}
  ],
  "tier": 2
}
```

**Confidence thresholds:**
- Above 0.95: Tier 1 (auto-approve)
- 0.70–0.95: Tier 2 (queue for single-click approval)
- Below 0.70: Tier 3 (mandatory specialist review)

**Overall record tier = maximum tier of any individual field.**

**Model requirements:**
- Must support SNOMED CT 2025 release
- Must support CVX (CDC vaccine codes) current release
- Must support LOINC 2.78+
- Must support ICD-10-CM 2026
- Must handle Arabic clinical text (for Saudi issuers) — bilingual model required for production

**Does NOT:**
- Make clinical judgments about the appropriateness of a diagnosis
- Modify the clinical meaning of a record
- Issue credentials autonomously

---

### 4. Schema Mapping Agent

**Responsibility:** Maps normalized FHIR fields to the Palma credential Layer 0 schema. Constructs the final JSON payload ready for signing.

**Inputs:**
- Normalized FHIR resource with terminology mappings from Terminology Agent
- Target credential type (determines schema version and required fields)
- Patient DID
- Issuer DID and Nphies facility code (if applicable)
- Recorder country (ISO 3166-1 alpha-2)

**Output:**
```json
{
  "schemaVersion": "0.2",
  "credentialType": "PalmaImmunizationCredential",
  "payload": {
    "immunizationId": "urn:uuid:...",
    "patientDid": "did:palma:patient:...",
    "vaccineCode": [
      {"system": "http://snomed.info/sct", "code": "1119349007", "display": "..."},
      {"system": "http://hl7.org/fhir/sid/cvx", "code": "207", "display": "..."}
    ],
    "vaccineDisplay": "...",
    "status": "completed",
    "occurrenceDateTime": "2025-09-15",
    "recorder": {
      "did": "did:palma:facility:...",
      "nphiesId": "MOH-RYD-042",
      "country": "SA"
    },
    "assertedDate": "2025-09-15",
    "palma:icvpCompliant": true,
    "palma:icvpStandard": "WHO-IHR-2024",
    "palma:gdhcnCompatible": true
  },
  "sdJwtDisclosureFlags": {
    "occurrenceDateTime": true,
    "lotNumber": true,
    "manufacturer": true,
    "protocolApplied": true,
    "isSubpotent": true,
    "note": true
  },
  "minimumDisclosureSet": ["vaccineCode", "status", "occurrenceDateTime"],
  "mappingReport": { ... }
}
```

**Does NOT:**
- Perform terminology normalization (that is the Terminology Agent's job)
- Sign the credential
- Make clinical decisions

---

### 5. Signing Agent

**Responsibility:** Wraps the mapped payload in a W3C VC 2.0 + SD-JWT envelope, requests the issuer signature, constructs the Merkle leaf, and submits the Merkle root to HealthChain Core.

**Inputs:**
- Approved Layer 0 payload from Schema Mapping Agent
- Issuer credentials (DID, HSM key reference)
- Patient Wallet delivery address (OID4VCI endpoint or custodial wallet reference)
- HealthChain Core contract address and ABI

**Process:**

Step 1: Construct W3C VC 2.0 envelope
```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://palma-healthchain.github.io/palma-schema/v0.2/context.json"
  ],
  "type": ["VerifiableCredential", "PalmaImmunizationCredential"],
  "id": "urn:uuid:<credentialId>",
  "issuer": {"id": "<issuerDid>", "name": "<institutionName>"},
  "validFrom": "<ISO8601>",
  "credentialSubject": {"id": "<patientDid>", "claim": <Layer0Payload>},
  "credentialStatus": { <BitStringStatusListEntry> }
}
```

Step 2: Apply SD-JWT selective disclosure
- Hash each field marked `sdJwtDisclosureFlags: true` with a random salt
- Replace field values with their hashes in the signed envelope
- Store full disclosures separately for patient wallet delivery

Step 3: Sign with ES256
- Request signature from HSM via issuer DID key reference
- Produce compact SD-JWT: `<header>.<payload>.<signature>~<disclosure1>~<disclosure2>`

Step 4: Compute Merkle leaf and submit anchor
```
leaf = keccak256(abi.encodePacked(credentialId, issuerDid, assertedDate, claimHash))
```
- If patient has existing anchor: compute updated Merkle root including new leaf
- Submit new Merkle root to HealthChain Core via anchorRoot()

Step 5: Deliver via OID4VCI
- Issue credential to Patient Wallet or custodial store

**Does NOT:**
- Modify the credential payload after signing
- Store the patient's private key
- Anchor without a valid signed credential

---

### 6. Audit Agent

**Responsibility:** Runs continuously across the entire workflow. Logs every event with full provenance. Generates ISO 42001 compliance reports.

**Log record structure (per credential):**

```json
{
  "auditId": "urn:uuid:...",
  "credentialId": "urn:uuid:...",
  "workflowTimestamp": "2026-05-15T10:30:00Z",
  "events": [
    {
      "event": "EXTRACTION",
      "timestamp": "...",
      "agent": "fhir-extraction-agent@0.1.0",
      "channel": "CH1",
      "sourceFingerprint": "sha256:...",
      "completenessScore": 0.94,
      "missingFields": ["performer.did"]
    },
    {
      "event": "TERMINOLOGY_MAPPING",
      "timestamp": "...",
      "agent": "terminology-agent@0.1.0",
      "modelVersion": "palma-term-v1.2.0",
      "modelChecksum": "sha256:...",
      "fieldMappings": [
        {
          "field": "substanceCode",
          "inputValue": "penicillin allergy",
          "outputCode": "764146007",
          "confidence": 0.94,
          "reasoning": "...",
          "tier": 2
        }
      ],
      "overallTier": 2
    },
    {
      "event": "HUMAN_REVIEW",
      "timestamp": "...",
      "reviewerDid": "did:palma:clinician:...",
      "action": "APPROVED",
      "fieldOverrides": [],
      "reviewDurationSeconds": 12
    },
    {
      "event": "SIGNING",
      "timestamp": "...",
      "issuerDid": "did:palma:facility:...",
      "sdJwtHeaderHash": "sha256:...",
      "credentialHash": "sha256:..."
    },
    {
      "event": "ANCHOR",
      "timestamp": "...",
      "merkleLeaf": "0x...",
      "merkleRoot": "0x...",
      "txHash": "0x...",
      "blockNumber": 55249812
    },
    {
      "event": "DELIVERED",
      "timestamp": "...",
      "deliveryMethod": "OID4VCI",
      "walletConfirmed": true
    }
  ]
}
```

**Aggregate reports (daily):**
- Credential issuance volume by type and channel
- Confidence distribution by field (histogram)
- Override rate by field (identifies systematically ambiguous mappings)
- Tier distribution (Tier 1 / 2 / 3 percentage over time)
- Model drift alerts (confidence mean drop > 5% in 7 days)
- Review queue depth and average resolution time

**Retention:**
- Individual log records: 7 years (clinical audit standard)
- Aggregate reports: indefinite

**Does NOT:**
- Have write access to credential content
- Share log records externally without explicit authorization
- Store PHI — log records reference credential IDs only

---

## Human-in-the-loop interface

### Tier 2 review queue

A clinician sees:
- The mapped credential fields with their original FHIR values
- The AI mapping for each flagged field with confidence score
- The plain-language reasoning explanation
- An accept/override button per field
- An escalate-to-Tier-3 button for the whole record

Single-click approval: the reviewer accepts all AI mappings.
Field override: the reviewer corrects a specific field and provides a reason.
Time limit: 48 hours before the record escalates to Tier 3.

### Tier 3 specialist review

A specialist sees:
- Everything in the Tier 2 queue plus
- All alternative mappings with their confidence scores
- The full FHIR source record
- A free-text mapping entry field
- A request-additional-information button (pauses the workflow)

No default approval: the specialist must actively choose or enter each mapping.
Every decision logged as a training signal.

---

## Implementation notes

The agents are defined here as interface contracts. Implementations may use:
- Any LLM capable of clinical NLP for the Terminology Agent
- Any signing library supporting ES256 / JWS for the Signing Agent
- Any event log store (PostgreSQL, Elasticsearch, etc.) for the Audit Agent
- Any FHIR client library for the Extraction Agent

The interface contracts are stable. Implementation details may change across versions. The audit log format is immutable once production data exists — schema changes require a new version with migration path.
