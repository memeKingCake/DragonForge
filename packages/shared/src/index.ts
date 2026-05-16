import { z } from "zod";

export const permissionLevelSchema = z.enum(["auto", "preview", "approval", "blocked"]);
export type PermissionLevel = z.infer<typeof permissionLevelSchema>;

export const commandCategorySchema = z.enum([
  "read",
  "build",
  "test",
  "git",
  "network",
  "write",
  "delete",
  "unknown"
]);
export type CommandCategory = z.infer<typeof commandCategorySchema>;

export const riskLevelSchema = z.enum(["low", "medium", "high", "blocked"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const commandPreviewSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1),
  projectId: z.string().min(1),
  reason: z.string().min(1),
  category: commandCategorySchema,
  risk: riskLevelSchema,
  expectedWrites: z.array(z.string()),
  requiresApproval: z.boolean(),
  policyLevel: permissionLevelSchema,
  warnings: z.array(z.string()).default([])
});
export type CommandPreview = z.infer<typeof commandPreviewSchema>;

export const commandPreviewRequestSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1),
  projectId: z.string().min(1),
  reason: z.string().min(1).default("User requested command preview")
});
export type CommandPreviewRequest = z.infer<typeof commandPreviewRequestSchema>;

export const commandApprovalRequestSchema = z.object({
  preview: commandPreviewSchema,
  actor: z.string().min(1).default("user")
});
export type CommandApprovalRequest = z.infer<typeof commandApprovalRequestSchema>;

export const commandStatusSchema = z.enum([
  "queued",
  "approved",
  "rejected",
  "running",
  "completed",
  "failed",
  "blocked"
]);
export type CommandStatus = z.infer<typeof commandStatusSchema>;

export type CommandExecutionLog = {
  id: string;
  command: string;
  cwd: string;
  projectId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type CommandRecord = {
  id: string;
  preview: CommandPreview;
  status: CommandStatus;
  requestedAt: string;
  requestedBy: string;
  decidedAt?: string;
  logPath?: string;
  log?: CommandExecutionLog;
};

export const registerLocalProjectSchema = z.object({
  rootPath: z.string().min(1),
  name: z.string().min(1).optional()
});
export type RegisterLocalProjectRequest = z.infer<typeof registerLocalProjectSchema>;

export const cloneProjectSchema = z.object({
  url: z.string().min(1),
  targetPath: z.string().min(1).optional(),
  name: z.string().min(1).optional()
});
export type CloneProjectRequest = z.infer<typeof cloneProjectSchema>;

export type SuggestedCommand = {
  label: string;
  command: string;
  category: CommandCategory;
};

export type ProjectScanSummary = {
  scannedAt: string;
  rootPath: string;
  fileCount: number;
  sourceCount: number;
  assetFolders: string[];
  buildFolders: string[];
  markers: string[];
  projectTypes: string[];
  sdlSignals: string[];
  suggestedCommands: SuggestedCommand[];
};

export type RegisteredProject = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastScan?: ProjectScanSummary;
};

export const agentRoleSchema = z.enum([
  "architect",
  "explorer",
  "implementer",
  "build-runner",
  "reviewer"
]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentConnectorIdSchema = z.enum(["claude", "codex", "kimi", "deepseek"]);
export type AgentConnectorId = z.infer<typeof agentConnectorIdSchema>;

export const agentTaskAttachmentSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.literal("image").default("image"),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative().max(5 * 1024 * 1024),
  dataUrl: z.string().min(1).optional(),
  storedPath: z.string().min(1).optional()
});
export type AgentTaskAttachment = z.infer<typeof agentTaskAttachmentSchema>;

export type ModelCapabilities = {
  roles: AgentRole[];
  strengths: string[];
  supportsNonInteractive: boolean;
  safetyMode: "read-only" | "plan-only" | "manual" | "unknown";
};

export type ConnectorAvailability = {
  id: AgentConnectorId;
  displayName: string;
  enabled: boolean;
  available: boolean;
  executablePath: string | null;
  version: string | null;
  mode?: "auto" | "guided" | "disabled";
  model?: string;
  reasoningEffort?: string;
  reason?: string;
  capabilities: ModelCapabilities;
};

export const agentTaskRequestSchema = z.object({
  projectId: z.string().min(1),
  role: agentRoleSchema,
  providerId: agentConnectorIdSchema.optional(),
  title: z.string().min(1),
  prompt: z.string().min(1),
  attachments: z.array(agentTaskAttachmentSchema).max(6).default([])
});
export type AgentTaskRequest = z.infer<typeof agentTaskRequestSchema>;

