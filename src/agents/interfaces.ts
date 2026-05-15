/**
 * PalmaAI Pipeline — Agent Interface Definitions
 * Version: 0.1.0
 *
 * These are interface contracts, not implementations.
 * Implementations may use any LLM, signing library, or storage backend
 * that satisfies the contract.
 */

// ─── SHARED TYPES ─────────────────────────────────────────────────────────────

export type CredentialType =
  | "PalmaAllergyCredential"
  | "PalmaImmunizationCredential"
  | "PalmaConditionCredential"
  | "PalmaMedicationCredential"
  | "PalmaDiagnosticCredential";

export type InputChannel = "CH1" | "CH2" | "CH3";

export type ConfidenceTier = "TIER1" | "TIER2" | "TIER3";

export type WorkflowStatus =
  | "EXTRACTING"
  | "NORMALIZING"
  | "MAPPING"
  | "PENDING_REVIEW"
  | "SIGNING"
  | "ANCHORING"
  | "DELIVERED"
  | "FAILED";

export type ReviewAction = "APPROVED" | "OVERRIDDEN" | "ESCALATED" | "ABANDONED";

// ─── FHIR EXTRACTION AGENT ────────────────────────────────────────────────────

export interface ExtractionRequest {
  channel: InputChannel;
  credentialType: CredentialType;
  patientIdentifier: string;  // MRN, national ID, or DID
  connectionCredentials: ChannelCredentials;
}

export interface ChannelCredentials {
  ch1?: { smartToken: string; fhirBaseUrl: string };
  ch2?: { nphiesApiKey: string; certificatePath: string };
  ch3?: { sessionId: string; structuredFormData?: object };
}

export interface ExtractionResult {
  success: boolean;
  fhirResource?: object;         // Raw FHIR R4 resource
  sourceFingerprint: string;     // SHA-256 of raw resource
  completenessScore: number;     // 0-1
  presentFields: string[];
  missingFields: string[];
  missingRequiredFields: string[]; // Blocks issuance if non-empty
  error?: string;
}

