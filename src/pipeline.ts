/**
 * PalmaAI Pipeline Orchestrator
 * Routes FHIR resources to the correct mapper agent.
 * Emits ISO 42001 audit events for every decision.
 */

import { v4 as uuid } from "uuid";
import type {
  FhirResource,
  FhirPatient,
  PipelineResult,
  AuditEvent,
} from "./types";
import { mapImmunization } from "./mappers/immunization.mapper";
import { mapAllergy } from "./mappers/allergy.mapper";

const PIPELINE_VERSION = "0.2.0";

export interface PipelineInput {
  resource: FhirResource;
  patient: FhirPatient;
  sourceChannel?: AuditEvent["sourceChannel"];
  sourceInstitutionId?: string;
  includeName?: boolean;
}

export interface PipelineOutput {
  result: PipelineResult;
  auditEvent: AuditEvent;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { resource, patient, sourceChannel = "STRUCTURED_UPLOAD", sourceInstitutionId } = input;

  let result: PipelineResult;

  switch (resource.resourceType) {
    case "Immunization":
      result = await mapImmunization(resource, patient, {
        includeName: input.includeName,
        sourceChannel,
      });
      break;
    case "AllergyIntolerance":
      result = await mapAllergy(resource, patient);
      break;
    default:
      throw new Error(`Unsupported FHIR resource type: ${(resource as { resourceType: string }).resourceType}`);
  }

  const auditEvent: AuditEvent = {
    eventId: uuid(),
    timestamp: new Date().toISOString(),
    agentId: `PalmaAI:${resource.resourceType}Mapper`,
    agentVersion: PIPELINE_VERSION,
    sourceChannel,
    sourceInstitutionId,
    fhirResourceType: resource.resourceType,
    fhirResourceId: resource.id,
    decisionType: "CREDENTIAL_MAPPING",
    outcome:
      result.tier === "T1_AUTO" ? "AUTO_APPROVED"
      : result.tier === "T2_REVIEW" ? "QUEUED_REVIEW"
      : "ESCALATED",
    tierAssigned: result.tier,
    confidenceScore: result.overallConfidence,
    confidenceFactors: result.decisions.map((d) => `${d.field}:${d.method}:${d.confidence.toFixed(2)}`),
    credentialType: result.credentialSubject.type,
    warnings: result.warnings,
  };

  return { result, auditEvent };
}
