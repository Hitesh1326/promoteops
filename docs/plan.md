---
name: PromoteOps MCP Server
overview: "OSS TypeScript MCP server for CloudFormation stack drift reports and plan-then-execute promotions (dev/test/prod). Stacks only — no S3. M1–M8."
todos:
  - id: m1-scaffold
    content: "M1 — Scaffold: package bin, tsconfig, deps, examples. Test: install + tsc; process starts."
    status: completed
  - id: m2-config-mapper
    content: "M2 — Load config.yaml + mapper.json (NOT_DEPLOYED/EXCLUDED). Test: valid/invalid fixtures."
    status: completed
  - id: m3-aws-clients
    content: "M3 — Per-env CFN clients via SSO; expired-session re-login message. Test: dev/test/prod clients."
    status: completed
  - id: m4-report-fixture
    content: "M4 — Fixture HTML report + report_stacks/diff_stack (matrix-first UX). Test: report:fixture; no AWS."
    status: completed
  - id: m5-live-compare
    content: "M5 — Live compare: fetch/normalize/hash/timestamps; unmapped; target-newer warning triangle. Fixture mode kept for UX. Test: mocked inventory + fixture path; zero writes."
    status: completed
  - id: m6-plan-store-audit
    content: "M6 — Plan files + audit JSONL + staleness. Test: save/load/mark-executed without AWS."
    status: pending
  - id: m7-stack-promotion
    content: "M7 — plan_stack_promotion + execute_stack_promotion (elicit, change sets); extra caution if target newer."
    status: pending
  - id: m8-docs-e2e
    content: "M8 — Docs + E2E: report → plan → execute one stack in Cursor or VS Code Copilot."
    status: pending
isProject: false
---

# PromoteOps — Implementation Plan

Living doc. Prefer updating this over treating older drafts as locked.

## 1. Goal

MCP server (`promoteops`) that:

1. Reports CloudFormation stack drift across **dev → test → prod** (HTML + short chat summary).
2. Promotes stacks via **plan → execute** (no writes during plan; elicitation before execute).
3. Never combines plan/diff and apply in one tool call.

**Inspired by** internal StackMate (mapper, statuses, unmapped visibility, env diffs). **Not** a React/.NET app. **OSS v1 is stacks-only** — no S3 config/binary tools.

**Location:** `/Users/hitesh/projects/promoteops`

## 2. Product decisions

| Topic | Decision |
|---|---|
| Stack | TypeScript, MCP SDK, AWS SDK v3 (CloudFormation only) |
| Mapper | `{ mappings: { [template]: [{ dev, test, prod }, ...] } }` with `NOT_DEPLOYED` / `EXCLUDED` |
| Instance id | Deployable stack name (dev, else test, else prod) |
| Compare | Test vs Dev, Prod vs Test |
| Promote from | Local templates path in `config.yaml` |
| Auth | SSO profiles in `config.yaml`; expired → `aws sso login --profile …` |
| Plans / audit | `~/.promoteops/plans/`, `~/.promoteops/` JSONL |
| Ship to work | `npm pack` → Slack → `npm install -g ./….tgz` (bump version to refresh) |

### Status (per env on a mapped instance)

| Status | Meaning |
|---|---|
| `excluded` | Mapper `EXCLUDED` |
| `not_deployed` | Mapper `NOT_DEPLOYED`, or mapped name missing in AWS |
| `current` | Deployed; **hash matches** lower env |
| `outdated` | Deployed; **hash differs** from lower env |

- Dev is never `outdated` (baseline for Test).
- **Ignored / unmapped:** in AWS but not in mapper — visibility only, not promote targets. Shown as a separate end table (“Ignored stacks”).
- Do not use labels `missing`, `in_sync`, or `skipped`.

### Drift (hash + timestamp)

| Signal | Job |
|---|---|
| Normalized template → **SHA-256** | Content equality → `current` / `outdated` |
| Stack timestamps | Which side is **newer** (`newerSide`) |

- Hashes equal → `current` even if clocks differ.
- Hashes differ → always `outdated` (content differs from lower env).
- **Target-newer (rare):** outdated **and** higher env timestamp is newer than lower. Status stays Outdated. Show a **warning triangle** next to the label; hover: *“Target is newer than the source. Review carefully before promoting — you may overwrite newer changes.”* Repeat that line in the diff drawer. Chat shortlist sorts those above other outdated. Do not auto-flip promote direction in the report; M7 adds extra confirm at plan/execute.
- Needs action = `outdated` + `not_deployed` (not `excluded`).
- Normalize before hash so formatting noise does not false-flag outdated.
- Expired SSO fails the whole report before HTML is written (not a mid-report status).

### Code organization

