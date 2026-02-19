import type { Trace } from "../types.ts";
import { assertIsTrace } from "./helpers.ts";

export function toHaveCalledTool(trace: unknown, toolName: string) {
  assertIsTrace(trace);
  const called = trace.toolCalls.some((tc) => tc.name === toolName);
  return {
    pass: called,
    message: () =>
      called
        ? `Expected trace not to have called tool "${toolName}", but it was called`
        : `Expected trace to have called tool "${toolName}", but it was not called. Called tools: [${[...new Set(trace.toolCalls.map((tc) => tc.name))].join(", ")}]`,
  };
}

export function toHaveCalledToolWith(
  trace: unknown,
  toolName: string,
  expectedInput: unknown
) {
  assertIsTrace(trace);

  const matchingCalls = trace.toolCalls.filter((tc) => tc.name === toolName);

  if (matchingCalls.length === 0) {
    return {
      pass: false,
      message: () =>
        `Expected trace to have called tool "${toolName}" with matching input, but "${toolName}" was never called`,
    };
  }

  // Use Bun's expect internally for deep/asymmetric matching
  const { expect } = require("bun:test");
  let matched = false;

  for (const call of matchingCalls) {
    try {
      expect(call.input).toEqual(expectedInput);
      matched = true;
      break;
    } catch {
      // Continue checking other calls
    }
  }

  return {
    pass: matched,
    message: () =>
      matched
        ? `Expected trace not to have called tool "${toolName}" with the specified input, but a matching call was found`
        : `Expected trace to have called tool "${toolName}" with matching input, but no call matched. Actual inputs: ${JSON.stringify(matchingCalls.map((c) => c.input))}`,
  };
}

export function toHaveToolCallCount(
  trace: unknown,
  toolNameOrOpts: string | { max: number },
  count?: number
) {
  assertIsTrace(trace);

  if (typeof toolNameOrOpts === "string") {
    // Specific tool count
    const toolName = toolNameOrOpts;
    const actual = trace.toolCalls.filter((tc) => tc.name === toolName).length;
    const expected = count!;
    const pass = actual === expected;
    return {
      pass,
      message: () =>
        pass
          ? `Expected tool "${toolName}" not to have been called ${expected} time(s), but it was`
          : `Expected tool "${toolName}" to have been called ${expected} time(s), but it was called ${actual} time(s)`,
    };
  } else {
    // Total count with max
    const { max } = toolNameOrOpts;
    const actual = trace.toolCalls.length;
    const pass = actual <= max;
    return {
      pass,
      message: () =>
        pass
          ? `Expected total tool calls to exceed ${max}, but got ${actual}`
          : `Expected at most ${max} total tool calls, but got ${actual}`,
    };
  }
}

export function toHaveToolOrder(trace: unknown, expectedOrder: string[]) {
  assertIsTrace(trace);

  // Extract the ordered sequence of tool names that match the expected tools
  const actualNames = trace.toolCalls.map((tc) => tc.name);
  const filtered = actualNames.filter((name) => expectedOrder.includes(name));

  // Check that the expected order appears as a subsequence
  let orderIndex = 0;
  for (const name of filtered) {
    if (name === expectedOrder[orderIndex]) {
      orderIndex++;
    }
    if (orderIndex === expectedOrder.length) break;
  }

  const pass = orderIndex === expectedOrder.length;

  return {
    pass,
    message: () =>
      pass
        ? `Expected tools not to have been called in order [${expectedOrder.join(", ")}], but they were`
        : `Expected tools to have been called in order [${expectedOrder.join(", ")}], but actual order was [${actualNames.join(", ")}]`,
  };
}
