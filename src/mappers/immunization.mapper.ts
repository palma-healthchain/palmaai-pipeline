/**
 * FHIR R4 Immunization → PalmaImmunizationCredential mapper
 *
 * Confidence tiers:
 *   T1 (>=0.95) — auto-approve
 *   T2 (0.80–0.95) — queue for human review
 *   T3 (<0.80) — escalate to specialist
 */

import { v4 as uuid } from "uuid";
import type {
  FhirImmunization,
  FhirPatient,
  ImmunizationCredentialSubject,
  PipelineResult,
  MappingDecision,
  ConfidenceTier,
  AuditEvent,
} from "../types";
import { resolveVaccineEntry } from "../utils/vaccine-registry";

const AGENT_ID = "PalmaAI:ImmunizationMapper";
const AGENT_VERSION = "0.2.0";

// ISO 3166-1 alpha-2 country codes we recognise in performer extensions
const KNOWN_COUNTRIES = new Set([
  "NG","SA","EG","PK","BD","ID","IN","MY","GB","DE","FR","US","AE","KW","QA","BH","OM",
  "TR","MA","DZ","TN","LB","JO","IQ","SY","YE","LY","SD","SO","ET","KE","GH","SN",
]);

function tier(confidence: number): ConfidenceTier {
  if (confidence >= 0.95) return "T1_AUTO";
  if (confidence >= 0.80) return "T2_REVIEW";
  return "T3_SPECIALIST";
}

function extractCountry(immunization: FhirImmunization): {
  country: string;
  confidence: number;
  method: string;
} {
  // 1. Palma recorder.country extension
  for (const ext of immunization.extension ?? []) {
    if (ext.url.includes("recorder-country") && ext.valueCode) {
      const code = ext.valueCode.toUpperCase();
      if (KNOWN_COUNTRIES.has(code)) {
        return { country: code, confidence: 0.99, method: "extension_recorder_country" };
      }
    }
  }
  // 2. Performer organisation reference — parse country from display
  for (const p of immunization.performer ?? []) {
    const display = p.actor.display ?? "";
    const match = display.match(/\b([A-Z]{2})\b/);
    if (match && KNOWN_COUNTRIES.has(match[1])) {
      return { country: match[1], confidence: 0.75, method: "performer_display_extract" };
    }
  }
  // 3. Location reference display
  const locDisplay = immunization.location?.display ?? "";
  const locMatch = locDisplay.match(/\b([A-Z]{2})\b/);
  if (locMatch && KNOWN_COUNTRIES.has(locMatch[1])) {
    return { country: locMatch[1], confidence: 0.70, method: "location_display_extract" };
  }
  return { country: "UNKNOWN", confidence: 0.30, method: "unresolved" };
}

function patientSubject(patient: FhirPatient, includeNameDefault = false) {
  const passportId = patient.identifier?.find(
    (i) => i.type?.coding?.some((c) => c.code === "PPN" || c.display?.toLowerCase().includes("passport"))
  );
  const nationalId = patient.identifier?.find(
    (i) => i.type?.coding?.some((c) => c.code === "NI" || c.code === "NNxxx")
  );
  const anyId = passportId ?? nationalId ?? patient.identifier?.[0];

  const subject: ImmunizationCredentialSubject["patient"] = {
    id: `did:palma:patient:${patient.id ?? uuid()}`,
    birthDate: patient.birthDate,
    identifier: anyId
      ? { system: anyId.system, value: anyId.value, type: anyId.type?.text }
      : undefined,
    // Name included only if caller explicitly opts in (SD-JWT selective disclosure)
    name: includeNameDefault
      ? [patient.name?.[0]?.given?.join(" "), patient.name?.[0]?.family]
          .filter(Boolean)
          .join(" ") || undefined
      : undefined,
  };
  return subject;
}

