import { test, expect, describe } from "bun:test";
import { buildTrace } from "../helpers.ts";

describe("toBeWithinBudget", () => {
  test("passes when cost is within budget", () => {
    const trace = buildTrace({ cost: 0.01 });
    expect(trace).toBeWithinBudget({ maxUsd: 0.02 });
  });

  test("passes when cost equals budget", () => {
    const trace = buildTrace({ cost: 0.02 });
    expect(trace).toBeWithinBudget({ maxUsd: 0.02 });
  });

  test("fails when cost exceeds budget", () => {
    const trace = buildTrace({ cost: 0.05 });
    expect(trace).not.toBeWithinBudget({ maxUsd: 0.02 });
  });

  test("fails when cost is undefined", () => {
    const trace = buildTrace();
    expect(trace).not.toBeWithinBudget({ maxUsd: 0.02 });
  });
});

describe("toBeWithinTokens", () => {
  test("passes when tokens are within limit", () => {
    const trace = buildTrace({
      tokens: { input: 100, output: 50, total: 150 },
    });
    expect(trace).toBeWithinTokens({ maxTotal: 200 });
  });

  test("fails when tokens exceed limit", () => {
    const trace = buildTrace({
      tokens: { input: 3000, output: 2000, total: 5000 },
    });
    expect(trace).not.toBeWithinTokens({ maxTotal: 4000 });
  });

  test("fails when tokens are undefined", () => {
    const trace = buildTrace();
    expect(trace).not.toBeWithinTokens({ maxTotal: 4000 });
  });

  test("computes total from input+output when total is missing", () => {
    const trace = buildTrace({
      tokens: { input: 100, output: 50 },
    });
    expect(trace).toBeWithinTokens({ maxTotal: 200 });
  });
});

describe("toBeWithinLatency", () => {
  test("passes when duration is within limit", () => {
    const trace = buildTrace({ duration: 500 });
    expect(trace).toBeWithinLatency({ maxMs: 1000 });
  });

  test("fails when duration exceeds limit", () => {
    const trace = buildTrace({ duration: 5000 });
    expect(trace).not.toBeWithinLatency({ maxMs: 3000 });
  });
});
