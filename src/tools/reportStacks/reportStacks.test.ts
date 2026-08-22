import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "../../report/buildReport/buildReport.js";
import { sampleComparisonReport } from "../../stacks/stackComparison/sampleReport.js";

describe("buildReport", () => {
  it("writes HTML and a slim live chat summary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "promoteops-report-"));
    const result = await buildReport(sampleComparisonReport(), {
      outputPath: join(directory, "report.html"),
    });

    expect(result.chatSummary).toContain("PromoteOps stack report");
    expect(result.chatSummary).toContain("(Live)");
    expect(result.chatSummary).toMatch(/\d+ mapped · \d+ ignored/);
    expect(result.chatSummary).toContain("Report: file://");
    expect(result.html).toContain("Mapped stacks");
  });
});
