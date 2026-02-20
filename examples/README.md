# Examples

Three complete examples demonstrating how to test agents with ATL.

## Running Examples

```bash
# Run all examples
bun test examples/

# Run a specific example
bun test examples/support-agent/
bun test examples/rag-pipeline/
bun test examples/code-review-agent/

# Run all tests (examples + unit tests)
bun test
```

---

## 1. Support Agent (`support-agent/`)

A multi-turn e-commerce customer support agent that classifies intent, gathers context, and decides how to respond.

**What it demonstrates:**
- Multi-turn agent structure (classify → gather-context → decide)
- Branching logic (question / refund / complaint)
- Policy compliance with `mock.forbidden()`
- Budget and token tracking
- `mock.sequence()` for multi-call LLM mocks
- Baseline regression testing
- `printTrace()` for debugging

**Agent flow:**
```
Turn 0 [classify]    → LLM classifies customer intent
Turn 1 [gather]      → Fetch customer, order, and KB data
Turn 2 [decide]      → Branch on intent: answer / refund / escalate
```

**Key patterns:**
```ts
// Mock an LLM that returns different values on each call
mocks: {
  llm: mock.sequence([
    { intent: "question", confidence: 0.95 },  // classification
    { message: "Here is your answer." },        // answer generation
  ]),
}

// Forbidden tools as policy guardrails
mocks: {
  processRefund: mock.forbidden("Refund tool must not be called for questions"),
}
```

---

## 2. RAG Pipeline (`rag-pipeline/`)

A retrieval-augmented generation agent that embeds a query, retrieves documents, reranks them, and generates an answer with citations.

**What it demonstrates:**
- Linear pipeline structure (embed → retrieve → rerank → generate)
- Early exit when no relevant documents found
- Citation extraction from retrieved documents
- Confidence thresholds and filtering
- Baseline drift detection between pipeline variants

**Agent flow:**
```
Turn 0 [embed]       → Convert query to vector embedding
Turn 1 [retrieve]    → Search vector store for relevant documents
Turn 2 [rerank]      → Re-score documents by relevance to query
Turn 3 [generate]    → Generate answer using relevant documents (or skip if none)
```

**Key patterns:**
```ts
// Test that the pipeline skips generation when no docs are relevant
test("skips generation when no documents pass threshold", async () => {
  const trace = await run(ragAgent, {
    input: questionInput,
    mocks: baseMocks({
      rerank: mock.fn(irrelevantDocuments),  // all below threshold
    }),
  });

  expect(trace).not.toHaveCalledTool("generate");
  expect(trace).toHaveToolOrder(["embed", "search", "rerank"]);
});

// Baseline detects when the pipeline shape changes
test("baseline detects pipeline change", async () => {
  const baseline = extractBaseline(happyPathTrace);
  const noDocsTrace = await run(ragAgent, { ... });
  expect(noDocsTrace).not.toMatchBaseline(baseline);
});
```

---

## 3. Code Review Agent (`code-review-agent/`)

An automated code review agent that analyzes diffs, runs linters, scans for security issues, generates review comments, and submits a review.

**What it demonstrates:**
- File-level iteration (tools called per file in the PR)
- Security scanning with severity-based blocking
- Strict mode (treating warnings as errors)
- Tool call count scaling with input size
- Comment generation and posting
- Approval/rejection logic

**Agent flow:**
```
Turn 0 [analyze]        → Analyze complexity of each file diff
Turn 1 [lint]           → Run linter on each file
Turn 2 [security-scan]  → Scan each file for security issues
Turn 3 [comment]        → Generate and post comments for findings
Turn 4 [submit]         → Submit review (approve/reject)
```

**Key patterns:**
```ts
// Dynamic mock that returns different results per file
mocks: {
  scanSecurity: mock.fn((path: unknown) =>
    (path as string) === "src/auth.ts" ? [sqlInjection] : []
  ),
}

// Verify tool calls scale with PR size
test("tool calls scale linearly with file count", async () => {
  const trace1 = await run(agent, { input: { pr: smallPR }, mocks });
  const trace2 = await run(agent, { input: { pr: largePR }, mocks });
  expect(trace2.toolCalls.length).toBeGreaterThan(trace1.toolCalls.length);
});

// Verify submit is called with correct approval status
expect(trace).toHaveCalledToolWith("submitReview", [99, false, expect.any(String)]);
```

---

## Best Practices

### 1. Structure tests around agent behavior, not implementation

Group tests by what the agent does, not how it's coded:

```ts
// Good: organized by behavior
describe("clean PR: no issues", () => { ... });
describe("security issue: blocks approval", () => { ... });
describe("policy compliance", () => { ... });

// Bad: organized by internals
describe("analyzeDiff function", () => { ... });
describe("comment generation", () => { ... });
```

### 2. Use `baseMocks()` helpers with overrides

Create a `baseMocks()` function that returns a complete mock set for the happy path. Override specific tools per test:

```ts
function baseMocks(overrides = {}) {
  return {
    llm: mock.fn({ intent: "question" }),
    lookup: mock.fn({ id: "1", name: "Alice" }),
    send: mock.fn(undefined),
    ...overrides,
  };
}

// Override just what's different for this test
mocks: baseMocks({
  llm: mock.fn({ intent: "refund" }),
})
```

### 3. Assert on multiple dimensions

Every test should assert on at least one of these categories:

```ts
// Structural — did it converge? how many turns?
expect(trace).toConverge();
expect(trace).toHaveStopReason("converged");
expect(trace).toHaveTurns({ min: 3, max: 5 });

// Tools — did it call the right tools?
expect(trace).toHaveCalledTool("search");
expect(trace).toHaveToolOrder(["embed", "search", "generate"]);

// Policy — did it avoid forbidden actions?
expect(trace).not.toHaveCalledTool("deleteUser");

// Budget — was it efficient?
expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
expect(trace).toBeWithinTokens({ maxTotal: 2000 });
```

### 4. Use baselines to catch regressions

Extract a baseline from a known-good run and verify future runs match:

```ts
test("behavior matches baseline", async () => {
  const trace = await run(agent, { input, mocks });
  const baseline = extractBaseline(trace);

  // Later runs should match
  const trace2 = await run(agent, { input, mocks });
  expect(trace2).toMatchBaseline(baseline);
});
```

### 5. Use `printTrace()` for debugging

When a test fails, add `printTrace()` to see exactly what happened:

```ts
const trace = await run(agent, { input, mocks });
console.log(printTrace(trace));
// Trace: converged (3 turns, 5 tool calls, 0.002 USD, 1000 tokens, 245ms)
//   Turn 0 [classify]:
//     → llm("Classify...") → {"intent":"question"}
//   ...
```

### 6. Test error paths explicitly

Don't just test the happy path. Verify the agent handles failures:

```ts
test("embedding failure produces error trace", async () => {
  const trace = await run(agent, {
    input,
    mocks: baseMocks({
      embed: mock.fn(() => { throw new Error("Service unavailable"); }),
    }),
  });

  expect(trace).not.toConverge();
  expect(trace).toHaveStopReason("error");
  expect(trace.error!.message).toContain("Service unavailable");
});
```

### 7. Type your agent functions

Use `RunContext<TInput, TTools>` for full type safety — no casting needed:

```ts
import type { RunContext } from "agent-testing-library";

interface MyTools {
  search: (query: string) => Promise<Result[]>;
  respond: (text: string) => Promise<void>;
}

async function myAgent(ctx: RunContext<string, MyTools>) {
  const results = await ctx.tools.search(ctx.input);  // fully typed
  await ctx.tools.respond(results[0].text);            // autocomplete works
}
```
