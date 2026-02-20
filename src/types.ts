export interface ToolCall {
  name: string;
  input: unknown;
  output: unknown;
  error?: Error;
  duration: number;
  startedAt: number;
  endedAt: number;
}

export interface Turn {
  index: number;
  label?: string;
  toolCalls: ToolCall[];
  response?: string;
  tokens?: TokenUsage;
  duration: number;
  startedAt: number;
  endedAt: number;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  input: number;
  output: number;
  total?: number;
}

export interface Trace<TInput = unknown, TOutput = unknown> {
  converged: boolean;
  stopReason: "converged" | "maxTurns" | "error" | "timeout";
  error?: Error;
  input: TInput;
  output: TOutput;
  toolCalls: readonly ToolCall[];
  turns: readonly Turn[];
  duration: number;
  startedAt: number;
  endedAt: number;
  cost?: number;
  tokens?: TokenUsage;
  metadata: Record<string, unknown>;
}

export interface TurnHandle {
  addToolCall(call: {
    name: string;
    input: unknown;
    output: unknown;
    error?: Error;
    duration?: number;
  }): void;
  setResponse(text: string): void;
  end(): void;
}

export interface TraceWriter {
  addToolCall(call: {
    name: string;
    input: unknown;
    output: unknown;
    error?: Error;
    duration?: number;
  }): void;
  startTurn(label?: string, metadata?: Record<string, unknown>): TurnHandle;
  setOutput(output: unknown): void;
  setCost(usd: number): void;
  setTokens(tokens: TokenUsage): void;
  setMetadata(key: string, value: unknown): void;
}

export type MockToolFn = ((...args: unknown[]) => unknown) & {
  _isMockTool: true;
  _isForbidden?: boolean;
};

export interface RunOptions<TInput = unknown> {
  input?: TInput;
  mocks?: Record<string, MockToolFn>;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface RunContext<
  TInput = unknown,
  TTools = Record<string, (...args: any[]) => any>,
> {
  input: TInput;
  tools: TTools;
  trace: TraceWriter;
}

export type AgentFn<
  TInput = unknown,
  TTools = Record<string, (...args: any[]) => any>,
  TOutput = unknown,
> = (ctx: RunContext<TInput, TTools>) => TOutput | Promise<TOutput>;

export interface Baseline {
  version: 1;
  toolSet: string[];
  toolOrder: string[];
  turnCount: { min: number; max: number };
  costRange?: { min: number; max: number };
  tokenRange?: { min: number; max: number };
  outputShape: string[];
  stopReason: string;
  metadata?: Record<string, unknown>;
}

export interface BaselineDiff {
  pass: boolean;
  differences: string[];
}
