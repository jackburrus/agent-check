import type { MockToolFn } from "./types.ts";

export class ForbiddenToolError extends Error {
  constructor(toolName: string, message?: string) {
    super(
      message ?? `Forbidden tool "${toolName}" was called`
    );
    this.name = "ForbiddenToolError";
  }
}

function makeMockFn(impl: (...args: unknown[]) => unknown): MockToolFn {
  const fn = impl as MockToolFn;
  fn._isMockTool = true;
  return fn;
}

export const mock = {
  fn(valueOrImpl?: unknown): MockToolFn {
    if (typeof valueOrImpl === "function") {
      return makeMockFn(valueOrImpl as (...args: unknown[]) => unknown);
    }
    return makeMockFn(() => valueOrImpl);
  },

  sequence(values: unknown[]): MockToolFn {
    if (values.length === 0) {
      throw new Error("mock.sequence() requires at least one value");
    }
    let callIndex = 0;
    return makeMockFn(() => {
      const value = callIndex < values.length
        ? values[callIndex]
        : values[values.length - 1];
      callIndex++;
      return value;
    });
  },

  forbidden(message?: string): MockToolFn {
    const fn = makeMockFn(function forbiddenTool(this: { _toolName?: string }) {
      throw new ForbiddenToolError(
        this?._toolName ?? "unknown",
        message
      );
    });
    fn._isForbidden = true;
    return fn;
  },
};
