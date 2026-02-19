import type { Trace, TokenUsage } from "./types.ts";

declare module "bun:test" {
  interface Matchers<T> {
    // Tool matchers
    toHaveCalledTool(toolName: string): void;
    toHaveCalledToolWith(toolName: string, expectedInput: unknown): void;
    toHaveToolCallCount(toolName: string, count: number): void;
    toHaveToolCallCount(opts: { max: number }): void;
    toHaveToolOrder(expectedOrder: string[]): void;

    // Budget matchers
    toBeWithinBudget(opts: { maxUsd: number }): void;
    toBeWithinTokens(opts: { maxTotal: number }): void;
    toBeWithinLatency(opts: { maxMs: number }): void;

    // Structural matchers
    toComplete(): void;
    toHaveSteps(opts?: { min?: number; max?: number }): void;
    toHaveRetries(opts: { max: number }): void;
  }
}
