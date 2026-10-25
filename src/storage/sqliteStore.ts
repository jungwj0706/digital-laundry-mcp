import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { decodeEncryptionKey, decryptField, encryptField } from "../security/crypto.js";

export const CASE_STATUSES = [
  "found",
  "user_verified",
  "evidence_gathering",
  "draft_ready",
  "user_submitted",
  "waiting_for_response",
  "additional_evidence_requested",
  "resolved",
  "closed",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export interface StoredFinding {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  domain: string;
  sourceType: "web" | "demo" | "image_web_detection";
  matchConfidence: "high" | "medium" | "low" | "unknown";
  riskScore: number | null;
  riskLevel: string;
  isDemo: boolean;
  urgentHumanSupport: boolean;
}

export interface StoredCase {
  id: string;
  title: string;
  status: CaseStatus;
  createdAt: string;
  expiresAt: string;
  findingCount: number;
  findings: StoredFinding[];
}

interface CaseQueryRow {
  id: string;
  title_enc: string;
  status: string;
  created_at: string;
  expires_at: string;
  finding_count: number;
}

interface FindingRow {
  id: string;
  url_enc: string;
  title_enc: string;
  snippet_enc: string | null;
  domain: string;
  source_type: StoredFinding["sourceType"];
  match_confidence: StoredFinding["matchConfidence"];
  risk_score: number | null;
  risk_level: string;
  is_demo: number;
  urgent: number;
}

export class SqliteCaseStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly key: Buffer,
  ) {}

  purge(now: Date): number {
    const cutoff = now.toISOString();
    const expired = this.db.prepare(
      "SELECT id FROM cases WHERE expires_at <= ?",
    ).all(cutoff) as { id: string }[];
    for (const row of expired) {
      this.deleteCase(row.id);
    }
    return expired.length;
  }

  insertCase(input: {
    id: string;
    title: string;
    status: CaseStatus;
    createdAt: string;
    expiresAt: string;
    auditId: string;
    provider: string;
    mode: string;
    findings: StoredFinding[];
    includeSnippets: boolean;
  }): void {
    const insertCase = this.db.prepare(
      `INSERT INTO cases
        (id, title_enc, status, created_at, updated_at, retention_until, expires_at, audit_id, provider, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertCase.run(
      input.id,
      encryptField(this.key, input.title),
      input.status,
      input.createdAt,
      input.createdAt,
      input.expiresAt,
      input.expiresAt,
      input.auditId,
      input.provider,
      input.mode,
    );
    const insertFinding = this.db.prepare(
      `INSERT INTO findings
        (id, case_id, url_enc, title_enc, snippet_enc, domain, source_type, match_confidence, risk_score, risk_level, is_demo, urgent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const finding of input.findings) {
      insertFinding.run(
        finding.id,
        input.id,
        encryptField(this.key, finding.url),
        encryptField(this.key, finding.title),
        input.includeSnippets && finding.snippet
          ? encryptField(this.key, finding.snippet)
          : null,
        finding.domain,
        finding.sourceType,
        finding.matchConfidence,
        finding.riskScore,
        finding.riskLevel,
        finding.isDemo ? 1 : 0,
        finding.urgentHumanSupport ? 1 : 0,
      );
    }
    this.db.prepare(
      `INSERT INTO consents (id, case_id, consent_type, recorded_at, provider, purpose, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      input.id,
      "user_save",
      input.createdAt,
      input.provider,
      "local_case",
      input.includeSnippets ? "findings_with_snippets" : "findings_without_snippets",
    );
    this.db.prepare(
      `INSERT INTO actions (id, case_id, status, note_enc, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), input.id, input.status, null, input.createdAt);
  }

  listCases(status: CaseStatus | undefined, limit: number, offset: number): StoredCase[] {
    const rows = (status
      ? this.db.prepare(
        `SELECT c.id, c.title_enc, c.status, c.created_at, c.expires_at,
                (SELECT COUNT(*) FROM findings f WHERE f.case_id = c.id) AS finding_count
         FROM cases c WHERE c.status = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      ).all(status, limit, offset)
      : this.db.prepare(
        `SELECT c.id, c.title_enc, c.status, c.created_at, c.expires_at,
                (SELECT COUNT(*) FROM findings f WHERE f.case_id = c.id) AS finding_count
         FROM cases c ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      ).all(limit, offset)) as unknown as CaseQueryRow[];
    return rows.map((row) => this.summary(row));
  }

  getCase(id: string): StoredCase | undefined {
    const row = this.db.prepare(
      `SELECT c.id, c.title_enc, c.status, c.created_at, c.expires_at,
              (SELECT COUNT(*) FROM findings f WHERE f.case_id = c.id) AS finding_count
       FROM cases c WHERE c.id = ?`,
    ).get(id) as CaseQueryRow | undefined;
    if (!row) {
      return undefined;
    }
    const findings = (this.db.prepare(
      `SELECT id, url_enc, title_enc, snippet_enc, domain, source_type, match_confidence,
              risk_score, risk_level, is_demo, urgent
       FROM findings WHERE case_id = ?`,
    ).all(id) as unknown as FindingRow[]).map((item) => this.finding(item));
    return { ...this.summary(row), findings };
  }

  updateStatus(id: string, status: CaseStatus, note: string | undefined, now: Date): boolean {
    const existing = this.db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
    if (!existing) {
      return false;
    }
    const stamp = now.toISOString();
    this.db.prepare("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?").run(status, stamp, id);
    this.db.prepare(
      "INSERT INTO actions (id, case_id, status, note_enc, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      id,
      status,
      note ? encryptField(this.key, note) : null,
      stamp,
    );
    return true;
  }

  deleteCase(id: string): boolean {
    const existing = this.db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
    if (!existing) {
      return false;
    }
    this.db.prepare("DELETE FROM findings WHERE case_id = ?").run(id);
    this.db.prepare("DELETE FROM actions WHERE case_id = ?").run(id);
    this.db.prepare("DELETE FROM consents WHERE case_id = ?").run(id);
    this.db.prepare("DELETE FROM cases WHERE id = ?").run(id);
    return true;
  }

  deleteAllCases(): number {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM cases").get() as { count: number };
    this.db.exec("DELETE FROM findings; DELETE FROM actions; DELETE FROM consents; DELETE FROM cases;");
    return Number(count.count);
  }

  deleteConsents(): number {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM consents").get() as { count: number };
    this.db.exec("DELETE FROM consents;");
    return Number(count.count);
  }

  counts(): { cases: number; findings: number; consents: number } {
    const cases = this.db.prepare("SELECT COUNT(*) AS count FROM cases").get() as { count: number };
    const findings = this.db.prepare("SELECT COUNT(*) AS count FROM findings").get() as { count: number };
    const consents = this.db.prepare("SELECT COUNT(*) AS count FROM consents").get() as { count: number };
    return { cases: Number(cases.count), findings: Number(findings.count), consents: Number(consents.count) };
  }

  private summary(row: CaseQueryRow): StoredCase {
    return {
      id: row.id,
      title: decryptField(this.key, row.title_enc),
      status: row.status as CaseStatus,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      findingCount: Number(row.finding_count),
      findings: [],
    };
  }

  private finding(row: FindingRow): StoredFinding {
    return {
      id: row.id,
      url: decryptField(this.key, row.url_enc),
      title: decryptField(this.key, row.title_enc),
      ...(row.snippet_enc ? { snippet: decryptField(this.key, row.snippet_enc) } : {}),
      domain: row.domain,
      sourceType: row.source_type,
      matchConfidence: row.match_confidence,
      riskScore: row.risk_score,
      riskLevel: row.risk_level,
      isDemo: row.is_demo === 1,
      urgentHumanSupport: row.urgent === 1,
    };
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title_enc TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      retention_until TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      audit_id TEXT,
      provider TEXT,
      mode TEXT
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      url_enc TEXT NOT NULL,
      title_enc TEXT NOT NULL,
      snippet_enc TEXT,
      domain TEXT NOT NULL,
      source_type TEXT NOT NULL,
      match_confidence TEXT NOT NULL,
      risk_score INTEGER,
      risk_level TEXT NOT NULL,
      is_demo INTEGER NOT NULL,
      urgent INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note_enc TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      case_id TEXT,
      consent_type TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      provider TEXT,
      purpose TEXT NOT NULL,
      scope TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
  if (!existing) {
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  }
}

export function openCaseStore(config: AppConfig): { store: SqliteCaseStore; close: () => void } {
  if (!config.persistenceEnabled) {
    throw new AppError(
      "storage_disabled",
      "로컬 저장이 꺼져 있거나 암호화 키가 없습니다.",
      false,
      "DL_ENABLE_PERSISTENCE=true와 DL_DATA_ENCRYPTION_KEY를 설정하세요.",
    );
  }
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  migrate(db);
  return {
    store: new SqliteCaseStore(db, decodeEncryptionKey(config.encryptionKey)),
    close: () => db.close(),
  };
}

export function withCaseStore<T>(config: AppConfig, now: Date, run: (store: SqliteCaseStore) => T): T {
  const opened = openCaseStore(config);
  try {
    opened.store.purge(now);
    return run(opened.store);
  } finally {
    opened.close();
  }
}
