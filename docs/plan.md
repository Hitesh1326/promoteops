---
name: PromoteOps MCP Server
overview: Build PromoteOps, a TypeScript MCP server (no React/.NET) that reports drift across dev/test/prod for CloudFormation stacks, S3 config files, and S3 binaries, and performs promotions only through an explicit plan-then-execute flow gated by human confirmation. Delivery is split into M1–M10 testable milestones.
todos:
  - id: m1-scaffold
    content: "M1 — Project scaffold: package.json bin, tsconfig, deps, .gitignore (mapper/config + tmp/), examples, empty tmp/configs/. Test: npm install + tsc; process starts cleanly."
    status: completed
  - id: m2-config-mapper
    content: "M2 — Config + mapper loading: zod schemas; SSO profiles + local template path from config.yaml; brand-new mapper.json with NOT_DEPLOYED/EXCLUDED. Test: fixture load/reject/sentinel/path resolution."
    status: pending
  - id: m3-aws-client-factory
    content: "M3 — AWS client factory: per-env CFN/S3 via SSO; clear expired-token message. Test: clients for dev/test/prod; expired SSO surfaces readable re-login error."
    status: pending
  - id: m4-stack-report
    content: "M4 — Stack compare + report: StackComparer (normalize/hash/timestamp), report_stacks, diff_stack, HTML + shortlist. Comparisons: live test vs dev, prod vs test. Test: small real mapper slice; no AWS writes."
    status: pending
  - id: m5-config-binary-report
    content: "M5 — Config + binary compare + report: report_configs, report_binaries, timestamp status, HTML + shortlist. Test: same as M4 for configs/binaries; zero mutations."
    status: pending
  - id: m6-plan-store-audit
    content: "M6 — Plan store + audit: FilePlanRepository (~/.promoteops/plans/), LocalFileAuditLogger JSONL, staleness fields. Test: save/load/mark-executed + audit append without AWS."
    status: pending
  - id: m7-stack-promotion
    content: "M7 — Stack promotion: plan_stack_promotion (local template from config path, param review, finalize PlanRecord) + execute_stack_promotion (elicit, staleness, CreateChangeSet+ExecuteChangeSet, audit). Test: plan read-only; execute gated; stale plan rejected."
    status: pending
  - id: m8-config-promotion
    content: "M8 — Config promotion: get_config → project tmp/configs/ (gitignored) → plan_config_promotion → execute PutObject + elicit + audit. Test: download/edit/plan/execute loop with confirmation."
    status: pending
  - id: m9-binary-promotion
    content: "M9 — Binary promotion: plan_binary_promotion + execute_binary_promotion (CopyObject test→prod only). Test: plan read-only; execute gated copy + audit."
    status: pending
  - id: m10-docs-e2e
    content: "M10 — Docs + E2E smoke: README + mapper/tools/AWS/safety docs; full happy path in real MCP client. Test: report → plan → execute for one stack and one config with elicitation."
    status: pending
isProject: false
---

# PromoteOps MCP Server — Implementation Plan

## Project location
Greenfield at `/Users/hitesh/projects/promoteops` (directory exists, currently empty).

## Goal
An MCP server, installable via `npx promoteops`, that:
1. Reports which CloudFormation stacks / S3 config files / S3 binaries are out of sync between **test vs dev** and **prod vs test**, rendered as a browsable HTML report (GitHub-style diffs) plus a short chat-friendly summary.
2. Lets the user promote an outdated item through a strict **plan → execute** flow with no AWS mutation during planning, and native MCP elicitation (or token fallback) before any write.
3. Never lets an agent chain "diff" and "apply" into a single call.

## Core design decisions (finalized in discussion)

