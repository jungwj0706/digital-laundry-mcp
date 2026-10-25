import { McpServer } from "@modelcontextprotocol/server";
import { SERVER_NAME } from "./config/constants.js";
import { getConfig, readServerVersion, type AppConfig } from "./config/env.js";
import { registerStatusTool } from "./tools/status.js";

export function createServer(config: AppConfig = getConfig()): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: readServerVersion(),
  });
  registerStatusTool(server, config);
  return server;
}
