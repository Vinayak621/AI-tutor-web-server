import { Worker } from "bullmq";
import { redisClient } from "../utils/redisConfig.js";
import { embedAndStoreJD } from "../utils/vectorUtils.js";

export const embedJDWorker = new Worker(
  "embedJD",
  async (job) => {
    console.log(`Processing jd ${job.data.jd}`);
    const { jd, text } = job.data;
    await embedAndStoreJD(jd, text);
  },
  { connection: redisClient }
);


embedJDWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});
