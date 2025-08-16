import redis from "ioredis";

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
};

export const redisClient = new redis(redisConfig);