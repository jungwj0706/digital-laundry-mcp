import type { AuditResult } from "../domain/types.js";
import { AUDIT_CACHE_TTL_MS } from "../domain/scoring.js";

interface CacheEntry {
  value: AuditResult;
  expiresAt: number;
}

const audits = new Map<string, CacheEntry>();

export function saveAudit(audit: AuditResult, now = Date.now()): void {
  audits.set(audit.auditId, { value: audit, expiresAt: now + AUDIT_CACHE_TTL_MS });
}

export function readAudit(auditId: string, now = Date.now()): AuditResult | undefined {
  const entry = audits.get(auditId);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= now) {
    audits.delete(auditId);
    return undefined;
  }
  return entry.value;
}

export function countAudits(now = Date.now()): number {
  for (const [id, entry] of audits) {
    if (entry.expiresAt <= now) {
      audits.delete(id);
    }
  }
  return audits.size;
}

export function clearAuditCache(): number {
  const count = audits.size;
  audits.clear();
  return count;
}
