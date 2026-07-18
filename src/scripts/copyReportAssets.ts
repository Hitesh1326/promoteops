import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceDirectory = new URL("../../src/report/css/", import.meta.url);
const outputDirectory = new URL("../report/css/", import.meta.url);

await mkdir(fileURLToPath(outputDirectory), { recursive: true });
await Promise.all(
  ["report.css", "diff2html.min.css"].map((name) =>
    copyFile(new URL(name, sourceDirectory), new URL(name, outputDirectory)),
  ),
);
