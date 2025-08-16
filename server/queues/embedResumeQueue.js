import { Queue } from "bullmq";
import {redisClient}  from "../utils/redisConfig.js";


export const embedResumeQueue = new Queue("embedResume", { connection: redisClient });
