export const NOT_DEPLOYED = "NOT_DEPLOYED";
export const EXCLUDED = "EXCLUDED";

const SPECIAL_VALUES = [NOT_DEPLOYED, EXCLUDED] as const;
export type SpecialMapperValue = (typeof SPECIAL_VALUES)[number];

export function isSpecialValue(value: string): value is SpecialMapperValue {
  return (SPECIAL_VALUES as readonly string[]).includes(value);
}

export function isDeployableValue(value: string): boolean {
  return !isSpecialValue(value);
}
