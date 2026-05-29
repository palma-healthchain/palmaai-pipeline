/**
 * PalmaDiagnosticCredential mapper
 * Maps a treated FHIR Condition (hospital discharge context) to a
 * PalmaDiagnosticCredential — proof of clinical encounter and treatment.
 */
import { v4 as uuid } from "uuid";
import type {
  FhirCondition, FhirPatient,
  PipelineResult, MappingDecision, ConfidenceTier, AuditEvent,
} from "../types";

export interface DiagnosticCredentialSubject {
  type: "PalmaDiagnosticCredential";
  patient: { id: string; birthDate?: string };
  code: { system: string; code: string; display?: string };
  conditionName?: string;
  clinicalStatus: string;
  verificationStatus?: string;
  encounterDate: string;
  dischargeDate?: string;
  treatmentSummary?: string;
  treatingFacility?: string;
  treatingPhysician?: string;
  recorder: { country: string; organizationName?: string };
  outcomeCode?: string;   // e.g. "resolved", "improving"
}

function tier(c: number): ConfidenceTier {
  if (c >= 0.95) return "T1_AUTO";
  if (c >= 0.80) return "T2_REVIEW";
  return "T3_SPECIALIST";
}

// ICD-10 codes we handle with high confidence
const KNOWN_ICD10 = new Set([
  "E11", "E11.649", "I10", "J18", "K92", "Z09", "S00", "T14",
]);

export async function mapDiagnostic(
  fhir: FhirCondition,
  patient: FhirPatient,
): Promise<PipelineResult> {
  const start = Date.now();
  const decisions: MappingDecision[] = [];
  const warnings: string[] = [];

  // ── 1. Code resolution ────────────────────────────────────────────────
  const snomedCoding = fhir.code.coding.find(c => c.system.includes("snomed"));
  const icd10Coding  = fhir.code.coding.find(c => c.system.includes("icd-10") || c.system.includes("icd10"));
  const primaryCode  = snomedCoding ?? icd10Coding ?? fhir.code.coding[0];

  const codeConf = snomedCoding ? 0.98 : (icd10Coding ? 0.95 : 0.60);
  decisions.push({
    field: "code",
    sourceValue: fhir.code.coding,
    mappedValue: primaryCode,
    confidence: codeConf,
    method: snomedCoding ? "direct_snomed" : icd10Coding ? "direct_icd10" : "fallback",
  });

  // ── 2. Clinical status ────────────────────────────────────────────────
  const clinStatus = fhir.clinicalStatus?.coding?.[0]?.code ?? "unknown";
  const clinConf   = fhir.clinicalStatus ? 0.99 : 0.50;
  decisions.push({
    field: "clinicalStatus", sourceValue: fhir.clinicalStatus,
    mappedValue: clinStatus, confidence: clinConf, method: "direct_map",
  });

  // ── 3. Encounter date — use recordedDate or onsetDateTime ─────────────
  const encounterDate = fhir.recordedDate ?? fhir.onsetDateTime ?? new Date().toISOString();
  const dateConf      = fhir.recordedDate ? 0.99 : (fhir.onsetDateTime ? 0.85 : 0.40);
  decisions.push({
    field: "encounterDate", sourceValue: fhir.recordedDate ?? fhir.onsetDateTime,
    mappedValue: encounterDate, confidence: dateConf, method: "direct_map",
    notes: !fhir.recordedDate ? "recordedDate absent — using onsetDateTime as proxy" : undefined,
  });

  // ── 4. Recorder / facility ────────────────────────────────────────────
  const recorderDisplay = fhir.recorder?.display ?? "";
  const countryMatch    = recorderDisplay.match(/\b([A-Z]{2})\b/);
  const country         = countryMatch?.[1] ?? "UNKNOWN";

  // ── 5. Outcome from note ──────────────────────────────────────────────
  const noteText = fhir.note?.[0]?.text ?? "";
  let outcomeCode: string | undefined;
  if (/resolv|discharg|recovered|treated/i.test(noteText)) outcomeCode = "resolved";
  else if (/improv/i.test(noteText)) outcomeCode = "improving";
  else if (/chronic|ongoing/i.test(noteText)) outcomeCode = "ongoing";

  // ── 6. Treatment summary from notes ──────────────────────────────────
  const treatmentSummary = noteText.length > 0 ? noteText.slice(0, 200) : undefined;

  // ── 7. Assemble ───────────────────────────────────────────────────────
  const credentialSubject: DiagnosticCredentialSubject = {
    type: "PalmaDiagnosticCredential",
    patient: { id: `did:palma:patient:${patient.id ?? uuid()}`, birthDate: patient.birthDate },
    code: primaryCode ?? { system: "unknown", code: "unknown" },
    conditionName: fhir.code.text ?? primaryCode?.display,
    clinicalStatus: clinStatus,
    verificationStatus: fhir.verificationStatus?.coding?.[0]?.code,
    encounterDate,
    treatingFacility: recorderDisplay.split(",")[1]?.trim() ?? recorderDisplay,
    treatingPhysician: recorderDisplay.split(",")[0]?.trim(),
    recorder: { country, organizationName: recorderDisplay },
    outcomeCode,
    treatmentSummary,
  };

  const overallConfidence = decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length;

  return {
    credentialSubject: credentialSubject as unknown as import("../types").PalmaCredentialSubject,
    tier: tier(overallConfidence),
    overallConfidence,
    decisions,
    warnings,
    requiresHumanReview: tier(overallConfidence) !== "T1_AUTO",
    processingMs: Date.now() - start,
  };
}
