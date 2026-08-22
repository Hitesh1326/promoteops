/**
 * Parse PromoteOps process arguments. The only supported flag is --root,
 * which names the folder that holds config.yaml and mapper.json.
 */
export interface PromoteOpsCliArgs {
  root?: string;
}

export class CliParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliParseError";
  }
}

export function parseCliArgs(argv: string[]): PromoteOpsCliArgs {
  let root: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliParseError("Missing value for --root. Pass the folder that holds config.yaml.");
      }
      root = requireUniqueRoot(root, value);
      index += 1;
      continue;
    }

    if (token.startsWith("--root=")) {
      const value = token.slice("--root=".length).trim();
      if (!value) {
        throw new CliParseError("Missing value for --root. Pass the folder that holds config.yaml.");
      }
      root = requireUniqueRoot(root, value);
      continue;
    }

    throw new CliParseError(
      `Unknown argument "${token}". Supported: --root <path> to the folder that holds config.yaml.`,
    );
  }

  return { root };
}

function requireUniqueRoot(existing: string | undefined, value: string): string {
  if (existing !== undefined) {
    throw new CliParseError("--root may only be specified once.");
  }
  return value;
}
