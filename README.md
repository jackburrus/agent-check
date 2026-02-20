# Agent Testing Library (ATL)

**Test agent behavior, not model outputs.**

ATL is a testing library for AI agents — inspired by [React Testing Library](https://testing-library.com/). Instead of asserting on prose or chat completions, you assert on what the agent *did*: which tools it called, in what order, how much it cost, and whether it respected policy constraints.

```ts
import { test, expect } from "bun:test";
import { run, mock } from "agent-testing-library";

test("agent greets the user by name", async () => {
  const trace = await run(
    async (ctx) => {
      const user = await ctx.tools.lookupUser(ctx.input);
      return { greeting: `Hello, ${user.name}!` };
    },
    {
      input: { userId: "42" },
      mocks: {
        lookupUser: mock.fn({ id: "42", name: "Bob" }),
        deleteUser: mock.forbidden("Agent must never delete users"),
      },
    }
  );

  expect(trace).toConverge();
  expect(trace).toHaveCalledTool("lookupUser");
  expect(trace).not.toHaveCalledTool("deleteUser");
  expect(trace).toHaveCalledToolWith("lookupUser", { userId: "42" });
  expect(trace.output).toEqual({ greeting: "Hello, Bob!" });
});
```

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [The `run()` Function](#the-run-function)
  - [RunContext](#runcontext)
  - [Traces](#traces)
  - [Turns](#turns)
  - [Mocks](#mocks)
- [API Reference](#api-reference)
  - [`run(agentFn, options?)`](#runagentfn-options)
  - [`mock.fn(valueOrImpl?)`](#mockfnvalueorimpl)
  - [`mock.forbidden(message?)`](#mockforbiddenmessage)
  - [TraceWriter](#tracewriter)
  - [TurnHandle](#turnhandle)
- [Matchers](#matchers)
  - [Tool Matchers](#tool-matchers)
  - [Budget Matchers](#budget-matchers)
  - [Structural Matchers](#structural-matchers)
  - [Baseline Matchers](#baseline-matchers)
- [Baseline Regression System](#baseline-regression-system)
- [Trace I/O](#trace-io)
- [Recipes](#recipes)
  - [Testing Tool Order](#testing-tool-order)
  - [Testing Cost Budgets](#testing-cost-budgets)
  - [Testing Policy Compliance](#testing-policy-compliance)
  - [Multi-Turn Agents](#multi-turn-agents)
  - [Testing Timeouts](#testing-timeouts)
  - [Dynamic Mocks](#dynamic-mocks)
  - [Baseline Regression Testing](#baseline-regression-testing)
  - [Debugging with printTrace](#debugging-with-printtrace)
- [Types](#types)
- [Project Structure](#project-structure)

---

## Installation

```bash
bun install agent-testing-library
```

ATL is designed for [Bun](https://bun.sh)'s test runner. It extends `expect` with custom matchers automatically via a preload file.

### Setup

ATL auto-registers its matchers when imported. If you're using the library from source, add the preload to your `bunfig.toml`:

```toml
[test]
preload = ["./src/setup.ts"]
```

If you install ATL as a package, add:

```toml
[test]
preload = ["agent-testing-library/setup"]
```

---

## Quick Start

```ts
import { test, expect } from "bun:test";
import { run, mock } from "agent-testing-library";

test("customer support agent looks up order before responding", async () => {
  const trace = await run(
    async (ctx) => {
      const order = await ctx.tools.getOrder(ctx.input);
      ctx.trace.setCost(0.002);
      ctx.trace.setTokens({ input: 120, output: 40 });
      return { status: order.status, message: `Your order is ${order.status}.` };
    },
    {
      input: { orderId: "ORD-789" },
      mocks: {
        getOrder: mock.fn({ id: "ORD-789", status: "shipped" }),
        cancelOrder: mock.forbidden("Agent must not cancel orders"),
      },
    }
  );

  // Did it converge?
  expect(trace).toConverge();
  expect(trace).toHaveStopReason("converged");

  // Did it call the right tools?
  expect(trace).toHaveCalledTool("getOrder");
  expect(trace).not.toHaveCalledTool("cancelOrder");
  expect(trace).toHaveCalledToolWith("getOrder", { orderId: "ORD-789" });

  // Was it efficient?
  expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
  expect(trace).toBeWithinTokens({ maxTotal: 500 });

  // Did it produce the right output?
  expect(trace.output).toEqual({
    status: "shipped",
    message: "Your order is shipped.",
  });
});
```

---

## Core Concepts

### The `run()` Function

`run()` is the entry point. It executes your agent function in a controlled environment, captures everything that happens, and returns a `Trace` object you can assert on.

```
Agent Function  →  run()  →  TraceBuilder  →  Trace  →  expect(trace).toHaveCalledTool(...)
                     ↑            ↑
                   injects     accumulates
                   mocked       tool calls,
                   tools        timing, cost
```

The agent function receives a `RunContext` with mocked tools (auto-tracked) and a `TraceWriter` for manual reporting. The function's return value becomes `trace.output`. If it throws, `trace.converged` is `false` and `trace.error` captures the exception.

### RunContext

Your agent function receives a `RunContext<TInput, TTools>` with three fields:

| Field | Type | Description |
|-------|------|-------------|
| `ctx.input` | `TInput` | The input data you passed via `options.input` |
| `ctx.tools` | `TTools` | Auto-tracked mock tools — every call is recorded |
| `ctx.trace` | `TraceWriter` | Manual reporting: cost, tokens, turns, metadata |

`RunContext` supports generics for full type safety. Define your tools as an interface and use it as a type parameter — no casting required:

```ts
interface MyTools {
  lookupUser: (id: string) => Promise<User>;
  sendEmail: (to: string, body: string) => Promise<void>;
}

async function myAgent(ctx: RunContext<MyInput, MyTools>) {
  const user = await ctx.tools.lookupUser("42"); // fully typed
  await ctx.tools.sendEmail(user.email, "Hello!"); // autocomplete works
}
```

### Traces

A `Trace<TInput, TOutput>` is a frozen snapshot of everything that happened during the agent run. When your agent is typed, `trace.input` and `trace.output` are typed too — no casting needed.

```ts
interface Trace<TInput = unknown, TOutput = unknown> {
  converged: boolean;              // Did the agent finish without error?
  stopReason: "converged" | "maxTurns" | "error" | "timeout";
  error?: Error;                   // The error, if it threw
  input: TInput;                   // What was passed in
  output: TOutput;                 // What was returned (or manually set)
  toolCalls: readonly ToolCall[];  // Every tool call, in order
  turns: readonly Turn[];          // Manually-reported turns
  duration: number;                // Wall-clock ms
  startedAt: number;               // Epoch timestamp
  endedAt: number;                 // Epoch timestamp
  cost?: number;                   // USD (manually reported)
  tokens?: TokenUsage;             // Token counts (manually reported)
  metadata: Record<string, unknown>;  // Arbitrary key-values
}
```

### Turns

A `Turn` represents a single iteration of the agent loop — typically one LLM call followed by zero or more tool calls. This mirrors how real agent loops work.

```ts
interface Turn {
  index: number;                   // Auto-incremented, starting at 0
  label?: string;                  // Optional developer label
  toolCalls: ToolCall[];           // Tool calls made during this turn
  response?: string;               // Text output from this turn
  tokens?: TokenUsage;
  duration: number;
  startedAt: number;
  endedAt: number;
  metadata?: Record<string, unknown>;
}
```

### Mocks

Mocks simulate the tools your agent calls. ATL wraps each mock in a tracking proxy that records tool name, input, output, timing, and errors — automatically.

```ts
// Static return value — always returns the same thing
mock.fn({ id: "123", name: "Alice" })

// Dynamic implementation — receives the call arguments
mock.fn((input) => ({ id: input.id, name: "Computed" }))

// Sequence — different value on each call, repeats the last when exhausted
mock.sequence([
  { intent: "question", confidence: 0.95 },
  { message: "Here is your answer.", tokensUsed: 150 },
])

// Forbidden — throws immediately if called
mock.forbidden("Agent should never delete accounts")
```

---

## API Reference

### `run(agentFn, options?)`

Executes an agent function and returns a `Trace`. Types are inferred from the agent function — if your agent takes `RunContext<MyInput, MyTools>` and returns `Promise<MyOutput>`, the trace is automatically typed as `Trace<MyInput, MyOutput>`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentFn` | `(ctx: RunContext<TInput, TTools>) => TOutput \| Promise<TOutput>` | Your agent function |
| `options.input` | `TInput` | Input data, available as `ctx.input` |
| `options.mocks` | `Record<string, MockToolFn>` | Named mock tools |
| `options.timeout` | `number` | Timeout in ms (default: `30000`) |
| `options.metadata` | `Record<string, unknown>` | Metadata attached to the trace |

**Returns:** `Promise<Trace<TInput, Awaited<TOutput>>>`

```ts
const trace = await run(
  async (ctx) => {
    const data = await ctx.tools.fetchData(ctx.input);
    return { result: data };
  },
  {
    input: "query",
    mocks: { fetchData: mock.fn({ answer: 42 }) },
    timeout: 5000,
    metadata: { model: "gpt-4" },
  }
);
```

**Behavior:**
- Each mock in `options.mocks` is wrapped in a tracking proxy before being exposed as `ctx.tools[name]`
- If the agent function returns a value, it becomes `trace.output`
- If the agent function throws, `trace.converged` is `false`, `trace.stopReason` is `"error"`, and `trace.error` captures it
- If the function exceeds `timeout`, `trace.stopReason` is `"timeout"`
- The trace is frozen (immutable) after `run()` returns

---

### `mock.fn(valueOrImpl?)`

Creates a mock tool function.

**Overloads:**

```ts
// No arguments — returns undefined
mock.fn()

// Static value — always returns this value
mock.fn({ id: "123", name: "Alice" })
mock.fn("hello")
mock.fn([1, 2, 3])
mock.fn(null)

// Function implementation — called with the tool's arguments
mock.fn((input) => ({ id: input.id, name: "Computed" }))
```

**Note:** ATL distinguishes static values from implementations by checking `typeof`. If you pass a function, it's used as the implementation. If you pass anything else, it's returned as-is.

---

### `mock.sequence(values)`

Creates a mock that returns a different value on each call. When all values are exhausted, the last value is repeated. This is ideal for tools called multiple times with different expected responses (e.g. an LLM called once for classification, then again for answer generation).

```ts
mock.sequence([
  { intent: "question", confidence: 0.95 },  // first call
  { message: "Here is your answer." },        // second call and beyond
])
```

**Requires** at least one value — `mock.sequence([])` throws.

---

### `mock.forbidden(message?)`

Creates a mock that throws `ForbiddenToolError` if called. Use this to assert that an agent never invokes a dangerous or disallowed tool.

```ts
mock.forbidden()                              // Default error message
mock.forbidden("Agent must not delete users") // Custom message
```

If a forbidden mock is called:
- The tool call is still recorded in the trace (with the error)
- The error propagates, causing `trace.converged = false` and `trace.stopReason = "error"`
- `trace.error` is a `ForbiddenToolError` instance

---

### TraceWriter

The `TraceWriter` is available as `ctx.trace` inside your agent function. Use it to report things ATL can't automatically observe — like LLM API costs, token usage, or logical turns.

| Method | Description |
|--------|-------------|
| `addToolCall(call)` | Manually record a tool call |
| `startTurn(label?, metadata?)` | Start a named turn (returns `TurnHandle`) |
| `setOutput(output)` | Override the function's return value |
| `setCost(usd)` | Report cost in USD |
| `setTokens({ input, output, total? })` | Report token usage |
| `setMetadata(key, value)` | Attach arbitrary metadata |

```ts
const trace = await run(async (ctx) => {
  // Report LLM usage
  ctx.trace.setCost(0.003);
  ctx.trace.setTokens({ input: 150, output: 50 });
  ctx.trace.setMetadata("model", "claude-sonnet-4-20250514");

  // Override the output
  ctx.trace.setOutput({ custom: "output" });

  return "this return value is ignored because setOutput was called";
});
```

### TurnHandle

Returned by `ctx.trace.startTurn()`. Represents a single iteration of the agent loop.

| Method | Description |
|--------|-------------|
| `addToolCall(call)` | Record a tool call within this turn |
| `setResponse(text)` | Capture text output from this turn |
| `end()` | Close the turn (records duration) |

```ts
const turn = ctx.trace.startTurn("planning", { model: "gpt-4" });
turn.addToolCall({ name: "think", input: "problem", output: "plan" });
turn.setResponse("I will search for relevant documents first.");
turn.end();
```

Tool calls added via `turn.addToolCall()` appear both in the turn's `toolCalls` array and in the top-level `trace.toolCalls`. Turn indices auto-increment starting at 0.

---

## Matchers

ATL extends Bun's `expect` with custom matchers. They're registered automatically via the preload file.

All matchers work with `.not` negation:

```ts
expect(trace).toHaveCalledTool("search");
expect(trace).not.toHaveCalledTool("deleteAll");
```

### Tool Matchers

#### `toHaveCalledTool(toolName)`

Asserts that a tool was called at least once.

```ts
expect(trace).toHaveCalledTool("lookupUser");
expect(trace).not.toHaveCalledTool("deleteUser");
```

#### `toHaveCalledToolWith(toolName, expectedInput)`

Asserts that a tool was called with matching input. Supports Bun's asymmetric matchers (`expect.any()`, `expect.stringContaining()`, etc.).

```ts
expect(trace).toHaveCalledToolWith("lookupUser", { userId: "42" });
expect(trace).toHaveCalledToolWith("lookupUser", { userId: expect.any(String) });
```

#### `toHaveToolCallCount(toolName, count)`

Asserts that a specific tool was called exactly `count` times.

```ts
expect(trace).toHaveToolCallCount("search", 2);
expect(trace).toHaveToolCallCount("lookup", 1);
```

#### `toHaveToolCallCount({ max })`

Asserts that the total number of tool calls (across all tools) is at most `max`.

```ts
expect(trace).toHaveToolCallCount({ max: 5 });
```

#### `toHaveToolOrder(expectedOrder)`

Asserts that tools were called in the specified order. The order is checked as a subsequence — other tools can appear between the expected ones.

```ts
expect(trace).toHaveToolOrder(["lookupUser", "sendEmail"]);

// Passes even if other tools were called between them:
// lookupUser → log → validate → sendEmail  ✓
```

---

### Budget Matchers

#### `toBeWithinBudget({ maxUsd })`

Asserts that `trace.cost` is at most `maxUsd`. Fails if cost was never set.

```ts
expect(trace).toBeWithinBudget({ maxUsd: 0.02 });
```

#### `toBeWithinTokens({ maxTotal })`

Asserts that total token count is at most `maxTotal`. Fails if tokens were never set.

```ts
expect(trace).toBeWithinTokens({ maxTotal: 4000 });
```

#### `toBeWithinLatency({ maxMs })`

Asserts that the trace's wall-clock duration is at most `maxMs`.

```ts
expect(trace).toBeWithinLatency({ maxMs: 3000 });
```

---

### Structural Matchers

#### `toConverge()`

Asserts that the agent finished without error.

```ts
expect(trace).toConverge();
expect(failedTrace).not.toConverge();
```

#### `toHaveTurns(opts?)`

With no arguments, asserts that at least one turn was recorded. With `{ min, max }`, asserts the turn count is within range.

```ts
expect(trace).toHaveTurns();                    // at least 1 turn
expect(trace).toHaveTurns({ min: 2 });          // at least 2
expect(trace).toHaveTurns({ max: 8 });          // at most 8
expect(trace).toHaveTurns({ min: 2, max: 8 });  // between 2 and 8
```

#### `toHaveStopReason(expected)`

Asserts that the trace stopped for a specific reason.

```ts
expect(trace).toHaveStopReason("converged");
expect(trace).toHaveStopReason("error");
expect(trace).toHaveStopReason("timeout");
```

---

### Baseline Matchers

#### `toMatchBaseline(baseline)`

Asserts that a trace matches a previously captured baseline — the structural "behavioral envelope" of the agent. Detects drift in tool usage, turn count, cost, and stop reason. See [Baseline Regression System](#baseline-regression-system) for details.

```ts
const baseline = extractBaseline(referenceTrace);
expect(newTrace).toMatchBaseline(baseline);
```

---

## Baseline Regression System

The killer feature. Capture a trace's structural invariants and detect drift when prompts change, models upgrade, or tools update.

### How It Works

A `Baseline` captures the structural "shape" of a trace — not exact values, but ranges and invariants:

```ts
interface Baseline {
  version: 1;
  toolSet: string[];              // unique tool names, sorted
  toolOrder: string[];            // full tool call sequence
  turnCount: { min: number; max: number };
  costRange?: { min: number; max: number };
  tokenRange?: { min: number; max: number };
  outputShape: string[];          // top-level keys of output (if object)
  stopReason: string;
}
```

### API

```ts
import { extractBaseline, compareBaseline, saveBaseline, loadBaseline, updateBaseline } from "agent-testing-library";

// Extract a baseline from a known-good trace
const baseline = extractBaseline(trace);

// Compare a new trace against the baseline
const diff = compareBaseline(newTrace, baseline);
// diff.pass: boolean
// diff.differences: string[] — human-readable list of what changed

// Persist baselines to disk
await saveBaseline(baseline, ".baselines/support-agent.json");
const loaded = await loadBaseline(".baselines/support-agent.json");

// Widen ranges from a new trace (e.g. after accepting a change)
const updated = updateBaseline(existing, newTrace);
```

### Usage in Tests

```ts
test("agent behavior matches baseline", async () => {
  const baseline = await loadBaseline(".baselines/support-agent.json");
  const trace = await run(supportAgent, { input, mocks });
  expect(trace).toMatchBaseline(baseline);
});
```

---

## Trace I/O

Save, load, and debug traces.

### `saveTrace(trace, path)` / `loadTrace(path)`

Serialize traces to JSON and load them back. Error objects are properly serialized and reconstructed.

```ts
import { saveTrace, loadTrace } from "agent-testing-library";

await saveTrace(trace, ".traces/run-123.json");
const loaded = await loadTrace(".traces/run-123.json");
```

### `printTrace(trace)`

Returns a human-readable summary string for debugging — like RTL's `screen.debug()`.

```ts
import { printTrace } from "agent-testing-library";

console.log(printTrace(trace));
```

Output:

```
Trace: converged (3 turns, 5 tool calls, 0.002 USD, 1000 tokens, 245ms)
  Turn 0 [classify]:
    → llm("Classify...") → {"intent":"question","confidence":0.95}
  Turn 1 [gather-context]:
    → lookupCustomer("cust-1") → {"id":"cust-1","name":"Alice"}
    → searchKnowledgeBase("What is...") → [{"title":"Return Policy"}]
  Turn 2 [decide]:
    → llm("Answer this...") → {"message":"Here is your answer..."}
    → sendResponse("cust-1","Here is your answer...") → undefined
  Output: {"intent":"question","responded":true,"escalated":false}
```

---

## Recipes

### Testing Tool Order

Verify that your agent calls tools in the correct sequence:

```ts
test("agent searches before responding", async () => {
  const trace = await run(
    async (ctx) => {
      const results = await ctx.tools.search(ctx.input);
      const answer = await ctx.tools.summarize(results);
      return answer;
    },
    {
      mocks: {
        search: mock.fn([{ title: "Result 1" }]),
        summarize: mock.fn("Here's what I found..."),
      },
      input: "What is ATL?",
    }
  );

  expect(trace).toHaveToolOrder(["search", "summarize"]);
});
```

### Testing Cost Budgets

Ensure your agent stays within cost and token limits:

```ts
test("agent stays within budget", async () => {
  const trace = await run(async (ctx) => {
    ctx.trace.setCost(0.005);
    ctx.trace.setTokens({ input: 500, output: 200 });
    return "done";
  });

  expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
  expect(trace).toBeWithinTokens({ maxTotal: 1000 });
  expect(trace).toBeWithinLatency({ maxMs: 5000 });
});
```

### Testing Policy Compliance

Use `mock.forbidden()` to verify agents don't call dangerous tools:

```ts
test("agent never deletes data", async () => {
  const trace = await run(
    async (ctx) => {
      const user = await ctx.tools.getUser({ id: "42" });
      return { name: user.name };
    },
    {
      mocks: {
        getUser: mock.fn({ id: "42", name: "Alice" }),
        deleteUser: mock.forbidden("Must not delete users"),
        dropDatabase: mock.forbidden("Must not drop database"),
      },
    }
  );

  expect(trace).toConverge();
  expect(trace).not.toHaveCalledTool("deleteUser");
  expect(trace).not.toHaveCalledTool("dropDatabase");
});
```

### Multi-Turn Agents

Track logical turns in complex agent flows:

```ts
test("agent follows plan-execute-verify pattern", async () => {
  const trace = await run(async (ctx) => {
    const turn1 = ctx.trace.startTurn("plan");
    turn1.addToolCall({ name: "analyze", input: ctx.input, output: "plan" });
    turn1.end();

    const turn2 = ctx.trace.startTurn("execute");
    turn2.addToolCall({ name: "act", input: "plan", output: "result" });
    turn2.end();

    const turn3 = ctx.trace.startTurn("verify");
    turn3.addToolCall({ name: "check", input: "result", output: "ok" });
    turn3.end();

    return "verified";
  });

  expect(trace).toConverge();
  expect(trace).toHaveTurns({ min: 3, max: 3 });
  expect(trace.turns[0]!.label).toBe("plan");
  expect(trace.turns[1]!.label).toBe("execute");
  expect(trace.turns[2]!.label).toBe("verify");
});
```

### Testing Timeouts

Verify that slow agents are handled correctly:

```ts
test("agent times out gracefully", async () => {
  const trace = await run(
    async () => {
      await new Promise((r) => setTimeout(r, 60000));
      return "never";
    },
    { timeout: 100 }
  );

  expect(trace).not.toConverge();
  expect(trace).toHaveStopReason("timeout");
  expect(trace.error!.message).toContain("timed out");
});
```

### Dynamic Mocks

Use function implementations for mocks that need to compute responses:

```ts
test("agent handles dynamic responses", async () => {
  const trace = await run(
    async (ctx) => {
      const a = await ctx.tools.increment(1);
      const b = await ctx.tools.increment(2);
      return { a, b };
    },
    {
      mocks: {
        increment: mock.fn((n: number) => n + 1),
      },
    }
  );

  expect(trace).toConverge();
  expect(trace.output).toEqual({ a: 2, b: 3 });
  expect(trace).toHaveToolCallCount("increment", 2);
});
```

### Baseline Regression Testing

Capture a baseline from a known-good run and detect drift in future runs:

```ts
import { extractBaseline, saveBaseline, loadBaseline } from "agent-testing-library";

// First time: capture and save baseline
test("capture baseline", async () => {
  const trace = await run(supportAgent, { input, mocks: baseMocks() });
  const baseline = extractBaseline(trace);
  await saveBaseline(baseline, ".baselines/support-agent.json");
});

// Subsequent runs: verify against baseline
test("agent behavior matches baseline", async () => {
  const baseline = await loadBaseline(".baselines/support-agent.json");
  const trace = await run(supportAgent, { input, mocks: baseMocks() });
  expect(trace).toMatchBaseline(baseline);
});
```

### Debugging with printTrace

When a test fails, use `printTrace` to quickly see what happened:

```ts
import { printTrace } from "agent-testing-library";

test("debug a failing agent", async () => {
  const trace = await run(supportAgent, { input, mocks: baseMocks() });

  // Print trace for debugging
  console.log(printTrace(trace));

  expect(trace).toConverge();
});
```

---

## Types

All types are exported from the main entry point:

```ts
import type {
  Trace,
  ToolCall,
  Turn,
  TokenUsage,
  TraceWriter,
  TurnHandle,
  RunOptions,
  RunContext,
  AgentFn,
  MockToolFn,
  Baseline,
  BaselineDiff,
} from "agent-testing-library";
```

### `ToolCall`

```ts
interface ToolCall {
  name: string;       // Tool name
  input: unknown;     // Arguments passed to the tool
  output: unknown;    // Return value
  error?: Error;      // Error thrown, if any
  duration: number;   // Wall-clock ms
  startedAt: number;  // Epoch timestamp
  endedAt: number;    // Epoch timestamp
}
```

### `Turn`

```ts
interface Turn {
  index: number;                   // Auto-incremented, starting at 0
  label?: string;                  // Optional developer label
  toolCalls: ToolCall[];
  response?: string;               // Text output from this turn
  tokens?: TokenUsage;
  duration: number;
  startedAt: number;
  endedAt: number;
  metadata?: Record<string, unknown>;
}
```

### `TokenUsage`

```ts
interface TokenUsage {
  input: number;
  output: number;
  total?: number;  // Computed as input + output if omitted
}
```

### `Baseline`

```ts
interface Baseline {
  version: 1;
  toolSet: string[];              // unique tool names, sorted
  toolOrder: string[];            // full tool call sequence
  turnCount: { min: number; max: number };
  costRange?: { min: number; max: number };
  tokenRange?: { min: number; max: number };
  outputShape: string[];          // top-level keys of output (if object)
  stopReason: string;
  metadata?: Record<string, unknown>;
}
```

### `BaselineDiff`

```ts
interface BaselineDiff {
  pass: boolean;
  differences: string[];   // human-readable list of what changed
}
```

---

## Project Structure

```
src/
  index.ts                    # Public API exports
  types.ts                    # All TypeScript interfaces (with generics)
  run.ts                      # run() — wires mocks, timeout, error handling
  trace-builder.ts            # Mutable accumulator → frozen Trace
  mock.ts                     # mock.fn(), mock.forbidden()
  baseline.ts                 # Baseline extraction, comparison, persistence
  trace-io.ts                 # Save/load/print traces
  setup.ts                    # expect.extend() preload
  matchers.d.ts               # Declaration merging for bun:test
  matchers/
    index.ts                  # Barrel export + allMatchers object
    helpers.ts                # assertIsTrace() guard
    tool-matchers.ts          # toHaveCalledTool, toHaveCalledToolWith, etc.
    budget-matchers.ts        # toBeWithinBudget, toBeWithinTokens, etc.
    structural-matchers.ts    # toConverge, toHaveTurns, toHaveStopReason
    baseline-matchers.ts      # toMatchBaseline
tests/
  helpers.ts                  # buildTrace(), buildToolCall(), buildTurn() factories
  trace-builder.test.ts
  mock.test.ts
  run.test.ts
  baseline.test.ts
  trace-io.test.ts
  matchers/
    tool-matchers.test.ts
    budget-matchers.test.ts
    structural-matchers.test.ts
    baseline-matchers.test.ts
  integration/
    full-flow.test.ts         # End-to-end test of the full API
examples/
  support-agent/
    types.ts                  # Domain types (Customer, Order, etc.)
    agent.ts                  # Multi-turn support agent with typed RunContext
    agent.test.ts             # 27 tests demonstrating all ATL features
```

---

## License

MIT
