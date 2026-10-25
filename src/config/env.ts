import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import * as z from "zod/v4";
import { isEncryptionKey } from "../security/crypto.js";

export { isEncryptionKey };

const emptyToUndefined = (value: unknown): unknown =>
  value === undefined || value === "" ? undefined : value;

const booleanString = (fallback: "true" | "false") =>
  z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"]).default(fallback),
  );

const boundedInt = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(minimum).max(maximum).default(fallback),
  );

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  DL_DEMO_MODE: booleanString("true"),
  DL_LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(["debug", "info", "warn", "error"]).default("info"),
  ),
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  GOOGLE_CLOUD_VISION_API_KEY: z.string().optional().default(""),
  DL_ENABLE_PERSISTENCE: booleanString("false"),
  DL_DATA_ENCRYPTION_KEY: z.string().optional().default(""),
  DL_DATABASE_PATH: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("./data/digital-laundry.sqlite"),
  ),
  DL_RETENTION_DAYS: boundedInt(1, 365, 30),
  DL_EXPORT_DIR: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("./data/exports"),
  ),
  DL_SEARCH_MAX_QUERIES: boundedInt(1, 20, 20),
  DL_SEARCH_MAX_RESULTS: boundedInt(1, 20, 20),
  DL_HTTP_TIMEOUT_MS: boundedInt(100, 120_000, 8_000),
  DL_HTTP_MAX_BYTES: boundedInt(1, 20_000_000, 2_097_152),
  DL_IMAGE_MAX_BYTES: boundedInt(1, 20_000_000, 5_242_880),
});

export class ConfigError extends Error {
  readonly names: string[];

  constructor(names: string[]) {
    super("invalid environment configuration");
    this.name = "ConfigError";
    this.names = names;
  }
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  demoMode: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  braveSearchApiKey: string;
  googleCloudVisionApiKey: string;
  persistenceRequested: boolean;
  encryptionKey: string;
  encryptionKeyValid: boolean;
  persistenceEnabled: boolean;
  databasePath: string;
  retentionDays: number;
  exportDir: string;
  exportDirectoryReady: boolean;
  searchMaxQueries: number;
  searchMaxResults: number;
  httpTimeoutMs: number;
  httpMaxBytes: number;
  imageMaxBytes: number;
  projectRoot: string;
}

export function projectRootFromHere(): string {
  return path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
}

export function readServerVersion(): string {
  const raw = readFileSync(path.join(projectRootFromHere(), "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "0.0.0";
}

function resolveConfiguredPath(root: string, configured: string): string {
  return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
}

export function exportDirectoryReady(directory: string): boolean {
  if (!existsSync(directory)) {
    return false;
  }
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

export function parseConfig(
  source: NodeJS.ProcessEnv,
  root = projectRootFromHere(),
): AppConfig {
  const picked = {
    NODE_ENV: source.NODE_ENV,
    DL_DEMO_MODE: source.DL_DEMO_MODE,
    DL_LOG_LEVEL: source.DL_LOG_LEVEL,
    BRAVE_SEARCH_API_KEY: source.BRAVE_SEARCH_API_KEY,
    GOOGLE_CLOUD_VISION_API_KEY: source.GOOGLE_CLOUD_VISION_API_KEY,
    DL_ENABLE_PERSISTENCE: source.DL_ENABLE_PERSISTENCE,
    DL_DATA_ENCRYPTION_KEY: source.DL_DATA_ENCRYPTION_KEY,
    DL_DATABASE_PATH: source.DL_DATABASE_PATH,
    DL_RETENTION_DAYS: source.DL_RETENTION_DAYS,
    DL_EXPORT_DIR: source.DL_EXPORT_DIR,
    DL_SEARCH_MAX_QUERIES: source.DL_SEARCH_MAX_QUERIES,
    DL_SEARCH_MAX_RESULTS: source.DL_SEARCH_MAX_RESULTS,
    DL_HTTP_TIMEOUT_MS: source.DL_HTTP_TIMEOUT_MS,
    DL_HTTP_MAX_BYTES: source.DL_HTTP_MAX_BYTES,
    DL_IMAGE_MAX_BYTES: source.DL_IMAGE_MAX_BYTES,
  };
  const parsed = envSchema.safeParse(picked);
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          issue.path.length > 0 ? String(issue.path[0]) : "environment",
        ),
      ),
    ];
    throw new ConfigError(names);
  }

  const data = parsed.data;
  const encryptionKey = data.DL_DATA_ENCRYPTION_KEY.trim();
  const encryptionKeyValid = isEncryptionKey(encryptionKey);
  const exportDir = resolveConfiguredPath(root, data.DL_EXPORT_DIR);
  const databasePath = resolveConfiguredPath(root, data.DL_DATABASE_PATH);

  return {
    nodeEnv: data.NODE_ENV,
    demoMode: data.DL_DEMO_MODE === "true",
    logLevel: data.DL_LOG_LEVEL,
    braveSearchApiKey: data.BRAVE_SEARCH_API_KEY.trim(),
    googleCloudVisionApiKey: data.GOOGLE_CLOUD_VISION_API_KEY.trim(),
    persistenceRequested: data.DL_ENABLE_PERSISTENCE === "true",
    encryptionKey,
    encryptionKeyValid,
    persistenceEnabled:
      data.DL_ENABLE_PERSISTENCE === "true" && encryptionKeyValid,
    databasePath,
    retentionDays: data.DL_RETENTION_DAYS,
    exportDir,
    exportDirectoryReady: exportDirectoryReady(exportDir),
    searchMaxQueries: data.DL_SEARCH_MAX_QUERIES,
    searchMaxResults: data.DL_SEARCH_MAX_RESULTS,
    httpTimeoutMs: data.DL_HTTP_TIMEOUT_MS,
    httpMaxBytes: data.DL_HTTP_MAX_BYTES,
    imageMaxBytes: data.DL_IMAGE_MAX_BYTES,
    projectRoot: root,
  };
}

let cached: AppConfig | undefined;
let dotenvLoaded = false;

export function loadConfig(root = projectRootFromHere()): AppConfig {
  if (!dotenvLoaded) {
    loadDotenv({ path: path.join(root, ".env"), quiet: true });
    dotenvLoaded = true;
  }
  cached = parseConfig(process.env, root);
  return cached;
}

export function getConfig(): AppConfig {
  return cached ?? loadConfig();
}
