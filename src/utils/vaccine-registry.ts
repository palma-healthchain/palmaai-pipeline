/**
 * CVX Vaccine Code Registry
 * Maps CVX codes → canonical vaccine metadata for ICVP compliance
 * Source: CDC CVX list + WHO IHR ICVP disease targets
 */

export interface VaccineEntry {
  cvxCode: string;
  cvxDisplay: string;
  snomedCode?: string;
  snomedDisplay?: string;
  icvpDiseaseTarget: string;      // WHO IHR Annex 6 disease name
  icvpCompliant: boolean;         // Meets IHR 2024 ICVP requirements
  typicalValidityDays?: number;   // Typical certificate validity
  hajjRequired: boolean;          // Required for Saudi Hajj entry
}

export const CVX_REGISTRY: Record<string, VaccineEntry> = {
  // Meningococcal
  "114": {
    cvxCode: "114",
    cvxDisplay: "meningococcal MCV4O",
    snomedCode: "430868007",
    snomedDisplay: "Meningococcal vaccine",
    icvpDiseaseTarget: "meningococcal disease",
    icvpCompliant: true,
    typicalValidityDays: 1825, // 5 years
    hajjRequired: true,
  },
  "136": {
    cvxCode: "136",
    cvxDisplay: "meningococcal MCV4P",
    snomedCode: "430868007",
    snomedDisplay: "Meningococcal vaccine",
    icvpDiseaseTarget: "meningococcal disease",
    icvpCompliant: true,
    typicalValidityDays: 1825,
    hajjRequired: true,
  },
  "108": {
    cvxCode: "108",
    cvxDisplay: "meningococcal MPSV4",
    snomedCode: "430868007",
    snomedDisplay: "Meningococcal vaccine",
    icvpDiseaseTarget: "meningococcal disease",
    icvpCompliant: true,
    typicalValidityDays: 1095, // 3 years
    hajjRequired: true,
  },
  // Yellow Fever
  "184": {
    cvxCode: "184",
    cvxDisplay: "Yellow fever vaccine - live",
    snomedCode: "56844000",
    snomedDisplay: "Yellow fever vaccine",
    icvpDiseaseTarget: "yellow fever",
    icvpCompliant: true,
    typicalValidityDays: 36500, // Lifetime (IHR 2016 amendment)
    hajjRequired: false,
  },
  // COVID-19
  "212": {
    cvxCode: "212",
    cvxDisplay: "COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose",
    snomedCode: "1119349007",
    snomedDisplay: "COVID-19 mRNA vaccine",
    icvpDiseaseTarget: "COVID-19",
    icvpCompliant: true,
    typicalValidityDays: 180,
    hajjRequired: false,
  },
  "213": {
    cvxCode: "213",
    cvxDisplay: "COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5 mL dose",
    snomedCode: "1119349007",
    snomedDisplay: "COVID-19 mRNA vaccine",
    icvpDiseaseTarget: "COVID-19",
    icvpCompliant: true,
    typicalValidityDays: 180,
    hajjRequired: false,
  },
  // Influenza
  "158": {
    cvxCode: "158",
    cvxDisplay: "influenza, injectable, quadrivalent",
    snomedCode: "46233009",
    snomedDisplay: "Influenza vaccine",
    icvpDiseaseTarget: "influenza",
    icvpCompliant: true,
    typicalValidityDays: 365,
    hajjRequired: false,
  },
  // Polio
  "10": {
    cvxCode: "10",
    cvxDisplay: "IPV",
    snomedCode: "396430007",
    snomedDisplay: "Inactivated poliovirus vaccine",
    icvpDiseaseTarget: "poliomyelitis",
    icvpCompliant: true,
    hajjRequired: false,
  },
};

/** Known SNOMED vaccine codes mapped to CVX */
export const SNOMED_TO_CVX: Record<string, string> = {
  "430868007": "136",  // Meningococcal → MCV4P (default)
  "56844000":  "184",  // Yellow fever
  "1119349007": "212", // COVID-19 mRNA
  "46233009":  "158",  // Influenza
  "396430007": "10",   // Polio
};

/** WHO IHR ICVP diseases that qualify for an International Certificate */
export const ICVP_DISEASES = new Set([
  "yellow fever",
  "meningococcal disease",
  "COVID-19",
  "poliomyelitis",
  "cholera",
]);

export function lookupByCvx(cvxCode: string): VaccineEntry | undefined {
  return CVX_REGISTRY[cvxCode];
}

export function lookupBySnomed(snomedCode: string): VaccineEntry | undefined {
  const cvx = SNOMED_TO_CVX[snomedCode];
  return cvx ? CVX_REGISTRY[cvx] : undefined;
}

export function resolveVaccineEntry(
  coding: Array<{ system: string; code: string; display?: string }>
): { entry: VaccineEntry | undefined; method: string } {
  // 1. Try CVX first (preferred)
  for (const c of coding) {
    if (c.system.includes("cdc.gov/vaccines/programs/iis/ict") ||
        c.system.includes("cvx") ||
        c.system === "http://hl7.org/fhir/sid/cvx") {
      const entry = lookupByCvx(c.code);
      if (entry) return { entry, method: "direct_cvx" };
    }
  }
  // 2. Try SNOMED CT
  for (const c of coding) {
    if (c.system.includes("snomed") || c.system === "http://snomed.info/sct") {
      const entry = lookupBySnomed(c.code);
      if (entry) return { entry, method: "snomed_lookup" };
    }
  }
  // 3. Try display name fuzzy match
  for (const c of coding) {
    if (c.display) {
      const lower = c.display.toLowerCase();
      if (lower.includes("mening")) {
        return { entry: CVX_REGISTRY["136"], method: "display_fuzzy_meningococcal" };
      }
      if (lower.includes("yellow fever")) {
        return { entry: CVX_REGISTRY["184"], method: "display_fuzzy_yellow_fever" };
      }
      if (lower.includes("covid")) {
        return { entry: CVX_REGISTRY["212"], method: "display_fuzzy_covid" };
      }
    }
  }
  return { entry: undefined, method: "unresolved" };
}
