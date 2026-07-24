import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildAttentionShortlist,
  type StackComparisonReport,
} from "../../stacks/stackComparison/stackComparison.js";
import { renderReport } from "../html/renderReport.js";

const DEFAULT_SHORTLIST_LIMIT = 8;

export interface BuildReportOptions {
  outputPath?: string;
  shortlistLimit?: number;
}

export interface BuiltReport {
  outputPath: string;
  fileUri: string;
  html: string;
  chatSummary: string;
}

export class ReportBuildError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReportBuildError";
  }
}

async function readAsset(name: string): Promise<string> {
  return readFile(new URL(`../css/${name}`, import.meta.url), "utf8");
}

async function writePrivateFileAtomically(outputPath: string, html: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, html, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function countIgnored(report: StackComparisonReport, environment: "dev" | "test" | "prod"): number {
  return report.unmappedStacks.filter((stack) => stack.environment === environment).length;
}

function buildChatSummary(
  report: StackComparisonReport,
  outputPath: string,
  fileUri: string,
  shortlistLimit: number,
): string {
  const shortlist = buildAttentionShortlist(report);
  const shown = shortlist.slice(0, shortlistLimit);
  const omitted = shortlist.length - shown.length;
  const attentionByStatus = (["dev", "test", "prod"] as const).flatMap((environment) =>
    (["outdated", "not_deployed"] as const).flatMap((status) => {
      const count = shortlist.filter(
        (finding) => finding.environment === environment && finding.status === status,
      ).length;
      return count > 0 ? [`${environment} ${status}: ${count}`] : [];
    }),
  );
  const targetNewerCount = shortlist.filter(
    (finding) => finding.status === "outdated" && finding.newerSide === "target",
  ).length;
  const shortlistLines = shown.length === 0
    ? ["- No mapped stacks need action."]
    : shown.map((finding) =>
      `- ${finding.environment.toUpperCase()} ${finding.status}: ${finding.templateName} / ${finding.instanceId}${finding.newerSide === "target" ? " — Target is newer; review before promotion." : ""}`,
    );

  const lines = [
    `PromoteOps stack report — ${report.generatedAt} (${report.source})`,
    `Mapped instances: ${report.mappedInstances.length}`,
    attentionByStatus.length > 0
      ? `Need action: ${shortlist.length} (${attentionByStatus.join("; ")})`
      : "Need action: 0",
    `Ignored: dev ${countIgnored(report, "dev")}; test ${countIgnored(report, "test")}; prod ${countIgnored(report, "prod")}`,
    `Target-newer: ${targetNewerCount}`,
    "Attention shortlist:",
    ...shortlistLines,
  ];
  if (omitted > 0) {
    lines.push(`- … ${omitted} more omitted; open the HTML report.`);
  }
  lines.push(`HTML path: ${outputPath}`, `File URI: ${fileUri}`);
  return lines.join("\n");
}

/** Orchestrates asset loading, HTML rendering, secure writing, and chat summary. */
export async function buildReport(
  report: StackComparisonReport,
  options: BuildReportOptions = {},
): Promise<BuiltReport> {
  const outputPath = resolve(options.outputPath ?? "tmp/report.html");
  const fileUri = pathToFileURL(outputPath).href;

  try {
    const [reportCss, diffCss] = await Promise.all([
      readAsset("report.css"),
      readAsset("diff2html.min.css"),
    ]);
    const html = renderReport(report, {
      assets: { reportCss, diffCss },
      outputPath,
      outputFileUri: fileUri,
    });
    await writePrivateFileAtomically(outputPath, html);

    return {
      outputPath,
      fileUri,
      html,
      chatSummary: buildChatSummary(
        report,
        outputPath,
        fileUri,
        options.shortlistLimit ?? DEFAULT_SHORTLIST_LIMIT,
      ),
    };
  } catch (error) {
    if (error instanceof ReportBuildError) throw error;
    const assetDirectory = fileURLToPath(new URL("../css/", import.meta.url));
    throw new ReportBuildError(
      `Could not build report at ${outputPath}. Expected packaged assets under ${assetDirectory}.`,
      { cause: error },
    );
  }
}