- **Language:** TypeScript, MCP SDK (`@modelcontextprotocol/sdk`) + AWS SDK v3.
- **No React, no .NET** anywhere in this project.
- **Mapper file** (`mapper.json`) is brand-new and populated incrementally as we go. Shape: `{ mappings: { [templateName]: [{ dev, test, prod }, ...] } }`, with sentinel values `NOT_DEPLOYED` (missing, not yet deployed) and `EXCLUDED` (intentionally skip that env for that instance). Templates absent from the mapper are out of scope — no auto-discovery in v1.
- **Instance identification:** each array entry (instance) is identified by its **dev stack name** (falling back to test, then prod, when dev itself is `NOT_DEPLOYED`) — no numeric indices in tool calls.
- **Env comparison pairs (reports and drift status):** live templates compared **test vs dev** and **prod vs test**. Same pairs for configs/binaries where applicable.
- **Stack comparison:** `GetTemplate` + normalize (parse YAML/JSON to canonical form) + SHA-256 hash for equality, plus `DescribeStacks` timestamp (`LastUpdatedTime`) to show which side is newer. Parameters are excluded from stack status/diffing (each env intentionally has different values).
- **Config comparison:** S3 `HeadObject`/`GetObject` — timestamp-only for report status (no hashing); all configs are JSON, so on-demand diff is a structural key-level diff.
- **Binary comparison:** S3 timestamp-only comparison test vs prod.
- **Binary promotion:** copy-only (`CopyObject` test→prod). No pipeline trigger call — the S3-drop-triggered deployment already exists on the AWS side.
- **Plan/execute split (hard rule):** every mutating action is two separate tool calls. Plan tools are 100% read-only (no `CreateChangeSet` during planning — moved to execute time, right before `ExecuteChangeSet`, so no idle change sets are left in AWS if the user changes their mind).
- **Parameters:** plan step returns the full list of **current live parameter values** (from `DescribeStacks`) for user re-verification (no silent carry-forward), plus any **new parameters** not present on the current stack (template `Default:` shown only as a hint, never auto-applied). User supplies overrides/new values via a second `plan_*` call before finalizing; execute always sends explicit resolved values (no `UsePreviousValue` ambiguity).
- **Template source for promotion:** local git working tree file; **local template path comes from `config.yaml` / env config** (not the mapper), so promotion always reflects whatever branch the user currently has checked out.
- **Report vs promotion:** reports answer “are envs out of sync?” using live env pairs above; promotion pushes content from the configured local template path into the target env.
- **Config edit loop:** `get_config` writes into a **project-local** directory (e.g. `tmp/configs/`) that is **gitignored**; plan/execute use that edited file.
- **Local plan storage:** `PlanRepository` interface with a `FilePlanRepository` v1 implementation (JSON files under `~/.promoteops/plans/`), swappable later. Plans store a `planId`, target, resolved payload, and a `targetCurrentTemplateHash` snapshot for staleness detection at execute time (abort + ask to replan if target changed since planning).
- **Confirmation mechanism:** MCP elicitation (`ctx.elicit`) as the primary human-approval gate before any execute call (confirmed broadly supported, including Copilot).
- **AWS credentials:** SSO-based named profiles, one per env (`dev`, `test`, `prod`), configured in `config.yaml`; credential provider must handle SSO token expiry with a clear re-login message.
- **Audit logging:** `AuditLogger` interface; v1 = local JSONL file per install (`~/.promoteops/audit.log`); v2 (future, not in this pass) = S3-backed shared log. Each team runs their own instance with their own mapper/config/audit log — no shared state assumed.
- **Diffing/rendering:** `diff` (jsdiff) to compute unified diffs, `diff2html` to render GitHub-style HTML in the generated report.
- **Report output:** a generated `report.html` (grid + click-to-expand diff) written locally and opened in the browser, plus a compact chat-facing summary (counts) and shortlist (outdated/missing only — never all rows by default).

## Architecture

```mermaid
flowchart TB
    Client["MCP Client (Cursor / Copilot)"] <--> Server[MCP Server process]

    subgraph Server[" "]
        Tools[Tool handlers - thin, zod-validated]
        Domain[Domain services - Comparer / PromotionPlanner / PromotionExecutor]
        PlanStore[FilePlanRepository - JSON files]
        Audit[LocalFileAuditLogger - JSONL]
        Report[Report builder - diff2html]
    end

    Tools --> Domain
    Tools --> PlanStore
    Tools --> Audit
    Tools --> Report

    Domain --> AWSFactory[AWS client factory - per-env SSO profiles]
    Domain --> LocalTemplates[Local template path from config]
    Domain --> ConfigTemp[Project tmp/configs gitignored]

    AWSFactory --> AWS[("CloudFormation / S3")]
    Report --> HTML[report.html]
```

## Directory structure

```
promoteops/
  src/
    server.ts                        # registers tools, starts stdio transport
    config/
      loadConfig.ts                  # config.yaml -> env profiles, local template path
      loadMapper.ts                  # mapper.json loader + zod schema + sentinel handling
      schemas.ts                     # zod schemas for config/mapper
    aws/
      clientFactory.ts               # per-env CFN/S3 clients via SSO profiles, cached
    domain/
      contracts.ts                   # Comparer<T>, PromotionPlanner<T>, PromotionExecutor<T>
      stacks/
        StackComparer.ts
        StackPromotionPlanner.ts
        StackPromotionExecutor.ts
      configs/
        ConfigComparer.ts
        ConfigPromotionPlanner.ts
        ConfigPromotionExecutor.ts
      binaries/
        BinaryComparer.ts
        BinaryPromotionExecutor.ts    # copy-only, no separate planner needed beyond compare
    planStore/
      contracts.ts                   # PlanRepository interface
      FilePlanRepository.ts
    audit/
      contracts.ts                   # AuditLogger interface
      LocalFileAuditLogger.ts
    report/
      buildHtml.ts                   # diff2html-based report renderer
      templates/
    tools/
      reportStacks.ts
      reportConfigs.ts
      reportBinaries.ts
      diffStack.ts
      planStackPromotion.ts
      executeStackPromotion.ts
      getConfig.ts
      planConfigPromotion.ts
      executeConfigPromotion.ts
      planBinaryPromotion.ts
      executeBinaryPromotion.ts
  tmp/
    configs/                         # config edit workspace; gitignored
  mapper.example.json                # starter shape, ships in repo
  config.example.yaml                # SSO profiles + local template path
  .gitignore                          # excludes real mapper.json/config.yaml and tmp/
  package.json                        # "bin": { "promoteops": "dist/index.js" }
  README.md
  docs/
    mapper-schema.md
    tools-reference.md
    setup-aws-profiles.md
    safety-model.md
  LICENSE
```

