import type { RunContext } from "../../src/index.ts";
import type {
  SupportInput,
  SupportTools,
  AgentResult,
  ClassifyResult,
  LLMResponse,
  EscalationTicket,
} from "./types.ts";

const MAX_AUTO_REFUND = 100;

export async function supportAgent(
  ctx: RunContext<SupportInput, SupportTools>,
): Promise<AgentResult> {
  const { input, tools } = ctx;

  ctx.trace.setMetadata("model", "gpt-4o-mini");

  // --- Step 1: Classify intent ---
  const classifyStep = ctx.trace.startStep("classify");
  const classification = (await tools.llm(
    `Classify the intent of this customer message: "${input.message}"`
  )) as ClassifyResult;
  classifyStep.end();

  const { intent } = classification;
  const orderId = classification.orderId ?? input.orderId;

  // --- Step 2: Gather context ---
  const gatherStep = ctx.trace.startStep("gather-context");
  const customer = await tools.lookupCustomer(input.customerId);

  let order;
  if (orderId) {
    order = await tools.lookupOrder(orderId);
  }

  let kbResults;
  if (intent === "question") {
    kbResults = await tools.searchKnowledgeBase(input.message);
  }
  gatherStep.end();

  // --- Step 3: Decide and act ---
  const decideStep = ctx.trace.startStep("decide");
  let result: AgentResult;

  switch (intent) {
    case "question": {
      const kbContext = (kbResults ?? [])
        .map((a) => a.content)
        .join("\n");
      const answer = (await tools.llm(
        `Answer this customer question using the following KB context:\n${kbContext}\n\nQuestion: ${input.message}`
      )) as LLMResponse;

      await tools.sendResponse(customer.id, answer.message);
      ctx.trace.setTokens({ input: 800, output: 200 });
      ctx.trace.setCost(0.002);

      result = {
        intent,
        responded: true,
        escalated: false,
        response: answer.message,
      };
      break;
    }

    case "refund": {
      if (!order) {
        throw new Error("Refund requested but no order found");
      }

      if (order.amount <= MAX_AUTO_REFUND) {
        const refundResult = await tools.processRefund(order.id, order.amount);
        await tools.sendResponse(
          customer.id,
          `Your refund of $${order.amount} has been processed.`
        );
        ctx.trace.setTokens({ input: 400, output: 100 });
        ctx.trace.setCost(0.001);

        result = {
          intent,
          responded: true,
          escalated: false,
          response: `Refund of $${order.amount} processed.`,
          refundProcessed: refundResult.success,
        };
      } else {
        const ticket: EscalationTicket = {
          customerId: customer.id,
          orderId: order.id,
          reason: `Refund of $${order.amount} exceeds auto-approval limit of $${MAX_AUTO_REFUND}`,
          priority: "high",
        };
        const escalation = await tools.createEscalation(ticket);
        await tools.sendResponse(
          customer.id,
          `Your refund request for $${order.amount} has been escalated to a specialist (ticket ${escalation.ticketId}).`
        );
        ctx.trace.setTokens({ input: 400, output: 100 });
        ctx.trace.setCost(0.001);

        result = {
          intent,
          responded: true,
          escalated: true,
          response: `Escalated: ticket ${escalation.ticketId}`,
          escalationTicket: ticket,
          refundProcessed: false,
        };
      }
      break;
    }

    case "complaint": {
      const ticket: EscalationTicket = {
        customerId: customer.id,
        orderId: order?.id,
        reason: `Customer complaint: ${input.message}`,
        priority: customer.tier === "vip" ? "high" : "medium",
      };
      const escalation = await tools.createEscalation(ticket);
      await tools.sendResponse(
        customer.id,
        `We're sorry to hear about your experience. A specialist will follow up shortly (ticket ${escalation.ticketId}).`
      );
      ctx.trace.setTokens({ input: 400, output: 100 });
      ctx.trace.setCost(0.001);

      result = {
        intent,
        responded: true,
        escalated: true,
        response: `Escalated: ticket ${escalation.ticketId}`,
        escalationTicket: ticket,
      };
      break;
    }
  }

  decideStep.end();

  ctx.trace.setOutput(result);
  return result;
}
