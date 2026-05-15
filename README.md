# PalmaAI Pipeline

**Agentic FHIR-to-credential pipeline — adoption layer for Palma HealthChain**

> Open-source · MIT License · Non-commercial at this stage
> Part of the [Palma HealthChain](https://github.com/palma-healthchain) project

---

## What this is

PalmaAI is the intelligence layer that bridges existing health data infrastructure to the Palma HealthChain credential schema. It reads FHIR R4 clinical data from any source, normalizes it using confidence-tiered AI agents, maps it to the canonical Palma credential schema, and delivers signed W3C Verifiable Credentials to the Patient Wallet.

**What it is not:** a general-purpose FHIR integration platform. Every major cloud provider (AWS HealthLake, Google Cloud Healthcare API, Microsoft Azure Health Data Services) moves health data between institutions. PalmaAI does something none of them do — it converts institutional health records into patient-held cryptographic credentials, with selective disclosure, patient sovereignty, and a full ISO 42001 audit trail.

---

## The market gap PalmaAI fills

The FHIR normalization problem is well-understood and well-funded. What is not solved:

| Existing solutions | What they do | What they miss |
|---|---|---|
| AWS HealthLake, Google Cloud Healthcare API | FHIR storage and normalization | Output is institutional — patient has no credential |
| Redox, Particle Health | EHR-to-EHR connectivity | No selective disclosure, no patient sovereignty |
| Mirth Connect, Talend | Clinical data transformation | No cryptographic trust, no on-chain anchor |
| LEAN (Hajj Health Card) | Proprietary Hajj certificate | Closed system, no international issuer model |

PalmaAI's output is a W3C VC 2.0 + SD-JWT credential anchored on HealthChain Core. The patient holds it. The patient controls what they disclose. Any verifier in any country can verify it without contacting the issuing institution.

---

## Architecture overview

PalmaAI is an orchestrated system of five specialized AI agents:

```
Clinical data source (FHIR R4)
        ↓
┌─────────────────────────────────────────┐
│  Workflow Agent (orchestrator)           │
│                                          │
│  ┌─────────────┐   ┌──────────────────┐ │
│  │ FHIR        │   │ Terminology      │ │
│  │ Extraction  │──▶│ Agent            │ │
│  │ Agent       │   │ (SNOMED/CVX/LOINC│ │
│  └─────────────┘   └────────┬─────────┘ │
│                             │            │
│                    ┌────────▼─────────┐  │
│                    │ Schema Mapping   │  │
│                    │ Agent            │  │
│                    │ (Palma Layer 0)  │  │
│                    └────────┬─────────┘  │
│                             │            │
│              ┌──────────────▼──────────┐ │
│              │ Confidence Tier Router  │ │
│              │ T1: auto  T2: queue     │ │
│              │ T3: specialist review   │ │
│              └──────────────┬──────────┘ │
│                             │            │
│                    ┌────────▼─────────┐  │
│                    │ Signing Agent    │  │
│                    │ SD-JWT + HSM     │  │
│                    └────────┬─────────┘  │
│                             │            │
│  ┌─────────────────────────────────────┐ │
│  │ Audit Agent (continuous)             │ │
│  │ ISO 42001 · SDAIA · full provenance  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
        ↓                    ↓
  Patient Wallet       HealthChain Core
  (OID4VCI)            (Merkle anchor)
```

---

## Three input channels

PalmaAI works with every institution at whatever level of digital maturity they have reached.

**Channel 1 — SMART on FHIR pull**
Direct API connection to any FHIR R4 endpoint. Automated, continuous, real-time. For Nphies-connected Saudi hospitals and FHIR-mature international institutions.

**Channel 2 — Nphies gateway integration**
Extracts from the Nphies Taameen data stream (~90% Saudi hospital coverage). Reaches institutions whose clinical FHIR API is not yet mature but whose claims data already flows through Nphies.

**Channel 3 — Structured upload**
Web interface for FHIR Bundle upload or structured form entry. For international clinics issuing Hajj pre-departure credentials. No API required. Works with any licensed clinician in any country with an internet connection.

A GP in Lagos using Channel 3 produces a credential that is cryptographically equivalent to one produced by King Faisal Hospital using Channel 1. The trust is in the signature and the Merkle anchor — not the input channel.

---

## Confidence-tiered mapping

```
Tier 1  >95% confidence  ~80% of records  Auto-issue + daily digest
Tier 2  70-95%           ~15% of records  Queue + single-click approval
Tier 3  <70%             ~5%  of records  Mandatory specialist review
```

Every Tier 3 decision is a training signal. Over time, Tier 3 volume shrinks. The system gets more accurate with every credential it processes. This is how PalmaAI achieves Option B (AI-primary mapping) at scale while satisfying SDAIA's human oversight requirement.

---

## Credential types supported (v0.1)

| Type | FHIR Resource | Status |
|---|---|---|
| PalmaAllergyCredential | AllergyIntolerance | Specified |
| PalmaImmunizationCredential | Immunization (IHR ICVP compliant) | Specified |
| PalmaConditionCredential | Condition | Roadmap |
| PalmaMedicationCredential | MedicationStatement | Roadmap |
| PalmaDiagnosticCredential | DiagnosticReport | Roadmap |

Full schema specification: [palma-healthchain/healthchain-core/PHC-credential-schema-v0.2.md](https://github.com/palma-healthchain/healthchain-core/blob/main/PHC-credential-schema-v0.2.md)

---

## Repository structure

```
palmaai-pipeline/
  docs/
    architecture.md          ← Full agent architecture specification
    business-case.md         ← Market analysis and competitive positioning
    api-contracts.md         ← API surface with HealthChain Core and Patient Wallet
    audit-log-schema.md      ← ISO 42001 audit log field specification
    channel-specs/
      channel-1-smart-fhir.md
      channel-2-nphies.md
      channel-3-structured-upload.md
    agent-specs/
      workflow-agent.md
      fhir-extraction-agent.md
      terminology-agent.md
      schema-mapping-agent.md
      signing-agent.md
      audit-agent.md
  src/
    agents/                  ← Agent interface definitions (TypeScript)
    channels/                ← Channel connector interfaces
    schema/                  ← Palma credential schema validators
    audit/                   ← Audit log schema and writers
  tests/                     ← Test fixtures and integration test specs
  examples/
    allergy-issuance/        ← End-to-end example: AllergyIntolerance
    immunization-hajj/       ← End-to-end example: Hajj pre-departure
  README.md
  LICENSE
```

---

## Relation to existing competitors

PalmaAI is not a general healthcare data integration platform. It does not compete with AWS HealthLake, Redox, or Google Cloud Healthcare API for the EHR-to-analytics or EHR-to-EHR market. It is the only open-source pipeline specifically designed to convert FHIR clinical data into patient-held W3C Verifiable Credentials with selective disclosure and blockchain anchoring.

The long-term opportunity: once PalmaAI has processed production credentials with documented accuracy rates, it becomes licensable as a FHIR-to-credential normalization engine for any organization building on W3C VC infrastructure — regardless of whether they use HealthChain Core for anchoring. The audit trail built from day one is the moat that no competitor can replicate retroactively.

---

## Current status

This repository contains the architecture specification and interface definitions. Implementation follows Priority 5 completion in the Palma HealthChain build sequence.

**Build sequence context:**
- ✅ Priority 1: Canonical credential schema
- ✅ Priority 2: Whitepaper v0.2
- ✅ Priority 3: HealthChainCore.sol smart contract
- ✅ Priority 4: Fuji testnet deployment (7/7 demo criteria passed)
- ✅ Priority 5: PalmaAI architecture specification (this repository)
- ⬜ Priority 6: Compliance documentation scaffold
- ⬜ Priority 7: Grant-readiness materials (SIGP)

---

## License

MIT — see LICENSE

## Part of Palma HealthChain

- [palma-healthchain/healthchain-core](https://github.com/palma-healthchain/healthchain-core) — trust layer
- [palma-healthchain/palmaai-pipeline](https://github.com/palma-healthchain/palmaai-pipeline) — this repo
- [palma-healthchain/palma-whitepaper](https://github.com/palma-healthchain/palma-whitepaper) — technical whitepaper
