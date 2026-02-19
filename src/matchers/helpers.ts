import type { Trace } from "../types.ts";

export function assertIsTrace(value: unknown): asserts value is Trace {
  if (
    typeof value !== "object" ||
    value === null ||
    !("toolCalls" in value) ||
    !("completed" in value) ||
    !("steps" in value)
  ) {
    throw new Error(
      "Expected value to be a Trace object (with toolCalls, completed, and steps properties)"
    );
  }
}
