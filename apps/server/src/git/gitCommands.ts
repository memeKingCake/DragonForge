import { spawn } from "node:child_process";
import type { RegisteredProject } from "@dragonforge/shared";
import { createCommandPreview } from "../commands/policy.js";
import { slugify } from "../projects/projectStore.js";

function runGit(project: RegisteredProject, args: string[]) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("git", args, {
      cwd: project.rootPath,
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
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function gitStatus(project: RegisteredProject) {
  return runGit(project, ["status", "--short", "--branch"]);
}

export async function gitDiff(project: RegisteredProject, paths: string[] = []) {
  return runGit(project, ["diff", "--", ...paths]);
}

export async function previewCheckpoint(project: RegisteredProject, name?: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const branch = `dragonforge/checkpoints/${slugify(name ?? project.id)}-${stamp}`;
  return createCommandPreview({
    projectId: project.id,
    cwd: project.rootPath,
    command: `git branch ${branch}`,
    reason: "Create DragonForge checkpoint branch"
  });
}

export async function previewTaskBranch(project: RegisteredProject, taskSlug?: string) {
  const branch = `dragonforge/${project.id}/${slugify(taskSlug ?? "task")}`;
  return createCommandPreview({
    projectId: project.id,
    cwd: project.rootPath,
    command: `git switch -c ${branch}`,
    reason: "Create and switch to DragonForge task branch"
  });
}

export async function previewStage(project: RegisteredProject, paths: string[] = ["."]) {
  return createCommandPreview({
    projectId: project.id,
    cwd: project.rootPath,
    command: `git add -- ${paths.map(quotePowerShell).join(" ")}`,
    reason: "Stage selected files"
  });
}

export async function previewCommit(project: RegisteredProject, message: string) {
  return createCommandPreview({
    projectId: project.id,
    cwd: project.rootPath,
    command: `git commit -m ${quotePowerShell(message)}`,
    reason: "Create Git commit after user review"
  });
}

export async function previewRollback(project: RegisteredProject, checkpoint: string) {
  return createCommandPreview({
    projectId: project.id,
    cwd: project.rootPath,
    command: `git reset --hard ${quotePowerShell(checkpoint)}`,
    reason: "Rollback to DragonForge checkpoint"
  });
}

