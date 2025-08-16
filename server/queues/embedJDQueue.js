import { Queue } from "bullmq";
import {redisClient}  from "../utils/redisConfig.js";


export const embedJDQueue = new Queue("embedJD", { connection: redisClient });
