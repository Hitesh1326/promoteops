import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportStacks } from "./reportStacks.js";

describe("reportStacks", () => {
  it("returns the fixture report chat contract and writes HTML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "promoteops-tool-"));
    const result = await reportStacks({ outputPath: join(directory, "report.html") });

    expect(result.chatSummary).toContain("PromoteOps stack report");
    expect(result.chatSummary).toContain("Attention:");
    expect(result.html).toContain("Mapped stacks");
  });
});
