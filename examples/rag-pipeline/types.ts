// --- Domain Types ---

export interface Document {
  id: string;
  title: string;
  content: string;
  source: string;
  score: number;
}

export interface Embedding {
  vector: number[];
  model: string;
}

export interface Citation {
  documentId: string;
  title: string;
  excerpt: string;
}

export interface RAGResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  documentsRetrieved: number;
  answeredFromKB: boolean;
}

// --- Tool Signatures ---

export interface RAGTools {
  embed: (text: string) => Promise<Embedding>;
  search: (embedding: Embedding, opts: { topK: number }) => Promise<Document[]>;
  rerank: (query: string, documents: Document[]) => Promise<Document[]>;
  generate: (prompt: string) => Promise<{ text: string; tokensUsed: number }>;
}

// --- Agent Input ---

export interface RAGInput {
  query: string;
  maxDocuments?: number;
}
