import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { AppError } from "../domain/errors.js";

const PATH_MESSAGE = "허용되지 않는 파일 경로입니다.";
const PATH_ACTION = "내보내기 폴더 안의 파일 이름만 사용하세요.";

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "report";
}

export function resolveExportFile(exportDir: string, requestedName: string): string {
  if (
    !requestedName ||
    requestedName.includes("\0") ||
    path.isAbsolute(requestedName) ||
    requestedName.includes("/") ||
    requestedName.includes("\\") ||
    requestedName.split(/[\\/]/).some((segment) => segment === ".." || segment === ".")
  ) {
    throw new AppError("export_failed", PATH_MESSAGE, false, PATH_ACTION);
  }

  let root: string;
  try {
    root = realpathSync(exportDir);
  } catch {
    throw new AppError(
      "export_failed",
      "내보내기 폴더를 찾지 못했습니다.",
      false,
      "DL_EXPORT_DIR 경로가 존재하는지 확인하세요.",
    );
  }

  const fileName = sanitizeFileName(requestedName);
  const target = path.resolve(root, fileName);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("export_failed", PATH_MESSAGE, false, PATH_ACTION);
  }

  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    let realTarget: string;
    try {
      realTarget = realpathSync(target);
    } catch {
      throw new AppError("export_failed", PATH_MESSAGE, false, PATH_ACTION);
    }
    const escaped = path.relative(root, realTarget);
    if (escaped.startsWith("..") || path.isAbsolute(escaped)) {
      throw new AppError("export_failed", PATH_MESSAGE, false, PATH_ACTION);
    }
  }

  return target;
}
