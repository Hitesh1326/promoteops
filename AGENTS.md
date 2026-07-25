# AGENTS.md

## Cursor Cloud specific instructions

PromoteOps is a single TypeScript product: an **MCP server** (Node ≥20, ESM) that reports CloudFormation stack drift across dev → test → prod and (later milestones) promotes stacks. It speaks **MCP over stdio only** — there is no HTTP endpoint, so you cannot `curl` it; drive it with an MCP client (see the stdio note below). There are no databases or background services to stand up.

Standard commands live in `package.json` `scripts` and `README.md`; use those. Notes below are the non-obvious bits.

- `npm install` runs the `prepare` hook, which runs `npm run build` (`tsc` + `dist/scripts/copyReportAssets.js`). So a plain install already produces `dist/`.
- There is **no lint script**. Type-checking is what `npm run build` does (`tsc` in `strict` mode); treat a clean build as the lint/typecheck gate.
- Tests: `npm run test` (Vitest, `*.test.ts` co-located with source). They mock AWS, so **no AWS credentials or network are needed**.
- Offline demo / fastest end-to-end check: `npm run report:fixture` builds and writes a self-contained HTML report to `tmp/report.html` (path from `paths.reportOutput` in `config.yaml`) using deterministic fixture data — **no AWS needed**. Open the file in a browser to see the stack matrix + diff drawer.
- Local config: copy `config.example.yaml` → `config.yaml` and `mapper.example.json` → `mapper.json` (both gitignored). These are only required for **live** runs and the fixture report's output path; unit tests use their own fixtures.
- Running the server: `npm start` (or `node dist/index.js`). It waits on stdio for an MCP client and exposes `ping`, `report_stacks`, `diff_stack`. To smoke-test without a full client, connect with `@modelcontextprotocol/sdk`'s `Client` + `StdioClientTransport` and call a tool with `arguments: { source: "fixture" }`.
- **Live** AWS mode (`source=live`, the default for `report_stacks`) needs AWS SSO profiles (dev/test/prod) configured per `config.yaml`; expired sessions surface an `aws sso login --profile …` message. Live AWS is not available in this environment — use `source=fixture` for local verification.