export type AgentTask = AgentTaskRequest & {
  id: string;
  providerId?: AgentConnectorId;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  activity?: AgentTaskActivity;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  transcriptPath?: string;
  result?: AgentTaskResult;
  error?: string;
  log: string[];
};

export type AgentTaskActivity = {
  state: "queued" | "starting" | "working" | "completed" | "cancelled" | "failed" | "interrupted";
  message: string;
  lastHeartbeatAt: string;
};

export type AgentTaskInput = {
  task: AgentTask;
  project: RegisteredProject;
  prompt: string;
  transcriptPath: string;
};

export type AgentTaskResult = {
  providerId: AgentConnectorId;
  output: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export type AuditEntry = {
  id: string;
  time: string;
  projectId?: string;
  actor: string;
  action: string;
  command?: string;
  cwd?: string;
  risk?: RiskLevel;
  details?: Record<string, unknown>;
};

export type PermissionDefaults = {
  read: PermissionLevel;
  search: PermissionLevel;
  write: PermissionLevel;
  build: PermissionLevel;
  test: PermissionLevel;
  install: PermissionLevel;
  gitRead: PermissionLevel;
  gitWrite: PermissionLevel;
  gitCheckpoint: PermissionLevel;
  delete: PermissionLevel;
  network: PermissionLevel;
  outsideProjectWrite: PermissionLevel;
  unknown: PermissionLevel;
};

export type PermissionsConfig = {
  defaults: PermissionDefaults;
  blockedPatterns: string[];
  rememberedApprovals: Array<{
    projectId: string;
    command: string;
    cwd: string;
    expiresAt?: string;
  }>;
};

export type DragonforgeSettings = {
  server: {
    host: string;
    port: number;
  };
  dashboard: {
    port: number;
  };
  install: {
    target: string;
  };
  git: {
    branchPrefix: string;
    checkpointMode: "branch" | "stash" | "commit" | "snapshot";
  };
  paths: {
    projects: string;
    logs: string;
    config: string;
  };
};

export type ModelsConfig = {
  providers: Record<
    string,
    {
      displayName: string;
      enabled: boolean;
      cliPath: string | null;
      roles: AgentRole[];
      mode?: "auto" | "guided" | "disabled";
      model?: string | null;
      reasoningEffort?: string | null;
      args?: string[];
    }
  >;
  routing: Record<AgentRole, string[]>;
};

export const defaultPermissions: PermissionsConfig = {
  defaults: {
    read: "auto",
    search: "auto",
    write: "approval",
    build: "preview",
    test: "preview",
    install: "approval",
    gitRead: "auto",
    gitWrite: "approval",
    gitCheckpoint: "preview",
    delete: "approval",
    network: "approval",
    outsideProjectWrite: "blocked",
    unknown: "preview"
  },
  blockedPatterns: [
    "Remove-Item -Recurse -Force",
    "rm -rf",
    "rm -r",
    "git reset --hard",
    "git clean -fd",
    "git checkout -- .",
    "Set-ExecutionPolicy",
    "format ",
    "diskpart"
  ],
  rememberedApprovals: []
};

export const defaultSettings: DragonforgeSettings = {
  server: {
    host: "127.0.0.1",
    port: 4545
  },
  dashboard: {
    port: 5173
  },
  install: {
    target: "C:\\AiAgents\\DragonForge"
  },
  git: {
    branchPrefix: "dragonforge",
    checkpointMode: "branch"
  },
  paths: {
    projects: "projects",
    logs: "logs",
    config: "config"
  }
};

export const defaultModels: ModelsConfig = {
  providers: {
    claude: {
      displayName: "Claude",
      enabled: true,
      cliPath: null,
      mode: "auto",
      model: null,
      reasoningEffort: null,
      args: [],
      roles: ["architect", "reviewer"]
    },
    codex: {
      displayName: "Codex",
      enabled: true,
      cliPath: null,
      mode: "auto",
      model: null,
      reasoningEffort: null,
      args: [],
      roles: ["explorer", "implementer", "build-runner"]
    },
    kimi: {
      displayName: "Kimi",
      enabled: true,
      cliPath: null,
      mode: "guided",
      model: null,
      reasoningEffort: null,
      args: [],
      roles: ["architect", "explorer", "reviewer"]
    },
    deepseek: {
      displayName: "DeepSeek",
      enabled: false,
      cliPath: null,
      mode: "disabled",
      model: null,
      reasoningEffort: null,
      args: [],
      roles: []
    }
  },
  routing: {
    architect: ["claude", "codex", "kimi"],
    explorer: ["codex", "kimi", "claude"],
    implementer: ["codex", "claude"],
    "build-runner": ["codex", "claude"],
    reviewer: ["claude", "codex", "kimi"]
  }
};
