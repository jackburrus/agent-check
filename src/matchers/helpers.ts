import type { Trace } from "../types.ts";

export function assertIsTrace(value: unknown): asserts value is Trace<unknown, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("toolCalls" in value) ||
    !("converged" in value) ||
    !("turns" in value)
  ) {
    throw new Error(
      "Expected value to be a Trace object (with toolCalls, converged, and turns properties)"
    );
  }
}
