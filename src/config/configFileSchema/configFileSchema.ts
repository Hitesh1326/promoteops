import { z } from "zod";

import { nonEmptyString } from "../../shared/primitives.js";

/** Validates the raw shape of the user-authored config.yaml at runtime. */
export const configFileSchema = z
  .object({
    aws: z
      .object({
        region: nonEmptyString,
        profiles: z
          .object({
            dev: nonEmptyString,
            test: nonEmptyString,
            prod: nonEmptyString,
          })
          .strict(),
      })
      .strict(),
    templates: z
      .object({
        localPath: nonEmptyString,
      })
      .strict(),
    paths: z
      .object({
        mapper: nonEmptyString,
        configTempDir: nonEmptyString,
        reportOutput: nonEmptyString,
      })
      .strict(),
  })
  .strict();
