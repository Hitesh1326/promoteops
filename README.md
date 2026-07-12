# PromoteOps

MCP server for reporting CloudFormation / S3 config / binary drift across
dev → test → prod, and promoting only through an explicit plan → execute flow.

## Status

**M1 scaffold complete.** Later milestones add config/mapper loading, AWS clients,
reports, and promotions. See [docs/plan.md](docs/plan.md).

## Quick start (scaffold)

```bash
npm install
npm run build
node dist/index.js
```

Or after install, via the bin entry:

```bash
npx promoteops
```

The server speaks MCP over stdio. Wire it into Cursor / Copilot as an MCP server
pointing at `node /absolute/path/to/promoteops/dist/index.js`.

M1 exposes a single `ping` tool for smoke checks.

## Local config

```bash
cp mapper.example.json mapper.json
cp config.example.yaml config.yaml
# edit mapper.json and config.yaml — both are gitignored
```

Config edits from `get_config` (later milestone) land in `tmp/configs/` (gitignored).
