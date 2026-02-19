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

  expect(trace).toComplete();
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
  - [Mocks](#mocks)
- [API Reference](#api-reference)
  - [`run(agentFn, options?)`](#runagentfn-options)
  - [`mock.fn(valueOrImpl?)`](#mockfnvalueorimpl)
  - [`mock.forbidden(message?)`](#mockforbiddenmessage)
  - [TraceWriter](#tracewriter)
  - [StepHandle](#stephandle)
- [Matchers](#matchers)
  - [Tool Matchers](#tool-matchers)
  - [Budget Matchers](#budget-matchers)
  - [Structural Matchers](#structural-matchers)
- [Recipes](#recipes)
  - [Testing Tool Order](#testing-tool-order)
  - [Testing Cost Budgets](#testing-cost-budgets)
  - [Testing Policy Compliance](#testing-policy-compliance)
  - [Multi-Step Agents](#multi-step-agents)
  - [Testing Timeouts](#testing-timeouts)
  - [Dynamic Mocks](#dynamic-mocks)
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

  // Did it finish?
  expect(trace).toComplete();

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

The agent function receives a `RunContext` with mocked tools (auto-tracked) and a `TraceWriter` for manual reporting. The function's return value becomes `trace.output`. If it throws, `trace.completed` is `false` and `trace.error` captures the exception.

### RunContext

Your agent function receives a `RunContext<TInput, TTools>` with three fields:

| Field | Type | Description |
|-------|------|-------------|
| `ctx.input` | `TInput` | The input data you passed via `options.input` |
| `ctx.tools` | `TTools` | Auto-tracked mock tools — every call is recorded |
| `ctx.trace` | `TraceWriter` | Manual reporting: cost, tokens, steps, metadata |

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
  completed: boolean;          // Did the agent finish without error?
  error?: Error;               // The error, if it threw
  input: TInput;               // What was passed in
  output: TOutput;             // What was returned (or manually set)
  toolCalls: readonly ToolCall[];  // Every tool call, in order
  steps: readonly Step[];      // Manually-reported steps
  duration: number;            // Wall-clock ms
  startedAt: number;           // Epoch timestamp
  endedAt: number;             // Epoch timestamp
  cost?: number;               // USD (manually reported)
  tokens?: TokenUsage;         // Token counts (manually reported)
  retries: number;             // Retry count (manually reported)
  metadata: Record<string, unknown>;  // Arbitrary key-values
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
- If the agent function throws, `trace.completed` is `false` and `trace.error` captures it
- If the function exceeds `timeout`, the trace records a timeout error
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
- The error propagates, causing `trace.completed = false`
- `trace.error` is a `ForbiddenToolError` instance

---

### TraceWriter

The `TraceWriter` is available as `ctx.trace` inside your agent function. Use it to report things ATL can't automatically observe — like LLM API costs, token usage, or logical steps.

| Method | Description |
|--------|-------------|
| `addToolCall(call)` | Manually record a tool call |
| `startStep(label, metadata?)` | Start a named step (returns `StepHandle`) |
| `setOutput(output)` | Override the function's return value |
| `setCost(usd)` | Report cost in USD |
| `setTokens({ input, output, total? })` | Report token usage |
| `setRetries(count)` | Report retry count |
| `setMetadata(key, value)` | Attach arbitrary metadata |

```ts
const trace = await run(async (ctx) => {
  // Report LLM usage
  ctx.trace.setCost(0.003);
  ctx.trace.setTokens({ input: 150, output: 50 });
  ctx.trace.setRetries(1);
  ctx.trace.setMetadata("model", "claude-sonnet-4-20250514");

  // Override the output
  ctx.trace.setOutput({ custom: "output" });

  return "this return value is ignored because setOutput was called";
});
```

### StepHandle

Returned by `ctx.trace.startStep()`. Represents a logical step in your agent's execution.

| Method | Description |
|--------|-------------|
| `addToolCall(call)` | Record a tool call within this step |
| `end()` | Close the step (records duration) |

```ts
const step = ctx.trace.startStep("planning", { model: "gpt-4" });
step.addToolCall({ name: "think", input: "problem", output: "plan" });
step.end();
```

Tool calls added via `step.addToolCall()` appear both in the step's `toolCalls` array and in the top-level `trace.toolCalls`.

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

#### `toComplete()`

Asserts that the agent finished without error.

```ts
expect(trace).toComplete();
expect(failedTrace).not.toComplete();
```

#### `toHaveSteps(opts?)`

With no arguments, asserts that at least one step was recorded. With `{ min, max }`, asserts the step count is within range.

```ts
expect(trace).toHaveSteps();                    // at least 1 step
expect(trace).toHaveSteps({ min: 2 });          // at least 2
expect(trace).toHaveSteps({ max: 8 });          // at most 8
expect(trace).toHaveSteps({ min: 2, max: 8 });  // between 2 and 8
```

#### `toHaveRetries({ max })`

Asserts that the retry count is at most `max`.

```ts
expect(trace).toHaveRetries({ max: 2 });
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

  expect(trace).toComplete();
  expect(trace).not.toHaveCalledTool("deleteUser");
  expect(trace).not.toHaveCalledTool("dropDatabase");
});
```

### Multi-Step Agents

Track logical steps in complex agent flows:

```ts
test("agent follows plan-execute-verify pattern", async () => {
  const trace = await run(async (ctx) => {
    const step1 = ctx.trace.startStep("plan");
    step1.addToolCall({ name: "analyze", input: ctx.input, output: "plan" });
    step1.end();

    const step2 = ctx.trace.startStep("execute");
    step2.addToolCall({ name: "act", input: "plan", output: "result" });
    step2.end();

    const step3 = ctx.trace.startStep("verify");
    step3.addToolCall({ name: "check", input: "result", output: "ok" });
    step3.end();

    return "verified";
  });

  expect(trace).toComplete();
  expect(trace).toHaveSteps({ min: 3, max: 3 });
  expect(trace.steps[0]!.label).toBe("plan");
  expect(trace.steps[1]!.label).toBe("execute");
  expect(trace.steps[2]!.label).toBe("verify");
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

  expect(trace).not.toComplete();
  expect(trace.error!.message).toContain("timed out");
});
```

### Dynamic Mocks

Use function implementations for mocks that need to compute responses:

```ts
test("agent handles dynamic responses", async () => {
  let callCount = 0;

  const trace = await run(
    async (ctx) => {
      const a = await ctx.tools.increment(1);
      const b = await ctx.tools.increment(2);
      return { a, b };
    },
    {
      mocks: {
        increment: mock.fn((n: number) => {
          callCount++;
          return n + 1;
        }),
      },
    }
  );

  expect(trace).toComplete();
  expect(trace.output).toEqual({ a: 2, b: 3 });
  expect(trace).toHaveToolCallCount("increment", 2);
});
```

---

## Types

All types are exported from the main entry point:

```ts
import type {
  Trace,
  ToolCall,
  Step,
  TokenUsage,
  TraceWriter,
  StepHandle,
  RunOptions,
  RunContext,
  AgentFn,
  MockToolFn,
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

### `Step`

```ts
interface Step {
  label: string;
  toolCalls: ToolCall[];
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

---

## Project Structure

```
src/
  index.ts                    # Public API exports
  types.ts                    # All TypeScript interfaces (with generics)
  run.ts                      # run() — wires mocks, timeout, error handling
  trace-builder.ts            # Mutable accumulator → frozen Trace
  mock.ts                     # mock.fn(), mock.forbidden()
  setup.ts                    # expect.extend() preload
  matchers.d.ts               # Declaration merging for bun:test
  matchers/
    index.ts                  # Barrel export + allMatchers object
    helpers.ts                # assertIsTrace() guard
    tool-matchers.ts          # toHaveCalledTool, toHaveCalledToolWith, etc.
    budget-matchers.ts        # toBeWithinBudget, toBeWithinTokens, etc.
    structural-matchers.ts    # toComplete, toHaveSteps, toHaveRetries
tests/
  helpers.ts                  # buildTrace(), buildToolCall() factories
  trace-builder.test.ts
  mock.test.ts
  run.test.ts
  matchers/
    tool-matchers.test.ts
    budget-matchers.test.ts
    structural-matchers.test.ts
  integration/
    full-flow.test.ts         # End-to-end test of the full API
examples/
  support-agent/
    types.ts                  # Domain types (Customer, Order, etc.)
    agent.ts                  # Multi-step support agent with typed RunContext
    agent.test.ts             # 24 tests demonstrating all ATL features
```

---

## License

MIT
