import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  AgentConnectorId,
  AgentTaskInput,
  AgentTaskResult,
  ConnectorAvailability,
  ModelCapabilities,
  ModelsConfig
} from "@dragonforge/shared";
import { readModels } from "../config/configStore.js";

type ProviderConfig = ModelsConfig["providers"][string];

type AgentConnector = {
  id: AgentConnectorId;
  displayName: string;
  commandName: string;
  capabilities: ModelCapabilities;
  isAvailable(provider: ProviderConfig): Promise<ConnectorAvailability>;
  runTask(input: AgentTaskInput, availability: ConnectorAvailability, provider: ProviderConfig): Promise<AgentTaskResult>;
};

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

const nodeJsPath = "C:\\Program Files\\nodejs";

function executionEnv() {
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  return {
    ...process.env,
    Path: currentPath.includes(nodeJsPath) ? currentPath : `${nodeJsPath};${currentPath}`,
    PATH: currentPath.includes(nodeJsPath) ? currentPath : `${nodeJsPath};${currentPath}`
  };
}

function isCmdShim(command: string) {
  return /\.(cmd|bat)$/i.test(command);
}

function runProcess(command: string, args: string[], options: { cwd?: string; input?: string; timeoutMs?: number } = {}) {
  return new Promise<ProcessResult>((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: executionEnv(),
        windowsHide: true,
        shell: isCmdShim(command)
      });
    } catch (error) {
      resolve({
        stdout: "",
        stderr: (error as Error).message,
        exitCode: null,
        timedOut: false
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 30_000);
    const finish = (exitCode: number | null) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, timedOut });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      stderr += error.message;
      finish(null);
    });
    child.on("close", (exitCode) => {
      finish(exitCode);
    });
    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function whereCommand(commandName: string) {
  if (process.platform !== "win32") {
    const result = await runProcess("which", [commandName], { timeoutMs: 10_000 });
    return result.exitCode === 0 ? result.stdout.split(/\r?\n/).find(Boolean) ?? null : null;
  }
  const result = await runProcess("where.exe", [commandName], { timeoutMs: 10_000 });
  return result.exitCode === 0 ? result.stdout.split(/\r?\n/).find(Boolean) ?? null : null;
}

