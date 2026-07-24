/**
 * CLI helper for `npm run report:fixture` — offline HTML report without AWS.
 */
import { reportStacks } from "../tools/reportStacks/reportStacks.js";

const outputPath = process.argv[2];
const result = await reportStacks({ outputPath, source: "fixture" });
process.stdout.write(`${result.chatSummary}\n`);
