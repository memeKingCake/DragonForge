import fs from "node:fs/promises";
import path from "node:path";
import type { AuditEntry } from "@dragonforge/shared";
import { dataPaths } from "../config/paths.js";

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (raw.trim().length === 0) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    if (error instanceof SyntaxError) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fs.copyFile(filePath, corruptPath);
      } catch {
        // Best-effort backup only; recovery should not be blocked by backup failure.
      }
      return fallback;
    }
    throw error;
  }
}

export async function writeJson<T>(filePath: string, value: T): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
  return value;
}

export function mergeObjects<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

export async function appendAudit(entry: AuditEntry) {
  await fs.mkdir(path.dirname(dataPaths.auditLog), { recursive: true });
  await fs.appendFile(dataPaths.auditLog, `${JSON.stringify(entry)}\n`, "utf8");
}