export interface FhirExtractionAgent {
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

// ─── TERMINOLOGY AGENT ────────────────────────────────────────────────────────

export interface TerminologyRequest {
  fhirResource: object;
  credentialType: CredentialType;
  targetCodingSystems: Record<string, string>;  // field → coding system URI
}

export interface FieldMapping {
  field: string;
  inputValue: string;
  inputSystem: string;
  outputCode: string;
  outputSystem: string;
  outputDisplay: string;
  confidence: number;
  reasoning: string;
  alternativeMappings: Array<{
    code: string;
    display: string;
    system: string;
    confidence: number;
  }>;
  tier: ConfidenceTier;
}

export interface TerminologyResult {
  success: boolean;
  fieldMappings: FieldMapping[];
  overallConfidence: number;
  overallTier: ConfidenceTier;
  modelVersion: string;
  modelChecksum: string;
  error?: string;
}

export interface TerminologyAgent {
  map(request: TerminologyRequest): Promise<TerminologyResult>;
}

// ─── SCHEMA MAPPING AGENT ─────────────────────────────────────────────────────

export interface SchemaMappingRequest {
  fhirResource: object;
  terminologyMappings: FieldMapping[];
  credentialType: CredentialType;
  patientDid: string;
  issuerDid: string;
  nphiesId?: string;
  recorderCountry: string;  // ISO 3166-1 alpha-2
}

export interface SchemaPayload {
  schemaVersion: string;
  credentialType: CredentialType;
  payload: Record<string, unknown>;   // Layer 0 JSON payload
  sdJwtDisclosureFlags: Record<string, boolean>;
  minimumDisclosureSet: string[];
  icvpCompliant?: boolean;            // PalmaImmunizationCredential only
  icvpStandard?: string;
  gdhcnCompatible?: boolean;
}

export interface SchemaMappingResult {
  success: boolean;
  schemaPayload?: SchemaPayload;
  validationErrors: string[];
  error?: string;
}

export interface SchemaMappingAgent {
  map(request: SchemaMappingRequest): Promise<SchemaMappingResult>;
}

// ─── HUMAN REVIEW INTERFACE ───────────────────────────────────────────────────

export interface ReviewQueueItem {
  workflowId: string;
  credentialType: CredentialType;
  tier: ConfidenceTier;
  schemaPayload: SchemaPayload;
  terminologyMappings: FieldMapping[];
  queuedAt: string;          // ISO 8601
  expiresAt: string;         // ISO 8601 (48h for Tier 2, 7d for Tier 3)
  reviewerDid?: string;      // Assigned reviewer
}

export interface ReviewDecision {
  workflowId: string;
  reviewerDid: string;
  action: ReviewAction;
  fieldOverrides: Array<{
    field: string;
    aiValue: string;
    humanValue: string;
    reason: string;
    trainingSignal: boolean;
  }>;
  escalationReason?: string;
}

// ─── SIGNING AGENT ────────────────────────────────────────────────────────────

export interface SigningRequest {
  workflowId: string;
  schemaPayload: SchemaPayload;
  issuerDid: string;
  issuerKeyId: string;       // Key identifier in issuer's DID document
  patientDid: string;
  walletEndpoint?: string;   // OID4VCI endpoint, null for custodial
  healthChainCoreAddress: string;
  network: string;           // "avalanche-fuji" | "avalanche-l1-healthchain"
}

export interface SigningResult {
  success: boolean;
  credentialId?: string;
  sdJwt?: string;            // Compact SD-JWT string
  merkleLeaf?: string;       // bytes32 hex
  merkleRoot?: string;       // bytes32 hex (new root after this credential)
  anchorTxHash?: string;     // Blockchain transaction hash
  anchorBlockNumber?: number;
  deliveryMethod?: "OID4VCI" | "CUSTODIAL";
  sdJwtHeaderHash?: string;
  credentialHash?: string;
  error?: string;
}

export interface SigningAgent {
  sign(request: SigningRequest): Promise<SigningResult>;
}

// ─── AUDIT AGENT ──────────────────────────────────────────────────────────────

export interface AuditEvent {
  workflowId: string;
  event: string;
  timestamp: string;         // ISO 8601
  data: Record<string, unknown>;
}

export interface AuditRecord {
  auditId: string;
  credentialId: string;
  credentialType: CredentialType;
  workflowStarted: string;
  workflowCompleted?: string;
  workflowStatus: string;
  issuerDid: string;
  channel: InputChannel;
  overallTier: ConfidenceTier;
  events: AuditEvent[];
}

export interface AggregateReport {
  reportDate: string;
  issuerDid: string;
  totalCredentials: number;
  byType: Record<CredentialType, number>;
  byChannel: Record<InputChannel, number>;
  tier1Pct: number;
  tier2Pct: number;
  tier3Pct: number;
  overrideRate: number;
  avgReviewTimeSec: number;
  avgConfidence: number;
  confidenceByField: Record<string, number>;
  overridesByField: Record<string, number>;
  modelDriftAlert: boolean;
  failedCredentials: number;
  failureReasons: Record<string, number>;
}

export interface AuditAgent {
  logEvent(event: AuditEvent): Promise<void>;
  getAuditRecord(workflowId: string): Promise<AuditRecord | null>;
  generateDailyReport(issuerDid: string, date: string): Promise<AggregateReport>;
}

// ─── WORKFLOW AGENT ───────────────────────────────────────────────────────────

export interface WorkflowRequest {
  triggerId: string;         // Idempotency key — same trigger = same result
  channel: InputChannel;
  credentialType: CredentialType;
  patientIdentifier: string;
  patientDid: string;
  issuerDid: string;
  issuerKeyId: string;
  nphiesId?: string;
  recorderCountry: string;
  connectionCredentials: ChannelCredentials;
  walletEndpoint?: string;
  healthChainCoreAddress: string;
  network: string;
}

export interface WorkflowResult {
  workflowId: string;
  status: WorkflowStatus;
  credentialId?: string;
  tier: ConfidenceTier;
  anchorTxHash?: string;
  error?: string;
  auditRecordId: string;
}

export interface WorkflowAgent {
  execute(request: WorkflowRequest): Promise<WorkflowResult>;
  getStatus(workflowId: string): Promise<WorkflowStatus>;
  cancelWorkflow(workflowId: string, reason: string): Promise<void>;
}
