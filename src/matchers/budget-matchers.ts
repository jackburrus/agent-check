import { assertIsTrace } from "./helpers.js";

export function toBeWithinBudget(trace: unknown, opts: { maxUsd: number }) {
  assertIsTrace(trace);

  if (trace.cost === undefined) {
    return {
      pass: false,
      message: () =>
        "Expected trace to have cost data, but trace.cost is undefined. Use ctx.trace.setCost() to set it.",
    };
  }

  const pass = trace.cost <= opts.maxUsd;
  return {
    pass,
    message: () =>
      pass
        ? `Expected cost to exceed $${opts.maxUsd}, but was $${trace.cost}`
        : `Expected cost to be at most $${opts.maxUsd}, but was $${trace.cost}`,
  };
}

export function toBeWithinTokens(trace: unknown, opts: { maxTotal: number }) {
  assertIsTrace(trace);

  if (trace.tokens === undefined) {
    return {
      pass: false,
      message: () =>
        "Expected trace to have token data, but trace.tokens is undefined. Use ctx.trace.setTokens() to set it.",
    };
  }

  const total = trace.tokens.total ?? trace.tokens.input + trace.tokens.output;
  const pass = total <= opts.maxTotal;
  return {
    pass,
    message: () =>
      pass
        ? `Expected total tokens to exceed ${opts.maxTotal}, but was ${total}`
        : `Expected at most ${opts.maxTotal} total tokens, but was ${total}`,
  };
}

export function toBeWithinLatency(trace: unknown, opts: { maxMs: number }) {
  assertIsTrace(trace);

  const pass = trace.duration <= opts.maxMs;
  return {
    pass,
    message: () =>
      pass
        ? `Expected latency to exceed ${opts.maxMs}ms, but was ${trace.duration}ms`
        : `Expected latency to be at most ${opts.maxMs}ms, but was ${trace.duration}ms`,
  };
}
