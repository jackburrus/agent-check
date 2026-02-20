// Public API
export { run } from "./run.ts";
export { mock, ForbiddenToolError } from "./mock.ts";
export { allMatchers } from "./matchers/index.ts";

// Baseline
export { extractBaseline, compareBaseline, saveBaseline, loadBaseline, updateBaseline } from "./baseline.ts";

// Trace I/O
export { saveTrace, loadTrace, printTrace } from "./trace-io.ts";

// Types
export type {
  Trace,
  ToolCall,
  Turn,
  TokenUsage,
  TraceWriter,
  TurnHandle,
  RunOptions,
  RunContext,
  AgentFn,
  MockToolFn,
  Baseline,
  BaselineDiff,
} from "./types.ts";
