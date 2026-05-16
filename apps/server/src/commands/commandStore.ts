import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CommandExecutionLog, CommandPreview, CommandRecord } from "@dragonforge/shared";
import { dataPaths } from "../config/paths.js";
import { appendAudit, readJson, writeJson } from "../storage/jsonStore.js";
import { createCommandPreview } from "./policy.js";

export async function listCommandRecords(): Promise<CommandRecord[]> {
  return readJson<CommandRecord[]>(dataPaths.commandQueue, []);
}

export async function getCommandRecord(id: string) {
  const records = await listCommandRecords();
  return records.find((record) => record.id === id);
}

async function writeCommandRecords(records: CommandRecord[]) {
  return writeJson(dataPaths.commandQueue, records);
}

export async function requestCommandApproval(submittedPreview: CommandPreview, actor: string) {
  const now = new Date().toISOString();
  const preview = await createCommandPreview({
    command: submittedPreview.command,
    cwd: submittedPreview.cwd,
    projectId: submittedPreview.projectId,
    reason: submittedPreview.reason
  });
  const record: CommandRecord = {
    id: `cmd_${crypto.randomUUID()}`,
    preview,
    status: preview.risk === "blocked" ? "blocked" : "queued",
    requestedAt: now,
    requestedBy: actor
  };
  const records = await listCommandRecords();
  await writeCommandRecords([record, ...records]);
  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: now,
    projectId: preview.projectId,
    actor,
    action: "request_command_approval",
    command: preview.command,
    cwd: preview.cwd,
    risk: preview.risk
  });
  return record;
}

async function updateRecord(record: CommandRecord) {
  const records = await listCommandRecords();
  await writeCommandRecords(records.map((current) => (current.id === record.id ? record : current)));
  return record;
}

export async function rejectCommand(id: string, actor: string) {
  const record = await getCommandRecord(id);
  if (!record) {
    throw new Error(`Command not found: ${id}`);
  }
  const updated: CommandRecord = {
    ...record,
    status: "rejected",
    decidedAt: new Date().toISOString()
  };
  await updateRecord(updated);
  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: updated.decidedAt!,
    projectId: record.preview.projectId,
    actor,
    action: "reject_command",
    command: record.preview.command,
    cwd: record.preview.cwd,
    risk: record.preview.risk
  });
  return updated;
}

function runPowerShell(record: CommandRecord): Promise<CommandExecutionLog> {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", record.preview.command], {
      cwd: record.preview.cwd,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (exitCode) => {
      const finishedAt = new Date();
      resolve({
        id: record.id,
        command: record.preview.command,
        cwd: record.preview.cwd,
        projectId: record.preview.projectId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        exitCode,
        stdout,
        stderr
      });
    });
  });
}

export async function approveAndRunCommand(id: string, actor: string) {
  const record = await getCommandRecord(id);
  if (!record) {
    throw new Error(`Command not found: ${id}`);
  }
  if (record.preview.risk === "blocked" || record.status === "blocked") {
    throw new Error("Blocked commands cannot be approved or executed.");
  }
  if (record.status !== "queued") {
    throw new Error(`Command is not queued: ${record.status}`);
  }

  const running: CommandRecord = {
    ...record,
    status: "running",
    decidedAt: new Date().toISOString()
  };
  await updateRecord(running);
  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: running.decidedAt!,
    projectId: record.preview.projectId,
    actor,
    action: "approve_command",
    command: record.preview.command,
    cwd: record.preview.cwd,
    risk: record.preview.risk
  });

  await fs.mkdir(dataPaths.commandLogsDir, { recursive: true });
  const log = await runPowerShell(running);
  const logPath = path.join(dataPaths.commandLogsDir, `${record.id}.json`);
  await fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  const completed: CommandRecord = {
    ...running,
    status: log.exitCode === 0 ? "completed" : "failed",
    logPath,
    log
  };
  await updateRecord(completed);
  return completed;
}
