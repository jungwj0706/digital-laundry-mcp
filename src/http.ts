import { timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { ConfigError, loadConfig, type AppConfig } from "./config/env.js";
import { logEvent } from "./logging/logger.js";
import { createServer } from "./server.js";

const MIN_TOKEN_LENGTH = 16;

export function bearerMatches(header: string | null, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? "");
  if (expected.length !== actual.length || token.length < MIN_TOKEN_LENGTH) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function createAuthorizedHandler(config: AppConfig): (request: Request) => Promise<Response> {
  if (!config.httpEnabled || config.httpAuthToken.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(["DL_HTTP_ENABLED", "DL_HTTP_AUTH_TOKEN"]);
  }
  const mcp = createMcpHandler(() => createServer(config));
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("not found", { status: 404 });
    }
    if (!bearerMatches(request.headers.get("authorization"), config.httpAuthToken)) {
      return new Response("unauthorized", { status: 401 });
    }
    return mcp.fetch(request);
  };
}

function headerEntries(headers: IncomingMessage["headers"]): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    }
  }
  return result;
}

export function startHttpServer(config: AppConfig): Promise<{ port: number; close: () => Promise<void> }> {
  const handle = createAuthorizedHandler(config);
  const server = createHttpServer(async (req, res) => {
    await writeResponse(req, res, handle, config.httpPort);
  });
  return new Promise((resolve) => {
    server.listen(config.httpPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : config.httpPort;
      resolve({
        port,
        close: () => new Promise((done, reject) => {
          server.close((error) => error ? reject(error) : done());
        }),
      });
    });
  });
}

async function writeResponse(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (request: Request) => Promise<Response>,
  port: number,
): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const request = new Request(new URL(req.url ?? "/", `http://127.0.0.1:${port}`), {
      method: req.method,
      headers: headerEntries(req.headers),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handle(request);
    const headers = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end();
  }
}

const entryArg = process.argv[1];
const isDirectRun = entryArg !== undefined
  && import.meta.url === pathToFileURL(path.resolve(entryArg)).href;

if (isDirectRun) {
  try {
    const config = loadConfig();
    if (!config.httpEnabled) {
      logEvent({ event: "start", errorCode: "invalid_input" });
      process.exit(1);
    }
    const running = await startHttpServer(config);
    logEvent({ event: "start" });
    process.stderr.write(`listening 127.0.0.1:${running.port}\n`);
    const stop = (): void => {
      logEvent({ event: "stop" });
      void running.close();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch {
    logEvent({ event: "start", errorCode: "invalid_input" });
    process.exit(1);
  }
}
