import type { Trace, ToolCall, RunContext, RunOptions, MockToolFn } from "./types.js";
import { TraceBuilder } from "./trace-builder.js";
import { ForbiddenToolError } from "./mock.js";

const DEFAULT_TIMEOUT = 30_000;

function wrapMock(
  name: string,
  mockFn: MockToolFn,
  builder: TraceBuilder
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const startedAt = Date.now();
    let output: unknown;
    let error: Error | undefined;

    try {
      output = mockFn.call({ _toolName: name }, ...args);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw error;
    } finally {
      const endedAt = Date.now();
      const call: ToolCall = {
        name,
        input: args.length === 1 ? args[0] : args,
        output,
        error,
        duration: endedAt - startedAt,
        startedAt,
        endedAt,
      };
      builder.recordToolCall(call);
    }

    return output;
  };
}

function wrapAsyncMock(
  name: string,
  mockFn: MockToolFn,
  builder: TraceBuilder
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    const startedAt = Date.now();
    let output: unknown;
    let error: Error | undefined;

    try {
      output = await mockFn.call({ _toolName: name }, ...args);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw error;
    } finally {
      const endedAt = Date.now();
      const call: ToolCall = {
        name,
        input: args.length === 1 ? args[0] : args,
        output,
        error,
        duration: endedAt - startedAt,
        startedAt,
        endedAt,
      };
      builder.recordToolCall(call);
    }

    return output;
  };
}

export async function run<
  TInput = unknown,
  TTools = Record<string, (...args: any[]) => any>,
  TOutput = unknown,
>(
  agentFn: (ctx: RunContext<TInput, TTools>) => TOutput | Promise<TOutput>,
  options: RunOptions<TInput> = {} as RunOptions<TInput>,
): Promise<Trace<TInput, Awaited<TOutput>>> {
  const { input, mocks = {}, timeout = DEFAULT_TIMEOUT, metadata = {} } = options;
  const builder = new TraceBuilder();
  builder.setInput(input);

  for (const [key, value] of Object.entries(metadata)) {
    builder.setMetadata(key, value);
  }

  // Wrap mocks in tracking proxies
  const trackedTools: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [name, mockFn] of Object.entries(mocks)) {
    if (mockFn._isForbidden) {
      trackedTools[name] = wrapMock(name, mockFn, builder);
    } else {
      // Use async wrapper to handle both sync and async mock implementations
      trackedTools[name] = wrapAsyncMock(name, mockFn, builder);
    }
  }

  const writer = builder.writer();
  const ctx = { input, tools: trackedTools, trace: writer } as RunContext<TInput, TTools>;

  const execute = async () => {
    try {
      const result = await agentFn(ctx);
      builder.setConverged(true);
      builder.setStopReason("converged");
      if (!builder.outputOverridden) {
        builder.setOutput(result);
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      builder.setError(error);
      builder.setConverged(false);
      builder.setStopReason("error");
    }
  };

  // Race against timeout
  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeout)
  );

  const result = await Promise.race([execute(), timeoutPromise]);

  if (result === "timeout") {
    builder.setConverged(false);
    builder.setStopReason("timeout");
    builder.setError(new Error(`Agent timed out after ${timeout}ms`));
  }

  return builder.build() as Trace<TInput, Awaited<TOutput>>;
}