export async function mapImmunization(
  fhir: FhirImmunization,
  patient: FhirPatient,
  opts: { includeName?: boolean; sourceChannel?: AuditEvent["sourceChannel"] } = {}
): Promise<PipelineResult> {
  const start = Date.now();
  const decisions: MappingDecision[] = [];
  const warnings: string[] = [];

  // ── 1. Vaccine code resolution ───────────────────────────────────────────
  const { entry: vaccineEntry, method: vaccineMethod } = resolveVaccineEntry(
    fhir.vaccineCode.coding
  );

  const vaccineConfidence = vaccineMethod === "direct_cvx" ? 0.99
    : vaccineMethod === "snomed_lookup" ? 0.92
    : vaccineMethod.startsWith("display_fuzzy") ? 0.72
    : 0.20;

  decisions.push({
    field: "vaccineCode",
    sourceValue: fhir.vaccineCode.coding,
    mappedValue: vaccineEntry
      ? { system: "http://hl7.org/fhir/sid/cvx", code: vaccineEntry.cvxCode, display: vaccineEntry.cvxDisplay }
      : fhir.vaccineCode.coding[0],
    confidence: vaccineConfidence,
    method: vaccineMethod,
    notes: vaccineEntry ? undefined : "Vaccine code could not be resolved to CVX — requires specialist review",
  });

  if (!vaccineEntry) {
    warnings.push("Vaccine code unresolved — credential cannot be ICVP-certified without a recognised CVX/SNOMED code");
  }

  // ── 2. Country extraction ────────────────────────────────────────────────
  const { country, confidence: countryConf, method: countryMethod } = extractCountry(fhir);
  decisions.push({
    field: "recorder.country",
    sourceValue: fhir.extension ?? fhir.performer ?? "none",
    mappedValue: country,
    confidence: countryConf,
    method: countryMethod,
    notes: country === "UNKNOWN" ? "Country of vaccination could not be determined" : undefined,
  });

  if (country === "UNKNOWN") {
    warnings.push("recorder.country could not be determined — ICVP compliance requires country of vaccination");
  }

  // ── 3. Status mapping ────────────────────────────────────────────────────
  const statusConf = fhir.status === "completed" ? 0.99 : 0.50;
  decisions.push({
    field: "status",
    sourceValue: fhir.status,
    mappedValue: fhir.status,
    confidence: statusConf,
    method: "direct_map",
  });

  if (fhir.status !== "completed") {
    warnings.push(`Immunization status is '${fhir.status}' — only 'completed' qualifies for ICVP`);
  }

  // ── 4. ICVP compliance determination ────────────────────────────────────
  const icvpCompliant =
    fhir.status === "completed" &&
    !!vaccineEntry?.icvpCompliant &&
    country !== "UNKNOWN";

  const icvpConf = icvpCompliant ? Math.min(vaccineConfidence, countryConf, statusConf) : 0.0;
  decisions.push({
    field: "icvpCompliant",
    sourceValue: { status: fhir.status, vaccineResolved: !!vaccineEntry, countryKnown: country !== "UNKNOWN" },
    mappedValue: icvpCompliant,
    confidence: icvpConf,
    method: "composite_rule",
  });

  // ── 5. Valid until calculation ───────────────────────────────────────────
  let validUntil: string | undefined;
  if (vaccineEntry?.typicalValidityDays && fhir.occurrenceDateTime) {
    const base = new Date(fhir.occurrenceDateTime);
    base.setDate(base.getDate() + vaccineEntry.typicalValidityDays);
    validUntil = base.toISOString().split("T")[0];
  } else if (fhir.expirationDate) {
    validUntil = fhir.expirationDate;
  }

  // ── 6. Assemble credentialSubject ────────────────────────────────────────
  const credentialSubject: ImmunizationCredentialSubject = {
    type: "PalmaImmunizationCredential",
    patient: patientSubject(patient, opts.includeName),
    vaccineCode: vaccineEntry
      ? { system: "http://hl7.org/fhir/sid/cvx", code: vaccineEntry.cvxCode, display: vaccineEntry.cvxDisplay }
      : fhir.vaccineCode.coding[0],
    vaccineName: vaccineEntry?.cvxDisplay ?? fhir.vaccineCode.text,
    status: fhir.status === "completed" ? "completed" : "not-done",
    occurrenceDateTime: fhir.occurrenceDateTime,
    lotNumber: fhir.lotNumber,
    expirationDate: fhir.expirationDate,
    manufacturer: fhir.manufacturer?.display,
    performer: fhir.performer?.[0]?.actor.display,
    seriesDose: fhir.protocolApplied?.[0]?.doseNumberPositiveInt,
    seriesTotal: fhir.protocolApplied?.[0]?.seriesDosesPositiveInt,
    recorder: {
      practitionerId: fhir.performer?.[0]?.actor.reference,
      organizationName: fhir.performer?.find(
        (p) => p.function?.coding?.[0]?.code === "ORG"
      )?.actor.display,
      country,
    },
    icvpCompliant,
    icvpDiseaseTarget: vaccineEntry?.icvpDiseaseTarget,
    validFrom: fhir.occurrenceDateTime.split("T")[0],
    validUntil,
  };

  // ── 7. Overall confidence + tier ─────────────────────────────────────────
  const overallConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
  const assignedTier = tier(overallConfidence);

  return {
    credentialSubject,
    tier: assignedTier,
    overallConfidence,
    decisions,
    warnings,
    requiresHumanReview: assignedTier !== "T1_AUTO",
    processingMs: Date.now() - start,
  };
}
