#!/usr/bin/env ts-node
/**
 * Palma HealthChain — Amina Demo Script
 *
 * Runs the full PalmaAI pipeline for all of Amina Musa's FHIR resources
 * and prints the resulting credential subjects with confidence scores.
 *
 * Usage:
 *   npm run demo
 *   ts-node scripts/demo-amina.ts
 */

import { runPipeline } from "../src/pipeline";
import { AMINA_BUNDLE } from "../src/fixtures/amina.fixture";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const BLUE   = "\x1b[34m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";

function tierColor(tier: string) {
  if (tier === "T1_AUTO")      return GREEN;
  if (tier === "T2_REVIEW")    return YELLOW;
  return RED;
}

function confBar(score: number): string {
  const filled = Math.round(score * 20);
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

async function main() {
  console.log(`\n${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${BLUE}║  Palma HealthChain — PalmaAI Pipeline Demo                ║${RESET}`);
  console.log(`${BOLD}${BLUE}║  Patient: Amina Musa, 58, Kano Nigeria — Hajj 1446H       ║${RESET}`);
  console.log(`${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}\n`);

  const outputs = [];

  // ── Process immunizations ────────────────────────────────────────────────
  for (const imm of AMINA_BUNDLE.immunizations) {
    const { result, auditEvent } = await runPipeline({
      resource: imm,
      patient: AMINA_BUNDLE.patient,
      sourceChannel: "STRUCTURED_UPLOAD",
      sourceInstitutionId: "kano-vaccination-centre-ng",
    });
    outputs.push({ label: `Immunization: ${imm.id}`, result, auditEvent });
  }

  // ── Process allergies ────────────────────────────────────────────────────
  for (const allergy of AMINA_BUNDLE.allergies) {
    const { result, auditEvent } = await runPipeline({
      resource: allergy,
      patient: AMINA_BUNDLE.patient,
      sourceChannel: "STRUCTURED_UPLOAD",
    });
    outputs.push({ label: `AllergyIntolerance: ${allergy.id}`, result, auditEvent });
  }

  // ── Print results ────────────────────────────────────────────────────────
  let t1Count = 0, t2Count = 0, t3Count = 0;

  for (const { label, result, auditEvent } of outputs) {
    const tc = tierColor(result.tier);
    const cs = result.credentialSubject;

    console.log(`${BOLD}▶ ${label}${RESET}`);
    console.log(`  Type        : ${CYAN}${cs.type}${RESET}`);
    console.log(`  Tier        : ${tc}${BOLD}${result.tier}${RESET}  ${DIM}(${result.requiresHumanReview ? "requires review" : "auto-approved"})${RESET}`);
    console.log(`  Confidence  : ${tc}${confBar(result.overallConfidence)} ${(result.overallConfidence * 100).toFixed(1)}%${RESET}`);
    console.log(`  Audit ID    : ${DIM}${auditEvent.eventId}${RESET}`);
    console.log(`  Outcome     : ${auditEvent.outcome}`);

    if (cs.type === "PalmaImmunizationCredential") {
      console.log(`  Vaccine     : ${cs.vaccineCode.display} (CVX ${cs.vaccineCode.code})`);
      console.log(`  ICVP        : ${cs.icvpCompliant ? `${GREEN}✓ compliant${RESET}` : `${RED}✗ not compliant${RESET}`}`);
      console.log(`  Country     : ${cs.recorder.country}`);
      console.log(`  Valid until : ${cs.validUntil ?? "not calculated"}`);
    } else if (cs.type === "PalmaAllergyCredential") {
      console.log(`  Substance   : ${cs.substanceName} (${cs.substanceCode.code})`);
      console.log(`  Criticality : ${cs.criticality === "high" ? `${RED}${BOLD}HIGH${RESET}` : cs.criticality}`);
    }

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`  ${YELLOW}⚠ ${w}${RESET}`);
      }
    }

    console.log(`  Processed in ${result.processingMs}ms\n`);

    if (result.tier === "T1_AUTO") t1Count++;
    else if (result.tier === "T2_REVIEW") t2Count++;
    else t3Count++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = outputs.length;
  console.log(`${BOLD}${BLUE}─────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BOLD}Summary${RESET}`);
  console.log(`  Total processed : ${total}`);
  console.log(`  ${GREEN}T1 Auto-approved${RESET} : ${t1Count} (${((t1Count/total)*100).toFixed(0)}%)`);
  console.log(`  ${YELLOW}T2 Human review${RESET}  : ${t2Count}`);
  console.log(`  ${RED}T3 Specialist${RESET}    : ${t3Count}`);
  console.log(`\n${BOLD}credentialSubject JSON (first immunization):${RESET}`);
  console.log(JSON.stringify(outputs[0].result.credentialSubject, null, 2));
  console.log(`\n${DIM}Next step: Session 5 — signing service + OID4VCI/VP endpoints${RESET}\n`);
}

main().catch((err) => {
  console.error(`${RED}Pipeline error:${RESET}`, err);
  process.exit(1);
});
