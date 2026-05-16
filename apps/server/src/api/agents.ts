import type { FastifyInstance } from "fastify";
import { agentTaskRequestSchema } from "@dragonforge/shared";
import { listConnectorAvailability } from "../agents/connectors.js";
import { cancelAgentTask, createAgentTask, getAgentTask, listAgentTasks, startAgentTask } from "../agents/taskStore.js";

export async function registerAgentRoutes(app: FastifyInstance) {
  app.get("/api/agents/connectors", async () => listConnectorAvailability());

  app.get("/api/agents/tasks", async () => listAgentTasks());

  app.post("/api/agents/tasks", async (request, reply) => {
    try {
      const body = agentTaskRequestSchema.parse(request.body);
      return await createAgentTask(body);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.get("/api/agents/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await getAgentTask(id);
    if (!task) {
      return reply.code(404).send({ error: "Agent task not found" });
    }
    return task;
  });

  app.post("/api/agents/tasks/:id/cancel", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await cancelAgentTask(id);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/agents/tasks/:id/run", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await startAgentTask(id);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.get("/api/agents/runs/:id/log", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await getAgentTask(id);
    if (!task) {
      return reply.code(404).send({ error: "Agent run not found" });
    }
    return { id, log: task.log };
  });
}
