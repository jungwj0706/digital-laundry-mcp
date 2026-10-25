import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server";

export async function withMcpClient(
  factory: () => McpServer,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const handler = createMcpHandler(factory);
  const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "digital-laundry-test", version: "0.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
    await handler.close();
  }
}
