import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportStacks } from "./reportStacks.js";

describe("reportStacks", () => {
  it("returns the fixture report chat contract and writes HTML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "promoteops-tool-"));
    const result = await reportStacks({
      outputPath: join(directory, "report.html"),
      source: "fixture",
    });

    expect(result.chatSummary).toContain("PromoteOps stack report");
    expect(result.chatSummary).toContain("(fixture)");
    expect(result.chatSummary).toContain("Need action:");
    expect(result.chatSummary).toContain("Ignored:");
    expect(result.chatSummary).toContain("Target-newer:");
    expect(result.chatSummary).not.toContain("Partial-data");
    expect(result.chatSummary).not.toContain("Unmapped:");
    expect(result.chatSummary).not.toContain("Omitted: 0");
    expect(result.html).toContain("Mapped stacks");
  });
});
