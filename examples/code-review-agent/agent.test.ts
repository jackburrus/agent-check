import { test, expect, describe } from "bun:test";
import { run, mock, extractBaseline, compareBaseline, printTrace } from "../../src/index.ts";
import { codeReviewAgent } from "./agent.ts";
import type {
  ReviewInput,
  ReviewResult,
  PRContext,
  FileDiff,
  LintIssue,
  SecurityFinding,
} from "./types.ts";

// ============================================================
// Fixtures
// ============================================================

const cleanFile: FileDiff = {
  path: "src/utils.ts",
  additions: 10,
  deletions: 2,
  patch: "+export function add(a: number, b: number) { return a + b; }",
};

const riskyFile: FileDiff = {
  path: "src/auth.ts",
  additions: 25,
  deletions: 5,
  patch: '+const query = `SELECT * FROM users WHERE id = ${userId}`;',
};

const cleanPR: PRContext = {
  number: 42,
  title: "Add utility functions",
  author: "alice",
  files: [cleanFile],
  baseBranch: "main",
};

const riskyPR: PRContext = {
  number: 99,
  title: "Update auth module",
  author: "bob",
  files: [cleanFile, riskyFile],
  baseBranch: "main",
};

const sqlInjection: SecurityFinding = {
  file: "src/auth.ts",
  line: 12,
  cwe: "CWE-89",
  severity: "critical",
  description: "SQL injection vulnerability: user input concatenated into query string",
};

const lintWarning: LintIssue = {
  file: "src/utils.ts",
  line: 5,
  rule: "no-unused-vars",
  severity: "warning",
  message: "Variable 'temp' is defined but never used",
};

const lintError: LintIssue = {
  file: "src/auth.ts",
  line: 10,
  rule: "no-eval",
  severity: "error",
  message: "eval() is not allowed",
};

// ============================================================
// Helpers
// ============================================================

function baseMocks(overrides: Record<string, ReturnType<typeof mock.fn>> = {}) {
  return {
    analyzeDiff: mock.fn({ complexity: 3, riskLevel: "low" }),
    runLinter: mock.fn([]),
    scanSecurity: mock.fn([]),
    generateComment: mock.fn({ text: "Please fix this issue.", tokensUsed: 50 }),
    postComment: mock.fn({ id: "comment-1" }),
    submitReview: mock.fn(undefined),
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("clean PR: no issues", () => {
  test("approves clean PR", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toConverge();
    expect(trace).toHaveStopReason("converged");

    const output = trace.output as ReviewResult;
    expect(output.approved).toBe(true);
    expect(output.blockers).toBe(0);
    expect(output.comments).toHaveLength(0);
    expect(output.summary).toContain("LGTM");
  });

  test("follows analyze → lint → scan → comment → submit pipeline", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toHaveToolOrder([
      "analyzeDiff",
      "runLinter",
      "scanSecurity",
      "submitReview",
    ]);
  });

  test("has exactly 5 turns", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toHaveTurns({ min: 5, max: 5 });
    expect(trace.turns[0]!.label).toBe("analyze");
    expect(trace.turns[1]!.label).toBe("lint");
    expect(trace.turns[2]!.label).toBe("security-scan");
    expect(trace.turns[3]!.label).toBe("comment");
    expect(trace.turns[4]!.label).toBe("submit");
  });

  test("does not generate comments for clean code", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).not.toHaveCalledTool("generateComment");
    expect(trace).not.toHaveCalledTool("postComment");
  });
});

describe("security issue: blocks approval", () => {
  test("rejects PR with critical security finding", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks({
        scanSecurity: mock.fn((path: unknown) =>
          (path as string) === "src/auth.ts" ? [sqlInjection] : []
        ),
      }),
    });

    expect(trace).toConverge();

    const output = trace.output as ReviewResult;
    expect(output.approved).toBe(false);
    expect(output.blockers).toBeGreaterThan(0);
    expect(output.securityIssues).toBe(1);
    expect(output.summary).toContain("blocking");
  });

  test("generates and posts comment for security finding", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks({
        scanSecurity: mock.fn((path: unknown) =>
          (path as string) === "src/auth.ts" ? [sqlInjection] : []
        ),
      }),
    });

    expect(trace).toHaveCalledTool("generateComment");
    expect(trace).toHaveCalledTool("postComment");
    expect(trace).toHaveToolOrder(["scanSecurity", "generateComment", "postComment", "submitReview"]);
  });

  test("submit is called with approved=false", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks({
        scanSecurity: mock.fn((path: unknown) =>
          (path as string) === "src/auth.ts" ? [sqlInjection] : []
        ),
      }),
    });

    expect(trace).toHaveCalledToolWith("submitReview", [99, false, expect.any(String)]);
  });
});

