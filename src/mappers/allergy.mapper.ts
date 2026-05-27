/**
 * FHIR R4 AllergyIntolerance → PalmaAllergyCredential mapper
 */

import type {
  FhirAllergyIntolerance,
  FhirPatient,
  AllergyCredentialSubject,
  PipelineResult,
  MappingDecision,
  ConfidenceTier,
} from "../types";

const AGENT_ID = "PalmaAI:AllergyMapper";
const AGENT_VERSION = "0.2.0";
import { v4 as uuid } from "uuid";

function tier(c: number): ConfidenceTier {
  if (c >= 0.95) return "T1_AUTO";
  if (c >= 0.80) return "T2_REVIEW";
  return "T3_SPECIALIST";
}

// Penicillin and common dangerous allergens — known SNOMED codes
const HIGH_RISK_SNOMED = new Set([
  "764146007",  // Penicillin
  "372687004",  // Amoxicillin
  "96000000",   // Sulfonamide
  "372754009",  // Aspirin
  "387517004",  // Paracetamol (rare but documented)
  "256277009",  // Peanut
  "260152009",  // Tree nut
  "227037002",  // Fish
]);

export async function mapAllergy(
  fhir: FhirAllergyIntolerance,
  patient: FhirPatient,
): Promise<PipelineResult> {
  const start = Date.now();
  const decisions: MappingDecision[] = [];
  const warnings: string[] = [];

  // ── 1. Substance code resolution ────────────────────────────────────────
  const snomedCoding = fhir.code.coding.find(
    (c) => c.system.includes("snomed") || c.system === "http://snomed.info/sct"
  );
  const substanceConf = snomedCoding ? 0.97 : (fhir.code.coding[0] ? 0.65 : 0.20);
  const substanceCoding = snomedCoding ?? fhir.code.coding[0];

  decisions.push({
    field: "substanceCode",
    sourceValue: fhir.code.coding,
    mappedValue: substanceCoding,
    confidence: substanceConf,
    method: snomedCoding ? "direct_snomed" : "fallback_coding",
  });

  if (!snomedCoding) {
    warnings.push("Substance code is not SNOMED CT — verifier interoperability may be limited");
  }

  // ── 2. Criticality mapping ───────────────────────────────────────────────
  const critMap: Record<string, "low" | "high" | "unable-to-assess"> = {
    low: "low", high: "high", "unable-to-assess": "unable-to-assess",
  };
  const mappedCrit = fhir.criticality ? (critMap[fhir.criticality] ?? "unable-to-assess") : "unable-to-assess";
  const critConf = fhir.criticality ? 0.99 : 0.50;

  decisions.push({
    field: "criticality",
    sourceValue: fhir.criticality,
    mappedValue: mappedCrit,
    confidence: critConf,
    method: "direct_map",
    notes: !fhir.criticality ? "Criticality not specified in source — defaulting to unable-to-assess" : undefined,
  });

  if (!fhir.criticality) {
    warnings.push("Criticality not specified — clinical safety may require manual review");
  }

  // Flag high-risk substances at HIGH criticality
  if (substanceCoding && HIGH_RISK_SNOMED.has(substanceCoding.code) && mappedCrit !== "high") {
    warnings.push(`Substance ${substanceCoding.code} is known high-risk — criticality should be reviewed`);
  }

  // ── 3. Clinical status ───────────────────────────────────────────────────
  const clinStatus = fhir.clinicalStatus?.coding?.[0]?.code ?? "active";
  decisions.push({
    field: "clinicalStatus",
    sourceValue: fhir.clinicalStatus,
    mappedValue: clinStatus,
    confidence: fhir.clinicalStatus ? 0.99 : 0.80,
    method: "direct_map",
  });

  // ── 4. Country extraction ────────────────────────────────────────────────
  const recorderDisplay = fhir.recorder?.display ?? "";
  const countryMatch = recorderDisplay.match(/\b([A-Z]{2})\b/);
  const country = countryMatch?.[1] ?? "UNKNOWN";

  // ── 5. Assemble credentialSubject ────────────────────────────────────────
  const credentialSubject: AllergyCredentialSubject = {
    type: "PalmaAllergyCredential",
    patient: {
      id: `did:palma:patient:${patient.id ?? uuid()}`,
      birthDate: patient.birthDate,
    },
    substanceCode: substanceCoding ?? { system: "unknown", code: "unknown" },
    substanceName: fhir.code.text ?? substanceCoding?.display,
    criticality: mappedCrit,
    clinicalStatus: clinStatus,
    verificationStatus: fhir.verificationStatus?.coding?.[0]?.code,
    category: fhir.category,
    onsetDateTime: fhir.onsetDateTime,
    recorder: { country },
    reactions: fhir.reaction?.map((r) => ({
      manifestation: r.manifestation[0]?.coding?.[0]?.display ?? r.manifestation[0]?.text ?? "unspecified",
      severity: r.severity,
    })),
  };

  const overallConfidence = decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length;

  return {
    credentialSubject,
    tier: tier(overallConfidence),
    overallConfidence,
    decisions,
    warnings,
    requiresHumanReview: tier(overallConfidence) !== "T1_AUTO",
    processingMs: Date.now() - start,
  };
}