async function resolveFromPath(commandName: string) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];
  const pathValue = process.env.Path ?? process.env.PATH ?? "";
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${commandName}${extension}`);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function commonCommandPaths(commandName: string) {
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE;
  const candidates = [
    appData ? path.join(appData, "npm", `${commandName}.cmd`) : null,
    appData ? path.join(appData, "npm", `${commandName}.ps1`) : null,
    userProfile ? path.join(userProfile, "AppData", "Roaming", "npm", `${commandName}.cmd`) : null,
    userProfile ? path.join(userProfile, "AppData", "Roaming", "npm", `${commandName}.ps1`) : null,
    userProfile
      ? path.join(
          userProfile,
          "AppData",
          "Local",
          "Packages",
          "OpenAI.Codex_2p2nqsd0c76g0",
          "LocalCache",
          "Local",
          "OpenAI",
          "Codex",
          "bin",
          `${commandName}.exe`
        )
      : null,
    userProfile ? path.join(userProfile, "AppData", "Local", "OpenAI", "Codex", "bin", `${commandName}.exe`) : null,
    path.join(nodeJsPath, `${commandName}.cmd`),
    path.join(nodeJsPath, `${commandName}.exe`),
    localAppData ? path.join(localAppData, "OpenAI", "Codex", "bin", `${commandName}.exe`) : null
  ];
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

async function resolveExecutable(commandName: string, configuredPath?: string | null) {
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  for (const candidate of commonCommandPaths(commandName)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  const fromPathScan = await resolveFromPath(commandName);
  if (fromPathScan) {
    return fromPathScan;
  }
  const fromPath = await whereCommand(commandName);
  if (fromPath) {
    return fromPath;
  }
  return null;
}

async function resolveAnyExecutable(commandNames: string[], configuredPath?: string | null) {
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  for (const commandName of commandNames) {
    const executablePath = await resolveExecutable(commandName);
    if (executablePath) {
      return executablePath;
    }
  }
  return null;
}

async function getVersion(executablePath: string) {
  for (const args of [["--version"], ["-v"]]) {
    const result = await runProcess(executablePath, args, { timeoutMs: 15_000 });
    const firstLine = `${result.stdout}${result.stderr}`.split(/\r?\n/).find((line) => line.trim().length > 0);
    if (result.exitCode === 0 && firstLine) {
      return firstLine.trim();
    }
  }
  return null;
}

async function availabilityFor(connector: AgentConnector, provider: ProviderConfig): Promise<ConnectorAvailability> {
  if (!provider.enabled || provider.mode === "disabled") {
    return {
      id: connector.id,
      displayName: provider.displayName ?? connector.displayName,
      enabled: false,
      available: false,
      executablePath: null,
      version: null,
      mode: provider.mode,
      model: provider.model ?? undefined,
      reasoningEffort: provider.reasoningEffort ?? undefined,
      reason: "Provider is disabled in config/models.json.",
      capabilities: connector.capabilities
    };
  }
  const executablePath = await resolveExecutable(connector.commandName, provider.cliPath);
  if (!executablePath) {
    return {
      id: connector.id,
      displayName: provider.displayName ?? connector.displayName,
      enabled: true,
      available: false,
      executablePath: null,
      version: null,
      mode: provider.mode,
      model: provider.model ?? undefined,
      reasoningEffort: provider.reasoningEffort ?? undefined,
      reason: `${connector.displayName} CLI was not found on PATH or in common install folders.`,
      capabilities: connector.capabilities
    };
  }
  return {
    id: connector.id,
    displayName: provider.displayName ?? connector.displayName,
    enabled: true,
    available: true,
    executablePath,
    version: await getVersion(executablePath),
    mode: provider.mode,
    model: provider.model ?? undefined,
    reasoningEffort: provider.reasoningEffort ?? undefined,
    capabilities: connector.capabilities
  };
}

async function writeTranscript(input: AgentTaskInput, result: AgentTaskResult, prompt: string) {
  await fs.mkdir(path.dirname(input.transcriptPath), { recursive: true });
  await fs.writeFile(input.transcriptPath, `${JSON.stringify({ prompt, result }, null, 2)}\n`, "utf8");
}

const codexConnector: AgentConnector = {
  id: "codex",
  displayName: "Codex",
  commandName: "codex",
  capabilities: {
    roles: ["explorer", "implementer", "build-runner"],
    strengths: ["codebase exploration", "focused patch planning", "debugging loops", "terminal-aware workflows"],
    supportsNonInteractive: true,
    safetyMode: "read-only"
  },
  isAvailable(provider) {
    return availabilityFor(this, provider);
  },
  async runTask(input, availability, provider) {
    if (!availability.executablePath) {
      throw new Error("Codex CLI is not available.");
    }
    const startedAt = new Date();
    const outputPath = `${input.transcriptPath}.last-message.txt`;
    const args = [
      "exec",
      "--cd",
      input.project.rootPath,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--color",
      "never",
      "--output-last-message",
      outputPath,
      "-"
    ];
    if (provider.model) {
      args.splice(1, 0, "--model", provider.model);
    }
    if (provider.reasoningEffort) {
      args.splice(1, 0, "-c", `model_reasoning_effort="${provider.reasoningEffort}"`);
    }
    const processResult = await runProcess(availability.executablePath, args, {
      cwd: input.project.rootPath,
      input: input.prompt,
      timeoutMs: 15 * 60_000
    });
    const finishedAt = new Date();
    let output = processResult.stdout;
    if (await fileExists(outputPath)) {
      output = await fs.readFile(outputPath, "utf8");
    }
    const result: AgentTaskResult = {
      providerId: "codex",
      output,
      stdout: processResult.stdout,
      stderr: processResult.timedOut ? `${processResult.stderr}\nTimed out.` : processResult.stderr,
      exitCode: processResult.exitCode,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime()
    };
    await writeTranscript(input, result, input.prompt);
    return result;
  }
};

const claudeConnector: AgentConnector = {
  id: "claude",
  displayName: "Claude",
  commandName: "claude",
  capabilities: {
    roles: ["architect", "reviewer"],
    strengths: ["planning", "review", "tradeoff analysis", "alternative designs"],
    supportsNonInteractive: true,
    safetyMode: "plan-only"
  },
  async isAvailable(provider) {
    const availability = await availabilityFor(this, provider);
    if (!availability.available || !availability.executablePath) {
      return availability;
    }

    const authStatus = await runProcess(availability.executablePath, ["auth", "status"], { timeoutMs: 15_000 });
    const authText = `${authStatus.stdout}\n${authStatus.stderr}`.trim();
    try {
      const parsed = JSON.parse(authText) as { loggedIn?: boolean; authMethod?: string; apiProvider?: string };
      if (parsed.loggedIn === false) {
        return {
          ...availability,
          available: false,
          reason: "Claude CLI is installed but not logged in. Run `claude auth login` in PowerShell."
        };
      }
    } catch {
      if (/not logged in|please run \/login/i.test(authText)) {
        return {
          ...availability,
          available: false,
          reason: "Claude CLI is installed but not logged in. Run `claude auth login` in PowerShell."
        };
      }
    }

    return availability;
  },
  async runTask(input, availability, provider) {
    if (!availability.executablePath) {
      throw new Error("Claude CLI is not available.");
    }
    const startedAt = new Date();
    const args = [
      ...(provider.model ? ["--model", provider.model] : []),
      ...(provider.reasoningEffort ? ["--effort", provider.reasoningEffort] : []),
      "-p",
      input.prompt,
      "--permission-mode",
      "plan",
      "--disallowedTools",
      "Bash,Edit,Write,MultiEdit"
    ];
    const processResult = await runProcess(availability.executablePath, args, {
      cwd: input.project.rootPath,
      timeoutMs: 15 * 60_000
    });
    const finishedAt = new Date();
    const result: AgentTaskResult = {
      providerId: "claude",
      output: processResult.stdout,
      stdout: processResult.stdout,
      stderr: processResult.timedOut ? `${processResult.stderr}\nTimed out.` : processResult.stderr,
      exitCode: processResult.exitCode,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime()
    };
    await writeTranscript(input, result, input.prompt);
    return result;
  }
};

const kimiConnector: AgentConnector = {
  id: "kimi",
  displayName: "Kimi",
  commandName: "kimi",
  capabilities: {
    roles: ["architect", "explorer", "reviewer"],
    strengths: ["large-context code reading", "repository-wide exploration", "secondary review"],
    supportsNonInteractive: false,
    safetyMode: "manual"
  },
  async isAvailable(provider) {
    if (!provider.enabled || provider.mode === "disabled") {
      return {
        id: "kimi",
        displayName: provider.displayName ?? "Kimi",
        enabled: false,
        available: false,
        executablePath: null,
        version: null,
        mode: provider.mode,
        model: provider.model ?? undefined,
        reasoningEffort: provider.reasoningEffort ?? undefined,
        reason: "Provider is disabled in config/models.json.",
        capabilities: this.capabilities
      };
    }

    const executablePath = await resolveAnyExecutable(["kimi", "kimi-cli", "moonshot", "moonshot-cli"], provider.cliPath);
    if (executablePath) {
      return {
        id: "kimi",
        displayName: provider.displayName ?? "Kimi",
        enabled: true,
        available: true,
        executablePath,
        version: await getVersion(executablePath),
        mode: provider.mode,
        model: provider.model ?? undefined,
        reasoningEffort: provider.reasoningEffort ?? undefined,
        capabilities: {
          ...this.capabilities,
          supportsNonInteractive: true,
          safetyMode: "read-only"
        }
      };
    }

    if (provider.mode === "guided") {
      return {
        id: "kimi",
        displayName: provider.displayName ?? "Kimi",
        enabled: true,
        available: true,
        executablePath: null,
        version: null,
        mode: "guided",
        model: provider.model ?? undefined,
        reasoningEffort: provider.reasoningEffort ?? undefined,
        reason: "Kimi CLI was not found; guided desktop prompt mode is enabled.",
        capabilities: this.capabilities
      };
    }

    return {
      id: "kimi",
      displayName: provider.displayName ?? "Kimi",
      enabled: true,
      available: false,
      executablePath: null,
      version: null,
      mode: provider.mode,
      model: provider.model ?? undefined,
      reasoningEffort: provider.reasoningEffort ?? undefined,
      reason: "Kimi CLI was not found. Set cliPath or switch mode to guided.",
      capabilities: this.capabilities
    };
  },
  async runTask(input, availability, provider) {
    const startedAt = new Date();
    if (availability.executablePath && availability.capabilities.supportsNonInteractive) {
      const args = provider.args ?? [];
      const processResult = await runProcess(availability.executablePath, args, {
        cwd: input.project.rootPath,
        input: input.prompt,
        timeoutMs: 15 * 60_000
      });
      const finishedAt = new Date();
      const result: AgentTaskResult = {
        providerId: "kimi",
        output: processResult.stdout,
        stdout: processResult.stdout,
        stderr: processResult.timedOut ? `${processResult.stderr}\nTimed out.` : processResult.stderr,
        exitCode: processResult.exitCode,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime()
      };
      await writeTranscript(input, result, input.prompt);
      return result;
    }

    const finishedAt = new Date();
    const output = [
      "Kimi guided mode prompt prepared.",
      "",
      "Open Kimi Desktop and paste the prompt below. DragonForge keeps this transcript so the result can be copied back for review.",
      "",
      input.prompt
    ].join("\n");
    const result: AgentTaskResult = {
      providerId: "kimi",
      output,
      stdout: output,
      stderr: "",
      exitCode: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime()
    };
    await writeTranscript(input, result, input.prompt);
    return result;
  }
};

const placeholderConnector = (id: AgentConnectorId, displayName: string): AgentConnector => ({
  id,
  displayName,
  commandName: id,
  capabilities: {
    roles: [],
    strengths: ["future connector"],
    supportsNonInteractive: false,
    safetyMode: "manual"
  },
  isAvailable(provider) {
    return availabilityFor(this, provider);
  },
  async runTask() {
    throw new Error(`${displayName} connector is not implemented yet.`);
  }
});

const connectors: Record<AgentConnectorId, AgentConnector> = {
  claude: claudeConnector,
  codex: codexConnector,
  kimi: kimiConnector,
  deepseek: placeholderConnector("deepseek", "DeepSeek")
};

export async function listConnectorAvailability() {
  const models = await readModels();
  const entries = await Promise.all(
    Object.entries(connectors).map(([id, connector]) =>
      connector.isAvailable(
        models.providers[id] ?? {
          displayName: connector.displayName,
          enabled: false,
          cliPath: null,
          roles: [],
          mode: "disabled",
          model: null,
          reasoningEffort: null,
          args: []
        }
      )
    )
  );
  return entries;
}

export async function selectConnectorForRole(role: string, preferredProviderId?: AgentConnectorId) {
  const models = await readModels();
  const availability = await listConnectorAvailability();
  const routedProviders = preferredProviderId
    ? [preferredProviderId]
    : models.routing[role as keyof typeof models.routing] ?? [];
  for (const providerId of routedProviders) {
    const candidate = availability.find((entry) => entry.id === providerId && entry.available && entry.enabled);
    if (candidate) {
      return {
        connector: connectors[candidate.id],
        availability: candidate,
        provider: models.providers[candidate.id]
      };
    }
  }
  return null;
}
