import { test, expect, describe, afterAll } from "bun:test";
import { saveTrace, loadTrace, printTrace } from "../src/trace-io.ts";
import { buildTrace, buildToolCall, buildTurn } from "./helpers.ts";
import { unlink } from "node:fs/promises";

const TMP_TRACE = "/tmp/atl-test-trace.json";

afterAll(async () => {
  try { await unlink(TMP_TRACE); } catch {}
});

describe("saveTrace / loadTrace", () => {
  test("round-trip preserves data", async () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm", input: "hello", output: "world" }),
        buildToolCall({ name: "search", input: { q: "test" }, output: [1, 2] }),
      ],
      turns: [
        buildTurn({ index: 0, label: "classify", toolCalls: [
          buildToolCall({ name: "llm", input: "hello", output: "world" }),
        ]}),
        buildTurn({ index: 1, label: "act", toolCalls: [
          buildToolCall({ name: "search", input: { q: "test" }, output: [1, 2] }),
        ]}),
      ],
      cost: 0.003,
      tokens: { input: 400, output: 100, total: 500 },
      output: { result: "ok" },
      metadata: { model: "gpt-4" },
    });

    await saveTrace(trace, TMP_TRACE);
    const loaded = await loadTrace(TMP_TRACE);

    expect(loaded.converged).toBe(trace.converged);
    expect(loaded.stopReason).toBe(trace.stopReason);
    expect(loaded.input).toEqual(trace.input);
    expect(loaded.output).toEqual(trace.output);
    expect(loaded.cost).toBe(trace.cost);
    expect(loaded.tokens).toEqual(trace.tokens);
    expect(loaded.metadata).toEqual(trace.metadata);
    expect(loaded.toolCalls).toHaveLength(2);
    expect(loaded.turns).toHaveLength(2);
    expect(loaded.turns[0]!.label).toBe("classify");
    expect(loaded.turns[1]!.label).toBe("act");
  });

  test("handles Error reconstruction", async () => {
    const trace = buildTrace({
      converged: false,
      stopReason: "error",
      error: new Error("something broke"),
      toolCalls: [
        { ...buildToolCall({ name: "fail" }), error: new Error("tool error") },
      ],
    });

    await saveTrace(trace, TMP_TRACE);
    const loaded = await loadTrace(TMP_TRACE);

    expect(loaded.error).toBeInstanceOf(Error);
    expect(loaded.error!.message).toBe("something broke");
    expect(loaded.toolCalls[0]!.error).toBeInstanceOf(Error);
    expect(loaded.toolCalls[0]!.error!.message).toBe("tool error");
  });
});

describe("printTrace", () => {
  test("produces readable output", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      toolCalls: [
        buildToolCall({ name: "llm", input: "Classify...", output: { intent: "question" } }),
        buildToolCall({ name: "search", input: "query", output: [{ title: "Result" }] }),
      ],
      turns: [
        buildTurn({
          index: 0,
          label: "classify",
          toolCalls: [
            buildToolCall({ name: "llm", input: "Classify...", output: { intent: "question" } }),
          ],
        }),
        buildTurn({
          index: 1,
          label: "act",
          toolCalls: [
            buildToolCall({ name: "search", input: "query", output: [{ title: "Result" }] }),
          ],
        }),
      ],
      cost: 0.002,
      tokens: { input: 500, output: 200, total: 700 },
      output: { intent: "question", responded: true },
      duration: 245,
    });

    const output = printTrace(trace);

    expect(output).toContain("Trace: converged");
    expect(output).toContain("2 turns");
    expect(output).toContain("2 tool calls");
    expect(output).toContain("0.002 USD");
    expect(output).toContain("700 tokens");
    expect(output).toContain("245ms");
    expect(output).toContain("Turn 0 [classify]");
    expect(output).toContain("Turn 1 [act]");
    expect(output).toContain("llm(");
    expect(output).toContain("search(");
    expect(output).toContain("Output:");
  });

  test("handles trace with response text", () => {
    const trace = buildTrace({
      converged: true,
      stopReason: "converged",
      turns: [
        {
          ...buildTurn({ index: 0, label: "reply" }),
          response: "Hello, world!",
        },
      ],
      duration: 50,
    });

    const output = printTrace(trace);
    expect(output).toContain("Response: Hello, world!");
  });

  test("handles error in tool call", () => {
    const trace = buildTrace({
      converged: false,
      stopReason: "error",
      turns: [
        buildTurn({
          index: 0,
          toolCalls: [
            { ...buildToolCall({ name: "fail" }), error: new Error("oops") },
          ],
        }),
      ],
      duration: 10,
    });

    const output = printTrace(trace);
    expect(output).toContain("ERROR: oops");
  });
});
