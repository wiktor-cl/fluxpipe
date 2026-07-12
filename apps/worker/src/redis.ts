import { Redis as IORedis } from "ioredis";

/**
 * BullMQ Workers issue blocking commands, so each Worker (and, to be safe,
 * each Queue) gets its own dedicated connection rather than sharing one
 * ioredis instance across components.
 */
export function createRedisConnection(url: string): IORedis {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
  });
}
