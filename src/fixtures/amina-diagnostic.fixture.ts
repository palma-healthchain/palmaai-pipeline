/**
 * Amina Musa — Hospital discharge FHIR fixture (Act 5)
 * To be appended to the existing amina.fixture.ts on the server.
 * Add this export to the existing AMINA_BUNDLE as well.
 */
import type { FhirCondition } from "../types";

export const AMINA_DIAGNOSTIC_HYPOGLYCAEMIA: FhirCondition = {
  resourceType: "Condition",
  id: "amina-diag-hypogly-001",
  clinicalStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "resolved", display: "Resolved" }],
  },
  verificationStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed", display: "Confirmed" }],
  },
  code: {
    coding: [
      { system: "http://snomed.info/sct", code: "302866003", display: "Hypoglycaemia" },
      { system: "http://hl7.org/fhir/sid/icd-10", code: "E11.649", display: "Type 2 diabetes with hypoglycaemia, without coma" },
    ],
    text: "Hypoglycaemic episode — Type 2 diabetes mellitus",
  },
  subject: { reference: "Patient/amina-musa-kano-001" },
  onsetDateTime: "2026-05-27T14:20:00+03:00",
  recordedDate: "2026-05-27",
  recorder: { display: "Dr. Saad Al-Ghamdi, King Faisal Specialist Hospital, Makkah, SA" },
  note: [{
    text: "Patient presented unconscious with blood glucose 1.8 mmol/L. IV glucose administered. Recovered fully within 30 minutes. Penicillin allergy documented — no beta-lactam antibiotics administered. Metformin continued. Discharged stable same day. Outcome: resolved.",
  }],
};
