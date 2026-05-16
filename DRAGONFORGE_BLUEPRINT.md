# Dragonforge Technical Blueprint

Dragonforge is a Windows-first AI coding agent for system application development, game development, and debugging existing projects. The MVP focuses on a local TypeScript/Node server, a dark dashboard, PowerShell command approvals, Git-safe project operations, and connectors for Claude and Codex.

## 1. Folder Structure

Final install target:

```text
C:\AiAgents\DragonForge
|-- apps
|   |-- dashboard
|   `-- server
|-- agents
|   |-- roles
|   |-- connectors
|   `-- prompts
|-- projects
|   |-- registered.json
|   `-- workspaces
|-- logs
|   |-- commands
|   |-- agents
|   `-- audits
|-- config
|   |-- dragonforge.json
|   |-- permissions.json
|   `-- models.json
|-- scripts
|   |-- launch.ps1
|   |-- doctor.ps1
|   `-- init-project.ps1
`-- README.md
```

Development repo structure:

```text
DragonForge
|-- apps
|   |-- dashboard
|   |   |-- src
|   |   |-- public
|   |   `-- package.json
|   `-- server
|       |-- src
|       |   |-- api
|       |   |-- agents
|       |   |-- commands
|       |   |-- config
|       |   |-- git
|       |   |-- projects
|       |   `-- index.ts
|       `-- package.json
|-- packages
|   |-- shared
|   `-- ui
|-- config
|-- scripts
|-- docs
|-- package.json
`-- README.md
```

## 2. Dashboard Pages

The dashboard should open at `http://localhost:<port>` from the Windows launcher.

Core MVP pages:

- `Dashboard`: active projects, recent runs, approvals waiting, agent status.
- `Projects`: local folder registration, GitHub clone/import, project metadata.
- `Project Workspace`: file scan summary, Git status, build/test commands, agent task panel.
- `Command Preview`: exact PowerShell command, working directory, writes, risk level, approval buttons.
- `Approvals`: queued file edits, shell commands, Git operations, network operations.
- `Logs`: command history, agent transcript, diff approvals, errors.
- `Settings`: model connectors, install paths, command policy, Git policy.

Post-MVP pages:

- `Releases`: build artifacts, packaging profiles, Steam-ready export folders.
- `Model Routing`: assign Claude, Codex, Kimi, and DeepSeek to roles.
- `Project Templates`: SDL/C, CMake, .NET, Unity, C++ desktop apps.

## 3. Backend API Routes

Base server: local-only Node/TypeScript API, bound to `127.0.0.1` by default.

Project routes:

- `GET /api/projects`
- `POST /api/projects/register-local`
- `POST /api/projects/clone`
- `GET /api/projects/:id`
- `GET /api/projects/:id/status`
- `POST /api/projects/:id/scan`

Command routes:

- `POST /api/commands/preview`
- `POST /api/commands/request-approval`
- `POST /api/commands/:id/approve`
- `POST /api/commands/:id/reject`
- `GET /api/commands/:id/log`

Agent routes:

- `POST /api/agents/tasks`
- `GET /api/agents/tasks/:id`
- `POST /api/agents/tasks/:id/cancel`
- `GET /api/agents/runs/:id/log`

Git routes:

- `GET /api/git/:projectId/status`
- `POST /api/git/:projectId/checkpoint`
- `POST /api/git/:projectId/branch`
- `POST /api/git/:projectId/stage`
- `POST /api/git/:projectId/commit`
- `POST /api/git/:projectId/diff`
- `POST /api/git/:projectId/rollback-checkpoint`

Settings routes:

- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/models`
- `PATCH /api/models/:provider`
- `GET /api/permissions`
- `PATCH /api/permissions`

## 4. Permission System

Dragonforge should behave like a careful local development assistant, not an unrestricted automation runner.

Permission levels:

- `auto`: safe read-only operations.
- `preview`: show the action and risk label before running.
- `approval`: require explicit user approval.
- `blocked`: never run from the agent.

Default policy:

| Action | Default | Notes |
| --- | --- | --- |
| Read files in registered project | auto | Limited to registered roots. |
| Search files | auto | Use `rg` where available. |
| Write files | approval | Show diff first. |
| Run build/test command | preview | Approval can be remembered per project command. |
| Install dependencies | approval | Network and disk-changing operation. |
| Git status/diff/log | auto | Read-only. |
| Git branch/checkpoint | preview | Safe but visible. |
| Git commit | approval | User should review. |
| Git reset/clean/checkout overwrite | blocked | Allow only manual override. |
| Delete files | approval | Recursive deletes require stronger warning. |
| Network calls | approval | Includes GitHub clone and package downloads. |
| Outside project root writes | blocked | Exceptions only through settings. |

Every approved action should create an audit entry:

```json
{
  "id": "cmd_...",
  "time": "2026-04-28T00:00:00.000Z",
  "projectId": "labyrinth-of-the-dragon",
  "actor": "user",
  "action": "approve_command",
  "command": "cmake --build build_mingw64",
  "cwd": "C:\\path\\to\\project",
  "risk": "medium"
}
```

## 5. Agent Roles

MVP roles:

- `Architect`: breaks tasks into steps, chooses safe workflow, updates plan.
- `Explorer`: reads code, maps project structure, finds likely causes.
- `Implementer`: edits files after approval and keeps patches scoped.
- `Build Runner`: previews and runs PowerShell commands under policy.
- `Reviewer`: checks diffs, tests, risky changes, and regression points.

Suggested first model routing:

| Role | Primary | Secondary |
| --- | --- | --- |
| Architect | Claude | Codex |
| Explorer | Codex | Claude |
| Implementer | Codex | Claude |
| Build Runner | Codex | Claude |
| Reviewer | Claude | Codex |

Later routing:

- `Kimi`: large-context code reading and repository-wide exploration.
- `DeepSeek`: cost-effective implementation and refactoring passes.
- `Ollama`: optional offline/local models for private or disconnected work.

## 6. PowerShell Command Rules

All shell execution goes through a command preview object before running.

Command preview fields:

```ts
type CommandPreview = {
  command: string;
  cwd: string;
  projectId: string;
  reason: string;
  category: "read" | "build" | "test" | "git" | "network" | "write" | "delete" | "unknown";
  risk: "low" | "medium" | "high" | "blocked";
  expectedWrites: string[];
  requiresApproval: boolean;
};
```

Rules:

- Always run with an explicit working directory.
- Prefer direct executable calls over complex shell strings.
- Disallow hidden destructive aliases.
- Detect shell operators such as `;`, `&&`, `||`, pipes, redirects, and command substitution.
- Treat chained commands as higher risk.
- Log stdout, stderr, exit code, duration, and cwd.
- Require approval for dependency installs, network calls, writes outside project roots, and destructive commands.

Blocked by default:

- `Remove-Item -Recurse -Force`
- `git reset --hard`
- `git clean -fd`
- `git checkout -- .`
- `Set-ExecutionPolicy`
- Formatting or deleting whole drives or user profile folders.

## 7. Git Safety Workflow

Before agent edits:

1. Confirm the target folder is a Git repo or offer to initialize one.
2. Read `git status --short`.
3. Detect uncommitted user changes.
4. Create a Dragonforge checkpoint branch or commit when appropriate.
5. Keep all generated changes visible in diff preview.

Recommended branch format:

```text
dragonforge/<project-slug>/<task-slug>
```

Checkpoint options:

- `branch`: create a task branch before edits.
- `stash`: only when user explicitly asks.
- `commit`: create a checkpoint commit with a clear message.
- `snapshot`: copy critical files into Dragonforge-managed backups for non-Git folders.

Never silently overwrite:

- untracked assets
- user-edited source files
- build scripts
- project configuration
- save data or game content

## 8. Claude/Codex Integration Strategy

Dragonforge should start as an orchestrator around installed local tools rather than a new model host.

Connector interface:

```ts
type AgentConnector = {
  id: "claude" | "codex" | "kimi" | "deepseek";
  displayName: string;
  isAvailable(): Promise<boolean>;
  describeCapabilities(): Promise<ModelCapabilities>;
  runTask(input: AgentTaskInput): Promise<AgentTaskResult>;
};
```

MVP connector behavior:

- Detect installed CLIs and configured paths.
- Use project-local working directories.
- Pass compact task prompts with explicit policy limits.
- Capture transcript and result artifacts.
- Do not let model CLIs execute unrestricted shell commands unless Dragonforge owns the approval layer.

Claude connector:

- Best for planning, code review, broader reasoning, and alternative designs.
- Initial integration can open a guided prompt/run flow if full automation is not available.

Codex connector:

- Best for codebase edits, tests, debugging loops, and terminal-driven development.
- Initial integration should mirror this chat workflow: inspect, edit, run focused commands, report.

Important MVP boundary:

- Dragonforge owns project registration, Git safety, command approval, and logs.
- Individual model tools provide reasoning and code changes inside those boundaries.

## 9. First SDL Project Workflow

First test project: `LabyrinthOfTheDragon` SDL/C game.

Project detection:

- Search for `CMakeLists.txt`, `Makefile`, `.sln`, `.vcxproj`, `src`, `assets`, `data`, `res`.
- Detect SDL dependencies from CMake, include paths, package config, or source includes.
- Detect build folders such as `build`, `build_mingw64`, `out`, `bin`, `dist`.

Suggested workflow:

1. Register local folder.
2. Scan source tree and asset folders.
3. Read build docs and existing scripts.
4. Run read-only Git status and project scan.
5. Preview build command.
6. Build with approved PowerShell command.
7. Parse compiler/linker errors.
8. Assign Explorer to locate failing code or missing asset paths.
9. Assign Implementer to make a small patch.
10. Show diff for approval.
11. Rebuild and run smoke test.
12. Package release folder only after a clean build.

SDL/C support commands:

- Detect CMake configure command.
- Detect CMake build command.
- Detect required DLLs for Windows release.
- Copy assets into release folder using a previewed packaging plan.
- Validate asset paths with a file existence scan.

For the `Stabilize asset loading` class of task, Dragonforge should:

- map all asset load calls
- list expected asset paths
- compare expected paths to actual files
- normalize path separators
- check working directory assumptions
- add logging around failed loads
- verify packaged folder structure

## 10. MVP Development Checklist

Milestone 1: Agent shell

- [ ] Create TypeScript monorepo.
- [ ] Build local Node server.
- [ ] Build dark dashboard.
- [ ] Add launcher script.
- [ ] Add project registration for local folders.
- [ ] Add GitHub clone/import field.
- [ ] Add project scan endpoint.
- [ ] Add command preview endpoint.
- [ ] Add approval queue.
- [ ] Add command execution logs.
- [ ] Add settings files under `config`.

Milestone 2: Model connectors

- [ ] Detect Claude CLI.
- [ ] Detect Codex CLI.
- [ ] Add connector interface.
- [ ] Add model availability page.
- [ ] Add task prompt composer.
- [ ] Capture model transcripts.
- [ ] Route tasks by role.

Milestone 3: Safe file editing

- [ ] Add file diff preview.
- [ ] Add approval workflow for writes.
- [ ] Add Git status warnings.
- [ ] Add branch/checkpoint workflow.
- [ ] Add rollback from checkpoint.

Milestone 4: SDL/C project support

- [ ] Detect SDL/C/CMake projects.
- [ ] Add build command suggestions.
- [ ] Add compiler error parser.
- [ ] Add asset path scanner.
- [ ] Add Windows release packaging profile.
- [ ] Test with `LabyrinthOfTheDragon`.

Milestone 5: Expansion

- [ ] Add C#/.NET profile.
- [ ] Add Unity profile.
- [ ] Add C++ desktop profile.
- [ ] Add Kimi connector.
- [ ] Add DeepSeek connector.
- [ ] Add Ollama/local model connector.

## Recommended First Build

Build Milestone 1 as the first real coding step:

1. `apps/server`: Express or Fastify API in TypeScript.
2. `apps/dashboard`: Vite + React dark dashboard.
3. `packages/shared`: shared route types and permission models.
4. `scripts/launch.ps1`: starts server and opens dashboard.
5. `config/permissions.json`: default policy.

Recommended stack:

- Node.js + TypeScript
- Vite + React
- Fastify for the local API
- Zod for request validation
- simple JSON config files for MVP storage
- PowerShell as the only shell target

This keeps Dragonforge small enough to build quickly, while leaving room for a stronger database, queue, and model orchestration layer later.
