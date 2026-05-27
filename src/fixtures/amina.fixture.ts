/**
 * Amina Musa — Complete FHIR R4 Demo Fixture
 *
 * Realistic fixture representing all health records generated during
 * Amina's Hajj journey. Used in CLI demos, integration tests, and
 * the live prototype demonstration.
 *
 * Scenario: 58-year-old pilgrim from Kano, Nigeria.
 *   - Vaccinated at Kano Vaccination Centre (meningococcal + yellow fever)
 *   - Hajj physician adds diabetes + hypertension conditions
 *   - King Faisal Hospital issues diagnostic credential after emergency treatment
 */

import type { FhirPatient, FhirImmunization, FhirAllergyIntolerance, FhirCondition } from "../types.js";

export const AMINA_PATIENT: FhirPatient = {
  resourceType: "Patient",
  id: "amina-musa-kano-001",
  identifier: [
    {
      system: "http://hl7.org/fhir/v2/0203",
      value: "A12345678",
      type: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "PPN", display: "Passport number" }],
        text: "Passport number",
      },
    },
  ],
  name: [{ use: "official", family: "Musa", given: ["Amina"] }],
  birthDate: "1968-03-14",
  gender: "female",
};

/** Act 1 — Meningococcal vaccine issued by Kano Vaccination Centre, Nigeria */
export const AMINA_IMMUNIZATION_MENING: FhirImmunization = {
  resourceType: "Immunization",
  id: "amina-imm-mening-001",
  status: "completed",
  vaccineCode: {
    coding: [
      {
        system: "http://hl7.org/fhir/sid/cvx",
        code: "136",
        display: "Meningococcal MCV4P vaccine",
      },
      {
        system: "http://snomed.info/sct",
        code: "430868007",
        display: "Meningococcal vaccine",
      },
    ],
    text: "Meningococcal (Groups A,C,Y,W-135) Polysaccharide Diphtheria Toxoid Conjugate Vaccine",
  },
  patient: { reference: "Patient/amina-musa-kano-001", display: "Amina Musa" },
  occurrenceDateTime: "2026-04-10T09:30:00+01:00",
  recorded: "2026-04-10T09:35:00+01:00",
  lotNumber: "KVC2026-MEN-0042",
  expirationDate: "2028-04-10",
  manufacturer: { display: "Sanofi Pasteur" },
  performer: [
    {
      function: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0443", code: "AP", display: "Administering Provider" }],
      },
      actor: { display: "Dr. Ibrahim Yusuf — Kano Vaccination Centre, NG" },
    },
  ],
  protocolApplied: [{ series: "Hajj Pre-travel", doseNumberPositiveInt: 1, seriesDosesPositiveInt: 1 }],
  location: { display: "Kano Vaccination Centre, Kano State, NG" },
  extension: [
    {
      url: "https://palma-healthchain.org/fhir/StructureDefinition/recorder-country",
      valueCode: "NG",
    },
  ],
};

/** Act 1 — Yellow fever vaccine, same visit */
export const AMINA_IMMUNIZATION_YF: FhirImmunization = {
  resourceType: "Immunization",
  id: "amina-imm-yf-001",
  status: "completed",
  vaccineCode: {
    coding: [
      {
        system: "http://hl7.org/fhir/sid/cvx",
        code: "184",
        display: "Yellow fever vaccine - live",
      },
      {
        system: "http://snomed.info/sct",
        code: "56844000",
        display: "Yellow fever vaccine",
      },
    ],
    text: "Yellow Fever Vaccine (live attenuated)",
  },
  patient: { reference: "Patient/amina-musa-kano-001", display: "Amina Musa" },
  occurrenceDateTime: "2026-04-10T09:45:00+01:00",
  recorded: "2026-04-10T09:50:00+01:00",
  lotNumber: "KVC2026-YF-0019",
  manufacturer: { display: "Bio-Manguinhos / Fiocruz" },
  performer: [
    {
      function: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0443", code: "AP", display: "Administering Provider" }],
      },
      actor: { display: "Dr. Ibrahim Yusuf — Kano Vaccination Centre, NG" },
    },
  ],
  protocolApplied: [{ series: "Yellow Fever (lifetime)", doseNumberPositiveInt: 1, seriesDosesPositiveInt: 1 }],
  location: { display: "Kano Vaccination Centre, Kano State, NG" },
  extension: [
    {
      url: "https://palma-healthchain.org/fhir/StructureDefinition/recorder-country",
      valueCode: "NG",
    },
  ],
};

