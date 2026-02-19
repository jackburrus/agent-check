import { test, expect, describe } from "bun:test";
import { mock, ForbiddenToolError } from "../src/mock.ts";

describe("mock.fn", () => {
  test("returns static value", () => {
    const fn = mock.fn({ id: "123", name: "Alice" });
    expect(fn()).toEqual({ id: "123", name: "Alice" });
    expect(fn._isMockTool).toBe(true);
  });

  test("returns undefined when no argument", () => {
    const fn = mock.fn();
    expect(fn()).toBeUndefined();
  });

  test("uses function implementation", () => {
    const fn = mock.fn((input: unknown) => {
      const { id } = input as { id: string };
      return { id, name: "Alice" };
    });
    expect(fn({ id: "42" })).toEqual({ id: "42", name: "Alice" });
  });

  test("returns static array", () => {
    const fn = mock.fn([1, 2, 3]);
    expect(fn()).toEqual([1, 2, 3]);
  });

  test("returns static string", () => {
    const fn = mock.fn("hello");
    expect(fn()).toBe("hello");
  });

  test("returns null as static value", () => {
    const fn = mock.fn(null);
    expect(fn()).toBeNull();
  });
});

describe("mock.sequence", () => {
  test("returns values in order", () => {
    const fn = mock.sequence(["first", "second", "third"]);
    expect(fn()).toBe("first");
    expect(fn()).toBe("second");
    expect(fn()).toBe("third");
  });

  test("repeats last value when exhausted", () => {
    const fn = mock.sequence(["only-two", "values"]);
    expect(fn()).toBe("only-two");
    expect(fn()).toBe("values");
    expect(fn()).toBe("values");
    expect(fn()).toBe("values");
  });

  test("works with single value", () => {
    const fn = mock.sequence([42]);
    expect(fn()).toBe(42);
    expect(fn()).toBe(42);
  });

  test("works with objects", () => {
    const fn = mock.sequence([
      { intent: "question", confidence: 0.9 },
      { message: "Here is your answer.", tokensUsed: 150 },
    ]);
    expect(fn()).toEqual({ intent: "question", confidence: 0.9 });
    expect(fn()).toEqual({ message: "Here is your answer.", tokensUsed: 150 });
  });

  test("throws on empty array", () => {
    expect(() => mock.sequence([])).toThrow(
      "mock.sequence() requires at least one value"
    );
  });

  test("has _isMockTool flag", () => {
    const fn = mock.sequence(["a"]);
    expect(fn._isMockTool).toBe(true);
  });
});

describe("mock.forbidden", () => {
  test("throws ForbiddenToolError when called", () => {
    const fn = mock.forbidden();
    expect(() => fn.call({ _toolName: "deleteUser" })).toThrow(
      ForbiddenToolError
    );
  });

  test("throws with custom message", () => {
    const fn = mock.forbidden("Agents must not delete users");
    expect(() => fn.call({ _toolName: "deleteUser" })).toThrow(
      "Agents must not delete users"
    );
  });

  test("has _isForbidden flag", () => {
    const fn = mock.forbidden();
    expect(fn._isForbidden).toBe(true);
    expect(fn._isMockTool).toBe(true);
  });
});
