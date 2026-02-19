import { test, expect, describe } from "bun:test";
import { TraceBuilder } from "../src/trace-builder.ts";

describe("TraceBuilder", () => {
  test("builds a default trace", () => {
    const builder = new TraceBuilder();
    const trace = builder.build();

    expect(trace.completed).toBe(false);
    expect(trace.error).toBeUndefined();
    expect(trace.input).toBeUndefined();
    expect(trace.output).toBeUndefined();
    expect(trace.toolCalls).toEqual([]);
    expect(trace.steps).toEqual([]);
    expect(trace.retries).toBe(0);
    expect(trace.cost).toBeUndefined();
    expect(trace.tokens).toBeUndefined();
    expect(trace.duration).toBeGreaterThanOrEqual(0);
  });

  test("records tool calls", () => {
    const builder = new TraceBuilder();
    const now = Date.now();
    builder.recordToolCall({
      name: "lookupUser",
      input: { id: "42" },
      output: { name: "Bob" },
      duration: 15,
      startedAt: now - 15,
      endedAt: now,
    });

    const trace = builder.build();
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.name).toBe("lookupUser");
    expect(trace.toolCalls[0]!.input).toEqual({ id: "42" });
    expect(trace.toolCalls[0]!.output).toEqual({ name: "Bob" });
  });

  test("sets completed and output", () => {
    const builder = new TraceBuilder();
    builder.setCompleted(true);
    builder.setOutput({ greeting: "Hello" });

    const trace = builder.build();
    expect(trace.completed).toBe(true);
    expect(trace.output).toEqual({ greeting: "Hello" });
  });

  test("sets error", () => {
    const builder = new TraceBuilder();
    const err = new Error("boom");
    builder.setError(err);

    const trace = builder.build();
    expect(trace.error).toBe(err);
  });

  test("sets cost and tokens", () => {
    const builder = new TraceBuilder();
    builder.setCost(0.003);
    builder.setTokens({ input: 150, output: 50 });

    const trace = builder.build();
    expect(trace.cost).toBe(0.003);
    expect(trace.tokens).toEqual({ input: 150, output: 50, total: 200 });
  });

  test("tokens total is computed when omitted", () => {
    const builder = new TraceBuilder();
    builder.setTokens({ input: 100, output: 200 });

    const trace = builder.build();
    expect(trace.tokens!.total).toBe(300);
  });

  test("tokens total is preserved when provided", () => {
    const builder = new TraceBuilder();
    builder.setTokens({ input: 100, output: 200, total: 999 });

    const trace = builder.build();
    expect(trace.tokens!.total).toBe(999);
  });

  test("sets retries and metadata", () => {
    const builder = new TraceBuilder();
    builder.setRetries(3);
    builder.setMetadata("model", "gpt-4");

    const trace = builder.build();
    expect(trace.retries).toBe(3);
    expect(trace.metadata).toEqual({ model: "gpt-4" });
  });

  test("build produces a frozen trace", () => {
    const builder = new TraceBuilder();
    const trace = builder.build();

    expect(() => {
      (trace as any).completed = true;
    }).toThrow();
  });
});

describe("TraceWriter", () => {
  test("addToolCall records to the trace", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();

    writer.addToolCall({
      name: "search",
      input: "query",
      output: ["result"],
    });

    const trace = builder.build();
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.name).toBe("search");
  });

  test("startStep creates a step with tool calls", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();

    const step = writer.startStep("reasoning", { model: "gpt-4" });
    step.addToolCall({
      name: "think",
      input: "problem",
      output: "solution",
    });
    step.end();

    const trace = builder.build();
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.label).toBe("reasoning");
    expect(trace.steps[0]!.toolCalls).toHaveLength(1);
    expect(trace.steps[0]!.metadata).toEqual({ model: "gpt-4" });
    // Step tool calls also appear in top-level toolCalls
    expect(trace.toolCalls).toHaveLength(1);
  });

  test("setOutput overrides output", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();
    writer.setOutput("manual output");

    expect(builder.outputOverridden).toBe(true);
    const trace = builder.build();
    expect(trace.output).toBe("manual output");
  });

  test("setCost sets cost via writer", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();
    writer.setCost(0.01);

    const trace = builder.build();
    expect(trace.cost).toBe(0.01);
  });

  test("setTokens sets tokens via writer", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();
    writer.setTokens({ input: 50, output: 25 });

    const trace = builder.build();
    expect(trace.tokens).toEqual({ input: 50, output: 25, total: 75 });
  });

  test("setRetries sets retries via writer", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();
    writer.setRetries(2);

    const trace = builder.build();
    expect(trace.retries).toBe(2);
  });

  test("setMetadata sets metadata via writer", () => {
    const builder = new TraceBuilder();
    const writer = builder.writer();
    writer.setMetadata("key", "value");

    const trace = builder.build();
    expect(trace.metadata).toEqual({ key: "value" });
  });
});
