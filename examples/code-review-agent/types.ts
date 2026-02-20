// --- Domain Types ---

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface PRContext {
  number: number;
  title: string;
  author: string;
  files: FileDiff[];
  baseBranch: string;
}

export interface LintIssue {
  file: string;
  line: number;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

export interface SecurityFinding {
  file: string;
  line: number;
  cwe: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface ReviewComment {
  file: string;
  line: number;
  body: string;
  severity: "critical" | "suggestion" | "nit";
}

export interface ReviewResult {
  approved: boolean;
  comments: ReviewComment[];
  summary: string;
  blockers: number;
  securityIssues: number;
  lintIssues: number;
}

// --- Tool Signatures ---

export interface ReviewTools {
  analyzeDiff: (diff: FileDiff) => Promise<{ complexity: number; riskLevel: string }>;
  runLinter: (filePath: string, patch: string) => Promise<LintIssue[]>;
  scanSecurity: (filePath: string, patch: string) => Promise<SecurityFinding[]>;
  generateComment: (context: string) => Promise<{ text: string; tokensUsed: number }>;
  postComment: (prNumber: number, comment: ReviewComment) => Promise<{ id: string }>;
  submitReview: (prNumber: number, approved: boolean, summary: string) => Promise<void>;
}

// --- Agent Input ---

export interface ReviewInput {
  pr: PRContext;
  strictMode?: boolean;  // treat warnings as errors
}
