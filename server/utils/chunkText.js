import { encoding_for_model } from "@dqbd/tiktoken";

export function splitIntoChunks(text, maxTokens) {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid input to splitIntoChunks");
  }

  const encoder = encoding_for_model("gpt-3.5-turbo");

  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = encoder.encode(para);

    if (currentTokens + paraTokens.length > maxTokens) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
      currentTokens = paraTokens.length;
    } else {
      currentChunk += "\n\n" + para;
      currentTokens += paraTokens.length;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  encoder.free(); // free after you're done

  return chunks;
}
