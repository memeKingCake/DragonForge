import type { AgentRole, AgentTask, ProjectScanSummary, RegisteredProject } from "@dragonforge/shared";

const roleGuidance: Record<AgentRole, string> = {
  architect:
    "Break the work into safe, ordered steps. Prefer checkpoints, small diffs, and visible command previews.",
  explorer:
    "Read the codebase, map relevant files, identify likely causes, and avoid making changes.",
  implementer:
    "Propose tightly scoped patches. Do not edit files directly from the connector run; DragonForge must approve writes first.",
  "build-runner":
    "Suggest exact PowerShell commands with cwd, reason, expected writes, and risk. Do not execute mutating commands directly.",
  reviewer:
    "Review proposed changes, call out regressions, missing tests, risky assumptions, and safer alternatives."
};

function formatScan(scan?: ProjectScanSummary) {
  if (!scan) {
    return "No DragonForge project scan has been recorded yet.";
  }
  return [
    `Scanned at: ${scan.scannedAt}`,
    `Files: ${scan.fileCount}`,
    `Source files: ${scan.sourceCount}`,
    `Project types: ${scan.projectTypes.join(", ") || "none"}`,
    `Markers: ${scan.markers.join(", ") || "none"}`,
    `Asset folders: ${scan.assetFolders.join(", ") || "none"}`,
    `Build folders: ${scan.buildFolders.join(", ") || "none"}`,
    `SDL signals: ${scan.sdlSignals.join("; ") || "none"}`,
    `Suggested commands: ${scan.suggestedCommands.map((command) => command.command).join("; ") || "none"}`
  ].join("\n");
}

function isAssetLoadingTask(task: AgentTask) {
  return /asset|loading|path|sdl/i.test(`${task.title}\n${task.prompt}`);
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAttachments(task: AgentTask) {
  if (!task.attachments?.length) {
    return "No user image attachments.";
  }

  return task.attachments
    .map((attachment) => {
      const pathText = attachment.storedPath ? ` Stored path: ${attachment.storedPath}` : "";
      return `- ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)}).${pathText}`;
    })
    .join("\n");
}

export function composeAgentPrompt(task: AgentTask, project: RegisteredProject) {
  const assetChecklist = isAssetLoadingTask(task)
    ? [
        "Asset-loading focus:",
        "- Map asset load calls and expected paths.",
        "- Compare expected paths to actual files and registered asset folders.",
        "- Check working-directory assumptions, packaged folder structure, and path separators.",
        "- Recommend minimal logging around failed loads.",
        "- Prefer small, reversible patches and exact validation commands."
      ].join("\n")
    : "";

  return [
    `You are DragonForge ${task.role}.`,
    roleGuidance[task.role],
    "",
    "DragonForge safety policy:",
    "- The registered project root is the only intended working area.",
    "- Do not install dependencies, write files, delete files, reset Git, clean Git, or overwrite user work from this connector run.",
    "- If a command is needed, propose it as a DragonForge command preview with command, cwd, reason, category, risk, and expected writes.",
    "- If a file edit is needed, provide a proposed unified diff or clear patch plan. DragonForge will route writes through approval later.",
    "- Keep the result practical and scoped to the task.",
    "",
    `Project: ${project.name}`,
    `Project ID: ${project.id}`,
    `Project root: ${project.rootPath}`,
    "",
    "Project scan summary:",
    formatScan(project.lastScan),
    "",
    "User image attachments:",
    formatAttachments(task),
    "Use attached renders or screenshots as reference artifacts when the connector can inspect local image paths. If you cannot inspect image pixels, still use the filenames and the user's prompt as context and say what visual detail you need.",
    "",
    assetChecklist,
    assetChecklist ? "" : "",
    `Task title: ${task.title}`,
    "Task prompt:",
    task.prompt,
    "",
    "Return format:",
    "1. Findings",
    "2. Proposed command previews",
    "3. Proposed file changes",
    "4. Verification plan",
    "5. Open questions"
  ]
    .filter(Boolean)
    .join("\n");
}
