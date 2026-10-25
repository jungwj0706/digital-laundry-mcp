import { AppError } from "../../domain/errors.js";

export const MAX_IMAGE_PIXELS = 16_000_000;

export interface InspectedImage {
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    return undefined;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function webpSize(bytes: Buffer): { width: number; height: number } | undefined {
  const format = bytes.toString("ascii", 12, 16);
  if (format === "VP8X" && bytes.length >= 30) {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return { width, height };
  }
  if (format === "VP8 " && bytes.length >= 30) {
    return {
      width: (bytes.readUInt16LE(26) & 0x3fff),
      height: (bytes.readUInt16LE(28) & 0x3fff),
    };
  }
  if (format === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

export function inspectImage(bytes: Buffer, maxBytes: number): InspectedImage {
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new AppError(
      bytes.length > maxBytes ? "image_too_large" : "invalid_image",
      bytes.length > maxBytes ? "이미지가 허용된 크기를 초과했습니다." : "이미지 파일을 읽지 못했습니다.",
      false,
      "5MB 이하의 JPEG, PNG, WebP 파일을 사용하세요.",
    );
  }
  let inspected: InspectedImage | undefined;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    const size = jpegSize(bytes);
    if (size) inspected = { mime: "image/jpeg", ...size };
  } else if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const size = pngSize(bytes);
    if (size) inspected = { mime: "image/png", ...size };
  } else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const size = webpSize(bytes);
    if (size) inspected = { mime: "image/webp", ...size };
  }
  if (!inspected || inspected.width < 1 || inspected.height < 1) {
    throw new AppError("invalid_image", "JPEG, PNG, WebP 이미지만 사용할 수 있습니다.", false, "이미지 파일 형식을 확인하세요.");
  }
  if (inspected.width * inspected.height > MAX_IMAGE_PIXELS) {
    throw new AppError("image_too_large", "이미지 픽셀 수가 허용 한도를 초과했습니다.", false, "더 작은 이미지를 사용하세요.");
  }
  return inspected;
}

export function decodeImageInput(value: string): Buffer {
  const trimmed = value.trim();
  const dataUrl = trimmed.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  const encoded = (dataUrl?.[1] ?? trimmed).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new AppError("invalid_image", "이미지 base64를 읽지 못했습니다.", false, "data URL 또는 base64 문자열을 전달하세요.");
  }
  return Buffer.from(encoded, "base64");
}
