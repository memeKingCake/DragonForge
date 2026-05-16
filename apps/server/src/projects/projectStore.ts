import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectScanSummary, RegisteredProject, RegisterLocalProjectRequest } from "@dragonforge/shared";
import { dataPaths } from "../config/paths.js";
import { appendAudit, readJson, writeJson } from "../storage/jsonStore.js";

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}

export async function listProjects(): Promise<RegisteredProject[]> {
  return readJson<RegisteredProject[]>(dataPaths.registeredProjects, []);
}

export async function getProject(projectId: string) {
  const projects = await listProjects();
  return projects.find((project) => project.id === projectId);
}

export async function registerLocalProject(input: RegisterLocalProjectRequest) {
  const rootPath = path.resolve(input.rootPath);
  const stat = await fs.stat(rootPath);
  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }

  const projects = await listProjects();
  const existing = projects.find((project) => path.resolve(project.rootPath).toLowerCase() === rootPath.toLowerCase());
  if (existing) {
    return existing;
  }

  const name = input.name ?? path.basename(rootPath);
  const baseId = slugify(name);
  const collision = projects.some((project) => project.id === baseId);
  const id = collision ? `${baseId}-${crypto.randomUUID().slice(0, 8)}` : baseId;
  const now = new Date().toISOString();
  const project: RegisteredProject = {
    id,
    name,
    rootPath,
    createdAt: now,
    updatedAt: now
  };

  await writeJson(dataPaths.registeredProjects, [...projects, project]);
  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: now,
    projectId: project.id,
    actor: "user",
    action: "register_project",
    details: { rootPath }
  });
  return project;
}

export async function updateProjectScan(projectId: string, scan: ProjectScanSummary) {
  const projects = await listProjects();
  const next = projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          lastScan: scan,
          updatedAt: new Date().toISOString()
        }
      : project
  );
  await writeJson(dataPaths.registeredProjects, next);
  return next.find((project) => project.id === projectId);
}

export async function removeProject(projectId: string) {
  const projects = await listProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  await writeJson(
    dataPaths.registeredProjects,
    projects.filter((candidate) => candidate.id !== projectId)
  );
  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: new Date().toISOString(),
    projectId: project.id,
    actor: "user",
    action: "unregister_project",
    details: {
      rootPath: project.rootPath,
      note: "Project files were left untouched."
    }
  });
  return project;
}
