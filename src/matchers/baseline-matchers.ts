import { assertIsTrace } from "./helpers.ts";
import { compareBaseline } from "../baseline.ts";
import type { Baseline } from "../types.ts";

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
