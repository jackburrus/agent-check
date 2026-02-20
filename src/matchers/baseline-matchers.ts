import { assertIsTrace } from "./helpers.js";
import { compareBaseline } from "../baseline.js";
import type { Baseline } from "../types.js";

export function toMatchBaseline(trace: unknown, baseline: Baseline) {
  assertIsTrace(trace);

  const diff = compareBaseline(trace, baseline);

  return {
    pass: diff.pass,
    message: () =>
      diff.pass
        ? "Expected trace not to match baseline, but it did"
        : `Expected trace to match baseline, but found differences:\n  - ${diff.differences.join("\n  - ")}`,
  };
}
