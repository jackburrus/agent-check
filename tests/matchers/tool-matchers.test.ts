import { test, expect, describe } from "bun:test";
import { buildTrace, buildToolCall } from "../helpers.ts";

describe("toHaveCalledTool", () => {
  test("passes when tool was called", () => {
    const trace = buildTrace({
      toolCalls: [buildToolCall({ name: "lookupUser" })],
    });
    expect(trace).toHaveCalledTool("lookupUser");
  });

  test("fails when tool was not called", () => {
    const trace = buildTrace({ toolCalls: [] });
    expect(trace).not.toHaveCalledTool("lookupUser");
  });

  test(".not works for called tool", () => {
    const trace = buildTrace({
      toolCalls: [buildToolCall({ name: "lookupUser" })],
    });
    expect(trace).not.toHaveCalledTool("deleteUser");
  });
});

describe("toHaveCalledToolWith", () => {
  test("passes with matching input", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "lookupUser", input: { userId: "42" } }),
      ],
    });
    expect(trace).toHaveCalledToolWith("lookupUser", { userId: "42" });
  });

  test("fails with non-matching input", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "lookupUser", input: { userId: "99" } }),
      ],
    });
    expect(trace).not.toHaveCalledToolWith("lookupUser", { userId: "42" });
  });

  test("fails when tool was never called", () => {
    const trace = buildTrace({ toolCalls: [] });
    expect(trace).not.toHaveCalledToolWith("lookupUser", { userId: "42" });
  });

  test("works with asymmetric matchers", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "lookupUser", input: { userId: "42" } }),
      ],
    });
    expect(trace).toHaveCalledToolWith("lookupUser", {
      userId: expect.any(String),
    });
  });
});

describe("toHaveToolCallCount", () => {
  test("checks specific tool count", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "search" }),
        buildToolCall({ name: "search" }),
        buildToolCall({ name: "lookup" }),
      ],
    });
    expect(trace).toHaveToolCallCount("search", 2);
    expect(trace).toHaveToolCallCount("lookup", 1);
  });

  test("checks total with max", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "a" }),
        buildToolCall({ name: "b" }),
        buildToolCall({ name: "c" }),
      ],
    });
    expect(trace).toHaveToolCallCount({ max: 5 });
    expect(trace).not.toHaveToolCallCount({ max: 2 });
  });
});

describe("toHaveToolOrder", () => {
  test("passes when tools are in order", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "lookupUser" }),
        buildToolCall({ name: "sendEmail" }),
      ],
    });
    expect(trace).toHaveToolOrder(["lookupUser", "sendEmail"]);
  });

  test("passes with interleaved tools", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "lookupUser" }),
        buildToolCall({ name: "log" }),
        buildToolCall({ name: "sendEmail" }),
      ],
    });
    expect(trace).toHaveToolOrder(["lookupUser", "sendEmail"]);
  });

  test("fails when tools are in wrong order", () => {
    const trace = buildTrace({
      toolCalls: [
        buildToolCall({ name: "sendEmail" }),
        buildToolCall({ name: "lookupUser" }),
      ],
    });
    expect(trace).not.toHaveToolOrder(["lookupUser", "sendEmail"]);
  });

  test("fails when tool is missing", () => {
    const trace = buildTrace({
      toolCalls: [buildToolCall({ name: "lookupUser" })],
    });
    expect(trace).not.toHaveToolOrder(["lookupUser", "sendEmail"]);
  });
});
