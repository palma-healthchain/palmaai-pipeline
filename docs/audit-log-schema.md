# PalmaAI — Audit Log Schema Specification

> Version: 0.1.0
> Standard: ISO 42001 AI Management System
> Last updated: 2026-05-15

---

## Purpose

Every credential issued by PalmaAI generates an immutable audit record. This schema defines every field, its type, and its purpose. The audit log is the ISO 42001 compliance artifact, the SDAIA AI Ethics Principles evidence, and the training signal source for model improvement.

---

## Field specification

### Root record

| Field | Type | Required | Description |
|---|---|---|---|
| auditId | UUID v4 | YES | Globally unique identifier for this audit record |
| credentialId | URI | YES | urn:uuid of the credential being issued |
| credentialType | string | YES | PalmaAllergyCredential / PalmaImmunizationCredential / etc. |
| workflowStarted | ISO 8601 | YES | Timestamp when workflow was triggered |
| workflowCompleted | ISO 8601 | NO | Timestamp when credential was delivered (null if failed/pending) |
| workflowStatus | enum | YES | COMPLETED / FAILED / PENDING_REVIEW / ABANDONED |
| issuerDid | DID | YES | DID of the issuing institution |
| channel | enum | YES | CH1 / CH2 / CH3 |
| overallTier | enum | YES | TIER1 / TIER2 / TIER3 |
| events | array | YES | Ordered array of workflow events (see below) |

### Extraction event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "EXTRACTION" |
| timestamp | ISO 8601 | YES | When extraction completed |
| agentVersion | string | YES | "fhir-extraction-agent@0.1.0" |
| channel | enum | YES | CH1 / CH2 / CH3 |
| sourceSystem | string | YES | EHR vendor / Nphies / structured-upload |
| sourceFingerprint | SHA-256 | YES | Hash of raw FHIR resource — proves source data unmodified |
| fhirResourceType | string | YES | AllergyIntolerance / Immunization / etc. |
| completenessScore | float 0-1 | YES | Fraction of required fields present |
| presentFields | string[] | YES | List of fields found in source |
| missingFields | string[] | YES | List of required fields not found |
| missingRequiredFields | string[] | YES | Fields in minimum disclosure set that are missing (blocks issuance if non-empty) |

### Terminology mapping event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "TERMINOLOGY_MAPPING" |
| timestamp | ISO 8601 | YES | When mapping completed |
| agentVersion | string | YES | "terminology-agent@0.1.0" |
| modelId | string | YES | Model identifier (e.g. "palma-term-v1.2.0") |
| modelChecksum | SHA-256 | YES | Hash of model weights — enables reproducibility audit |
| overallConfidence | float 0-1 | YES | Minimum confidence across all mapped fields |
| overallTier | enum | YES | TIER1 / TIER2 / TIER3 |
| fieldMappings | array | YES | One entry per mapped field (see below) |

### Field mapping entry

| Field | Type | Required | Description |
|---|---|---|---|
| field | string | YES | Credential schema field name (e.g. "substanceCode") |
| inputValue | string | YES | Raw value from FHIR resource |
| inputSystem | string | YES | Coding system of input or "free-text" |
| outputCode | string | YES | Mapped standard code |
| outputSystem | string | YES | Target coding system URI |
| outputDisplay | string | YES | Human-readable display name for mapped code |
| confidence | float 0-1 | YES | Confidence score for this mapping |
| reasoning | string | YES | Plain-language explanation of the mapping decision |
| alternativeMappings | array | YES | Top 3 alternative mappings with codes and confidence scores |
| tier | enum | YES | TIER1 / TIER2 / TIER3 for this specific field |

### Human review event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "HUMAN_REVIEW" |
| timestamp | ISO 8601 | YES | When review was completed |
| reviewerDid | DID | YES | DID of the reviewing clinician |
| reviewerRole | string | YES | "primary" / "specialist" |
| tier | enum | YES | TIER2 / TIER3 |
| action | enum | YES | APPROVED / OVERRIDDEN / ESCALATED / ABANDONED |
| fieldOverrides | array | NO | One entry per field that was corrected (see below) |
| reviewDurationSeconds | integer | YES | Time from queue entry to decision |
| escalationReason | string | NO | Required if action is ESCALATED |

### Field override entry

