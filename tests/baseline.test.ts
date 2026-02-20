import { test, expect, describe, afterAll } from "bun:test";
import { extractBaseline, compareBaseline, saveBaseline, loadBaseline, updateBaseline } from "../src/baseline.ts";
import { buildTrace, buildToolCall, buildTurn } from "./helpers.ts";
import { unlink } from "node:fs/promises";

const TMP_BASELINE = "/tmp/atl-test-baseline.json";

afterAll(async () => {
  try { await unlink(TMP_BASELINE); } catch {}
});

describe("extractBaseline", () => {
  test("produces correct Baseline from a trace", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "lookupCustomer" }),
        buildToolCall({ name: "llm" }),
      ],
      turns: [
        buildTurn({ index: 0 }),
        buildTurn({ index: 1 }),
      ],
      cost: 0.003,
      tokens: { input: 500, output: 200, total: 700 },
      output: { intent: "question", responded: true },
    });

    const baseline = extractBaseline(trace);

    expect(baseline.version).toBe(1);
    expect(baseline.toolSet).toEqual(["llm", "lookupCustomer"]);
    expect(baseline.toolOrder).toEqual(["llm", "lookupCustomer", "llm"]);
    expect(baseline.turnCount).toEqual({ min: 2, max: 2 });
    expect(baseline.costRange).toEqual({ min: 0.003, max: 0.003 });
    expect(baseline.tokenRange).toEqual({ min: 700, max: 700 });
    expect(baseline.outputShape).toEqual(["intent", "responded"]);
    expect(baseline.stopReason).toBe("converged");
  });

  test("handles trace without cost/tokens", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [buildToolCall({ name: "search" })],
      turns: [buildTurn({ index: 0 })],
      output: "simple string",
    });

    const baseline = extractBaseline(trace);
    expect(baseline.costRange).toBeUndefined();
    expect(baseline.tokenRange).toBeUndefined();
    expect(baseline.outputShape).toEqual([]);
  });
});

describe("compareBaseline", () => {
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
    const diff = compareBaseline(referenceTrace, baseline);
    expect(diff.pass).toBe(true);
    expect(diff.differences).toEqual([]);
  });

  test("detects tool set changes", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "newTool" }),
      ],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
    });

    const diff = compareBaseline(trace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.some((d) => d.includes("New tools used"))).toBe(true);
    expect(diff.differences.some((d) => d.includes("no longer used"))).toBe(true);
  });

  test("detects tool order changes", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "lookup" }),
        buildToolCall({ name: "llm" }),
      ],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
    });

    const diff = compareBaseline(trace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.some((d) => d.includes("Tool order changed"))).toBe(true);
  });

  test("detects turn count outside range", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "lookup" }),
      ],
      turns: [
        buildTurn({ index: 0 }),
        buildTurn({ index: 1 }),
        buildTurn({ index: 2 }),
        buildTurn({ index: 3 }),
      ],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
    });

    const diff = compareBaseline(trace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.some((d) => d.includes("Turn count"))).toBe(true);
  });

  test("detects cost outside range", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "lookup" }),
      ],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.05,
      tokens: { input: 400, output: 100, total: 500 },
    });

    const diff = compareBaseline(trace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.some((d) => d.includes("Cost"))).toBe(true);
  });

  test("detects stop reason changes", () => {
    const trace = buildTrace({
      converged: false,
      stopReason: "error",
      toolCalls: [
        buildToolCall({ name: "llm" }),
        buildToolCall({ name: "lookup" }),
      ],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
    });

    const diff = compareBaseline(trace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.some((d) => d.includes("Stop reason changed"))).toBe(true);
  });
});

describe("updateBaseline", () => {
  test("widens ranges from new trace", () => {
    const trace1 = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [buildToolCall({ name: "llm" })],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 })],
      cost: 0.002,
      tokens: { input: 400, output: 100, total: 500 },
      output: { result: "ok" },
    });

    const baseline = extractBaseline(trace1);

    const trace2 = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [buildToolCall({ name: "llm" }), buildToolCall({ name: "search" })],
      turns: [buildTurn({ index: 0 }), buildTurn({ index: 1 }), buildTurn({ index: 2 })],
      cost: 0.005,
      tokens: { input: 600, output: 200, total: 800 },
      output: { result: "ok", extra: true },
    });

    const updated = updateBaseline(baseline, trace2);

    expect(updated.toolSet).toEqual(["llm", "search"]);
    expect(updated.turnCount).toEqual({ min: 2, max: 3 });
    expect(updated.costRange).toEqual({ min: 0.002, max: 0.005 });
    expect(updated.tokenRange).toEqual({ min: 500, max: 800 });
    expect(updated.outputShape).toContain("extra");
  });
});

describe("saveBaseline / loadBaseline", () => {
  test("round-trip preserves data", async () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [buildToolCall({ name: "llm" })],
      turns: [buildTurn({ index: 0 })],
      cost: 0.003,
      tokens: { input: 300, output: 100, total: 400 },
      output: { ok: true },
    });

    const baseline = extractBaseline(trace);
    await saveBaseline(baseline, TMP_BASELINE);
    const loaded = await loadBaseline(TMP_BASELINE);

    expect(loaded).toEqual(baseline);
  });
});
