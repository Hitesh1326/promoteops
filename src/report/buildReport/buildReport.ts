import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { StackComparisonReport } from "../../stacks/stackComparison/stackComparison.js";
import { renderReport } from "../html/renderReport.js";

export interface BuildReportOptions {
  outputPath?: string;
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

function formatChatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(iso));
}

function buildChatSummary(
  report: StackComparisonReport,
  fileUri: string,
): string {
  const ignored = report.unmappedStacks.length;

  return [
    `PromoteOps stack report — ${formatChatTimestamp(report.generatedAt)} (Live)`,
    `${report.mappedInstances.length} mapped · ${ignored} ignored`,
    `Report: ${fileUri}`,
  ].join("\n");
}

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
      chatSummary: buildChatSummary(report, fileUri),
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
