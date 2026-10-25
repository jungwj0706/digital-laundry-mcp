export const ERROR_CODES = [
  "invalid_input",
  "consent_required",
  "provider_not_configured",
  "provider_rate_limited",
  "provider_timeout",
  "provider_error",
  "unsafe_url",
  "content_type_not_supported",
  "image_too_large",
  "invalid_image",
  "image_provider_not_configured",
  "not_found",
  "storage_disabled",
  "export_failed",
  "delete_failed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ToolFailure {
  ok: false;
  errorCode: ErrorCode;
  message: string;
  retryable: boolean;
  nextAction: string;
}

export class AppError extends Error {
  readonly errorCode: ErrorCode;
  readonly retryable: boolean;
  readonly nextAction: string;

  constructor(errorCode: ErrorCode, message: string, retryable: boolean, nextAction: string) {
    super(message);
    this.name = "AppError";
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.nextAction = nextAction;
  }

  toFailure(): ToolFailure {
    return {
      ok: false,
      errorCode: this.errorCode,
      message: this.message,
      retryable: this.retryable,
      nextAction: this.nextAction,
    };
  }
}

export function errorResult(error: AppError): {
  isError: true;
  content: [{ type: "text"; text: string }];
  structuredContent: ToolFailure;
} {
  return {
    isError: true,
    content: [{ type: "text", text: error.message }],
    structuredContent: error.toFailure(),
  };
}
