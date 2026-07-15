import { describe, expect, it } from "vitest";

import { EXCLUDED, isDeployableValue, isSpecialValue, NOT_DEPLOYED } from "./specialValues.js";

describe("specialValues", () => {
  it.each([NOT_DEPLOYED, EXCLUDED])("treats %s as a special value, not deployable", (value) => {
    expect(isSpecialValue(value)).toBe(true);
    expect(isDeployableValue(value)).toBe(false);
  });

  it("treats an ordinary stack name as deployable, not special", () => {
    expect(isSpecialValue("my-stack-name")).toBe(false);
    expect(isDeployableValue("my-stack-name")).toBe(true);
  });
});
