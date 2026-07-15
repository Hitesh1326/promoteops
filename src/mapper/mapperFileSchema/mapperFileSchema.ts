import { z } from "zod";

import { nonEmptyString } from "../../shared/primitives.js";

/** Validates the raw shape of the user-authored mapper.json at runtime. */
export const mapperInstanceSchema = z
  .object({
    dev: nonEmptyString,
    test: nonEmptyString,
    prod: nonEmptyString,
  })
  .strict();

export const mapperFileSchema = z
  .object({
    mappings: z.record(
      nonEmptyString,
      z.array(mapperInstanceSchema).min(1, "must include at least one instance"),
    ),
  })
  .strict();
