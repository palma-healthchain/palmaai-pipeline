/**
 * PalmaAI Pipeline — Example: Hajj Immunization Credential
 *
 * This example demonstrates the complete credential issuance workflow
 * for a Hajj pilgrim using Channel 3 (structured upload from a GP clinic).
 *
 * Scenario: A GP clinic in Lagos, Nigeria is issuing a meningococcal
 * vaccination credential to a patient before their Hajj departure.
 * The clinic has no FHIR API — they use the structured upload form.
 *
 * This is the scenario that the IHR 2024 amendments mandate but provide
 * no implementation path for. Palma is that implementation path.
 */

import type {
  WorkflowRequest,
  WorkflowResult,
  ChannelCredentials,
} from "../../src/agents/interfaces";

// ─── STEP 1: Clinic submits structured form via Channel 3 ─────────────────────

const channel3FormData = {
  // Clinical content
  vaccineCode: "Meningococcal ACWY",        // Free text — Terminology Agent maps to SNOMED CT
  vaccineStatus: "completed",
  occurrenceDate: "2026-05-10",
  lotNumber: "MCV4-2026-004521",
  manufacturer: "Sanofi Pasteur",
  doseNumber: 1,
  seriesDoses: 1,

  // Issuer information (Channel 3 — no FHIR API)
  institutionName: "Lagos Central Medical Clinic",
  institutionCountry: "NG",                  // Nigeria ISO 3166-1 alpha-2
  clinicianName: "Dr. Adaeze Okonkwo",       // Not stored — used only for credential binding
  clinicianLicenseNumber: "MDCN-2018-043721",

  // Patient consent
  patientConsentSignature: "<signed-consent-record>",
  patientDid: "did:palma:patient:hajj-pilgrim-2026-NG-001",
};

// ─── STEP 2: Workflow request ──────────────────────────────────────────────────

const workflowRequest: WorkflowRequest = {
  triggerId: "hajj-2026-NG-001-meningococcal-v1",  // Idempotency key
  channel: "CH3",
  credentialType: "PalmaImmunizationCredential",
  patientIdentifier: "hajj-pilgrim-2026-NG-001",
  patientDid: "did:palma:patient:hajj-pilgrim-2026-NG-001",
  issuerDid: "did:palma:facility:lagos-central-medical-NG",
  issuerKeyId: "key-1",
  recorderCountry: "NG",
  connectionCredentials: {
    ch3: {
      sessionId: "ch3-session-abc123",
      structuredFormData: channel3FormData,
    },
  },
  walletEndpoint: "https://wallet.palma.health/oid4vci/hajj-pilgrim-2026-NG-001",
  healthChainCoreAddress: "0xEEd6b1262380e63b184D56E588118d8990A6a35B",
  network: "avalanche-fuji",
};

// ─── STEP 3: Expected workflow result ─────────────────────────────────────────

/*
The Workflow Agent will:

1. FHIR Extraction Agent (CH3):
   - Converts structuredFormData to a FHIR R4 Immunization resource
   - Validates required fields: vaccineCode ✓, status ✓, occurrenceDateTime ✓
   - Sets sourceFingerprint = SHA-256(rawFhirResource)

2. Terminology Agent:
   - Maps "Meningococcal ACWY" to:
     - SNOMED CT: 416598943 (Meningococcal group A, C, Y and W-135 vaccine)
     - CVX: 136 (Meningococcal MCV4O)
   - Expected confidence: ~0.97 (well-known vaccine, clear name)
   - Tier: TIER1 (auto-approve)

3. Schema Mapping Agent:
   - Constructs PalmaImmunizationCredential Layer 0 payload
   - Sets palma:icvpCompliant = true (IHR 2024 compliance)
   - Sets palma:gdhcnCompatible = true
   - Sets recorder.country = "NG"

4. Confidence tier: TIER1 → auto-issue (no human review required)

5. Signing Agent:
   - Wraps in W3C VC 2.0 + SD-JWT
   - Signs with Lagos Central Medical Clinic's key
   - Submits Merkle root to HealthChain Core

6. Expected result:
*/

const expectedResult: Partial<WorkflowResult> = {
  status: "DELIVERED",
  tier: "TIER1",
  // credentialId: "urn:uuid:..." (generated at runtime)
  // anchorTxHash: "0x..." (generated at runtime)
};

/*
The produced credential will be:
- Verifiable by Saudi health officials at Hajj entry points
- Legally recognized as a WHO ICVP under IHR 2024 amendments
- Selectively disclosable: pilgrim presents vaccineCode + status + date only
- Anchored on HealthChain Core: tamper-proof from issuance to verification

From paper yellow card → cryptographic credential: same GP, same 5-minute encounter.
The trust comes from the signature and the anchor, not from the input channel.
*/

// ─── STEP 4: What the verifier sees at the Saudi checkpoint ───────────────────

const verifierPresentation = {
  // Patient discloses minimum required by Saudi MOH for Hajj entry:
  disclosed: {
    vaccineCode: {
      system: "http://snomed.info/sct",
      code: "416598943",
      display: "Meningococcal group A, C, Y and W-135 vaccine",
    },
    status: "completed",
    occurrenceDateTime: "2026-05-10",
  },

  // Patient withholds (Saudi checkpoint cannot see these):
  withheld: ["lotNumber", "manufacturer", "doseNumber", "performer", "note"],

  // Verification checks (all automated, < 3 seconds):
  checks: [
    "SD-JWT signature valid ✓",
    "Issuer DID registered in Palma network ✓",
    "Credential not revoked (Bitstring Status List) ✓",
    "Merkle proof valid against HealthChain Core anchor ✓",
    "ICVP compliant (WHO-IHR-2024) ✓",
    "Occurrence date within required window ✓",
  ],
};

export { workflowRequest, expectedResult, verifierPresentation };
