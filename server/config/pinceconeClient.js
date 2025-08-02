import { Pinecone } from "@pinecone-database/pinecone";

export const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const INDEX_NAME = "resume-embeddings";

export async function getPineconeIndex() {
  try {
 
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes?.some(index => index.name === INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating index: ${INDEX_NAME}`);
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: 1024, 
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      
      let ready = false;
      while (!ready) {
        const indexDescription = await pinecone.describeIndex(INDEX_NAME);
        ready = indexDescription.status?.ready;
        if (!ready) {
          console.log("Waiting for index to be ready...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      console.log(`✅ Index ${INDEX_NAME} is ready!`);
    }
    
    return pinecone.Index(INDEX_NAME);
  } catch (error) {
    console.error("Error getting Pinecone index:", error);
    throw error;
  }
}

export const pineconeIndex = pinecone.Index(INDEX_NAME);
