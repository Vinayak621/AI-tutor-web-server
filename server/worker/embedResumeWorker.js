import { Worker } from "bullmq";
import { redisClient } from "../utils/redisConfig.js";
import { embedAndStoreJD } from "../utils/vectorUtils.js";

export const embedResumeWorker = new Worker(
  "embedResume",
  async (job) => {
    console.log(`Processing for resumeId: ${job.data.resumeId}`);
    const { resumeId, text } = job.data;
    await embedAndStoreResumeContent(resumeId, text);
  },
  { connection: redisClient }
);


embedResumeWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});