## Tool contract summary

| Tool | Type | Behavior |
|---|---|---|
| `report_stacks()` | read-only | Compare all mapper stack entries (test vs dev, prod vs test); hash + timestamp; writes `report.html`, returns summary + outdated/missing shortlist |
| `report_configs()` | read-only | Same pattern for S3 configs, timestamp-only |
| `report_binaries()` | read-only | Same pattern for S3 binaries, timestamp-only |
| `diff_stack(devStackName, fromEnv, toEnv)` | read-only | Full GitHub-style template diff for one instance |
| `plan_stack_promotion(devStackName, targetEnv, paramOverrides?)` | read-only | Uses local template from config path; returns template diff + `currentParameters` + `newParameters`; on second call with `paramOverrides`, finalizes and saves a local `PlanRecord` |
| `execute_stack_promotion(planId)` | **mutating** | Elicit confirmation; staleness check against `targetCurrentTemplateHash`; `CreateChangeSet` + `ExecuteChangeSet` (created and consumed together); mark plan executed; audit log |
| `get_config(name, env)` | read-only | Downloads config to project `tmp/configs/` for review/edit |
| `plan_config_promotion(name, targetEnv)` | read-only | Diffs edited local temp file vs live target JSON object |
| `execute_config_promotion(planId)` | **mutating** | Elicit confirmation; `PutObject`; audit log |
| `plan_binary_promotion(name)` | read-only | Compares test/prod object timestamp |
| `execute_binary_promotion(planId)` | **mutating** | Elicit confirmation; `CopyObject` test→prod only; audit log |

## Milestones (testable gates)

Each milestone must pass its test gate before starting the next.

### M1 — Project scaffold
**Ship:** `package.json` with `bin`, TypeScript config, MCP/AWS/zod/diff deps, `.gitignore` (real mapper/config + `tmp/`), `mapper.example.json`, `config.example.yaml`, empty `tmp/configs/`.
**Test:** `npm install` + `tsc` succeed; process starts and exits cleanly on stdio.

### M2 — Config + mapper loading
**Ship:** Load `config.yaml` (SSO profiles, local template path) + brand-new `mapper.json` with zod; sentinel handling.
**Test:** Fixtures for valid load, reject bad files, resolve `NOT_DEPLOYED`/`EXCLUDED`, resolve local template path from config.

### M3 — AWS client factory
**Ship:** Cached per-env CFN/S3 clients via SSO; clear expired-token messaging.
**Test:** Clients resolve for `dev`/`test`/`prod`; expired SSO produces a readable re-login message.

### M4 — Stack compare + report (read-only)
**Ship:** `StackComparer`, `report_stacks`, `diff_stack`, HTML report (`diff2html`), chat summary + outdated/missing shortlist.
**Comparisons:** live **test vs dev**, **prod vs test**.
**Test:** Run against a small real mapper slice; HTML opens; shortlist only drift/missing; no AWS writes.

### M5 — Config + binary compare + report (read-only)
**Ship:** Config/binary comparers + `report_configs` / `report_binaries` + HTML/shortlist.
**Test:** Same as M4 for configs/binaries; still zero mutations.

### M6 — Plan store + audit log
**Ship:** `FilePlanRepository` (`~/.promoteops/plans/`), `LocalFileAuditLogger` (JSONL); save/load/mark-executed; staleness fields on plan records.
**Test:** Round-trip a fake plan; mark executed; append audit line; no AWS required.

### M7 — Stack promotion (plan → execute)
**Ship:** `plan_stack_promotion` (local template from config path, param review, finalize `PlanRecord`); `execute_stack_promotion` (elicit, staleness, change-set-at-execute-time, audit).
**Test:** Plan produces no CFN writes; execute only after confirm; reject stale plan; audit entry written.

### M8 — Config promotion (plan → execute)
**Ship:** `get_config` → `tmp/configs/` → `plan_config_promotion` → `execute_config_promotion` (`PutObject` + elicit + audit).
**Test:** Download → edit temp → plan shows diff → execute uploads; confirmation gate works.

### M9 — Binary promotion (plan → execute)
**Ship:** `plan_binary_promotion` / `execute_binary_promotion` (`CopyObject` test→prod only).
**Test:** Plan is read-only compare; execute copies only after elicit; audit logged.

### M10 — Docs + end-to-end smoke
**Ship:** README + `docs/mapper-schema.md`, `tools-reference.md`, `setup-aws-profiles.md`, `safety-model.md`.
**Test:** Fresh setup → `report_*` → plan → execute (one stack + one config) with elicitation in the actual MCP client.

## Explicitly out of scope for this pass

- Auto-discovery / convention-based mapper generation
- Nested stack comparison
- Any React or .NET code
- S3-backed shared audit log (v2)
- Any tool that both plans and applies in a single call
