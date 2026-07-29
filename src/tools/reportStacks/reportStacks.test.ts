import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportStacks } from "./reportStacks.js";

describe("reportStacks", () => {
  it("returns the slim fixture chat contract and writes HTML", async () => {
    const directory = await mkdtemp(join(tmpdir(), "promoteops-tool-"));
    const result = await reportStacks({
      outputPath: join(directory, "report.html"),
      source: "fixture",
    });

    expect(result.chatSummary).toContain("PromoteOps stack report");
    expect(result.chatSummary).toContain("(Fixture)");
    expect(result.chatSummary).toMatch(/\d{1,2}:\d{2}:\d{2}\s?(AM|PM)/);
    expect(result.chatSummary).toMatch(/\d+ mapped · \d+ ignored/);
    expect(result.chatSummary).toContain("Report: file://");
    expect(result.html).toContain("Mapped stacks");
  });
});
