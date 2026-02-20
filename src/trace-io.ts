import type { Trace, ToolCall, Turn, TokenUsage } from "./types.js";

interface SerializedError {
  __isError: true;
  message: string;
  name: string;
  stack?: string;
}

function serializeError(err: Error): SerializedError {
  return {
    __isError: true,
    message: err.message,
    name: err.name,
    stack: err.stack,
  };
}

function deserializeError(obj: SerializedError): Error {
  const err = new Error(obj.message);
  err.name = obj.name;
  if (obj.stack) err.stack = obj.stack;
  return err;
}

function isSerializedError(val: unknown): val is SerializedError {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as SerializedError).__isError === true
  );
}

function serializeTrace(trace: Trace): unknown {
  return {
    converged: trace.converged,
    stopReason: trace.stopReason,
    error: trace.error ? serializeError(trace.error) : undefined,
    input: trace.input,
    output: trace.output,
    toolCalls: trace.toolCalls.map((tc) => ({
      ...tc,
      error: tc.error ? serializeError(tc.error) : undefined,
    })),
    turns: trace.turns.map((turn) => ({
      ...turn,
      toolCalls: turn.toolCalls.map((tc) => ({
        ...tc,
        error: tc.error ? serializeError(tc.error) : undefined,
      })),
    })),
    duration: trace.duration,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    cost: trace.cost,
    tokens: trace.tokens,
    metadata: trace.metadata,
  };
}

function deserializeTrace(data: any): Trace {
  return {
    converged: data.converged,
    stopReason: data.stopReason,
    error: isSerializedError(data.error) ? deserializeError(data.error) : undefined,
    input: data.input,
    output: data.output,
    toolCalls: Object.freeze(
      (data.toolCalls ?? []).map((tc: any) => ({
        ...tc,
        error: isSerializedError(tc.error) ? deserializeError(tc.error) : undefined,
      }))
    ),
    turns: Object.freeze(
      (data.turns ?? []).map((turn: any) => ({
        ...turn,
        toolCalls: (turn.toolCalls ?? []).map((tc: any) => ({
          ...tc,
          error: isSerializedError(tc.error) ? deserializeError(tc.error) : undefined,
        })),
      }))
    ),
    duration: data.duration,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    cost: data.cost,
    tokens: data.tokens,
    metadata: data.metadata ?? {},
  };
}

export async function saveTrace(trace: Trace, path: string): Promise<void> {
  const serialized = serializeTrace(trace);
  await Bun.write(path, JSON.stringify(serialized, null, 2) + "\n");
}

export async function loadTrace(path: string): Promise<Trace> {
  const file = Bun.file(path);
  const text = await file.text();
  const data = JSON.parse(text);
  return deserializeTrace(data);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function formatValue(val: unknown): string {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  const str = JSON.stringify(val);
  return truncate(str, 60);
}

export function printTrace(trace: Trace): string {
  const lines: string[] = [];

  const status = trace.converged ? "converged" : trace.stopReason;
  const turnCount = trace.turns.length;
  const toolCallCount = trace.toolCalls.length;
  const costStr = trace.cost !== undefined ? `, ${trace.cost} USD` : "";
  const tokenStr = trace.tokens
    ? `, ${trace.tokens.total ?? trace.tokens.input + trace.tokens.output} tokens`
    : "";

  lines.push(
    `Trace: ${status} (${turnCount} turns, ${toolCallCount} tool calls${costStr}${tokenStr}, ${trace.duration}ms)`
  );

  for (const turn of trace.turns) {
    const labelStr = turn.label ? ` [${turn.label}]` : "";
    lines.push(`  Turn ${turn.index}${labelStr}:`);

    for (const tc of turn.toolCalls) {
      const inputStr = formatValue(tc.input);
      const outputStr = tc.error
        ? `ERROR: ${tc.error.message}`
        : formatValue(tc.output);
      lines.push(`    → ${tc.name}(${inputStr}) → ${outputStr}`);
    }

    if (turn.response) {
      lines.push(`    Response: ${truncate(turn.response, 80)}`);
    }
  }

  if (trace.output !== undefined && trace.output !== null) {
    lines.push(`  Output: ${formatValue(trace.output)}`);
  }

  return lines.join("\n");
}
