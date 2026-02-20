# Vision

> "The more your tests resemble the way your agents are used, the more confidence they give you."

## The Problem

You're building agents. They call tools, make decisions, cost money. Every prompt change, model upgrade, or tool update could break something.

You need tests. But not "eval framework" tests with YAML configs and dashboards. You need tests that live in your codebase, run in CI, and feel like the unit tests you already write.

Today's options don't fit:

- **Eval frameworks** (Promptfoo, Braintrust) live in YAML configs and separate dashboards — not in your test suite.
- **LM evaluators** focus on prompt/output quality, not orchestration logic.
- **Observability tools** (LangSmith, Arize) are built for production monitoring, not development testing.
- **Benchmark suites** compare models. They don't prevent regressions in *your* agent.

None of them answer the questions that actually matter: Did the agent call the right tools? In the right order? Did it stay within budget? Did it follow policy? Nobody cares about the raw token probabilities.

## The Insight

React Testing Library changed frontend testing with one idea: **query the DOM the way a user sees it.** Stop testing implementation details. Test behavior.

ATL applies the same insight to agents: **assert on the trace the way a stakeholder audits it.** Stop asserting on prose. Assert on what the agent *did*.

If you're writing `expect(output).toContain("password reset")`, you're testing the model, not the agent. ATL tests the agent.

## Core Opinions

### 1. Test behavior, not text

Assert on tool calls, decisions, costs, and policy compliance — not on prose. The LLM is a tool your agent calls. Mock it like any other tool. Test the orchestration logic, not model outputs.

### 2. Tests live next to your code

Not in a YAML config. Not in a dashboard. In your test files, with your test runner, in your CI. `agent.test.ts` sits next to `agent.ts`.

### 3. Traces are first-class

Every `run()` produces a structured `Trace` — the equivalent of RTL's `screen`. The trace is the primary interface between your test and the system under test. It captures tool calls, turns, cost, tokens, timing, metadata, and output.

### 4. Turn-based model mirrors reality

Real agents run in loops: LLM call → tool calls → repeat. ATL's turn-based trace model mirrors this directly. Each `Turn` captures one iteration of the loop — its tool calls, response text, and metadata. This makes traces legible and assertions natural.

### 5. Baselines catch regressions

When you change a prompt, upgrade a model, or update a tool, the behavioral "shape" of the agent might change — different tools get called, the number of turns shifts, cost increases. ATL's baseline system captures the structural envelope of a known-good trace and detects drift automatically.

### 6. Mocks are cheap, not mandatory

You can mock tools (fast, deterministic) or hit real ones (slow, realistic). ATL doesn't force either. But it makes mocking trivially easy — `mock.fn()` for tool calls, `mock.forbidden()` for policy guardrails.

### 7. No vendor lock-in

Works with OpenAI, Anthropic, local models, any agent framework, or no framework at all. ATL doesn't care how your agent is built. It cares what the agent *did*.

## The Logic/Intelligence Split

A common objection: *"If I mock the LLM, aren't I removing the 'AI' from the test?"*

Yes. And that is the point.

Agent bugs come in two flavors:

1.  **Intelligence Failures:** The model hallucinated or didn't understand the user. (Solved by Evals/Real Model calls).
2.  **Orchestration Failures:** The model understood perfectly, but your code crashed, the tool arguments were wrong, the budget was exceeded, or the safety guardrail failed. (Solved by ATL).

ATL is primarily for **Orchestration Failures**.

Think of a self-driving car:
- **Evals** test the **Eyes**: *Did the camera identify the stop sign?*
- **ATL** tests the **Brakes**: *When a stop sign is detected, did the car actually stop?*

If you only test the Eyes (Evals), you might have a car that sees every stop sign but refuses to slow down because of a logic bug.

### Hybrid Testing
ATL doesn't ban real model calls. It supports "Passthrough Mocks" where you call the real LLM inside a `mock.fn()`. This lets you run 10% of your tests as "End-to-End" smoke tests to verify Intelligence, while keeping 90% of your tests as fast, deterministic Logic tests.

## Mental Model

```
Agent Code  →  Runner  →  Trace  →  Assertions
    ↑                        ↑
  your code            what happened
                    (tool calls, turns,
                     tokens, cost, timing)
```

Mapping to React Testing Library:

| RTL | ATL |
|-----|-----|
| `render()` | `run()` — executes the agent in a controlled harness |
| `screen` | `Trace` — the primary query interface for assertions |
| `getByRole()`, `toBeInTheDocument()` | `toHaveCalledTool()`, `toConverge()` — semantic assertions on behavior |
| MSW (network mocks) | `mock.fn()`, `mock.forbidden()` — tool doubles |
| Jest snapshots | `toMatchBaseline()` — structural regression detection |
| `screen.debug()` | `printTrace()` — human-readable trace output for debugging |

## What ATL Is Not

- **Not an observability platform.** No dashboards, no production monitoring. Use Arize/Datadog for that.
- **Not a prompt playground.** You're not A/B testing prose. You're testing agent behavior.
- **Not a benchmark suite.** You're not comparing models. You're preventing regressions in *your* agent.
- **Not framework-specific.** Works with any agent framework or none at all.

## Competitive Positioning

