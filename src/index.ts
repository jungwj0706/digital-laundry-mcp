import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ConfigError, loadConfig } from "./config/env.js";
import { logEvent } from "./logging/logger.js";
import { createServer } from "./server.js";

try {
  const config = loadConfig();
  logEvent({ event: "start" });
  const handle = serveStdio(() => createServer(config));
  const stop = (): void => {
    logEvent({ event: "stop" });
    void handle.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  logEvent({
    event: "start",
    errorCode: error instanceof ConfigError ? "invalid_input" : "provider_error",
  });
  process.exit(1);
}
