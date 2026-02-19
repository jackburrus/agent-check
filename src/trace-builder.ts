import type {
  Trace,
  ToolCall,
  Step,
  TokenUsage,
  TraceWriter,
  StepHandle,
} from "./types.ts";

export class TraceBuilder {
  private _completed = false;
  private _error?: Error;
  private _input: unknown = undefined;
  private _output: unknown = undefined;
  private _toolCalls: ToolCall[] = [];
  private _steps: Step[] = [];
  private _startedAt: number;
  private _cost?: number;
  private _tokens?: TokenUsage;
  private _retries = 0;
  private _metadata: Record<string, unknown> = {};
  private _outputOverridden = false;

  constructor() {
    this._startedAt = Date.now();
  }

  setInput(input: unknown): void {
    this._input = input;
  }

  setOutput(output: unknown): void {
    this._output = output;
    this._outputOverridden = true;
  }

  get outputOverridden(): boolean {
    return this._outputOverridden;
  }

  setCompleted(completed: boolean): void {
    this._completed = completed;
  }

  setError(error: Error): void {
    this._error = error;
  }

  setCost(usd: number): void {
    this._cost = usd;
  }

  setTokens(tokens: TokenUsage): void {
    this._tokens = {
      input: tokens.input,
      output: tokens.output,
      total: tokens.total ?? tokens.input + tokens.output,
    };
  }

  setRetries(count: number): void {
    this._retries = count;
  }

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  recordToolCall(call: ToolCall): void {
    this._toolCalls.push(call);
  }

  addStep(step: Step): void {
    this._steps.push(step);
  }

  writer(): TraceWriter {
    return {
      addToolCall: (call) => {
        const now = Date.now();
        this.recordToolCall({
          name: call.name,
          input: call.input,
          output: call.output,
          error: call.error,
          duration: call.duration ?? 0,
          startedAt: now - (call.duration ?? 0),
          endedAt: now,
        });
      },
      startStep: (label, metadata) => {
        const stepStartedAt = Date.now();
        const stepToolCalls: ToolCall[] = [];

        const handle: StepHandle = {
          addToolCall: (call) => {
            const now = Date.now();
            const toolCall: ToolCall = {
              name: call.name,
              input: call.input,
              output: call.output,
              error: call.error,
              duration: call.duration ?? 0,
              startedAt: now - (call.duration ?? 0),
              endedAt: now,
            };
            stepToolCalls.push(toolCall);
            this._toolCalls.push(toolCall);
          },
          end: () => {
            const endedAt = Date.now();
            this.addStep({
              label,
              toolCalls: stepToolCalls,
              duration: endedAt - stepStartedAt,
              startedAt: stepStartedAt,
              endedAt,
              metadata,
            });
          },
        };

        return handle;
      },
      setOutput: (output) => this.setOutput(output),
      setCost: (usd) => this.setCost(usd),
      setTokens: (tokens) => this.setTokens(tokens),
      setRetries: (count) => this.setRetries(count),
      setMetadata: (key, value) => this.setMetadata(key, value),
    };
  }

  build(): Trace {
    const endedAt = Date.now();
    const trace: Trace = {
      completed: this._completed,
      error: this._error,
      input: this._input,
      output: this._output,
      toolCalls: Object.freeze([...this._toolCalls]),
      steps: Object.freeze([...this._steps]),
      duration: endedAt - this._startedAt,
      startedAt: this._startedAt,
      endedAt,
      cost: this._cost,
      tokens: this._tokens,
      retries: this._retries,
      metadata: { ...this._metadata },
    };
    return Object.freeze(trace) as Trace;
  }
}
