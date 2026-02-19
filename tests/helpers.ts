import type { Trace, ToolCall, Step, TokenUsage } from "../src/types.ts";

interface BuildTraceOptions {
  completed?: boolean;
  error?: Error;
  input?: unknown;
  output?: unknown;
  toolCalls?: ToolCall[];
  steps?: Step[];
  duration?: number;
  startedAt?: number;
  endedAt?: number;
  cost?: number;
  tokens?: TokenUsage;
  retries?: number;
  metadata?: Record<string, unknown>;
}

export function buildTrace(opts: BuildTraceOptions = {}): Trace {
  const now = Date.now();
  return {
    completed: opts.completed ?? true,
    error: opts.error,
    input: opts.input ?? null,
    output: opts.output ?? null,
    toolCalls: Object.freeze(opts.toolCalls ?? []),
    steps: Object.freeze(opts.steps ?? []),
    duration: opts.duration ?? 100,
    startedAt: opts.startedAt ?? now - 100,
    endedAt: opts.endedAt ?? now,
    cost: opts.cost,
    tokens: opts.tokens,
    retries: opts.retries ?? 0,
    metadata: opts.metadata ?? {},
  };
}

export function buildToolCall(
  overrides: Partial<ToolCall> & { name: string } = { name: "tool" }
): ToolCall {
  const now = Date.now();
  return {
    input: undefined,
    output: undefined,
    duration: 10,
    startedAt: now - 10,
    endedAt: now,
    ...overrides,
  };
}
