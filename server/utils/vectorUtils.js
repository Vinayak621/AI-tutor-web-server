import { openai } from "./openAIClient.js";
import { getPineconeIndex, pinecone } from "../config/pinceconeClient.js";
import { splitIntoChunks } from "./chunkText.js";
import { Pinecone } from "@pinecone-database/pinecone";

// Embedding + storing chunks

const MAX_TOKENS = 8000;
export async function embedAndStoreResume(resumeId, content) {
  const chunks = splitIntoChunks(content, MAX_TOKENS);

  const vectors = await Promise.all(
    chunks.map(async (chunk, i) => {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: chunk,
      });

      return {
        id: `${resumeId}-chunk-${i}`,
        values: embedding.data[0].embedding,
        metadata: {
          resumeId,
          chunk,
          chunkIndex: i,
        },
      };
    })
  );

   const index = pinecone.index("resume-embeddings");
  await index.upsert(vectors);
}

// Retrieving relevant chunks
export async function getRelevantResumeChunks(resumeId, query) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query,
  });

  const index = pinecone.index("resume-embeddings");

  const result = await index.query({
    vector: embedding.data[0].embedding,
    topK: 3,
    filter: { resumeId: { $eq: resumeId } },
    includeMetadata: true,
  });

  console.log(result);

  return result.matches.map(m => m.metadata.chunk).join("\n\n");
}
