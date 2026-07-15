export const ENVIRONMENTS = ["dev", "test", "prod"] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];
