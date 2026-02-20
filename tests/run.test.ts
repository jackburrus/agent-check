import { test, expect, describe } from "bun:test";
import { run } from "../src/run.ts";
import { mock, ForbiddenToolError } from "../src/mock.ts";

describe("run()", () => {
  test("runs agent and returns trace with output", async () => {
    const trace = await run(
      async (ctx) => {
        return { greeting: "Hello!" };
      },
      { input: { userId: "42" } }
    );

    expect(trace.converged).toBe(true);
    expect(trace.stopReason).toBe("converged");
    expect(trace.input).toEqual({ userId: "42" });
    expect(trace.output).toEqual({ greeting: "Hello!" });
    expect(trace.error).toBeUndefined();
  });

  test("tracks mock tool calls", async () => {
    const trace = await run(
      async (ctx) => {
        const user = await ctx.tools.lookupUser!({ id: "42" });
        return { user };
      },
      {
        input: { userId: "42" },
        mocks: {
          lookupUser: mock.fn({ id: "42", name: "Bob" }),
        },
      }
    );

    expect(trace.converged).toBe(true);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.name).toBe("lookupUser");
    expect(trace.toolCalls[0]!.input).toEqual({ id: "42" });
    expect(trace.toolCalls[0]!.output).toEqual({ id: "42", name: "Bob" });
  });

  test("tracks multiple tool calls", async () => {
    const trace = await run(
      async (ctx) => {
        const user = await ctx.tools.lookupUser!({ id: "1" });
        const prefs = await ctx.tools.getPreferences!({ userId: "1" });
        return { user, prefs };
      },
      {
        mocks: {
          lookupUser: mock.fn({ id: "1", name: "Alice" }),
          getPreferences: mock.fn({ theme: "dark" }),
        },
      }
    );

    expect(trace.toolCalls).toHaveLength(2);
    expect(trace.toolCalls[0]!.name).toBe("lookupUser");
    expect(trace.toolCalls[1]!.name).toBe("getPreferences");
  });

  test("captures errors and sets converged=false", async () => {
    const trace = await run(async () => {
      throw new Error("Agent crashed");
    });

    expect(trace.converged).toBe(false);
    expect(trace.stopReason).toBe("error");
    expect(trace.error).toBeDefined();
    expect(trace.error!.message).toBe("Agent crashed");
  });

  test("forbidden tool records call and sets error", async () => {
    const trace = await run(
      async (ctx) => {
        ctx.tools.deleteUser!({ id: "42" });
      },
      {
        mocks: {
          deleteUser: mock.forbidden("Never delete users"),
        },
      }
    );

    expect(trace.converged).toBe(false);
    expect(trace.stopReason).toBe("error");
    expect(trace.error).toBeInstanceOf(ForbiddenToolError);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]!.name).toBe("deleteUser");
    expect(trace.toolCalls[0]!.error).toBeInstanceOf(ForbiddenToolError);
  });

  test("respects timeout", async () => {
    const trace = await run(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return "done";
      },
      { timeout: 50 }
    );

    expect(trace.converged).toBe(false);
    expect(trace.stopReason).toBe("timeout");
    expect(trace.error!.message).toContain("timed out");
  });

  test("trace.setOutput overrides return value", async () => {
    const trace = await run(async (ctx) => {
      ctx.trace.setOutput("manual output");
      return "return value";
    });

    expect(trace.output).toBe("manual output");
  });

  test("trace.setCost and setTokens work", async () => {
    const trace = await run(async (ctx) => {
      ctx.trace.setCost(0.003);
      ctx.trace.setTokens({ input: 150, output: 50 });
      return "ok";
    });

    expect(trace.cost).toBe(0.003);
    expect(trace.tokens).toEqual({ input: 150, output: 50, total: 200 });
  });

  test("trace.startTurn works", async () => {
    const trace = await run(async (ctx) => {
      const turn = ctx.trace.startTurn("planning");
      turn.addToolCall({
        name: "think",
        input: "problem",
        output: "plan",
      });
      turn.end();
      return "ok";
    });

    expect(trace.turns).toHaveLength(1);
    expect(trace.turns[0]!.label).toBe("planning");
    expect(trace.turns[0]!.toolCalls).toHaveLength(1);
  });

  test("passes metadata through", async () => {
    const trace = await run(async () => "ok", {
      metadata: { model: "gpt-4" },
    });

    expect(trace.metadata).toEqual({ model: "gpt-4" });
  });

  test("dynamic mock implementation receives input", async () => {
    const trace = await run(
      async (ctx) => {
        return await ctx.tools.multiply!(5);
      },
      {
        mocks: {
          multiply: mock.fn((n: unknown) => (n as number) * 2),
        },
      }
    );

    expect(trace.converged).toBe(true);
    expect(trace.output).toBe(10);
  });

  test("works with no options", async () => {
    const trace = await run(async () => "hello");

    expect(trace.converged).toBe(true);
    expect(trace.output).toBe("hello");
    expect(trace.input).toBeUndefined();
  });
});
