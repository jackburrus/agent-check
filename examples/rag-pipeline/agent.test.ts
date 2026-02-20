import { test, expect, describe } from "bun:test";
import { run, mock, extractBaseline, printTrace } from "../../src/index.ts";
import { ragAgent } from "./agent.ts";
import type { RAGInput, RAGResult, Document, Embedding } from "./types.ts";

// ============================================================
// Fixtures
// ============================================================

const embedding: Embedding = {
  vector: [0.1, 0.2, 0.3],
  model: "text-embedding-3-small",
};

const documents: Document[] = [
  { id: "doc-1", title: "Getting Started", content: "To install, run bun install agent-check.", source: "docs", score: 0.92 },
  { id: "doc-2", title: "API Reference", content: "The run() function executes an agent and returns a Trace.", source: "docs", score: 0.85 },
  { id: "doc-3", title: "FAQ", content: "ATL works with any agent framework or none at all.", source: "faq", score: 0.71 },
];

const irrelevantDocuments: Document[] = [
  { id: "doc-99", title: "Unrelated", content: "This has nothing to do with the query.", source: "blog", score: 0.1 },
];

const questionInput: RAGInput = {
  query: "How do I install the testing library?",
};

// ============================================================
// Helpers
// ============================================================

function baseMocks(overrides: Record<string, ReturnType<typeof mock.fn>> = {}) {
  return {
    embed: mock.fn(embedding),
    search: mock.fn(documents),
    rerank: mock.fn(documents),
    generate: mock.fn({ text: "To install, run bun install agent-check.", tokensUsed: 80 }),
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("happy path: question with relevant documents", () => {
  test("converges and produces answer with citations", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toConverge();
    expect(trace).toHaveStopReason("converged");

    const output = trace.output as RAGResult;
    expect(output.answeredFromKB).toBe(true);
    expect(output.citations).toHaveLength(3);
    expect(output.confidence).toBeGreaterThan(0);
  });

  test("follows embed → search → rerank → generate pipeline", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toHaveToolOrder(["embed", "search", "rerank", "generate"]);
    expect(trace).toHaveToolCallCount("embed", 1);
    expect(trace).toHaveToolCallCount("search", 1);
    expect(trace).toHaveToolCallCount("rerank", 1);
    expect(trace).toHaveToolCallCount("generate", 1);
  });

  test("has exactly 4 turns with correct labels", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toHaveTurns({ min: 4, max: 4 });
    expect(trace.turns[0]!.label).toBe("embed");
    expect(trace.turns[1]!.label).toBe("retrieve");
    expect(trace.turns[2]!.label).toBe("rerank");
    expect(trace.turns[3]!.label).toBe("generate");
  });
});

describe("no relevant documents", () => {
  test("gracefully declines when no documents are relevant", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks({
        rerank: mock.fn(irrelevantDocuments),
      }),
    });

    expect(trace).toConverge();

    const output = trace.output as RAGResult;
    expect(output.answeredFromKB).toBe(false);
    expect(output.citations).toHaveLength(0);
    expect(output.confidence).toBe(0);
    expect(output.answer).toContain("don't have enough information");
  });

  test("skips generation when no documents pass threshold", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks({
        rerank: mock.fn(irrelevantDocuments),
      }),
    });

    // Should NOT call generate since no relevant docs
    expect(trace).not.toHaveCalledTool("generate");
    expect(trace).toHaveToolOrder(["embed", "search", "rerank"]);
  });
});

describe("budget and efficiency", () => {
  test("stays within cost budget", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
  });

  test("stays within token budget", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinTokens({ maxTotal: 2000 });
  });

  test("total tool calls stay bounded", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toHaveToolCallCount({ max: 5 });
  });

  test("completes within latency budget", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinLatency({ maxMs: 5000 });
  });
});

describe("error handling", () => {
  test("embedding failure produces error trace", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks({
        embed: mock.fn(() => { throw new Error("Embedding service unavailable"); }),
      }),
    });

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("error");
    expect(trace.error!.message).toContain("Embedding service unavailable");
  });

  test("timeout produces timeout trace", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks({
        search: mock.fn(async () => {
          await new Promise((r) => setTimeout(r, 5000));
          return documents;
        }),
      }),
      timeout: 50,
    });

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("timeout");
  });
});

describe("baseline regression", () => {
  test("extract and verify baseline from happy path", async () => {
    const trace1 = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });
    const baseline = extractBaseline(trace1);

    // Verify baseline shape
    expect(baseline.toolSet).toEqual(["embed", "generate", "rerank", "search"]);
    expect(baseline.stopReason).toBe("converged");
    expect(baseline.turnCount).toEqual({ min: 4, max: 4 });

    // Second run should match
    const trace2 = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });
    expect(trace2).toMatchBaseline(baseline);
  });

  test("baseline detects pipeline change", async () => {
    const trace1 = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });
    const baseline = extractBaseline(trace1);

    // Run with no relevant docs changes the pipeline
    const trace2 = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks({
        rerank: mock.fn(irrelevantDocuments),
      }),
    });

    expect(trace2).not.toMatchBaseline(baseline);
  });
});

describe("debugging", () => {
  test("printTrace produces readable output", async () => {
    const trace = await run(ragAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    const output = printTrace(trace);
    expect(output).toContain("Trace: converged");
    expect(output).toContain("4 turns");
    expect(output).toContain("embed");
    expect(output).toContain("generate");
  });
});
