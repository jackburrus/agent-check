import { test, expect, describe } from "bun:test";
import { run, mock, ForbiddenToolError } from "../../src/index.ts";
import { supportAgent } from "./agent.ts";
import type {
  SupportInput,
  Customer,
  Order,
  KBArticle,
  ClassifyResult,
  LLMResponse,
  AgentResult,
  EscalationTicket,
} from "./types.ts";

// --- Shared fixtures ---

const customer: Customer = {
  id: "cust-1",
  name: "Alice",
  email: "alice@example.com",
  tier: "standard",
};

const vipCustomer: Customer = {
  id: "cust-2",
  name: "Bob",
  email: "bob@example.com",
  tier: "vip",
};

const smallOrder: Order = {
  id: "ord-100",
  customerId: "cust-1",
  amount: 49.99,
  status: "delivered",
  items: ["Widget"],
};

const largeOrder: Order = {
  id: "ord-200",
  customerId: "cust-1",
  amount: 250.0,
  status: "delivered",
  items: ["Gadget Pro"],
};

const kbArticles: KBArticle[] = [
  {
    title: "Return Policy",
    content: "Items can be returned within 30 days of delivery.",
    relevance: 0.95,
  },
];

// --- Helper to build a standard mock set ---

function baseMocks(overrides: Record<string, ReturnType<typeof mock.fn>> = {}) {
  return {
    llm: mock.sequence([
      { intent: "question", confidence: 0.95 } as ClassifyResult,
      { message: "Here is your answer based on our knowledge base.", tokensUsed: 150 } as LLMResponse,
    ]),
    lookupCustomer: mock.fn(customer),
    lookupOrder: mock.fn(smallOrder),
    searchKnowledgeBase: mock.fn(kbArticles),
    processRefund: mock.fn({ success: true }),
    createEscalation: mock.fn({ ticketId: "ESC-001" }),
    sendResponse: mock.fn(undefined),
    ...overrides,
  };
}

const questionInput: SupportInput = {
  customerId: "cust-1",
  message: "What is your return policy?",
};

// ============================================================
// Tests
// ============================================================

describe("happy path: general question", () => {
  test("completes and calls the right tools in order", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toComplete();
    expect(trace).toHaveCalledTool("llm");
    expect(trace).toHaveCalledTool("lookupCustomer");
    expect(trace).toHaveCalledTool("searchKnowledgeBase");
    expect(trace).toHaveCalledTool("sendResponse");
    expect(trace).toHaveToolOrder([
      "llm",
      "lookupCustomer",
      "searchKnowledgeBase",
      "llm",
      "sendResponse",
    ]);
  });

  test("never calls refund or escalation tools", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).not.toHaveCalledTool("processRefund");
    expect(trace).not.toHaveCalledTool("createEscalation");
  });

  test("stays within budget", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinBudget({ maxUsd: 0.05 });
    expect(trace).toBeWithinTokens({ maxTotal: 5000 });
  });
});

describe("refund: auto-approved (≤$100)", () => {
  const refundInput: SupportInput = {
    customerId: "cust-1",
    message: "I want a refund for my order",
    orderId: "ord-100",
  };

  test("processes refund and responds", async () => {
    const trace = await run(supportAgent, {
      input: refundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.98,
          orderId: "ord-100",
        } as ClassifyResult),
      }),
    });

    expect(trace).toComplete();
    expect(trace).toHaveCalledTool("processRefund");
    expect(trace).toHaveCalledToolWith("processRefund", [
      "ord-100",
      49.99,
    ]);
    expect(trace).toHaveCalledTool("sendResponse");
    expect(trace).not.toHaveCalledTool("createEscalation");
  });

  test("tool order is correct", async () => {
    const trace = await run(supportAgent, {
      input: refundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.98,
          orderId: "ord-100",
        } as ClassifyResult),
      }),
    });

    expect(trace).toHaveToolOrder([
      "llm",
      "lookupCustomer",
      "lookupOrder",
      "processRefund",
      "sendResponse",
    ]);
  });

  test("output indicates refund was processed", async () => {
    const trace = await run(supportAgent, {
      input: refundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.98,
          orderId: "ord-100",
        } as ClassifyResult),
      }),
    });

    const output = trace.output as AgentResult;
    expect(output.intent).toBe("refund");
    expect(output.refundProcessed).toBe(true);
    expect(output.escalated).toBe(false);
  });
});

describe("refund: escalated (>$100)", () => {
  const largeRefundInput: SupportInput = {
    customerId: "cust-1",
    message: "I want a refund for my expensive order",
    orderId: "ord-200",
  };

  test("escalates instead of processing refund", async () => {
    const trace = await run(supportAgent, {
      input: largeRefundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.99,
          orderId: "ord-200",
        } as ClassifyResult),
        lookupOrder: mock.fn(largeOrder),
      }),
    });

    expect(trace).toComplete();
    expect(trace).toHaveCalledTool("createEscalation");
    expect(trace).not.toHaveCalledTool("processRefund");
    expect(trace).toHaveCalledTool("sendResponse");
  });

  test("output indicates escalation", async () => {
    const trace = await run(supportAgent, {
      input: largeRefundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.99,
          orderId: "ord-200",
        } as ClassifyResult),
        lookupOrder: mock.fn(largeOrder),
      }),
    });

    const output = trace.output as AgentResult;
    expect(output.intent).toBe("refund");
    expect(output.escalated).toBe(true);
    expect(output.refundProcessed).toBe(false);
    expect(output.escalationTicket).toBeDefined();
    expect(output.escalationTicket!.reason).toContain("250");
  });
});

