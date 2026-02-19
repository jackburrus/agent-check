// --- Domain Types ---

export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: "standard" | "premium" | "vip";
}

export interface Order {
  id: string;
  customerId: string;
  amount: number;
  status: "pending" | "shipped" | "delivered" | "returned";
  items: string[];
}

export interface KBArticle {
  title: string;
  content: string;
  relevance: number;
}

export interface EscalationTicket {
  customerId: string;
  orderId?: string;
  reason: string;
  priority: "low" | "medium" | "high";
}

export type Intent = "question" | "refund" | "complaint";

export interface ClassifyResult {
  intent: Intent;
  confidence: number;
  orderId?: string;
}

export interface LLMResponse {
  message: string;
  tokensUsed: number;
}

export interface AgentResult {
  intent: Intent;
  responded: boolean;
  escalated: boolean;
  response?: string;
  escalationTicket?: EscalationTicket;
  refundProcessed?: boolean;
}

// --- Tool Signatures ---

export interface SupportTools {
  llm: (prompt: string) => Promise<ClassifyResult | LLMResponse>;
  lookupCustomer: (customerId: string) => Promise<Customer>;
  lookupOrder: (orderId: string) => Promise<Order>;
  searchKnowledgeBase: (query: string) => Promise<KBArticle[]>;
  processRefund: (orderId: string, amount: number) => Promise<{ success: boolean }>;
  createEscalation: (ticket: EscalationTicket) => Promise<{ ticketId: string }>;
  sendResponse: (customerId: string, message: string) => Promise<void>;
}

// --- Agent Input ---

export interface SupportInput {
  customerId: string;
  message: string;
  orderId?: string;
}
