import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../domain/errors.js";

export function isEncryptionKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length < 43) {
    return false;
  }
  return Buffer.from(value, "base64").length === 32;
}

export function decodeEncryptionKey(value: string): Buffer {
  if (!isEncryptionKey(value)) {
    throw new AppError(
      "storage_disabled",
      "저장 암호화 키가 올바르지 않습니다.",
      false,
      "npm run generate-encryption-key로 32바이트 키를 만들어 DL_DATA_ENCRYPTION_KEY에 넣으세요.",
    );
  }
  return Buffer.from(value, "base64");
}

export function encryptField(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptField(key: Buffer, payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 12 + 16) {
    throw new AppError(
      "storage_disabled",
      "저장된 내용을 복호화하지 못했습니다.",
      false,
      "암호화 키와 저장 파일이 같은 것인지 확인하세요.",
    );
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError(
      "storage_disabled",
      "저장된 내용을 복호화하지 못했습니다.",
      false,
      "암호화 키와 저장 파일이 같은 것인지 확인하세요.",
    );
  }
}
