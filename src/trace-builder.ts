import type {
  Trace,
  ToolCall,
  Turn,
  TokenUsage,
  TraceWriter,
  TurnHandle,
} from "./types.js";

export class TraceBuilder {
  private _converged = false;
  private _stopReason: Trace["stopReason"] = "error";
  private _error?: Error;
  private _input: unknown = undefined;
  private _output: unknown = undefined;
  private _toolCalls: ToolCall[] = [];
  private _turns: Turn[] = [];
  private _startedAt: number;
  private _cost?: number;
  private _tokens?: TokenUsage;
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

  setConverged(converged: boolean): void {
    this._converged = converged;
  }

  setStopReason(reason: Trace["stopReason"]): void {
    this._stopReason = reason;
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

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  recordToolCall(call: ToolCall): void {
    this._toolCalls.push(call);
  }

  addTurn(turn: Turn): void {
    this._turns.push(turn);
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
      startTurn: (label?, metadata?) => {
        const turnStartedAt = Date.now();
        const turnToolCalls: ToolCall[] = [];
        const turnIndex = this._turns.length;
        let turnResponse: string | undefined;

        const handle: TurnHandle = {
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
            turnToolCalls.push(toolCall);
            this._toolCalls.push(toolCall);
          },
          setResponse: (text: string) => {
            turnResponse = text;
          },
          end: () => {
            const endedAt = Date.now();
            this.addTurn({
              index: turnIndex,
              label,
              toolCalls: turnToolCalls,
              response: turnResponse,
              duration: endedAt - turnStartedAt,
              startedAt: turnStartedAt,
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
      setMetadata: (key, value) => this.setMetadata(key, value),
    };
  }

  build(): Trace {
    const endedAt = Date.now();
    const trace: Trace = {
      converged: this._converged,
      stopReason: this._stopReason,
      error: this._error,
      input: this._input,
      output: this._output,
      toolCalls: Object.freeze([...this._toolCalls]),
      turns: Object.freeze([...this._turns]),
      duration: endedAt - this._startedAt,
      startedAt: this._startedAt,
      endedAt,
      cost: this._cost,
      tokens: this._tokens,
      metadata: { ...this._metadata },
    };
    return Object.freeze(trace) as Trace;
  }
}
