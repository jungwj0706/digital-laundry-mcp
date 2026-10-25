import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");
process.stdout.write(`${key}\n`);
process.stderr.write(
  "copy this key into DL_DATA_ENCRYPTION_KEY yourself. it was not written to a file.\n",
);
