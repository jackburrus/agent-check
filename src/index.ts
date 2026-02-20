// Public API
export { run } from "./run.js";
export { mock, ForbiddenToolError } from "./mock.js";
export { allMatchers } from "./matchers/index.js";

// Baseline
export { extractBaseline, compareBaseline, saveBaseline, loadBaseline, updateBaseline } from "./baseline.js";

// Trace I/O
export { saveTrace, loadTrace, printTrace } from "./trace-io.js";

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
} from "./types.js";
