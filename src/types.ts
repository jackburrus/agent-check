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

export interface Trace {
  completed: boolean;
  error?: Error;
  input: unknown;
  output: unknown;
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

export interface RunOptions {
  input?: unknown;
  mocks?: Record<string, MockToolFn>;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface RunContext {
  input: unknown;
  tools: Record<string, (...args: unknown[]) => unknown>;
  trace: TraceWriter;
}

export type AgentFn = (ctx: RunContext) => unknown | Promise<unknown>;
