import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getProject } from "../projects/projectStore.js";
import { gitDiff, gitStatus, previewCheckpoint, previewCommit, previewRollback, previewStage, previewTaskBranch } from "../git/gitCommands.js";

async function requireProject(projectId: string) {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
}

export async function registerGitRoutes(app: FastifyInstance) {
  app.get("/api/git/:projectId/status", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const project = await requireProject(projectId);
      return await gitStatus(project);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/diff", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ paths: z.array(z.string()).optional() }).parse(request.body ?? {});
      const project = await requireProject(projectId);
      return await gitDiff(project, body.paths);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/checkpoint", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ name: z.string().optional() }).parse(request.body ?? {});
      const project = await requireProject(projectId);
      return await previewCheckpoint(project, body.name);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/branch", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ taskSlug: z.string().optional() }).parse(request.body ?? {});
      const project = await requireProject(projectId);
      return await previewTaskBranch(project, body.taskSlug);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/stage", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ paths: z.array(z.string()).default(["."]) }).parse(request.body ?? {});
      const project = await requireProject(projectId);
      return await previewStage(project, body.paths);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/commit", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ message: z.string().min(1) }).parse(request.body);
      const project = await requireProject(projectId);
      return await previewCommit(project, body.message);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/git/:projectId/rollback-checkpoint", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const body = z.object({ checkpoint: z.string().min(1) }).parse(request.body);
      const project = await requireProject(projectId);
      return await previewRollback(project, body.checkpoint);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
}

