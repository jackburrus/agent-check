import { assertIsTrace } from "./helpers.ts";

export function toComplete(trace: unknown) {
  assertIsTrace(trace);

  return {
    pass: trace.completed,
    message: () =>
      trace.completed
        ? "Expected trace not to have completed, but it did"
        : `Expected trace to have completed, but it did not${trace.error ? `: ${trace.error.message}` : ""}`,
  };
}

export function toHaveSteps(
  trace: unknown,
  opts?: { min?: number; max?: number }
) {
  assertIsTrace(trace);

  if (!opts) {
    const pass = trace.steps.length > 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected trace to have no steps, but it has ${trace.steps.length}`
          : "Expected trace to have at least one step, but it has none",
    };
  }

  const count = trace.steps.length;
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
        ? `Expected step count not to be ${rangeStr}, but got ${count}`
        : `Expected ${rangeStr} steps, but got ${count}`,
  };
}

export function toHaveRetries(trace: unknown, opts: { max: number }) {
  assertIsTrace(trace);

  const pass = trace.retries <= opts.max;
  return {
    pass,
    message: () =>
      pass
        ? `Expected retries to exceed ${opts.max}, but was ${trace.retries}`
        : `Expected at most ${opts.max} retries, but was ${trace.retries}`,
  };
}
