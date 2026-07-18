/**
 * Temporary CLI helper for `npm run report:fixture`. Delete with `src/fake/` after M5.
 */
import { reportStacks } from "../tools/reportStacks/reportStacks.js";

const outputPath = process.argv[2];
const result = await reportStacks({ outputPath });
process.stdout.write(`${result.chatSummary}\n`);