| | ATL | Promptfoo | Braintrust | LangSmith |
|---|---|---|---|---|
| **Primary interface** | TypeScript tests | YAML config | Dashboard | Dashboard |
| **Lives where** | Your test files | Separate config | Cloud platform | Cloud platform |
| **Feels like** | Jest / Vitest | CLI tool | Analytics product | DevOps platform |
| **Tests what** | Agent behavior | Prompt outputs | Model quality | Agent traces |
| **Regression detection** | Baseline diffs | Manual | Manual | Manual |
| **Vendor lock-in** | None | None | Some | LangChain |
| **Setup time** | `npm install` | `npx init` + YAML | Account + SDK | Account + SDK |
| **Target user** | TS/JS devs building agents | ML/AI engineers | ML teams | LangChain users |

The one-line pitch: **No YAML. No dashboard. Just tests.**

## Roadmap

### Phase 1: Core Loop (Done)

The foundation that makes everything else possible.

- `run()` — execute an agent function in a controlled harness
- `Trace` type + `TraceBuilder` — structured capture of everything that happened
- `mock.fn()` and `mock.forbidden()` — tool mocking and policy guardrails
- 10 matchers across three categories:
  - **Tool:** `toHaveCalledTool`, `toHaveCalledToolWith`, `toHaveToolCallCount`, `toHaveToolOrder`
  - **Budget:** `toBeWithinBudget`, `toBeWithinTokens`, `toBeWithinLatency`
  - **Structural:** `toConverge`, `toHaveTurns`, `toHaveStopReason`
- Bun test runner integration with automatic matcher registration
- Full generics — `RunContext<TInput, TTools>`, `Trace<TInput, TOutput>`, type inference from agent function signatures
- `mock.sequence()` — ordered multi-call responses, repeats last value when exhausted

### Phase 2: Turn-Based Traces, Baselines, and Trace I/O (Done)

The redesign that makes ATL genuinely useful for real agent development.

- **Turn-based trace model** — `Turn` replaces `Step`, mirrors how real agent loops work (LLM call → tool calls → repeat). Turns auto-increment, have optional labels, capture response text.
- **`stopReason`** — `"converged" | "maxTurns" | "error" | "timeout"` replaces the boolean `completed` flag, giving precise information about why the agent stopped.
- **Baseline regression system** — `extractBaseline()` captures a trace's structural invariants (tool set, tool order, turn count range, cost range, token range, output shape, stop reason). `compareBaseline()` detects drift. `toMatchBaseline()` matcher for assertions. `saveBaseline()`/`loadBaseline()` for persistence. `updateBaseline()` for widening ranges.
- **Trace I/O** — `saveTrace()`/`loadTrace()` with proper Error serialization. `printTrace()` for human-readable debugging output (like RTL's `screen.debug()`).
- **11 matchers** including the new `toMatchBaseline`
- 3 complete examples: e-commerce support agent, RAG pipeline, code review agent
- 169 tests across 13 files

### Phase 3: Publish & Ecosystem

Expand reach and integrate into the broader development workflow.

- **npm publish** — proper package.json exports, bundled ESM + declarations, `files` whitelist, MIT LICENSE (Done)
- **Framework adapters** — Vercel AI SDK, OpenAI Agents SDK, LangChain/LangGraph, raw HTTP endpoints
- **Test runner plugins** — Vitest plugin, Jest plugin (in addition to Bun)
- **CLI tooling** — `atl --update-baselines`, `atl record`, `atl report`
- **CI/CD integration** — GitHub Actions annotations, JUnit output
- **LLM judge matchers** — `toBeHelpful()`, `toMatchRubric()`, `toAnswerQuestion()` for optional quality assertions

### Phase 4: Advanced Mocking

Sophisticated mock capabilities for complex agent testing scenarios.

- **Conditional mocks** — responses based on input patterns
- **Delayed mocks** — simulate slow tools and test timeout handling
- **Failing mocks** — simulate tool errors and test recovery
- **PII detection** — `not.toContainPII()` for data safety assertions
- **Recorded-trace testing** — replay saved traces as test fixtures

## Package Strategy

```
agent-testing-library           ← core library (run, trace, matchers, mocks, baselines)
@agent-testing-library/jest     ← jest setup + reporter
@agent-testing-library/vitest   ← vitest plugin + reporter
@agent-testing-library/cli      ← CLI tools (baselines, recording, reports)
```

Install with one command. Work immediately. No accounts, no API keys, no config files.

```bash
npm install -D agent-testing-library
```

## Target User

A TypeScript/JavaScript developer building agents. They're already comfortable with Jest or Vitest. They want to test their agent's behavior in CI — not set up a cloud platform. They want tests that are fast, deterministic, and cheap to run. They don't want to learn a new DSL or configure YAML. They want to write `expect(trace).toConverge()` and `expect(trace).toMatchBaseline(baseline)` and move on.

## Design Principles

1. **Familiar over novel.** Use patterns developers already know. `expect()`, `mock.fn()`, `describe/test`. No new syntax to learn.
2. **Fast over comprehensive.** Mocked tests run in milliseconds. Real API calls are opt-in, not the default.
3. **Behavioral over textual.** What did the agent *do*? Not what did it *say*. Tool calls over token probabilities.
4. **Simple over configurable.** Sensible defaults. Zero config to start. Progressive disclosure for advanced features.
5. **Library over platform.** A dependency in your `package.json`, not a service to sign up for.
6. **Regression-aware.** Baselines capture what "normal" looks like. Changes are detected, not ignored.
