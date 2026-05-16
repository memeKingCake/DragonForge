import path from "node:path";
import type { FastifyInstance } from "fastify";
import { cloneProjectSchema, registerLocalProjectSchema } from "@dragonforge/shared";
import { createCommandPreview } from "../commands/policy.js";
import { dataPaths } from "../config/paths.js";
import { gitStatus } from "../git/gitCommands.js";
import { getProject, registerLocalProject, removeProject, slugify, updateProjectScan } from "../projects/projectStore.js";
import { scanProject } from "../projects/scanner.js";

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/projects", async () => {
    const { listProjects } = await import("../projects/projectStore.js");
    return listProjects();
  });

  app.post("/api/projects/register-local", async (request, reply) => {
    try {
      const body = registerLocalProjectSchema.parse(request.body);
      return await registerLocalProject(body);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/projects/clone", async (request, reply) => {
    try {
      const body = cloneProjectSchema.parse(request.body);
      const folderName = body.name ? slugify(body.name) : slugify(path.basename(body.url.replace(/\.git$/i, "")));
      const targetPath = body.targetPath ? path.resolve(body.targetPath) : path.join(dataPaths.workspacesDir, folderName);
      const preview = await createCommandPreview({
        projectId: "dragonforge-workspaces",
        cwd: dataPaths.workspacesDir,
        command: `git clone ${quotePowerShell(body.url)} ${quotePowerShell(targetPath)}`,
        reason: "Clone remote project into DragonForge workspaces"
      });
      return { preview, targetPath };
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    return project;
  });

  app.get("/api/projects/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    const status = await gitStatus(project);
    return { project, git: status };
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await removeProject(id);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post("/api/projects/:id/scan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    const scan = await scanProject(project.rootPath);
    const updated = await updateProjectScan(project.id, scan);
    return updated;
  });
}