| Field | Type | Required | Description |
|---|---|---|---|
| field | string | YES | Field that was overridden |
| aiValue | string | YES | What the AI mapped |
| humanValue | string | YES | What the reviewer corrected it to |
| reason | string | YES | Free-text reason for the override |
| trainingSignal | boolean | YES | Whether this override should be used as a training signal (default: true) |

### Signing event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "SIGNING" |
| timestamp | ISO 8601 | YES | When signing completed |
| issuerDid | DID | YES | DID of the signing institution |
| keyId | string | YES | Key identifier within the issuer's DID document |
| algorithm | string | YES | "ES256" |
| sdJwtHeaderHash | SHA-256 | YES | Hash of the SD-JWT header — binds audit record to credential |
| credentialHash | SHA-256 | YES | Hash of the complete signed credential |

### Anchor event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "ANCHOR" |
| timestamp | ISO 8601 | YES | When anchor was confirmed |
| merkleLeaf | bytes32 | YES | The Merkle leaf value for this credential |
| merkleRoot | bytes32 | YES | The new Merkle root submitted on-chain |
| contractAddress | address | YES | HealthChain Core contract address |
| txHash | bytes32 | YES | Blockchain transaction hash |
| blockNumber | integer | YES | Block number of the anchor transaction |
| network | string | YES | "avalanche-fuji" / "avalanche-l1-healthchain" |

### Delivery event

| Field | Type | Required | Description |
|---|---|---|---|
| event | string | YES | "DELIVERED" |
| timestamp | ISO 8601 | YES | When delivery completed |
| deliveryMethod | enum | YES | OID4VCI / CUSTODIAL |
| walletConfirmed | boolean | YES | Whether the wallet acknowledged receipt |

---

## Aggregate report fields

Generated daily per issuing institution:

| Field | Type | Description |
|---|---|---|
| reportDate | ISO 8601 date | Date of the report |
| issuerDid | DID | Issuing institution |
| totalCredentials | integer | Total credentials issued |
| byType | object | Count per credential type |
| byChannel | object | Count per input channel (CH1/CH2/CH3) |
| tier1Pct | float | Percentage auto-issued (Tier 1) |
| tier2Pct | float | Percentage queued for review (Tier 2) |
| tier3Pct | float | Percentage requiring specialist review (Tier 3) |
| overrideRate | float | Percentage of Tier 2/3 records with at least one field override |
| avgReviewTimeSec | float | Average time from queue entry to reviewer decision |
| avgConfidence | float | Mean confidence across all field mappings |
| confidenceByField | object | Mean confidence per schema field |
| overridesByField | object | Override count per schema field (identifies weak mappings) |
| modelDriftAlert | boolean | True if mean confidence dropped >5% vs 7-day rolling average |
| failedCredentials | integer | Credentials that failed to issue |
| failureReasons | object | Count per failure reason code |

---

## Retention policy

| Data category | Retention | Rationale |
|---|---|---|
| Individual audit records | 7 years | Clinical audit standard (Saudi MoH / international) |
| Aggregate reports | Indefinite | Model improvement and compliance history |
| Training signals (field overrides) | Indefinite | Model retraining dataset |
| Raw FHIR resources | Not retained | PalmaAI is a pipeline — source data not stored |

---

## Privacy constraints

The audit log MUST NOT contain:
- Patient names, national IDs, or any direct identifiers
- Clinical content from the credential payload
- The full SD-JWT credential (only its hash)
- Any PHI as defined by PDPL or HIPAA

The audit log MAY contain:
- Credential IDs (pseudonymous UUIDs)
- Patient DIDs (pseudonymous identifiers)
- Issuer DIDs (public institutional identifiers)
- Field mapping metadata (non-PHI technical data)
- Confidence scores and reasoning (non-PHI AI metadata)

---

## ISO 42001 mapping

| ISO 42001 Clause | How PalmaAI satisfies it |
|---|---|
| 6.1 Actions to address AI risks | Confidence-tiered routing — uncertain mappings require human review |
| 8.4 AI system documentation | Agent version and model checksum in every log record |
| 8.5 AI system operation | Continuous Audit Agent monitoring with drift alerts |
| 9.1 Performance monitoring | Daily aggregate reports with confidence trend analysis |
| 9.2 Internal audit | Full provenance chain from source fingerprint to on-chain anchor |
| 10.1 Nonconformity and corrective action | Override records as training signals — systematic nonconformities trigger model retraining |
