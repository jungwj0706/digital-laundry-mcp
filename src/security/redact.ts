const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TOKEN_PATTERN = /[A-Za-z0-9_+/=-]{20,}/g;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redactToken(token: string): string {
  if (UUID_PATTERN.test(token) || /^[a-z0-9_]+$/.test(token)) {
    return token;
  }
  const compact = token.replace(/[-_]/g, "");
  if (compact.length >= 20) {
    return "[secret]";
  }
  return token;
}

export function redactSensitive(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[email]")
    .replace(URL_PATTERN, (match) => {
      try {
        const parsed = new URL(match);
        return `${parsed.origin}/[redacted]`;
      } catch {
        return "[url]";
      }
    })
    .replace(TOKEN_PATTERN, redactToken);
}
