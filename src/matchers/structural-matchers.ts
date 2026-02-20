import { assertIsTrace } from "./helpers.ts";

export function toConverge(trace: unknown) {
  assertIsTrace(trace);

  return {
    pass: trace.converged,
    message: () =>
      trace.converged
        ? "Expected trace not to have converged, but it did"
        : `Expected trace to have converged, but it did not${trace.error ? `: ${trace.error.message}` : ""}`,
  };
}

export function toHaveTurns(
  trace: unknown,
  opts?: { min?: number; max?: number }
) {
  assertIsTrace(trace);

  if (!opts) {
    const pass = trace.turns.length > 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected trace to have no turns, but it has ${trace.turns.length}`
          : "Expected trace to have at least one turn, but it has none",
    };
  }

  const count = trace.turns.length;
  const aboveMin = opts.min === undefined || count >= opts.min;
  const belowMax = opts.max === undefined || count <= opts.max;
  const pass = aboveMin && belowMax;

  const rangeStr =
    opts.min !== undefined && opts.max !== undefined
      ? `between ${opts.min} and ${opts.max}`
      : opts.min !== undefined
        ? `at least ${opts.min}`
        : `at most ${opts.max}`;

  return {
    pass,
    message: () =>
      pass
        ? `Expected turn count not to be ${rangeStr}, but got ${count}`
        : `Expected ${rangeStr} turns, but got ${count}`,
  };
}

export function toHaveStopReason(trace: unknown, expected: string) {
  assertIsTrace(trace);

  const pass = trace.stopReason === expected;
  return {
    pass,
    message: () =>
      pass
        ? `Expected stop reason not to be "${expected}", but it was`
        : `Expected stop reason to be "${expected}", but was "${trace.stopReason}"`,
  };
}
