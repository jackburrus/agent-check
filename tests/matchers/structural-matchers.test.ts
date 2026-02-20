import { test, expect, describe } from "bun:test";
import { buildTrace, buildTurn } from "../helpers.ts";

describe("toConverge", () => {
  test("passes when trace converged", () => {
    const trace = buildTrace({ converged: true });
    expect(trace).toConverge();
  });

  test("fails when trace did not converge", () => {
    const trace = buildTrace({ converged: false });
    expect(trace).not.toConverge();
  });

  test("error message includes error when present", () => {
    const trace = buildTrace({
      converged: false,
      error: new Error("boom"),
    });
    expect(trace).not.toConverge();
  });
});

describe("toHaveTurns", () => {
  test("passes with no args when turns exist", () => {
    const trace = buildTrace({
      turns: [buildTurn({ index: 0, label: "plan" })],
    });
    expect(trace).toHaveTurns();
  });

  test("fails with no args when no turns", () => {
    const trace = buildTrace({ turns: [] });
    expect(trace).not.toHaveTurns();
  });

  test("passes with min constraint", () => {
    const trace = buildTrace({
      turns: [
        buildTurn({ index: 0, label: "a" }),
        buildTurn({ index: 1, label: "b" }),
      ],
    });
    expect(trace).toHaveTurns({ min: 2 });
  });

  test("fails when below min", () => {
    const trace = buildTrace({
      turns: [buildTurn({ index: 0, label: "a" })],
    });
    expect(trace).not.toHaveTurns({ min: 2 });
  });

  test("passes with max constraint", () => {
    const trace = buildTrace({
      turns: [buildTurn({ index: 0, label: "a" })],
    });
    expect(trace).toHaveTurns({ max: 3 });
  });

  test("fails when above max", () => {
    const trace = buildTrace({
      turns: Array.from({ length: 5 }, (_, i) =>
        buildTurn({ index: i, label: `turn-${i}` })
      ),
    });
    expect(trace).not.toHaveTurns({ max: 3 });
  });

  test("passes with min and max range", () => {
    const trace = buildTrace({
      turns: Array.from({ length: 3 }, (_, i) =>
        buildTurn({ index: i, label: `turn-${i}` })
      ),
    });
    expect(trace).toHaveTurns({ min: 2, max: 5 });
  });
});

describe("toHaveStopReason", () => {
  test("passes when stop reason matches", () => {
    const trace = buildTrace({ converged: true, stopReason: "converged" });
    expect(trace).toHaveStopReason("converged");
  });

  test("passes for error stop reason", () => {
    const trace = buildTrace({ converged: false, stopReason: "error" });
    expect(trace).toHaveStopReason("error");
  });

  test("fails when stop reason does not match", () => {
    const trace = buildTrace({ converged: false, stopReason: "timeout" });
    expect(trace).not.toHaveStopReason("converged");
  });
});
