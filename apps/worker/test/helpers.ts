import http from "node:http";
import { createLogger, type Logger } from "@fluxpipe/shared";

export function silentLogger(): Logger {
  // "error" rather than "silent" - if something in the worker's error path
  // itself fails (e.g. a swallowed DLQ-enqueue error), it should still show
  // up in CI test output instead of vanishing entirely.
  return createLogger({ name: "test", level: "error" });
}

export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}

export interface MockServerHandle {
  server: http.Server;
  url: string;
  getCallCount: () => number;
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

/** Fails the first `failuresBeforeSuccess` requests with 503, then echoes the body back with 200. */
export async function startFlakyServer(failuresBeforeSuccess: number): Promise<MockServerHandle> {
  let callCount = 0;
  const server = http.createServer((req, res) => {
    callCount += 1;
    const isFailure = callCount <= failuresBeforeSuccess;
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (isFailure) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "simulated failure" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ received: body ? JSON.parse(body) : null }));
    });
  });
  const url = await listen(server);
  return { server, url, getCallCount: () => callCount };
}

/** Always responds 200, after an artificial delay - used to simulate a slow job. */
export async function startSlowServer(delayMs: number): Promise<MockServerHandle> {
  let callCount = 0;
  const server = http.createServer((_req, res) => {
    callCount += 1;
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }, delayMs);
  });
  const url = await listen(server);
  return { server, url, getCallCount: () => callCount };
}
