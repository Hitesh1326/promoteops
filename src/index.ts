#!/usr/bin/env node
import { parseCliArgs } from "./cli/parseCliArgs/parseCliArgs.js";
import { startServer } from "./server.js";

const { root } = parseCliArgs(process.argv.slice(2));
await startServer({ projectRoot: root });
