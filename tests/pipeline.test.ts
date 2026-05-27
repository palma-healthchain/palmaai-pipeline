/**
 * PalmaAI Pipeline — Immunization mapper tests
 */

import { runPipeline } from "../src/pipeline";
import {
  AMINA_BUNDLE,
  AMINA_IMMUNIZATION_MENING,
  AMINA_IMMUNIZATION_YF,
  AMINA_ALLERGY_PENICILLIN,
} from "../src/fixtures/amina.fixture";
import type { ImmunizationCredentialSubject, AllergyCredentialSubject } from "../src/types";

describe("PalmaAI Pipeline — Immunization mapper", () => {
  test("meningococcal vaccine maps to T1_AUTO with CVX 136", async () => {
    const { result } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
      sourceChannel: "STRUCTURED_UPLOAD",
    });
    expect(result.tier).toBe("T1_AUTO");
    expect(result.requiresHumanReview).toBe(false);
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.type).toBe("PalmaImmunizationCredential");
    expect(cs.vaccineCode.code).toBe("136");
    expect(cs.icvpCompliant).toBe(true);
    expect(cs.icvpDiseaseTarget).toBe("meningococcal disease");
    expect(cs.recorder.country).toBe("NG");
  });

  test("meningococcal validUntil is ~5 years from occurrenceDateTime", async () => {
    const { result } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.validUntil).toBeDefined();
    const diff = new Date(cs.validUntil!).getTime() - new Date(cs.validFrom).getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    // 5 years ≈ 1825 days — allow ±1 for leap years
    expect(days).toBeGreaterThanOrEqual(1824);
    expect(days).toBeLessThanOrEqual(1826);
  });

  test("yellow fever maps to T1_AUTO and is ICVP-compliant", async () => {
    const { result } = await runPipeline({
      resource: AMINA_IMMUNIZATION_YF,
      patient: AMINA_BUNDLE.patient,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.vaccineCode.code).toBe("184");
    expect(cs.icvpCompliant).toBe(true);
    expect(cs.icvpDiseaseTarget).toBe("yellow fever");
    // Yellow fever is lifetime — ~36500 days
    const diff = new Date(cs.validUntil!).getTime() - new Date(cs.validFrom).getTime();
    const years = diff / (1000 * 60 * 60 * 24 * 365);
    expect(years).toBeGreaterThan(90);
  });

  test("immunization falls back to performer display when extension absent", async () => {
    const noExtension = {
      ...AMINA_IMMUNIZATION_MENING,
      extension: [], // remove recorder-country extension — mapper should fall back to performer display
    };
    const { result } = await runPipeline({
      resource: noExtension,
      patient: AMINA_BUNDLE.patient,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.type).toBe("PalmaImmunizationCredential");
    // Performer display contains "NG" — mapper extracts it as fallback
    expect(cs.recorder.country).toBe("NG");
    // Fallback method has lower confidence (0.75) vs extension (0.99) — still T1 overall
    // but the decision log should reflect the fallback method
    const countryDecision = result.decisions.find((d) => d.field === "recorder.country");
    expect(countryDecision?.method).toBe("performer_display_extract");
    expect(countryDecision?.confidence).toBeLessThan(0.99);
  });

  test("immunization without any country source produces UNKNOWN and warning", async () => {
    const noCountrySource = {
      ...AMINA_IMMUNIZATION_MENING,
      extension: [],
      performer: [],    // also remove performer — now truly no country source
      location: undefined,
    };
    const { result } = await runPipeline({
      resource: noCountrySource,
      patient: AMINA_BUNDLE.patient,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.recorder.country).toBe("UNKNOWN");
    expect(result.warnings.some((w) => w.includes("recorder.country"))).toBe(true);
    expect(["T2_REVIEW", "T3_SPECIALIST"]).toContain(result.tier);
  });

  test("audit event is emitted with correct fields", async () => {
    const { auditEvent } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
      sourceChannel: "SMART_ON_FHIR",
      sourceInstitutionId: "kano-vcn-ng",
    });
    expect(auditEvent.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(auditEvent.fhirResourceType).toBe("Immunization");
    expect(auditEvent.sourceChannel).toBe("SMART_ON_FHIR");
    expect(auditEvent.sourceInstitutionId).toBe("kano-vcn-ng");
    expect(auditEvent.outcome).toBe("AUTO_APPROVED");
    expect(auditEvent.credentialType).toBe("PalmaImmunizationCredential");
    expect(auditEvent.timestamp).toBeTruthy();
  });
});

describe("PalmaAI Pipeline — Allergy mapper", () => {
  test("penicillin allergy maps to T1_AUTO with HIGH criticality", async () => {
    const { result } = await runPipeline({
      resource: AMINA_ALLERGY_PENICILLIN,
      patient: AMINA_BUNDLE.patient,
    });
    expect(result.tier).toBe("T1_AUTO");
    const cs = result.credentialSubject as AllergyCredentialSubject;
    expect(cs.type).toBe("PalmaAllergyCredential");
    expect(cs.substanceCode.code).toBe("764146007");
    expect(cs.criticality).toBe("high");
    expect(cs.clinicalStatus).toBe("active");
    expect(cs.reactions?.[0].severity).toBe("severe");
  });

  test("patient DID is generated and stable across calls", async () => {
    const { result: r1 } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
    });
    const { result: r2 } = await runPipeline({
      resource: AMINA_ALLERGY_PENICILLIN,
      patient: AMINA_BUNDLE.patient,
    });
    // Both should use the same patient ID since patient.id is fixed
    expect(r1.credentialSubject.patient.id).toBe(r2.credentialSubject.patient.id);
    expect(r1.credentialSubject.patient.id).toContain("did:palma:patient:");
  });

  test("name is excluded by default (selective disclosure)", async () => {
    const { result } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.patient.name).toBeUndefined();
  });

  test("name is included when includeName is set", async () => {
    const { result } = await runPipeline({
      resource: AMINA_IMMUNIZATION_MENING,
      patient: AMINA_BUNDLE.patient,
      includeName: true,
    });
    const cs = result.credentialSubject as ImmunizationCredentialSubject;
    expect(cs.patient.name).toBe("Amina Musa");
  });
});
