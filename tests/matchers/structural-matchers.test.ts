import { test, expect, describe } from "bun:test";
import { buildTrace } from "../helpers.ts";

describe("toComplete", () => {
  test("passes when trace completed", () => {
    const trace = buildTrace({ completed: true });
    expect(trace).toComplete();
  });

  test("fails when trace did not complete", () => {
    const trace = buildTrace({ completed: false });
    expect(trace).not.toComplete();
  });

  test("error message includes error when present", () => {
    const trace = buildTrace({
      completed: false,
      error: new Error("boom"),
    });
    expect(trace).not.toComplete();
  });
});

describe("toHaveSteps", () => {
  test("passes with no args when steps exist", () => {
    const trace = buildTrace({
      steps: [
        {
          label: "plan",
          toolCalls: [],
          duration: 10,
          startedAt: Date.now() - 10,
          endedAt: Date.now(),
        },
      ],
    });
    expect(trace).toHaveSteps();
  });

  test("fails with no args when no steps", () => {
    const trace = buildTrace({ steps: [] });
    expect(trace).not.toHaveSteps();
  });

  test("passes with min constraint", () => {
    const trace = buildTrace({
      steps: [
        {
          label: "a",
          toolCalls: [],
          duration: 10,
          startedAt: Date.now() - 10,
          endedAt: Date.now(),
        },
        {
          label: "b",
          toolCalls: [],
          duration: 10,
          startedAt: Date.now() - 10,
          endedAt: Date.now(),
        },
      ],
    });
    expect(trace).toHaveSteps({ min: 2 });
  });

  test("fails when below min", () => {
    const trace = buildTrace({
      steps: [
        {
          label: "a",
          toolCalls: [],
          duration: 10,
          startedAt: Date.now() - 10,
          endedAt: Date.now(),
        },
      ],
    });
    expect(trace).not.toHaveSteps({ min: 2 });
  });

  test("passes with max constraint", () => {
    const trace = buildTrace({
      steps: [
        {
          label: "a",
          toolCalls: [],
          duration: 10,
          startedAt: Date.now() - 10,
          endedAt: Date.now(),
        },
      ],
    });
    expect(trace).toHaveSteps({ max: 3 });
  });

  test("fails when above max", () => {
    const trace = buildTrace({
      steps: Array.from({ length: 5 }, (_, i) => ({
        label: `step-${i}`,
        toolCalls: [],
        duration: 10,
        startedAt: Date.now() - 10,
        endedAt: Date.now(),
      })),
    });
    expect(trace).not.toHaveSteps({ max: 3 });
  });

  test("passes with min and max range", () => {
    const trace = buildTrace({
      steps: Array.from({ length: 3 }, (_, i) => ({
        label: `step-${i}`,
        toolCalls: [],
        duration: 10,
        startedAt: Date.now() - 10,
        endedAt: Date.now(),
      })),
    });
    expect(trace).toHaveSteps({ min: 2, max: 5 });
  });
});

describe("toHaveRetries", () => {
  test("passes when retries within max", () => {
    const trace = buildTrace({ retries: 1 });
    expect(trace).toHaveRetries({ max: 2 });
  });

  test("passes when retries equal max", () => {
    const trace = buildTrace({ retries: 2 });
    expect(trace).toHaveRetries({ max: 2 });
  });

  test("fails when retries exceed max", () => {
    const trace = buildTrace({ retries: 5 });
    expect(trace).not.toHaveRetries({ max: 2 });
  });
});
