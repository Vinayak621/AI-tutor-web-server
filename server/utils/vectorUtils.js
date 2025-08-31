import { openai } from "./openAIClient.js";
import { getPineconeIndex, getTargetJDIndex, pinecone } from "../config/pinceconeClient.js";
import { splitIntoChunks } from "./chunkText.js";
import { Pinecone } from "@pinecone-database/pinecone";

// Embedding + storing chunks

const MAX_TOKENS = 200;
export async function embedAndStoreResume(resumeId, content) {
  const chunks = splitIntoChunks(content, MAX_TOKENS);
  console.log(`Number of chunks: ${chunks.length}`);


  const vectors = await Promise.all(
    chunks.map(async (chunk, i) => {
      console.log(i);
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

   const index = await getPineconeIndex();
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

export async function embedAndStoreJD(jdId, jobDescriptionText) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: jobDescriptionText,
    });

    const vector = {
      id: `jd-${jdId}`,
      values: embeddingResponse.data[0].embedding,
      metadata: {
        jdId,
        jobDescriptionText,
      },
    };

    const jdIndex = await getTargetJDIndex();
    await jdIndex.upsert([vector]);
    console.log(`JD embedded and stored for id: ${jdId}`);
  } catch (err) {
    console.error("Error in embedAndStoreJD:", err);
    throw err;
  }
}


export async function embedAndStoreResumeContent(resumeId, resumeText) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: resumeText,
    });

    const vector = {
      id: `resume-${resumeId}`,
      values: embeddingResponse.data[0].embedding,
      metadata: {
        resumeId,
        resumeText,
      },
    };

    const resumeIndex = await getPineconeIndex();
    await resumeIndex.upsert([vector]);
    console.log(`✅ Resume embedded and stored for resumeId: ${resumeId}`);
  } catch (err) {
    console.error("❌ Error in embedAndStoreResume:", err);
    throw err;
  }
}

export async function generateResumeSuggestions(jdText, resumeText) {
  const prompt = `
You are given a job description and a resume.

JOB DESCRIPTION:
${jdText}

RESUME:
${resumeText}

TASK:
1. Identify only the **missing** or **insufficiently covered** skills, experiences, or qualifications in the resume, compared to the job description. Do not include strengths that already match well.
2. Return them as a **pure JSON array** of strings, where each string is one improvement point.
3. Do not include code fences, explanations, or any text outside the JSON array.
4. If there are no improvements needed, return an empty JSON array: []

Example output:
["Add AWS certification", "Include leadership experience with cross-functional teams"]
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0
  });

  let suggestions;
  try {
    suggestions = JSON.parse(response.choices[0].message.content);
  } catch (e) {
    console.error("Error parsing suggestions:", e);
    suggestions = [];
  }

  return suggestions;
}

export async function fetchVectorWithRetry(index, vectorId, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to fetch vector: ${vectorId}`);
      
      const result = await index.fetch(vectorId);
      
      if (result.records && result.records[vectorId]) {
        console.log(`Successfully found vector ${vectorId} on attempt ${attempt}`);
        return result;
      }
      
      if (attempt < maxRetries) {
        console.log(`Vector ${vectorId} not found, waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 1.5;
      }
      
    } catch (error) {
      console.error(`Error fetching vector ${vectorId} on attempt ${attempt}:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 1.5;
    }
  }
  
  throw new Error(`Vector ${vectorId} not found after ${maxRetries} attempts`);
}
