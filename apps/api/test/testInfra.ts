import { createDatabase } from "@fluxpipe/db";
import { Redis as IORedis } from "ioredis";

export async function isPostgresReachable(url: string): Promise<boolean> {
  const { pool } = createDatabase(url);
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function isRedisReachable(url: string): Promise<boolean> {
  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
    connectTimeout: 1000,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
