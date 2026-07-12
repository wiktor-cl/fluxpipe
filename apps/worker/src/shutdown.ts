import type { Worker } from "bullmq";
import type { Logger } from "@fluxpipe/shared";

/**
 * BullMQ's Worker#close() (with force=false, the default) waits for the
 * currently active job's processor promise to settle before releasing its
 * connections, so a SIGTERM/SIGINT during processing does not lose the
 * in-flight job - it finishes, then the process exits.
 */
export function registerGracefulShutdown(
  worker: Worker,
  logger: Logger,
  extraCleanup: () => Promise<void> = async () => {},
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown initiated, waiting for active job to finish");
    await worker.close();
    await extraCleanup();
    logger.info("graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
