import type { ResourceLimits } from "./spec/index.js";

/**
 * Conservative host defaults for WorldSimSeed v0.1.
 *
 * Hosts may choose lower limits freely. Raising these values is an explicit
 * host decision and is never controlled by a world spec.
 */
export const DEFAULT_RESOURCE_LIMITS: Readonly<Required<ResourceLimits>> =
  Object.freeze({
    maxAgents: 5_000,
    maxSteps: 500,
    maxEvents: 1_000_000,
    maxTraceRecords: 50_000,
    maxRuns: 100,
  });

export function createDefaultResourceLimits(): ResourceLimits {
  return { ...DEFAULT_RESOURCE_LIMITS };
}
