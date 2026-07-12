import http from "node:http";
import { registry } from "./metrics.js";

export function startMetricsServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.setHeader("content-type", registry.contentType);
          res.end(body);
        })
        .catch((err: unknown) => {
          res.writeHead(500);
          res.end(String(err));
        });
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port);
  return server;
}
