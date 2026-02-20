import type { RunContext } from "../../src/index.ts";
import type { RAGInput, RAGTools, RAGResult, Citation } from "./types.ts";

const CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_TOP_K = 5;

export async function ragAgent(
  ctx: RunContext<RAGInput, RAGTools>,
): Promise<RAGResult> {
  const { input, tools } = ctx;
  const topK = input.maxDocuments ?? DEFAULT_TOP_K;

  ctx.trace.setMetadata("model", "text-embedding-3-small");

  // --- Turn 0: Embed the query ---
  const embedTurn = ctx.trace.startTurn("embed");
  const embedding = await tools.embed(input.query);
  embedTurn.end();

  // --- Turn 1: Retrieve documents ---
  const retrieveTurn = ctx.trace.startTurn("retrieve");
  const rawDocuments = await tools.search(embedding, { topK });
  retrieveTurn.end();

  // --- Turn 2: Rerank for relevance ---
  const rerankTurn = ctx.trace.startTurn("rerank");
  const documents = await tools.rerank(input.query, rawDocuments);
  const relevant = documents.filter((d) => d.score >= CONFIDENCE_THRESHOLD);
  rerankTurn.end();

  // --- Turn 3: Generate answer ---
  const generateTurn = ctx.trace.startTurn("generate");

  if (relevant.length === 0) {
    generateTurn.setResponse("No relevant documents found.");
    generateTurn.end();

    ctx.trace.setTokens({ input: 50, output: 10 });
    ctx.trace.setCost(0.0001);

    const result: RAGResult = {
      answer: "I don't have enough information to answer that question.",
      citations: [],
      confidence: 0,
      documentsRetrieved: rawDocuments.length,
      answeredFromKB: false,
    };
    ctx.trace.setOutput(result);
    return result;
  }

  const context = relevant
    .map((d) => `[${d.id}] ${d.title}: ${d.content}`)
    .join("\n\n");

  const prompt = `Answer the following question using only the provided context.\n\nContext:\n${context}\n\nQuestion: ${input.query}`;
  const response = await tools.generate(prompt);

  generateTurn.setResponse(response.text);
  generateTurn.end();

  ctx.trace.setTokens({ input: 800, output: response.tokensUsed });
  ctx.trace.setCost(0.002);

  const citations: Citation[] = relevant.map((d) => ({
    documentId: d.id,
    title: d.title,
    excerpt: d.content.slice(0, 100),
  }));

  const avgScore = relevant.reduce((sum, d) => sum + d.score, 0) / relevant.length;

  const result: RAGResult = {
    answer: response.text,
    citations,
    confidence: avgScore,
    documentsRetrieved: rawDocuments.length,
    answeredFromKB: true,
  };

  ctx.trace.setOutput(result);
  return result;
}
