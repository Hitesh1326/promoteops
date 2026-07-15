import { z } from "zod";

/** A trimmed string that must not be empty; shared by every schema below. */
export const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");