describe("complaint: always escalates", () => {
  const complaintInput: SupportInput = {
    customerId: "cust-2",
    message: "This product is terrible and your service is awful!",
  };

  test("escalates and never processes refund", async () => {
    const trace = await run(supportAgent, {
      input: complaintInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "complaint",
          confidence: 0.97,
        } as ClassifyResult),
        lookupCustomer: mock.fn(vipCustomer),
      }),
    });

    expect(trace).toComplete();
    expect(trace).toHaveCalledTool("createEscalation");
    expect(trace).toHaveCalledTool("sendResponse");
    expect(trace).not.toHaveCalledTool("processRefund");
  });

  test("VIP customer gets high priority escalation", async () => {
    const trace = await run(supportAgent, {
      input: complaintInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "complaint",
          confidence: 0.97,
        } as ClassifyResult),
        lookupCustomer: mock.fn(vipCustomer),
      }),
    });

    const output = trace.output as AgentResult;
    expect(output.escalated).toBe(true);
    expect(output.escalationTicket!.priority).toBe("high");
  });
});

describe("policy compliance", () => {
  test("question flow never touches processRefund (forbidden)", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks({
        processRefund: mock.forbidden("Refund tool must not be called for questions"),
      }),
    });

    expect(trace).toComplete();
    expect(trace).not.toHaveCalledTool("processRefund");
  });

  test("question flow never touches createEscalation (forbidden)", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks({
        createEscalation: mock.forbidden("Escalation tool must not be called for questions"),
      }),
    });

    expect(trace).toComplete();
    expect(trace).not.toHaveCalledTool("createEscalation");
  });

  test("forbidden tool causes failure when called", async () => {
    const refundInput: SupportInput = {
      customerId: "cust-1",
      message: "I want a refund",
      orderId: "ord-100",
    };

    const trace = await run(supportAgent, {
      input: refundInput,
      mocks: baseMocks({
        llm: mock.fn({
          intent: "refund",
          confidence: 0.98,
          orderId: "ord-100",
        } as ClassifyResult),
        processRefund: mock.forbidden("Refunds are disabled"),
      }),
    });

    expect(trace).not.toComplete();
    expect(trace.error).toBeInstanceOf(ForbiddenToolError);
    expect(trace).toHaveCalledTool("processRefund");
  });
});

describe("budget and performance", () => {
  test("cost stays within $0.05", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinBudget({ maxUsd: 0.05 });
  });

  test("tokens stay within 5000", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinTokens({ maxTotal: 5000 });
  });

  test("latency within 5000ms", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toBeWithinLatency({ maxMs: 5000 });
  });
});

describe("error handling", () => {
  test("agent handles tool failure gracefully", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks({
        lookupCustomer: mock.fn(() => {
          throw new Error("Database connection failed");
        }),
      }),
    });

    expect(trace).not.toComplete();
    expect(trace.error).toBeDefined();
    expect(trace.error!.message).toContain("Database connection failed");
  });

  test("timeout produces incomplete trace", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks({
        llm: mock.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return { intent: "question", confidence: 0.9 };
        }),
      }),
      timeout: 50,
    });

    expect(trace).not.toComplete();
    expect(trace.error).toBeDefined();
    expect(trace.error!.message).toContain("timed out");
  });
});

describe("multi-step structure", () => {
  test("has exactly 3 steps with correct labels", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toHaveSteps({ min: 3, max: 3 });
    expect(trace.steps[0]!.label).toBe("classify");
    expect(trace.steps[1]!.label).toBe("gather-context");
    expect(trace.steps[2]!.label).toBe("decide");
  });

  test("tool calls are recorded at trace level across steps", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    // Mocked tools record to the trace-level toolCalls, not step-level.
    // For a question flow: llm (classify), lookupCustomer, searchKnowledgeBase, llm (answer), sendResponse
    expect(trace).toHaveToolCallCount("llm", 2);
    expect(trace).toHaveToolCallCount("lookupCustomer", 1);
    expect(trace).toHaveToolCallCount("searchKnowledgeBase", 1);
    expect(trace).toHaveToolCallCount("sendResponse", 1);
  });
});

describe("metadata and output", () => {
  test("trace.metadata contains model name", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace.metadata.model).toBe("gpt-4o-mini");
  });

  test("trace.output contains expected AgentResult structure", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    const output = trace.output as AgentResult;
    expect(output.intent).toBe("question");
    expect(output.responded).toBe(true);
    expect(output.escalated).toBe(false);
    expect(output.response).toBeDefined();
  });

  test("setOutput override works (output comes from agent, not return value)", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    // The agent calls ctx.trace.setOutput(result), so trace.output should match
    const output = trace.output as AgentResult;
    expect(output.intent).toBe("question");
    expect(output.responded).toBe(true);
  });

  test("total tool calls within reasonable bounds", async () => {
    const trace = await run(supportAgent, {
      input: questionInput,
      mocks: baseMocks(),
    });

    expect(trace).toHaveToolCallCount({ max: 10 });
    expect(trace).toHaveRetries({ max: 0 });
  });
});
