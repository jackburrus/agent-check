import type { RunContext } from "../../src/index.ts";
import type {
  ReviewInput,
  ReviewTools,
  ReviewResult,
  ReviewComment,
  LintIssue,
  SecurityFinding,
} from "./types.ts";

export async function codeReviewAgent(
  ctx: RunContext<ReviewInput, ReviewTools>,
): Promise<ReviewResult> {
  const { input, tools } = ctx;
  const { pr, strictMode = false } = input;

  ctx.trace.setMetadata("pr", pr.number);
  ctx.trace.setMetadata("author", pr.author);

  const comments: ReviewComment[] = [];
  let totalTokens = 0;

  // --- Turn 0: Analyze diffs ---
  const analyzeTurn = ctx.trace.startTurn("analyze");
  const analyses = [];
  for (const file of pr.files) {
    const analysis = await tools.analyzeDiff(file);
    analyses.push({ file, analysis });
  }
  analyzeTurn.end();

  // --- Turn 1: Lint ---
  const lintTurn = ctx.trace.startTurn("lint");
  const allLintIssues: LintIssue[] = [];
  for (const file of pr.files) {
    const issues = await tools.runLinter(file.path, file.patch);
    allLintIssues.push(...issues);
  }
  lintTurn.end();

  // --- Turn 2: Security scan ---
  const securityTurn = ctx.trace.startTurn("security-scan");
  const allSecurityFindings: SecurityFinding[] = [];
  for (const file of pr.files) {
    const findings = await tools.scanSecurity(file.path, file.patch);
    allSecurityFindings.push(...findings);
  }
  securityTurn.end();

  // --- Turn 3: Generate and post comments ---
  const commentTurn = ctx.trace.startTurn("comment");

  // Security findings → critical comments
  for (const finding of allSecurityFindings) {
    const prompt = `Generate a code review comment for this security issue:\n${finding.description}\nFile: ${finding.file}, Line: ${finding.line}, CWE: ${finding.cwe}`;
    const response = await tools.generateComment(prompt);
    totalTokens += response.tokensUsed;

    const comment: ReviewComment = {
      file: finding.file,
      line: finding.line,
      body: response.text,
      severity: finding.severity === "critical" || finding.severity === "high" ? "critical" : "suggestion",
    };
    comments.push(comment);
    await tools.postComment(pr.number, comment);
  }

  // Lint errors → suggestion comments
  const relevantLintIssues = strictMode
    ? allLintIssues
    : allLintIssues.filter((i) => i.severity === "error");

  for (const issue of relevantLintIssues) {
    const comment: ReviewComment = {
      file: issue.file,
      line: issue.line,
      body: `[${issue.rule}] ${issue.message}`,
      severity: issue.severity === "error" ? "suggestion" : "nit",
    };
    comments.push(comment);
    await tools.postComment(pr.number, comment);
  }

  commentTurn.end();

  // --- Turn 4: Submit review ---
  const submitTurn = ctx.trace.startTurn("submit");

  const blockers = comments.filter((c) => c.severity === "critical").length;
  const approved = blockers === 0;

  const summary = approved
    ? `LGTM! ${comments.length > 0 ? `${comments.length} minor suggestions.` : "No issues found."}`
    : `${blockers} blocking issue(s) found. Please address before merging.`;

  await tools.submitReview(pr.number, approved, summary);
  submitTurn.end();

  ctx.trace.setTokens({ input: totalTokens * 4, output: totalTokens });
  ctx.trace.setCost(totalTokens * 0.00001);

  const result: ReviewResult = {
    approved,
    comments,
    summary,
    blockers,
    securityIssues: allSecurityFindings.length,
    lintIssues: allLintIssues.length,
  };

  ctx.trace.setOutput(result);
  return result;
}
