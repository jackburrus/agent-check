import { test, expect, describe } from "bun:test";
import { run, mock, ForbiddenToolError } from "../../src/index.ts";

describe("Integration: full agent flow", () => {
  test("complete agent run with mocks, cost, tokens, and all matchers", async () => {
    const trace = await run(
      async (ctx) => {
        const user = await ctx.tools.lookupUser!({ userId: ctx.input as string });
        const prefs = await ctx.tools.getPreferences!({ userId: (user as any).id });

        ctx.trace.setCost(0.003);
        ctx.trace.setTokens({ input: 150, output: 50 });
        ctx.trace.setMetadata("model", "gpt-4");

        const turn = ctx.trace.startTurn("compose-greeting");
        turn.end();

        return { greeting: `Hello, ${(user as any).name}!`, theme: (prefs as any).theme };
      },
      {
        input: "42",
        mocks: {
          lookupUser: mock.fn({ id: "42", name: "Bob" }),
          getPreferences: mock.fn({ theme: "dark" }),
          deleteUser: mock.forbidden("Agent must never delete users"),
        },
      }
    );

    // Structural
    expect(trace).toConverge();
    expect(trace).toHaveTurns();
    expect(trace).toHaveTurns({ min: 1, max: 5 });
    expect(trace).toHaveStopReason("converged");

    // Tool calls
    expect(trace).toHaveCalledTool("lookupUser");
    expect(trace).toHaveCalledTool("getPreferences");
    expect(trace).not.toHaveCalledTool("deleteUser");
    expect(trace).toHaveCalledToolWith("lookupUser", { userId: "42" });
    expect(trace).toHaveCalledToolWith("lookupUser", {
      userId: expect.any(String),
    });
    expect(trace).toHaveToolCallCount("lookupUser", 1);
    expect(trace).toHaveToolCallCount("getPreferences", 1);
    expect(trace).toHaveToolCallCount({ max: 5 });
    expect(trace).toHaveToolOrder(["lookupUser", "getPreferences"]);

    // Budget
    expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
    expect(trace).toBeWithinTokens({ maxTotal: 4000 });
    expect(trace).toBeWithinLatency({ maxMs: 5000 });

    // Output
    expect(trace.output).toEqual({
      greeting: "Hello, Bob!",
      theme: "dark",
    });

    // Input
    expect(trace.input).toBe("42");

    // Metadata
    expect(trace.metadata).toEqual({ model: "gpt-4" });
  });

  test(".not negation works for all matchers", async () => {
    const trace = await run(async () => "done");

    expect(trace).toConverge();
    expect(trace).not.toHaveCalledTool("anything");
    expect(trace).not.toHaveCalledToolWith("anything", {});
    expect(trace).not.toHaveTurns();
    expect(trace).toHaveStopReason("converged");
    expect(trace).not.toBeWithinBudget({ maxUsd: 1 }); // no cost data
    expect(trace).not.toBeWithinTokens({ maxTotal: 1000 }); // no token data
    expect(trace).toBeWithinLatency({ maxMs: 5000 });
    expect(trace).toHaveToolCallCount({ max: 0 });
  });

  test("timeout produces non-converged trace", async () => {
    const trace = await run(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return "never";
      },
      { timeout: 50 }
    );

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("timeout");
    expect(trace.error).toBeDefined();
    expect(trace.error!.message).toContain("timed out");
  });

  test("forbidden tool produces error trace with recorded call", async () => {
    const trace = await run(
      async (ctx) => {
        ctx.tools.nuke!({ target: "everything" });
      },
      {
        mocks: {
          nuke: mock.forbidden("Absolutely not"),
        },
      }
    );

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("error");
    expect(trace.error).toBeInstanceOf(ForbiddenToolError);
    expect(trace).toHaveCalledTool("nuke");
    expect(trace).toHaveCalledToolWith("nuke", { target: "everything" });
    expect(trace.toolCalls[0]!.error).toBeInstanceOf(ForbiddenToolError);
  });

  test("trace.setOutput overrides function return", async () => {
    const trace = await run(async (ctx) => {
      ctx.trace.setOutput("overridden");
      return "original";
    });

    expect(trace).toConverge();
    expect(trace.output).toBe("overridden");
  });

  test("dynamic mock receives input", async () => {
    const trace = await run(
      async (ctx) => {
        const result = await ctx.tools.double!(5);
        return result;
      },
      {
        mocks: {
          double: mock.fn((n: unknown) => (n as number) * 2),
        },
      }
    );

    expect(trace).toConverge();
    expect(trace.output).toBe(10);
    expect(trace).toHaveCalledToolWith("double", 5);
  });

  test("sequence mock returns different values per call", async () => {
    const trace = await run(
      async (ctx) => {
        const first = await ctx.tools.llm!("classify this");
        const second = await ctx.tools.llm!("generate answer");
        const third = await ctx.tools.llm!("one more");
        return { first, second, third };
      },
      {
        mocks: {
          llm: mock.sequence([
            { intent: "question" },
            { message: "Here is your answer" },
          ]),
        },
      }
    );

    expect(trace).toConverge();
    expect(trace).toHaveToolCallCount("llm", 3);
    const output = trace.output as any;
    expect(output.first).toEqual({ intent: "question" });
    expect(output.second).toEqual({ message: "Here is your answer" });
    // Third call repeats the last value
    expect(output.third).toEqual({ message: "Here is your answer" });
  });

  test("multiple turns with tool calls", async () => {
    const trace = await run(
      async (ctx) => {
        const turn1 = ctx.trace.startTurn("fetch-data");
        turn1.addToolCall({
          name: "fetchAPI",
          input: "/users",
          output: [{ id: 1 }],
        });
        turn1.end();

        const turn2 = ctx.trace.startTurn("process-data");
        turn2.addToolCall({
          name: "transform",
          input: [{ id: 1 }],
          output: [{ id: 1, processed: true }],
        });
        turn2.end();

        return "processed";
      }
    );

    expect(trace).toConverge();
    expect(trace).toHaveTurns({ min: 2, max: 2 });
    expect(trace.turns[0]!.label).toBe("fetch-data");
    expect(trace.turns[1]!.label).toBe("process-data");
  });
});
