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
