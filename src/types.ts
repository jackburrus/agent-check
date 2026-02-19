export interface ToolCall {
  name: string;
  input: unknown;
  output: unknown;
  error?: Error;
  duration: number;
  startedAt: number;
  endedAt: number;
}

export interface Step {
  label: string;
  toolCalls: ToolCall[];
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
  completed: boolean;
  error?: Error;
  input: TInput;
  output: TOutput;
  toolCalls: readonly ToolCall[];
  steps: readonly Step[];
  duration: number;
  startedAt: number;
  endedAt: number;
  cost?: number;
  tokens?: TokenUsage;
  retries: number;
  metadata: Record<string, unknown>;
}

export interface StepHandle {
  addToolCall(call: {
    name: string;
    input: unknown;
    output: unknown;
    error?: Error;
    duration?: number;
  }): void;
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
  startStep(label: string, metadata?: Record<string, unknown>): StepHandle;
  setOutput(output: unknown): void;
  setCost(usd: number): void;
  setTokens(tokens: TokenUsage): void;
  setRetries(count: number): void;
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
