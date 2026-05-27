/**
 * Palma HealthChain — Core type definitions
 * Canonical types for the FHIR R4 → W3C VC 2.0 pipeline
 *
 * These types align with:
 *   - docs/api-contracts.md (FHIR input / VC output contracts)
 *   - credential schema v0.2 (ICVP compliance, recorder.country)
 *   - W3C VC 2.0 Data Model
 */

// ─── FHIR R4 Input Types ─────────────────────────────────────────────────────

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference?: string;
  display?: string;
  identifier?: { system: string; value: string };
}

export interface FhirHumanName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

export interface FhirIdentifier {
  system: string;
  value: string;
  type?: FhirCodeableConcept;
}

export interface FhirPatient {
  resourceType: "Patient";
  id?: string;
  identifier?: FhirIdentifier[];
  name?: FhirHumanName[];
  birthDate?: string;          // YYYY-MM-DD
  gender?: string;
}

export interface FhirImmunization {
  resourceType: "Immunization";
  id?: string;
  status: "completed" | "entered-in-error" | "not-done";
  vaccineCode: FhirCodeableConcept;
  patient: FhirReference;
  occurrenceDateTime: string;  // ISO 8601
  recorded?: string;
  lotNumber?: string;
  expirationDate?: string;
  manufacturer?: FhirReference;
  performer?: Array<{
    function?: FhirCodeableConcept;
    actor: FhirReference;
  }>;
  protocolApplied?: Array<{
    series?: string;
    doseNumberPositiveInt?: number;
    seriesDosesPositiveInt?: number;
  }>;
  location?: FhirReference;
  extension?: Array<{
    url: string;
    valueString?: string;
    valueCode?: string;
    valueBoolean?: boolean;
  }>;
}

export interface FhirAllergyIntolerance {
  resourceType: "AllergyIntolerance";
  id?: string;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  type?: string;
  category?: string[];
  criticality?: "low" | "high" | "unable-to-assess";
  code: FhirCodeableConcept;
  patient: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: FhirReference;
  note?: Array<{ text: string }>;
  reaction?: Array<{
    substance?: FhirCodeableConcept;
    manifestation: FhirCodeableConcept[];
    severity?: "mild" | "moderate" | "severe";
  }>;
}

export interface FhirCondition {
  resourceType: "Condition";
  id?: string;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  severity?: FhirCodeableConcept;
  code: FhirCodeableConcept;
  subject: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: FhirReference;
  note?: Array<{ text: string }>;
}

export type FhirResource =
  | FhirImmunization
  | FhirAllergyIntolerance
  | FhirCondition;

// ─── Palma Credential Subject Types ──────────────────────────────────────────

export interface PalmaPatientSubject {
  id: string;                    // DID or pseudonymous ID — never raw PII
  birthDate?: string;
  identifier?: {
    system: string;
    value: string;
    type?: string;
  };
  name?: string;                 // Optional — patient controls disclosure
}

export interface PalmaRecorder {
  practitionerId?: string;
  organizationId?: string;
  organizationName?: string;
  country: string;               // ISO 3166-1 alpha-2 (e.g. "NG", "SA")
}

/** PalmaImmunizationCredential credentialSubject — schema v0.2 */
export interface ImmunizationCredentialSubject {
  type: "PalmaImmunizationCredential";
  patient: PalmaPatientSubject;
  vaccineCode: FhirCoding;       // CVX preferred; SNOMED fallback
  vaccineName?: string;
  status: "completed" | "not-done";
  occurrenceDateTime: string;
  lotNumber?: string;
  expirationDate?: string;
  manufacturer?: string;
  performer?: string;
  seriesDose?: number;
  seriesTotal?: number;
  recorder: PalmaRecorder;
  // ICVP compliance fields (IHR 2024)
  icvpCompliant: boolean;
  icvpDiseaseTarget?: string;    // e.g. "meningococcal disease"
  validFrom: string;
  validUntil?: string;
}

/** PalmaAllergyCredential credentialSubject */
export interface AllergyCredentialSubject {
  type: "PalmaAllergyCredential";
  patient: PalmaPatientSubject;
  substanceCode: FhirCoding;     // SNOMED CT
  substanceName?: string;
  criticality: "low" | "high" | "unable-to-assess";
  clinicalStatus: string;
  verificationStatus?: string;
  category?: string[];
  onsetDateTime?: string;
  recorder: PalmaRecorder;
  reactions?: Array<{
    manifestation: string;
    severity?: string;
  }>;
}

/** PalmaConditionCredential credentialSubject */
export interface ConditionCredentialSubject {
  type: "PalmaConditionCredential";
  patient: PalmaPatientSubject;
  code: FhirCoding;              // SNOMED CT
  conditionName?: string;
  clinicalStatus: string;
  verificationStatus?: string;
  onsetDateTime?: string;
  recorder: PalmaRecorder;
  severity?: string;
  note?: string;
}

export type PalmaCredentialSubject =
  | ImmunizationCredentialSubject
  | AllergyCredentialSubject
  | ConditionCredentialSubject;

// ─── Pipeline Types ───────────────────────────────────────────────────────────

/** Confidence tier for each mapping decision */
export type ConfidenceTier = "T1_AUTO" | "T2_REVIEW" | "T3_SPECIALIST";

export interface MappingDecision {
  field: string;
  sourceValue: unknown;
  mappedValue: unknown;
  confidence: number;            // 0.0 – 1.0
  method: string;                // e.g. "direct_cvx", "snomed_lookup", "fallback"
  notes?: string;
}

export interface PipelineResult {
  credentialSubject: PalmaCredentialSubject;
  tier: ConfidenceTier;
  overallConfidence: number;
  decisions: MappingDecision[];
  warnings: string[];
  requiresHumanReview: boolean;
  processingMs: number;
}

export interface PipelineError {
  code: string;
  message: string;
  field?: string;
  fhirPath?: string;
}

// ─── Audit Log Types (ISO 42001) ──────────────────────────────────────────────

export interface AuditEvent {
  eventId: string;               // UUID v4
  timestamp: string;             // ISO 8601
  agentId: string;
  agentVersion: string;
  sourceChannel: "SMART_ON_FHIR" | "NPHIES_GATEWAY" | "STRUCTURED_UPLOAD";
  sourceInstitutionId?: string;
  fhirResourceType: string;
  fhirResourceId?: string;
  decisionType: string;
  outcome: "AUTO_APPROVED" | "QUEUED_REVIEW" | "ESCALATED" | "REJECTED";
  tierAssigned: ConfidenceTier;
  confidenceScore: number;
  confidenceFactors: string[];
  credentialType?: string;
  credentialId?: string;
  merkleRoot?: string;
  chainTxHash?: string;
  reviewerId?: string;
  reviewTimestamp?: string;
  overrideRationale?: string;
  warnings: string[];
}