- Feature folders: `config/`, `mapper/`, `stacks/`, `report/`, `aws/`, `tools/`, `shared/`
- Module + test co-located; `shared/` flat
- Types live with the owner module; local consumer shapes across boundaries
- File-level comments only (inline only for non-obvious *why*)
- Plain names; report HTML/CSS under `report/html` + `report/css`
- One public error type per pipeline (`ConfigLoadError`, `MapperLoadError`, `AwsClientError`, …)

## 3. Architecture

```mermaid
flowchart TB
  Client["MCP client"] <--> Server[PromoteOps]
  Server --> Compare[Stack compare]
  Server --> Report[HTML report]
  Server --> Plans[Plan store]
  Server --> Audit[Audit log]
  Compare --> CFN[CFN clients SSO]
  Compare --> Mapper[mapper.json]
  Report --> HTML[report.html]
```

```
src/
  shared/  config/  mapper/  aws/clients/
  stacks/stackComparison/   # shapes, shortlist helpers
  stacks/compareStacks/     # M5 live fetch + hash + unmapped
  report/buildReport|html|css/
  fake/                     # Offline fixture report (kept for UX; source=fixture)
  planStore/  audit/        # M6
  tools/reportStacks|diffStack|planStackPromotion|executeStackPromotion/
  server.ts  index.ts
```

## 4. Tools

| Tool | Type | Behavior |
|---|---|---|
| `report_stacks` | read-only | Live compare (default) or `source=fixture` → HTML + chat summary |
| `diff_stack` | read-only | One instance pair template diff (live cache or fixture) |
| `plan_stack_promotion` | read-only | Local template + params → `PlanRecord` |
| `execute_stack_promotion` | mutating | Elicit → staleness → change set → execute → audit |

## 5. Milestones

Gate each milestone before starting the next.

| ID | Status | Ship | Test |
|---|---|---|---|
| **M1** | done | Scaffold | `tsc` + process starts |
| **M2** | done | Config + mapper load | Fixtures valid/invalid |
| **M3** | done | CFN clients + SSO errors | Per-env clients; re-login message |
| **M4** | done | Fixture report + MCP tools; matrix-first UX (see §6) | `npm run report:fixture`; no AWS |
| **M5** | done | Live fetch/normalize/hash/timestamps; unmapped; target-newer triangle; fixture mode retained | Unit tests on inventory→report; `report:fixture` still works; zero CFN writes |
| **M6** | pending | Plan store + audit | Round-trip without AWS |
| **M7** | pending | Plan + execute promotion; extra caution if target newer | Plan read-only; elicit; stale rejected |
| **M8** | pending | Docs + E2E | Report → plan → execute one stack in Copilot/Cursor |

## 6. Report UX (locked — matrix-first)

Desktop ops report. The **matrix is the report**. No summary cards, no duplicate shortlist section in HTML. Chat gets the capped shortlist; HTML surfaces attention via **sort + filters**.

**Layout**
1. Header: **PromoteOps** + “Stack report”, generated time (TZ-explicit), source (`fixture`/`live`), region, **Dev → Test → Prod**, plain-text counts (mapped / need action / ignored)
2. Mapped matrix (primary)
3. Ignored stacks table (end, collapsible)
4. Collapsed “How to read this report”

**Matrix**
- Columns: Template/Instance · Dev · Test · Prod
- One row per mapper instance; attention-first sort: `not_deployed` → target-newer `outdated` → other `outdated` → rest
- Cell: status **dot + label**, stack name or special value, compact time, **View diff** when outdated; **warning triangle** (hover text above) when target-newer; short hash in `title`
- Sticky header + identity column; beige light theme; system fonts; no CDN

**Filters:** search, status, Needs action only, Clear, “Showing X of Y”. Usable empty state. Without JS, all rows still readable.

**Diff drawer:** slide-over; title Dev→Test / Test→Prod; target-newer caution line when applicable; always embed full diff; Esc/scrim/close; works with `:target` without JS; print shows diffs inline.

**Ignored stacks:** one table (Environment, Stack, CFN status, Last activity); env filter; “not tracked for promotion.”

**Chat (`report_stacks`):** time, source, mapped count, need-action counts (non-zero statuses only), ignored counts by env, target-newer count, capped shortlist (omit “0 more” noise), HTML path + `file://` URI. Never dump all rows; no partial-data / unmapped wording.

**Packaging:** self-contained `report.html` (inline CSS); write only to configured output path (`0600`, atomic); escape all mapper/AWS text; default path gitignored.

## 7. Out of scope (OSS v1)

S3 config/binary flows · mapper auto-discovery · nested-stack deep compare · React/.NET UI · shared S3 audit · plan+apply in one tool · public npm before the stack path is solid

## 8. Work-machine check

1. M5 against real SSO profiles (or pack after local M5).
2. Bump version → `npm pack` → Slack.
3. Work: `npm install -g ./promoteops-x.y.z.tgz`, `config.yaml` + `mapper.json`, Leapp, MCP → `promoteops`.
4. Reinstall later builds the same way with a new tarball.
