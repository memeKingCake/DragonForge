import path from "node:path";
import type { CommandCategory, CommandPreview, PermissionLevel, PermissionsConfig, RiskLevel } from "@dragonforge/shared";
import { readPermissions } from "../config/configStore.js";
import { getProject } from "../projects/projectStore.js";

const shellOperatorPattern = /(;|&&|\|\||\||>|<|\$\(|`)/;

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

function startsWithAny(command: string, prefixes: string[]) {
  const lower = command.toLowerCase();
  return prefixes.some((prefix) => lower.startsWith(prefix));
}

function includesAny(command: string, fragments: string[]) {
  const lower = command.toLowerCase();
  return fragments.some((fragment) => lower.includes(fragment));
}

function blockedByPattern(command: string, config: PermissionsConfig) {
  const lower = command.toLowerCase();
  return config.blockedPatterns.find((pattern) => lower.includes(pattern.toLowerCase()));
}

function classify(command: string): CommandCategory {
  const lower = command.toLowerCase();
  if (startsWithAny(lower, ["git status", "git diff", "git log", "get-childitem", "dir", "ls", "rg ", "findstr "])) {
    return "read";
  }
  if (startsWithAny(lower, ["git clone", "npm install", "npm add", "pnpm add", "pnpm install", "yarn add", "curl ", "invoke-webrequest", "iwr ", "wget "])) {
    return "network";
  }
  if (startsWithAny(lower, ["git "])) {
    return "git";
  }
  if (startsWithAny(lower, ["cmake --build", "dotnet build", "msbuild", "make", "ninja", "npm run build", "cargo build"])) {
    return "build";
  }
  if (startsWithAny(lower, ["npm test", "npm run test", "dotnet test", "cargo test", "ctest", "pytest", "vitest"])) {
    return "test";
  }
  if (startsWithAny(lower, ["remove-item", "rm ", "ri ", "del ", "erase ", "rmdir ", "rd "])) {
    return "delete";
  }
  if (startsWithAny(lower, ["copy-item", "move-item", "new-item", "set-content", "add-content", "out-file", "mkdir", "ni "])) {
    return "write";
  }
  return "unknown";
}

function policyLevelFor(category: CommandCategory, command: string, config: PermissionsConfig): PermissionLevel {
  const lower = command.toLowerCase();
  if (category === "read") {
    return config.defaults.read;
  }
  if (category === "build") {
    return config.defaults.build;
  }
  if (category === "test") {
    return config.defaults.test;
  }
  if (category === "network") {
    return lower.includes("install") || lower.includes(" add ") ? config.defaults.install : config.defaults.network;
  }
  if (category === "git") {
    if (startsWithAny(lower, ["git status", "git diff", "git log", "git show"])) {
      return config.defaults.gitRead;
    }
    if (startsWithAny(lower, ["git branch", "git switch -c"])) {
      return config.defaults.gitCheckpoint;
    }
    return config.defaults.gitWrite;
  }
  if (category === "write") {
    return config.defaults.write;
  }
  if (category === "delete") {
    return config.defaults.delete;
  }
  return config.defaults.unknown;
}

function riskFor(category: CommandCategory, policyLevel: PermissionLevel, command: string, hasOperators: boolean): RiskLevel {
  const lower = command.toLowerCase();
  if (policyLevel === "blocked") {
    return "blocked";
  }
  if (includesAny(lower, ["git reset", "git clean", "remove-item -recurse", "set-executionpolicy", "format ", "diskpart"])) {
    return "blocked";
  }
  if (category === "delete" || category === "network") {
    return "high";
  }
  if (hasOperators || category === "write" || category === "unknown") {
    return "medium";
  }
  if (category === "build" || category === "test" || category === "git") {
    return "medium";
  }
  return "low";
}

function expectedWrites(category: CommandCategory, command: string) {
  const lower = command.toLowerCase();
  if (category === "read") {
    return [];
  }
  if (category === "build") {
    return ["Build artifacts under the project working directory"];
  }
  if (category === "test") {
    return ["Test caches, coverage, or temporary files under the project working directory"];
  }
  if (category === "network") {
    return lower.startsWith("git clone")
      ? ["Clone target folder", "Git object database"]
      : ["Dependency folders, package cache, or downloaded files"];
  }
  if (category === "git") {
    if (startsWithAny(lower, ["git branch", "git switch -c"])) {
      return [".git refs"];
    }
    if (startsWithAny(lower, ["git add"])) {
      return [".git index"];
    }
    if (startsWithAny(lower, ["git commit"])) {
      return [".git objects", ".git refs"];
    }
    return [".git metadata"];
  }
  if (category === "delete") {
    return ["Files or folders targeted by the command"];
  }
  if (category === "write") {
    return ["Files or folders targeted by the command"];
  }
  return ["Unknown write surface"];
}

export async function createCommandPreview(input: {
  command: string;
  cwd: string;
  projectId: string;
  reason: string;
}): Promise<CommandPreview> {
  const config = await readPermissions();
  const command = normalizeCommand(input.command);
  const resolvedCwd = path.resolve(input.cwd);
  const hasOperators = shellOperatorPattern.test(command);
  const blockedPattern = blockedByPattern(command, config);
  const category = classify(command);
  let policyLevel = blockedPattern ? "blocked" : policyLevelFor(category, command, config);
  const risk = blockedPattern ? "blocked" : riskFor(category, policyLevel, command, hasOperators);
  const warnings: string[] = [];
  const project = await getProject(input.projectId);

  if (hasOperators) {
    warnings.push("Shell operators or redirection were detected; chained commands are treated as higher risk.");
  }
  if (blockedPattern) {
    warnings.push(`Blocked pattern detected: ${blockedPattern}`);
  }
  if (!path.isAbsolute(input.cwd)) {
    warnings.push("Working directory should be an absolute path.");
  }
  if (project) {
    const relativeToProject = path.relative(project.rootPath, resolvedCwd);
    const outsideProjectRoot = relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject);
    const writesOrMutates = category !== "read";
    if (outsideProjectRoot && writesOrMutates) {
      policyLevel = config.defaults.outsideProjectWrite;
      warnings.push("The working directory is outside the registered project root for a mutating command.");
    }
  }

  const finalRisk = policyLevel === "blocked" ? "blocked" : riskFor(category, policyLevel, command, hasOperators);

  return {
    command,
    cwd: resolvedCwd,
    projectId: input.projectId,
    reason: input.reason,
    category,
    risk: finalRisk,
    expectedWrites: expectedWrites(category, command),
    requiresApproval: policyLevel !== "auto",
    policyLevel,
    warnings
  };
}
