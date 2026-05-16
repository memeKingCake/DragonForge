import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTask, AgentTaskActivity, AgentTaskAttachment, AgentTaskRequest } from "@dragonforge/shared";
import { dataPaths } from "../config/paths.js";
import { getProject } from "../projects/projectStore.js";
import { appendAudit, readJson, writeJson } from "../storage/jsonStore.js";
import { listConnectorAvailability, selectConnectorForRole } from "./connectors.js";
import { composeAgentPrompt } from "./promptComposer.js";

export async function listAgentTasks(): Promise<AgentTask[]> {
  return readJson<AgentTask[]>(dataPaths.agentTasks, []);
}

async function writeAgentTasks(tasks: AgentTask[]) {
  return writeJson(dataPaths.agentTasks, tasks);
}

async function updateAgentTask(id: string, patch: Partial<AgentTask>) {
  const tasks = await listAgentTasks();
  const existing = tasks.find((task) => task.id === id);
  if (!existing) {
    throw new Error(`Agent task not found: ${id}`);
  }
  const updated: AgentTask = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await writeAgentTasks(tasks.map((task) => (task.id === id ? updated : task)));
  return updated;
}

function createActivity(
  state: AgentTaskActivity["state"],
  message: string,
  lastHeartbeatAt = new Date().toISOString()
): AgentTaskActivity {
  return {
    state,
    message,
    lastHeartbeatAt
  };
}