describe("lint issues", () => {
  test("ignores warnings in normal mode", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks({
        runLinter: mock.fn([lintWarning]),
      }),
    });

    expect(trace).toConverge();

    const output = trace.output as ReviewResult;
    expect(output.approved).toBe(true);
    // Warning is recorded but doesn't generate a comment in non-strict mode
    expect(output.lintIssues).toBe(1);
    expect(output.comments).toHaveLength(0);
  });

  test("treats warnings as errors in strict mode", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR, strictMode: true },
      mocks: baseMocks({
        runLinter: mock.fn([lintWarning]),
      }),
    });

    expect(trace).toConverge();

    const output = trace.output as ReviewResult;
    expect(output.comments).toHaveLength(1);
    expect(output.comments[0]!.severity).toBe("nit");
  });

  test("lint errors always produce comments", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks({
        runLinter: mock.fn([lintError]),
      }),
    });

    expect(trace).toConverge();
    expect(trace).toHaveCalledTool("postComment");

    const output = trace.output as ReviewResult;
    expect(output.comments).toHaveLength(1);
    expect(output.comments[0]!.body).toContain("no-eval");
  });
});

describe("policy compliance", () => {
  test("always calls submitReview exactly once", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toHaveToolCallCount("submitReview", 1);
  });

  test("analyzes every file in the PR", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks(),
    });

    // riskyPR has 2 files, so analyzeDiff should be called twice
    expect(trace).toHaveToolCallCount("analyzeDiff", 2);
    expect(trace).toHaveToolCallCount("runLinter", 2);
    expect(trace).toHaveToolCallCount("scanSecurity", 2);
  });
});

describe("budget and performance", () => {
  test("stays within cost budget for clean PR", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinBudget({ maxUsd: 0.01 });
  });

  test("stays within token budget", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinTokens({ maxTotal: 5000 });
  });

  test("completes within latency budget", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinLatency({ maxMs: 5000 });
  });

  test("tool calls scale linearly with file count", async () => {
    // Clean PR (1 file) → fewer tool calls than risky PR (2 files)
    const trace1 = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });
    const trace2 = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks(),
    });

    const calls1 = trace1.toolCalls.length;
    const calls2 = trace2.toolCalls.length;
    expect(calls2).toBeGreaterThan(calls1);
  });
});

describe("error handling", () => {
  test("linter failure propagates as error", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks({
        runLinter: mock.fn(() => { throw new Error("Linter crashed"); }),
      }),
    });

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("error");
    expect(trace.error!.message).toContain("Linter crashed");
  });

  test("timeout during security scan", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks({
        scanSecurity: mock.fn(async () => {
          await new Promise((r) => setTimeout(r, 5000));
          return [];
        }),
      }),
      timeout: 50,
    });

    expect(trace).not.toConverge();
    expect(trace).toHaveStopReason("timeout");
  });
});

describe("baseline regression", () => {
  test("clean PR baseline is stable", async () => {
    const trace1 = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });
    const baseline = extractBaseline(trace1);

    expect(baseline.toolSet).toEqual(["analyzeDiff", "runLinter", "scanSecurity", "submitReview"]);
    expect(baseline.stopReason).toBe("converged");

    const trace2 = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });
    expect(trace2).toMatchBaseline(baseline);
  });

  test("security findings change the baseline shape", async () => {
    const cleanTrace = await run(codeReviewAgent, {
      input: { pr: cleanPR },
      mocks: baseMocks(),
    });
    const baseline = extractBaseline(cleanTrace);

    const riskyTrace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks({
        scanSecurity: mock.fn((path: unknown) =>
          (path as string) === "src/auth.ts" ? [sqlInjection] : []
        ),
      }),
    });

    const diff = compareBaseline(riskyTrace, baseline);
    expect(diff.pass).toBe(false);
    expect(diff.differences.length).toBeGreaterThan(0);
  });
});

describe("debugging", () => {
  test("printTrace produces useful output", async () => {
    const trace = await run(codeReviewAgent, {
      input: { pr: riskyPR },
      mocks: baseMocks({
        scanSecurity: mock.fn((path: unknown) =>
          (path as string) === "src/auth.ts" ? [sqlInjection] : []
        ),
      }),
    });

    const output = printTrace(trace);
    expect(output).toContain("Trace: converged");
    expect(output).toContain("5 turns");
    expect(output).toContain("[analyze]");
    expect(output).toContain("[submit]");
  });
});
