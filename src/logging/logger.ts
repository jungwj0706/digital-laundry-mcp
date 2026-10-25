import { redactSensitive } from "../security/redact.js";

export interface LogFields {
  event: "start" | "stop" | "tool";
  toolName?: string;
  durationMs?: number;
  resultCount?: number;
  errorCode?: string;
  provider?: string;
  correlationId?: string;
}

const LEVEL_RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

function currentLevel(): number {
  const raw = process.env.DL_LOG_LEVEL;
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return LEVEL_RANK[raw];
  }
  return LEVEL_RANK.info;
}

export function logEvent(fields: LogFields): void {
  const severity = fields.errorCode === undefined ? LEVEL_RANK.info : LEVEL_RANK.error;
  if (severity < currentLevel()) {
    return;
  }

  const payload: Record<string, string | number> = { event: fields.event };
  if (fields.toolName !== undefined) {
    payload.toolName = redactSensitive(fields.toolName);
  }
  if (fields.durationMs !== undefined) {
    payload.durationMs = fields.durationMs;
  }
  if (fields.resultCount !== undefined) {
    payload.resultCount = fields.resultCount;
  }
  if (fields.errorCode !== undefined) {
    payload.errorCode = redactSensitive(fields.errorCode);
  }
  if (fields.provider !== undefined) {
    payload.provider = redactSensitive(fields.provider);
  }
  if (fields.correlationId !== undefined) {
    payload.correlationId = redactSensitive(fields.correlationId);
  }
  console.error(JSON.stringify(payload));
}
