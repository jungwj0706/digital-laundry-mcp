import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config/env.js";
import { README_SECTIONS } from "../config/constants.js";
import { AppError, errorResult } from "../domain/errors.js";
import { findingSchema, toolFailureSchema } from "../domain/schemas.js";
import { logEvent } from "../logging/logger.js";
import {
  candidatesToFindings,
  GoogleVisionWebDetectionProvider,
  loadImageBytes,
} from "../providers/image/GoogleVisionWebDetectionProvider.js";
import type { ProviderRuntime } from "../providers/selectSearchProvider.js";

export function registerImageTool(server: McpServer, config: AppConfig, deps: ProviderRuntime = {}): void {
  server.registerTool(
    "find_image_reuse_candidates",
    {
      title: "이미지 재사용 후보",
      description:
        "사용자가 제공한 본인 사진을 Google Cloud Vision 웹 탐지로 보냅니다. confirmExternalImageProcessing이 true일 때만 전송합니다. 결과는 유사 이미지 후보이며 동일 인물 확정이 아닙니다. 이미지 원본은 저장하지 않습니다.",
      inputSchema: z.object({
        imageBase64: z.string().max(8_000_000).optional(),
        publicImageUrl: z.string().url().max(2000).optional(),
        confirmExternalImageProcessing: z.boolean(),
        maxResults: z.number().int().min(1).max(20).optional(),
      }),
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          provider: z.literal("google_vision_web_detection"),
          findings: z.array(findingSchema).max(20),
        }),
        toolFailureSchema,
      ]),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const started = Date.now();
      const fail = (error: AppError) => {
        logEvent({
          event: "tool",
          toolName: "find_image_reuse_candidates",
          durationMs: Date.now() - started,
          resultCount: 0,
          errorCode: error.errorCode,
          provider: "google_vision_web_detection",
          correlationId: crypto.randomUUID(),
        });
        return errorResult(error);
      };
      if (input.confirmExternalImageProcessing !== true) {
        return fail(new AppError(
          "consent_required",
          "외부 이미지 처리 동의가 없어 사진을 전송하지 않았습니다.",
          false,
          "confirmExternalImageProcessing을 true로 다시 호출하세요.",
        ));
      }
      if (config.googleCloudVisionApiKey.length === 0) {
        return fail(new AppError(
          "image_provider_not_configured",
          `Google Cloud Vision API 키가 없습니다. README의 ${README_SECTIONS.imageSearch} 절을 확인하세요.`,
          false,
          "텍스트 검색과 다른 도구는 계속 사용할 수 있습니다.",
        ));
      }
      let bytes: Buffer | undefined;
      try {
        bytes = await loadImageBytes({
          ...(input.imageBase64 ? { imageBase64: input.imageBase64 } : {}),
          ...(input.publicImageUrl ? { publicImageUrl: input.publicImageUrl } : {}),
          maxBytes: config.imageMaxBytes,
          timeoutMs: config.httpTimeoutMs,
          ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          ...(deps.lookup ? { lookup: deps.lookup } : {}),
        });
        const provider = new GoogleVisionWebDetectionProvider(
          config.googleCloudVisionApiKey,
          deps.fetchImpl ?? fetch,
          config.httpTimeoutMs,
        );
        const findings = candidatesToFindings(await provider.detect(bytes, input.maxResults ?? 10));
        logEvent({
          event: "tool",
          toolName: "find_image_reuse_candidates",
          durationMs: Date.now() - started,
          resultCount: findings.length,
          provider: "google_vision_web_detection",
          correlationId: crypto.randomUUID(),
        });
        return {
          content: [{
            type: "text" as const,
            text: `유사 이미지 후보 ${findings.length}건입니다. 같은 사람이라는 뜻이 아니며 원본은 저장하지 않았습니다.`,
          }],
          structuredContent: {
            ok: true as const,
            provider: "google_vision_web_detection" as const,
            findings,
          },
        };
      } catch (error) {
        const app = error instanceof AppError
          ? error
          : new AppError("provider_error", "이미지 검색을 완료하지 못했습니다.", true, "잠시 후 다시 시도하세요.");
        return fail(app);
      } finally {
        bytes?.fill(0);
      }
    },
  );
}
