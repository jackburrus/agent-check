import type { Trace, ToolCall, Turn, TokenUsage } from "../src/types.ts";

interface BuildTraceOptions {
  converged?: boolean;
  stopReason?: Trace["stopReason"];
  error?: Error;
  input?: unknown;
  output?: unknown;
  toolCalls?: ToolCall[];
  turns?: Turn[];
  duration?: number;
  startedAt?: number;
  endedAt?: number;
  cost?: number;
  tokens?: TokenUsage;
  metadata?: Record<string, unknown>;
}

export function buildTrace(opts: BuildTraceOptions = {}): Trace {
  const now = Date.now();
  return {
    converged: opts.converged ?? true,
    stopReason: opts.stopReason ?? (opts.converged === false ? "error" : "converged"),
    error: opts.error,
    input: opts.input ?? null,
    output: opts.output ?? null,
    toolCalls: Object.freeze(opts.toolCalls ?? []),
    turns: Object.freeze(opts.turns ?? []),
    duration: opts.duration ?? 100,
    startedAt: opts.startedAt ?? now - 100,
    endedAt: opts.endedAt ?? now,
    cost: opts.cost,
    tokens: opts.tokens,
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

export function buildTurn(
  overrides: Partial<Turn> & { index: number } = { index: 0 }
): Turn {
  const now = Date.now();
  return {
    toolCalls: [],
    duration: 10,
    startedAt: now - 10,
    endedAt: now,
    ...overrides,
  };
}