function sanitizeAttachmentName(name: string) {
  const parsed = path.parse(name);
  const base = (parsed.name || "image")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
  const extension = (parsed.ext || ".png").replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 12) || ".png";
  return `${base}${extension}`;
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Only base64 image attachments are supported.");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function materializeAttachments(taskId: string, attachments: AgentTaskAttachment[] = []) {
  if (attachments.length === 0) {
    return [];
  }

  const attachmentDir = path.join(dataPaths.agentLogsDir, "attachments", taskId);
  await fs.mkdir(attachmentDir, { recursive: true });

  return Promise.all(
    attachments.map(async (attachment, index): Promise<AgentTaskAttachment> => {
      const id = attachment.id ?? `img_${crypto.randomUUID()}`;
      let storedPath = attachment.storedPath;
      let mimeType = attachment.mimeType;

      if (attachment.dataUrl) {
        const decoded = decodeDataUrl(attachment.dataUrl);
        mimeType = decoded.mimeType;
        const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeAttachmentName(attachment.name)}`;
        storedPath = path.join(attachmentDir, fileName);
        await fs.writeFile(storedPath, decoded.buffer);
      }

      return {
        id,
        kind: "image",
        name: attachment.name,
        mimeType,
        size: attachment.size,
        storedPath
      };
    })
  );
}

export async function createAgentTask(input: AgentTaskRequest) {
  const now = new Date().toISOString();
  const id = `task_${crypto.randomUUID()}`;
  const attachments = await materializeAttachments(id, input.attachments);
  const task: AgentTask = {
    ...input,
    id,
    attachments,
    status: "queued",
    activity: createActivity("queued", "Task is waiting to start.", now),
    createdAt: now,
    updatedAt: now,
    log: [
      "Task queued."
    ]
  };
  const tasks = await listAgentTasks();
  await writeAgentTasks([task, ...tasks]);
  return task;
}

export async function getAgentTask(id: string) {
  const tasks = await listAgentTasks();
  return tasks.find((task) => task.id === id);
}

export async function cancelAgentTask(id: string) {
  const tasks = await listAgentTasks();
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    throw new Error(`Agent task not found: ${id}`);
  }
  const updated: AgentTask = {
    ...task,
    status: "cancelled",
    activity: createActivity("cancelled", "Task was cancelled by the user."),
    updatedAt: new Date().toISOString(),
    log: [...task.log, "Task cancelled by user."]
  };
  await writeAgentTasks(tasks.map((candidate) => (candidate.id === id ? updated : candidate)));
  return updated;
}

export async function recoverInterruptedAgentTasks() {
  const tasks = await listAgentTasks();
  const now = new Date().toISOString();
  let changed = false;
  const next = tasks.map((task) => {
    if (task.status !== "running") {
      return task;
    }
    changed = true;
    return {
      ...task,
      status: "failed" as const,
      activity: createActivity("interrupted", "DragonForge restarted before the connector returned a result.", now),
      finishedAt: now,
      updatedAt: now,
      error: "DragonForge restarted before this task finished. Rerun the task if the work is still needed.",
      log: [
        ...task.log,
        "Marked failed on startup because DragonForge restarted before the connector returned a result."
      ]
    };
  });

  if (changed) {
    await writeAgentTasks(next);
  }
}

async function markTaskFailed(task: AgentTask, message: string) {
  return updateAgentTask(task.id, {
    status: "failed",
    activity: createActivity("failed", message),
    finishedAt: new Date().toISOString(),
    error: message,
    log: [...task.log, message]
  });
}

async function heartbeatAgentTask(id: string, message: string) {
  const latest = await getAgentTask(id);
  if (!latest || latest.status !== "running") {
    return latest;
  }

  return updateAgentTask(id, {
    activity: createActivity("working", message)
  });
}

async function executeAgentTask(task: AgentTask) {
  const current = await getAgentTask(task.id);
  if (!current || current.status !== "running") {
    return;
  }

  const project = await getProject(current.projectId);
  if (!project) {
    await markTaskFailed(current, `Project not found: ${current.projectId}`);
    return;
  }

  const selection = await selectConnectorForRole(current.role, current.providerId);
  if (!selection) {
    const availability = await listConnectorAvailability();
    const statusLine = availability
      .map((entry) => `${entry.displayName}: ${entry.available ? "available" : entry.reason ?? "unavailable"}`)
      .join("; ");
    await markTaskFailed(current, `No available connector for role ${current.role}. ${statusLine}`);
    return;
  }

  const prompt = composeAgentPrompt(current, project);
  const transcriptPath = path.join(dataPaths.agentLogsDir, `${current.id}.json`);
  const startedAt = new Date().toISOString();
  const running = await updateAgentTask(current.id, {
    providerId: selection.availability.id,
    startedAt,
    activity: createActivity("working", `${selection.availability.displayName} is working on the task.`, startedAt),
    transcriptPath,
    log: [
      ...current.log,
      `Running with ${selection.availability.displayName}.`,
      `Transcript: ${transcriptPath}`
    ]
  });

  await appendAudit({
    id: `audit_${crypto.randomUUID()}`,
    time: startedAt,
    projectId: project.id,
    actor: "dragonforge",
    action: "run_agent_task",
    details: {
      taskId: running.id,
      role: running.role,
      providerId: selection.availability.id,
      executablePath: selection.availability.executablePath
    }
  });

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  try {
    heartbeatTimer = setInterval(() => {
      void heartbeatAgentTask(current.id, `${selection.availability.displayName} is working on the task.`);
    }, 5000);

    const result = await selection.connector.runTask(
      {
        task: running,
        project,
        prompt,
        transcriptPath
      },
      selection.availability,
      selection.provider
    );
    const finishedAt = new Date().toISOString();
    const latest = await getAgentTask(current.id);
    if (!latest || latest.status !== "running") {
      return;
    }

    await updateAgentTask(current.id, {
      status: result.exitCode === 0 ? "completed" : "failed",
      activity: createActivity(
        result.exitCode === 0 ? "completed" : "failed",
        result.exitCode === 0
          ? `${selection.availability.displayName} finished the task.`
          : `${selection.availability.displayName} returned an error.`,
        finishedAt
      ),
      finishedAt,
      result,
      error: result.exitCode === 0 ? undefined : result.stderr || `Connector exited with code ${result.exitCode}`,
      log: [
        ...running.log,
        result.exitCode === 0
          ? `Completed with ${selection.availability.displayName}.`
          : `Connector failed with exit code ${result.exitCode}.`
      ]
    });
  } catch (error) {
    const latest = (await getAgentTask(current.id)) ?? running;
    await markTaskFailed(latest, (error as Error).message);
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}

export async function startAgentTask(id: string) {
  const task = await getAgentTask(id);
  if (!task) {
    throw new Error(`Agent task not found: ${id}`);
  }
  if (task.status === "running") {
    return task;
  }
  if (task.status === "cancelled") {
    throw new Error("Cancelled tasks cannot be started.");
  }
  const running = await updateAgentTask(id, {
    status: "running",
    startedAt: new Date().toISOString(),
    activity: createActivity("starting", "DragonForge is selecting a connector."),
    error: undefined,
    log: [...task.log, "Run requested."]
  });
  void executeAgentTask(running);
  return running;
}
