import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { commandApprovalRequestSchema, commandPreviewRequestSchema } from "@dragonforge/shared";
import { approveAndRunCommand, getCommandRecord, listCommandRecords, rejectCommand, requestCommandApproval } from "../commands/commandStore.js";
import { createCommandPreview } from "../commands/policy.js";

export async function registerCommandRoutes(app: FastifyInstance) {
  app.get("/api/commands", async (request) => {
    const { status } = request.query as { status?: string };
    const records = await listCommandRecords();
    return status ? records.filter((record) => record.status === status) : records;
  });

  app.post("/api/commands/preview", async (request, reply) => {
    try {
      const body = commandPreviewRequestSchema.parse(request.body);
      return createCommandPreview(body);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/commands/request-approval", async (request, reply) => {
    try {
      const body = commandApprovalRequestSchema.parse(request.body);
      return requestCommandApproval(body.preview, body.actor);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/commands/:id/approve", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await approveAndRunCommand(id, "user");
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post("/api/commands/:id/reject", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await rejectCommand(id, "user");
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.get("/api/commands/:id/log", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getCommandRecord(id);
    if (!record) {
      return reply.code(404).send({ error: "Command not found" });
    }
    if (record.log) {
      return record.log;
    }
    if (record.logPath) {
      const raw = await fs.readFile(record.logPath, "utf8");
      return JSON.parse(raw);
    }
    return reply.code(404).send({ error: "Command has no log yet" });
  });
}

