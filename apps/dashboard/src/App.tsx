import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  FolderGit2,
  GitBranch,
  ImagePlus,
  LayoutDashboard,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  X
} from "lucide-react";
import type {
  AgentTask,
  AgentTaskAttachment,
  AgentRole,
  CommandPreview,
  CommandRecord,
  ConnectorAvailability,
  DragonforgeSettings,
  ModelsConfig,
  PermissionsConfig,
  RegisteredProject
} from "@dragonforge/shared";
import { apiGet, apiSend } from "./api";

type Page = "dashboard" | "projects" | "workspace" | "commands" | "approvals" | "logs" | "settings";

const navItems: Array<{ page: Page; label: string; icon: typeof LayoutDashboard }> = [
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "projects", label: "Projects", icon: FolderGit2 },
  { page: "workspace", label: "Workspace", icon: Search },
  { page: "commands", label: "Command Preview", icon: SquareTerminal },
  { page: "approvals", label: "Approvals", icon: ShieldCheck },
  { page: "logs", label: "Logs", icon: ScrollText },
  { page: "settings", label: "Settings", icon: Settings }
];

const roles: AgentRole[] = ["architect", "explorer", "implementer", "build-runner", "reviewer"];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [projects, setProjects] = useState<RegisteredProject[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [connectors, setConnectors] = useState<ConnectorAvailability[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [status, setStatus] = useState("Ready");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  async function refresh() {
    const [projectList, commandList, taskList, connectorList] = await Promise.all([
      apiGet<RegisteredProject[]>("/api/projects"),
      apiGet<CommandRecord[]>("/api/commands"),
      apiGet<AgentTask[]>("/api/agents/tasks"),
      apiGet<ConnectorAvailability[]>("/api/agents/connectors")
    ]);
    setProjects(projectList);
    setCommands(commandList);
    setTasks(taskList);
    setConnectors(connectorList);
    setSelectedProjectId((current) =>
      current && projectList.some((project) => project.id === current) ? current : projectList[0]?.id ?? ""
    );
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error.message));
  }, []);

  const queued = commands.filter((command) => command.status === "queued");
  const recent = commands.slice(0, 5);
  const hasRunningTasks = tasks.some((task) => task.status === "running");

  useEffect(() => {
    if (!hasRunningTasks) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refresh().catch((error) => setStatus(error.message));
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [hasRunningTasks]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DF</div>
          <div>
            <strong>DragonForge</strong>
            <span>Local agent shell</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={page === item.page ? "nav-item active" : "nav-item"}
                key={item.page}
                onClick={() => setPage(item.page)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{navItems.find((item) => item.page === page)?.label}</h1>
            <p>{status}</p>
          </div>
          <button className="icon-button" onClick={() => refresh().catch((error) => setStatus(error.message))} title="Refresh">
            <RefreshCw size={18} />
          </button>
        </header>

        {page === "dashboard" && <DashboardPage projects={projects} queued={queued} recent={recent} tasks={tasks} connectors={connectors} />}
        {page === "projects" && (
          <ProjectsPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            refresh={refresh}
            setStatus={setStatus}
          />
        )}
        {page === "workspace" && <WorkspacePage project={selectedProject} tasks={tasks} connectors={connectors} refresh={refresh} setStatus={setStatus} />}
        {page === "commands" && (
          <CommandPreviewPage project={selectedProject} setStatus={setStatus} refresh={refresh} />
        )}
        {page === "approvals" && <ApprovalsPage commands={queued} refresh={refresh} setStatus={setStatus} />}
        {page === "logs" && <LogsPage commands={commands} tasks={tasks} />}
        {page === "settings" && <SettingsPage connectors={connectors} setStatus={setStatus} />}
      </main>
    </div>
  );
}

function DashboardPage({
  projects,
  queued,
  recent,
  tasks,
  connectors
}: {
  projects: RegisteredProject[];
  queued: CommandRecord[];
  recent: CommandRecord[];
  tasks: AgentTask[];
  connectors: ConnectorAvailability[];
}) {
  const runningTasks = tasks.filter((task) => task.status === "running");

  return (
    <section className="content-grid">
      <MetricCard label="Active projects" value={projects.length} icon={FolderGit2} />
      <MetricCard label="Approvals waiting" value={queued.length} icon={ShieldCheck} />
      <MetricCard label="AI working now" value={runningTasks.length} icon={Activity} />
      <div className="panel span-3">
        <PanelHeader title="AI activity" />
        {runningTasks.length > 0 ? (
          <div className="task-list">
            {runningTasks.map((task) => (
              <div className="task-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.role} / {task.providerId ?? "selecting provider"}</span>
                </div>
                <TaskActivityIndicator task={task} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="No AI task is running right now." />
        )}
      </div>
      <div className="panel span-2">
        <PanelHeader title="Projects" />
        <div className="list">
          {projects.map((project) => (
            <div className="list-row" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <span>{project.rootPath}</span>
              </div>
              <small>{project.lastScan?.projectTypes.join(", ") || "Not scanned"}</small>
            </div>
          ))}
          {projects.length === 0 && <EmptyState text="No projects registered yet." />}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Agent status" />
        <div className="role-list">
          {roles.map((role) => (
            <div className="role-row" key={role}>
              <span>{role}</span>
              <small>{connectorLabelForRole(role, connectors)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Connectors" />
        <ConnectorList connectors={connectors} />
      </div>
      <div className="panel span-3">
        <PanelHeader title="Recent commands" />
        <CommandTable commands={recent} />
      </div>
    </section>
  );
}

function ProjectsPage({
  projects,
  selectedProjectId,
  setSelectedProjectId,
  refresh,
  setStatus
}: {
  projects: RegisteredProject[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  refresh: () => Promise<void>;
  setStatus: (value: string) => void;
}) {
  const [rootPath, setRootPath] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePreview, setClonePreview] = useState<CommandPreview | null>(null);

  async function register() {
    const project = await apiSend<RegisteredProject>("/api/projects/register-local", "POST", { rootPath });
    setRootPath("");
    setSelectedProjectId(project.id);
    setStatus(`Registered ${project.name}`);
    await refresh();
  }

  async function previewClone() {
    const result = await apiSend<{ preview: CommandPreview; targetPath: string }>("/api/projects/clone", "POST", { url: cloneUrl });
    setClonePreview(result.preview);
    setStatus(`Clone target: ${result.targetPath}`);
  }

  async function removeProject(project: RegisteredProject) {
    const confirmed = window.confirm(`Remove ${project.name} from DragonForge? The project files will stay on disk.`);
    if (!confirmed) {
      return;
    }

    await apiSend<RegisteredProject>(`/api/projects/${project.id}`, "DELETE");
    if (selectedProjectId === project.id) {
      const nextProject = projects.find((candidate) => candidate.id !== project.id);
      setSelectedProjectId(nextProject?.id ?? "");
    }
    setStatus(`Removed ${project.name} from DragonForge`);
    await refresh();
  }

  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title="Register local folder" />
        <div className="form-row">
          <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="C:\path\to\project" />
          <button className="primary-button" onClick={() => register().catch((error) => setStatus(error.message))} title="Register project">
            <Plus size={18} />
            <span>Register</span>
          </button>
        </div>
        <div className="list">
          {projects.map((project) => (
            <div className={project.id === selectedProjectId ? "project-row active" : "project-row"} key={project.id}>
              <button className="project-select" onClick={() => setSelectedProjectId(project.id)} title={`Open ${project.name}`}>
                <strong>{project.name}</strong>
                <span>{project.rootPath}</span>
              </button>
              <button
                className="icon-button danger-icon"
                onClick={() => removeProject(project).catch((error) => setStatus(error.message))}
                title={`Remove ${project.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {projects.length === 0 && <EmptyState text="No projects registered yet." />}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="GitHub clone/import" />
        <div className="form-row">
          <input value={cloneUrl} onChange={(event) => setCloneUrl(event.target.value)} placeholder="https://github.com/org/repo.git" />
          <button className="secondary-button" onClick={() => previewClone().catch((error) => setStatus(error.message))} title="Preview clone">
            <GitBranch size={18} />
            <span>Preview</span>
          </button>
        </div>
        {clonePreview && <PreviewCard preview={clonePreview} />}
      </div>
    </section>
  );
}

function WorkspacePage({
  project,
  tasks,
  connectors,
  refresh,
  setStatus
}: {
  project?: RegisteredProject;
  tasks: AgentTask[];
  connectors: ConnectorAvailability[];
  refresh: () => Promise<void>;
  setStatus: (value: string) => void;
}) {
  const [gitStatus, setGitStatus] = useState("");
  const scan = project?.lastScan;

  async function scanProject() {
    if (!project) {
      return;
    }
    await apiSend<RegisteredProject>(`/api/projects/${project.id}/scan`, "POST");
    setStatus(`Scanned ${project.name}`);
    await refresh();
  }

  async function loadGitStatus() {
    if (!project) {
      return;
    }
    const result = await apiGet<{ stdout: string; stderr: string }>(`/api/git/${project.id}/status`);
    setGitStatus(result.stdout || result.stderr);
  }

  if (!project) {
    return <EmptyState text="Register a project to open a workspace." />;
  }

  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title={project.name} />
        <p className="path-text">{project.rootPath}</p>
        <div className="toolbar">
          <button className="primary-button" onClick={() => scanProject().catch((error) => setStatus(error.message))} title="Scan project">
            <Search size={18} />
            <span>Scan</span>
          </button>
          <button className="secondary-button" onClick={() => loadGitStatus().catch((error) => setStatus(error.message))} title="Read Git status">
            <GitBranch size={18} />
            <span>Git status</span>
          </button>
        </div>
        {scan && (
          <div className="scan-grid">
            <MetricCard label="Files" value={scan.fileCount} icon={ScrollText} />
            <MetricCard label="Sources" value={scan.sourceCount} icon={Search} />
            <MetricCard label="Build dirs" value={scan.buildFolders.length} icon={SquareTerminal} />
          </div>
        )}
      </div>
      <div className="panel">
        <PanelHeader title="Scan summary" />
        {scan ? (
          <div className="summary">
            <LabelList label="Types" values={scan.projectTypes} />
            <LabelList label="Markers" values={scan.markers} />
            <LabelList label="Assets" values={scan.assetFolders} />
            <LabelList label="SDL signals" values={scan.sdlSignals} />
            <LabelList label="Suggested commands" values={scan.suggestedCommands.map((command) => command.command)} />
          </div>
        ) : (
          <EmptyState text="No scan has been run for this project." />
        )}
      </div>
      <div className="panel span-2">
        <PanelHeader title="Git output" />
        <pre className="terminal">{gitStatus || "No Git status loaded."}</pre>
      </div>
      <AgentTaskPanel project={project} tasks={tasks} connectors={connectors} refresh={refresh} setStatus={setStatus} />
    </section>
  );
}

function makeClientId() {
  return `img_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function fileToImageAttachment(file: File): Promise<AgentTaskAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: makeClientId(),
        kind: "image",
        name: file.name,
        mimeType: file.type || "image/png",
        size: file.size,
        dataUrl: String(reader.result)
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function AgentTaskPanel({
  project,
  tasks,
  connectors,
  refresh,
  setStatus
}: {
  project: RegisteredProject;
  tasks: AgentTask[];
  connectors: ConnectorAvailability[];
  refresh: () => Promise<void>;
  setStatus: (value: string) => void;
}) {
  const [role, setRole] = useState<AgentRole>("explorer");
  const [providerId, setProviderId] = useState<string>("auto");
  const [title, setTitle] = useState("Stabilize asset loading");
  const [prompt, setPrompt] = useState(
    "Map all asset load calls, list expected asset paths, compare them to actual files, check working directory assumptions, normalize path separator issues, and propose minimal logging plus validation commands. Do not edit files directly yet."
  );
  const [attachments, setAttachments] = useState<AgentTaskAttachment[]>([]);
  const projectTasks = tasks.filter((task) => task.projectId === project.id).slice(0, 6);

  async function addImages(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const oversized = images.filter((file) => file.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      setStatus(`Image too large: ${oversized[0].name}. Max size is 5 MB.`);
      return;
    }

    const next = await Promise.all(images.map(fileToImageAttachment));
    setAttachments((current) => [...current, ...next].slice(0, 6));
    if (attachments.length + next.length > 6) {
      setStatus("Attached the first 6 images. Remove one to add more.");
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function runTask() {
    const task = await apiSend<AgentTask>("/api/agents/tasks", "POST", {
      projectId: project.id,
      role,
      providerId: providerId === "auto" ? undefined : providerId,
      title,
      prompt,
      attachments
    });
    await apiSend<AgentTask>(`/api/agents/tasks/${task.id}/run`, "POST");
    setAttachments([]);
    setStatus(`Agent task started: ${title}`);
    await refresh();
  }

  return (
    <div className="panel span-2">
      <PanelHeader title="Agent task panel" />
      <div className="agent-task-grid">
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as AgentRole)}>
            {roles.map((candidate) => (
              <option value={candidate} key={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="auto">auto route</option>
            {connectors
              .filter((connector) => connector.enabled)
              .map((connector) => (
                <option value={connector.id} key={connector.id}>
                  {connector.displayName} {connector.available ? "" : "(missing)"}
                </option>
              ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <label>
        Prompt
        <textarea className="task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} spellCheck={false} />
      </label>
      <div className="attachment-panel">
        <div className="attachment-toolbar">
          <label className="secondary-button file-picker" title="Attach image references">
            <ImagePlus size={18} />
            <span>Add images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                addImages(event.target.files).catch((error) => setStatus(error.message));
                event.currentTarget.value = "";
              }}
            />
          </label>
          <small>{attachments.length}/6 images attached</small>
        </div>
        {attachments.length > 0 && (
          <div className="attachment-grid">
            {attachments.map((attachment) => (
              <div className="attachment-tile" key={attachment.id}>
                <img src={attachment.dataUrl} alt={attachment.name} />
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
                </div>
                <button className="icon-button" onClick={() => removeAttachment(attachment.id ?? "")} title={`Remove ${attachment.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="toolbar">
        <button className="primary-button" onClick={() => runTask().catch((error) => setStatus(error.message))} title="Run agent task">
          <Bot size={18} />
          <span>Run task</span>
        </button>
      </div>
      <div className="task-list">
        {projectTasks.map((task) => (
          <div className="task-row" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.role} / {task.providerId ?? "unassigned"} / {task.status}</span>
            </div>
            <TaskActivityIndicator task={task} />
            {task.attachments?.length > 0 && (
              <div className="task-attachments">
                <Paperclip size={14} />
                <span>{task.attachments.map((attachment) => attachment.name).join(", ")}</span>
              </div>
            )}
            <TaskRunNotice task={task} />
            <TaskResultBlock task={task} />
            {task.error && <small>{task.error}</small>}
          </div>
        ))}
        {projectTasks.length === 0 && <EmptyState text="No agent tasks for this project yet." />}
      </div>
    </div>
  );
}

function TaskRunNotice({ task }: { task: AgentTask }) {
  if (!task.providerId || task.status === "queued") {
    return null;
  }

  return (
    <div className="task-notice">
      <span>analysis only</span>
      <p>DragonForge did not edit code in this run. Proposed patches still need a separate approval step.</p>
    </div>
  );
}

function TaskActivityIndicator({ task }: { task: AgentTask }) {
  const activity = task.activity;
  const heartbeatAt = activity?.lastHeartbeatAt ?? task.updatedAt;
  const ageMs = Math.max(0, Date.now() - new Date(heartbeatAt).getTime());
  const recentHeartbeat = ageMs <= 15_000;
  const ageLabel = formatRelativeAge(ageMs);

  if (task.status === "running") {
    return (
      <div className={recentHeartbeat ? "task-activity live" : "task-activity stale"}>
        <span className="activity-dot" aria-hidden="true" />
        <strong>{recentHeartbeat ? activity?.message ?? "AI is working on the task." : "Waiting for a fresh heartbeat."}</strong>
        <small>{recentHeartbeat ? `Heartbeat ${ageLabel}` : `Last heartbeat ${ageLabel}`}</small>
      </div>
    );
  }

  if (!activity) {
    return null;
  }

  return (
    <div className={`task-activity ${activity.state}`}>
      <span className="activity-dot" aria-hidden="true" />
      <strong>{activity.message}</strong>
      <small>{formatRelativeTimestamp(heartbeatAt)}</small>
    </div>
  );
}

function TaskResultBlock({ task }: { task: AgentTask }) {
  const [expanded, setExpanded] = useState(false);
  const output = task.result?.output;

  if (!output) {
    return null;
  }

  const isLong = output.length > 1400;
  const visibleOutput = expanded || !isLong ? output : `${output.slice(0, 1400)}\n\n...result preview truncated...`;

  return (
    <div className="task-result">
      <pre className={expanded ? "task-output expanded" : "task-output"}>{visibleOutput}</pre>
      <div className="task-result-actions">
        {isLong && (
          <button className="secondary-button compact-button" onClick={() => setExpanded((current) => !current)} title="Toggle full result">
            <ScrollText size={16} />
            <span>{expanded ? "Collapse result" : "Show full result"}</span>
          </button>
        )}
        {task.transcriptPath && <small>{task.transcriptPath}</small>}
      </div>
    </div>
  );
}

function CommandPreviewPage({
  project,
  setStatus,
  refresh
}: {
  project?: RegisteredProject;
  setStatus: (value: string) => void;
  refresh: () => Promise<void>;
}) {
  const [command, setCommand] = useState("git status --short");
  const [reason, setReason] = useState("Inspect project state");
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const cwd = project?.rootPath ?? "";

  async function createPreview() {
    if (!project) {
      return;
    }
    const result = await apiSend<CommandPreview>("/api/commands/preview", "POST", {
      projectId: project.id,
      cwd,
      command,
      reason
    });
    setPreview(result);
  }

  async function queueApproval() {
    if (!preview) {
      return;
    }
    await apiSend<CommandRecord>("/api/commands/request-approval", "POST", { preview, actor: "user" });
    setStatus("Command added to approval queue");
    await refresh();
  }

  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title="PowerShell command" />
        <label>
          Command
          <input value={command} onChange={(event) => setCommand(event.target.value)} />
        </label>
        <label>
          Reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label>
          Working directory
          <input value={cwd} readOnly />
        </label>
        <div className="toolbar">
          <button className="primary-button" onClick={() => createPreview().catch((error) => setStatus(error.message))} title="Create command preview">
            <Search size={18} />
            <span>Preview</span>
          </button>
          <button className="secondary-button" disabled={!preview} onClick={() => queueApproval().catch((error) => setStatus(error.message))} title="Queue for approval">
            <ShieldCheck size={18} />
            <span>Queue</span>
          </button>
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Preview" />
        {preview ? <PreviewCard preview={preview} /> : <EmptyState text="Create a preview to inspect policy and risk." />}
      </div>
    </section>
  );
}

function ApprovalsPage({
  commands,
  refresh,
  setStatus
}: {
  commands: CommandRecord[];
  refresh: () => Promise<void>;
  setStatus: (value: string) => void;
}) {
  async function approve(id: string) {
    const record = await apiSend<CommandRecord>(`/api/commands/${id}/approve`, "POST");
    setStatus(`Command ${record.status}`);
    await refresh();
  }

  async function reject(id: string) {
    await apiSend<CommandRecord>(`/api/commands/${id}/reject`, "POST");
    setStatus("Command rejected");
    await refresh();
  }

  return (
    <section className="panel">
      <PanelHeader title="Waiting approvals" />
      <div className="approval-list">
        {commands.map((record) => (
          <div className="approval-row" key={record.id}>
            <PreviewCard preview={record.preview} />
            <div className="approval-actions">
              <button className="primary-button" onClick={() => approve(record.id).catch((error) => setStatus(error.message))} title="Approve and run">
                <Play size={18} />
                <span>Approve</span>
              </button>
              <button className="danger-button" onClick={() => reject(record.id).catch((error) => setStatus(error.message))} title="Reject">
                <X size={18} />
                <span>Reject</span>
              </button>
            </div>
          </div>
        ))}
        {commands.length === 0 && <EmptyState text="No commands are waiting for approval." />}
      </div>
    </section>
  );
}

function LogsPage({ commands, tasks }: { commands: CommandRecord[]; tasks: AgentTask[] }) {
  const commandRows = useMemo(() => commands.filter((command) => command.status !== "queued"), [commands]);
  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title="Command history" />
        <CommandTable commands={commandRows} />
      </div>
      <div className="panel">
        <PanelHeader title="Agent transcripts" />
        <TaskTable tasks={tasks} />
      </div>
    </section>
  );
}

function SettingsPage({ connectors, setStatus }: { connectors: ConnectorAvailability[]; setStatus: (value: string) => void }) {
  const [settings, setSettings] = useState("");
  const [permissions, setPermissions] = useState("");
  const [models, setModels] = useState("");

  useEffect(() => {
    Promise.all([
      apiGet<DragonforgeSettings>("/api/settings"),
      apiGet<PermissionsConfig>("/api/permissions"),
      apiGet<ModelsConfig>("/api/models")
    ])
      .then(([settingsValue, permissionsValue, modelsValue]) => {
        setSettings(JSON.stringify(settingsValue, null, 2));
        setPermissions(JSON.stringify(permissionsValue, null, 2));
        setModels(JSON.stringify(modelsValue, null, 2));
      })
      .catch((error) => setStatus(error.message));
  }, [setStatus]);

  async function save(path: string, value: string) {
    await apiSend(path, "PATCH", JSON.parse(value));
    setStatus("Settings saved");
  }

  return (
    <section className="settings-grid">
      <div className="panel">
        <PanelHeader title="Connector availability" />
        <ConnectorList connectors={connectors} />
      </div>
      <JsonPanel title="DragonForge" value={settings} onChange={setSettings} onSave={() => save("/api/settings", settings).catch((error) => setStatus(error.message))} />
      <JsonPanel title="Permissions" value={permissions} onChange={setPermissions} onSave={() => save("/api/permissions", permissions).catch((error) => setStatus(error.message))} />
      <JsonPanel title="Models" value={models} onChange={setModels} onSave={() => save("/api/models", models).catch((error) => setStatus(error.message))} />
    </section>
  );
}

function connectorLabelForRole(role: AgentRole, connectors: ConnectorAvailability[]) {
  const candidates = connectors.filter((connector) => connector.capabilities.roles.includes(role));
  const available = candidates.find((connector) => connector.available && connector.enabled);
  if (available) {
    return `${available.displayName} ready`;
  }
  const configured = candidates.find((connector) => connector.enabled);
  return configured ? `${configured.displayName} missing` : "not routed";
}

function ConnectorList({ connectors }: { connectors: ConnectorAvailability[] }) {
  if (connectors.length === 0) {
    return <EmptyState text="Connector status has not loaded yet." />;
  }
  return (
    <div className="connector-list">
      {connectors.map((connector) => (
        <div className={connector.available ? "connector-row available" : "connector-row"} key={connector.id}>
          <div>
            <strong>{connector.displayName}</strong>
            <span>{connector.version ?? connector.reason ?? "No version reported"}</span>
          </div>
          <small>{connector.available ? "ready" : connector.enabled ? "missing" : "disabled"}</small>
        </div>
      ))}
    </div>
  );
}

function TaskTable({ tasks }: { tasks: AgentTask[] }) {
  if (tasks.length === 0) {
    return <EmptyState text="No agent transcripts yet." />;
  }
  return (
    <div className="task-list">
      {tasks.slice(0, 10).map((task) => (
        <div className="task-row" key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <span>{task.role} / {task.providerId ?? "unassigned"} / {task.status}</span>
          </div>
          <TaskActivityIndicator task={task} />
          {task.attachments?.length > 0 && (
            <div className="task-attachments">
              <Paperclip size={14} />
              <span>{task.attachments.map((attachment) => attachment.name).join(", ")}</span>
            </div>
          )}
          <TaskRunNotice task={task} />
          <TaskResultBlock task={task} />
          <small>{task.transcriptPath ?? task.error ?? task.updatedAt}</small>
        </div>
      ))}
    </div>
  );
}

function formatRelativeAge(ageMs: number) {
  if (ageMs < 1000) {
    return "just now";
  }
  if (ageMs < 60_000) {
    return `${Math.floor(ageMs / 1000)}s ago`;
  }
  if (ageMs < 60 * 60_000) {
    return `${Math.floor(ageMs / 60_000)}m ago`;
  }
  return `${Math.floor(ageMs / (60 * 60_000))}h ago`;
}

function formatRelativeTimestamp(timestamp: string) {
  return formatRelativeAge(Math.max(0, Date.now() - new Date(timestamp).getTime()));
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof LayoutDashboard }) {
  return (
    <div className="metric">
      <Icon size={20} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function PreviewCard({ preview }: { preview: CommandPreview }) {
  return (
    <div className={`preview-card risk-${preview.risk}`}>
      <div className="preview-head">
        <span>{preview.category}</span>
        <strong>{preview.risk}</strong>
      </div>
      <pre>{preview.command}</pre>
      <small>{preview.cwd}</small>
      <p>{preview.reason}</p>
      <LabelList label="Expected writes" values={preview.expectedWrites.length ? preview.expectedWrites : ["None"]} />
      <LabelList label="Warnings" values={preview.warnings.length ? preview.warnings : ["None"]} />
    </div>
  );
}

function LabelList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="label-list">
      <strong>{label}</strong>
      <div>
        {values.length > 0 ? values.map((value) => <span key={value}>{value}</span>) : <span>None</span>}
      </div>
    </div>
  );
}

function CommandTable({ commands }: { commands: CommandRecord[] }) {
  if (commands.length === 0) {
    return <EmptyState text="No command records yet." />;
  }
  return (
    <div className="command-table">
      {commands.map((record) => (
        <div className="command-row" key={record.id}>
          <span className={`status status-${record.status}`}>{record.status}</span>
          <code>{record.preview.command}</code>
          <small>{record.preview.cwd}</small>
          {record.log?.exitCode === 0 && <Check size={16} />}
        </div>
      ))}
    </div>
  );
}

function JsonPanel({
  title,
  value,
  onChange,
  onSave
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="panel">
      <PanelHeader title={title} />
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      <button className="primary-button" onClick={onSave} title={`Save ${title}`}>
        <Check size={18} />
        <span>Save</span>
      </button>
    </div>
  );
}
