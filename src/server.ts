import { McpServer } from "@modelcontextprotocol/server";
import { SERVER_NAME } from "./config/constants.js";
import { getConfig, readServerVersion, type AppConfig } from "./config/env.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerPolicyTools } from "./tools/policy.js";
import { registerReportTool } from "./tools/report.js";
import { registerSearchTools, type SearchDependencies } from "./tools/search.js";
import { registerStatusTool } from "./tools/status.js";

export function createServer(
  config: AppConfig = getConfig(),
  deps: SearchDependencies = {},
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: readServerVersion(),
  });
  registerStatusTool(server, config);
  registerSearchTools(server, config, deps);
  registerAnalysisTools(server, config, deps);
  registerPolicyTools(server);
  registerReportTool(server);
  return server;
}
