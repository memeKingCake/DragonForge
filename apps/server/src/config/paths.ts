import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = process.env.DRAGONFORGE_HOME
  ? path.resolve(process.env.DRAGONFORGE_HOME)
  : path.resolve(moduleDir, "../../../..");

export const dataPaths = {
  configDir: path.join(repoRoot, "config"),
  projectsDir: path.join(repoRoot, "projects"),
  workspacesDir: path.join(repoRoot, "projects", "workspaces"),
  logsDir: path.join(repoRoot, "logs"),
  commandLogsDir: path.join(repoRoot, "logs", "commands"),
  agentLogsDir: path.join(repoRoot, "logs", "agents"),
  auditLogsDir: path.join(repoRoot, "logs", "audits"),
  settings: path.join(repoRoot, "config", "dragonforge.json"),
  permissions: path.join(repoRoot, "config", "permissions.json"),
  models: path.join(repoRoot, "config", "models.json"),
  registeredProjects: path.join(repoRoot, "projects", "registered.json"),
  commandQueue: path.join(repoRoot, "logs", "commands", "queue.json"),
  agentTasks: path.join(repoRoot, "logs", "agents", "tasks.json"),
  auditLog: path.join(repoRoot, "logs", "audits", "audit.jsonl")
};

export async function ensureDataDirs() {
  await Promise.all([
    fs.mkdir(dataPaths.configDir, { recursive: true }),
    fs.mkdir(dataPaths.projectsDir, { recursive: true }),
    fs.mkdir(dataPaths.workspacesDir, { recursive: true }),
    fs.mkdir(dataPaths.commandLogsDir, { recursive: true }),
    fs.mkdir(dataPaths.agentLogsDir, { recursive: true }),
    fs.mkdir(dataPaths.auditLogsDir, { recursive: true })
  ]);
}

