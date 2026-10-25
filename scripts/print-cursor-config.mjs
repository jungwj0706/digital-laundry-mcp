import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "index.js");
const config = {
  mcpServers: {
    "digital-laundry": {
      command: "node",
      args: [entry],
    },
  },
};

process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
process.stderr.write("API 키는 .env에 두세요. 이 JSON에는 넣지 마세요.\n");