/** Act 1 — Penicillin allergy — pre-existing, recorded at same clinic visit */
export const AMINA_ALLERGY_PENICILLIN: FhirAllergyIntolerance = {
  resourceType: "AllergyIntolerance",
  id: "amina-allergy-pen-001",
  clinicalStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active", display: "Active" }],
  },
  verificationStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed", display: "Confirmed" }],
  },
  type: "allergy",
  category: ["medication"],
  criticality: "high",
  code: {
    coding: [
      {
        system: "http://snomed.info/sct",
        code: "764146007",
        display: "Penicillin",
      },
    ],
    text: "Penicillin (class allergy)",
  },
  patient: { reference: "Patient/amina-musa-kano-001" },
  onsetDateTime: "1995-01-01",
  recordedDate: "2026-04-10",
  recorder: { display: "Dr. Ibrahim Yusuf, Kano Vaccination Centre, NG" },
  note: [{ text: "Patient reports severe anaphylaxis following amoxicillin in 1995. Avoid all penicillin-class antibiotics." }],
  reaction: [
    {
      substance: {
        coding: [{ system: "http://snomed.info/sct", code: "372687004", display: "Amoxicillin" }],
      },
      manifestation: [
        { coding: [{ system: "http://snomed.info/sct", code: "39579001", display: "Anaphylaxis" }] },
      ],
      severity: "severe",
    },
  ],
};

/** Act 3 — Diabetes condition, issued by Hajj physician */
export const AMINA_CONDITION_DIABETES: FhirCondition = {
  resourceType: "Condition",
  id: "amina-cond-diabetes-001",
  clinicalStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active", display: "Active" }],
  },
  verificationStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed", display: "Confirmed" }],
  },
  category: [
    { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item", display: "Problem List Item" }] },
  ],
  severity: { coding: [{ system: "http://snomed.info/sct", code: "6736007", display: "Moderate" }] },
  code: {
    coding: [
      { system: "http://snomed.info/sct", code: "73211009", display: "Diabetes mellitus type 2" },
      { system: "http://hl7.org/fhir/sid/icd-10", code: "E11", display: "Type 2 diabetes mellitus" },
    ],
    text: "Type 2 Diabetes Mellitus",
  },
  subject: { reference: "Patient/amina-musa-kano-001" },
  onsetDateTime: "2018-06-01",
  recordedDate: "2026-05-15",
  recorder: { display: "Dr. Khalid Al-Rashidi, Hajj Health Screening Centre, Makkah, SA" },
  note: [{ text: "Patient manages with oral metformin 1000mg BD. HbA1c 7.2% at last check (2025-12). No insulin." }],
};

/** Act 3 — Hypertension condition, same Hajj physician encounter */
export const AMINA_CONDITION_HYPERTENSION: FhirCondition = {
  resourceType: "Condition",
  id: "amina-cond-htn-001",
  clinicalStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }],
  },
  verificationStatus: {
    coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }],
  },
  code: {
    coding: [
      { system: "http://snomed.info/sct", code: "38341003", display: "Hypertensive disorder" },
      { system: "http://hl7.org/fhir/sid/icd-10", code: "I10", display: "Essential hypertension" },
    ],
    text: "Essential Hypertension",
  },
  subject: { reference: "Patient/amina-musa-kano-001" },
  onsetDateTime: "2015-03-01",
  recordedDate: "2026-05-15",
  recorder: { display: "Dr. Khalid Al-Rashidi, Hajj Health Screening Centre, Makkah, SA" },
  note: [{ text: "Managed with amlodipine 5mg OD. BP 138/86 at screening." }],
};

/** All Amina's FHIR resources in one export */
export const AMINA_BUNDLE = {
  patient: AMINA_PATIENT,
  immunizations: [AMINA_IMMUNIZATION_MENING, AMINA_IMMUNIZATION_YF],
  allergies: [AMINA_ALLERGY_PENICILLIN],
  conditions: [AMINA_CONDITION_DIABETES, AMINA_CONDITION_HYPERTENSION],
};
