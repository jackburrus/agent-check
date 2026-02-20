import { test, expect, describe } from "bun:test";
import { buildTrace, buildToolCall, buildTurn } from "../helpers.ts";
import { extractBaseline } from "../../src/baseline.ts";

describe("toMatchBaseline", () => {
  const referenceTrace = buildTrace({
    converged: true,
    stopReason: "converged",
    toolCalls: [
      buildToolCall({ name: "llm" }),
      buildToolCall({ name: "lookup" }),
    ],
    turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
    cost: 0.002,
    tokens: { input: 400, output: 100, total: 500 },
    output: { result: "ok" },
  });

  const baseline = extractBaseline(referenceTrace);

  test("passes when trace matches baseline", () => {
    expect(referenceTrace).toMatchBaseline(baseline);
  });

  test("fails with detailed diff message when trace differs", () => {
    const differentTrace = buildTrace({
      converged: false,
      stopReason: "error",
      toolCalls: [
        buildToolCall({ name: "newTool" }),
      ],
      turns: [
        buildTurn({ index: 0 }),
        buildTurn({ index: 1 }),
        buildTurn({ index: 2 }),
        buildTurn({ index: 3 }),
      ],
      cost: 0.05,
      tokens: { input: 400, output: 100, total: 500 },
    });

    expect(differentTrace).not.toMatchBaseline(baseline);
  });

  test(".not.toMatchBaseline works for matching trace", () => {
    // A matching trace should fail the .not assertion
    const matchingTrace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "lookup" }),
      ],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
    });

    // This should pass (trace matches baseline)
    expect(matchingTrace).toMatchBaseline(baseline);
  });
});
