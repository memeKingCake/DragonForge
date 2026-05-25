# DragonForge

DragonForge is a Windows-first local AI coding agent shell for system application work, game development, and debugging existing projects. It combines a Fastify API, a React dashboard, model connectors, command approvals, Git-aware workflows, and inspectable local storage into a tool that behaves like a careful engineering assistant rather than an unrestricted automation runner.

## Highlights

- Local-only API bound to `127.0.0.1` by default.
- Dark dashboard for projects, workspace scans, approvals, logs, settings, and live AI activity.
- Explicit PowerShell command previews with policy levels, risk labels, expected writes, and audit logging.
- Project registration, local scans, Git status helpers, and Git operation previews.
- Connector routing for Claude, Codex, and Kimi with transcript capture.
- Image attachments for agent tasks, useful for game screenshots and visual debugging.
- Heartbeat-backed activity indicators so the UI shows when an AI task is genuinely still working.
- JSON-backed MVP storage that is easy to inspect while the product is still young.

## Stack

- Node.js and TypeScript
- Fastify
- React and Vite
- Zod
- PowerShell
- JSON-backed local storage

## Repository Layout

```text
apps/
  dashboard/        React dashboard
  server/           Fastify API and local orchestration
packages/
  shared/           Shared schemas and domain types
  ui/               Shared UI package placeholder
config/             Runtime config plus shareable examples
projects/           Registered project state and managed workspaces
logs/               Runtime logs, transcripts, audits
scripts/            Windows launch and helper scripts
docs/               Architecture notes and technical manual
```

## Quick Start

Requirements:

- Windows
- Node.js 20 or newer
- npm 10 or newer
- PowerShell

```powershell
npm install
npm run build
.\scripts\launch.ps1
```

If Windows blocks direct PowerShell script execution, use:

```powershell
.\scripts\launch.cmd
```

DragonForge then opens:

- Dashboard: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4545`

## Typical Workflow

1. Register a local project folder.
2. Run a project scan to detect source files, build folders, asset folders, and project types.
3. Review Git status and command suggestions.
4. Start an agent task using a routed role such as `architect`, `explorer`, or `build-runner`.
5. Review analysis, transcripts, proposed patches, and any command previews before approving changes.

The first test workflow for this repository focused on an SDL/C game project and the `Stabilize asset loading` class of debugging task.

## Current Capability

Implemented:

- Project registration, removal, scanning, and Git status reads.
- Command preview, approval, rejection, execution, and logs.
- Dashboard pages for projects, workspace, approvals, logs, settings, and live AI task activity.
- Connector discovery and role routing for Claude, Codex, and Kimi.
- Agent task transcripts, image attachments, and full result viewing.
- Startup recovery for interrupted tasks.

Planned next:

- File write approvals and diff review workflow.
- Stronger checkpoint and rollback flows.
- SDL/C-specific compiler and asset diagnostics.
- Additional model connectors and project templates.

## Documentation

- [Technical manual](docs/TECHNICAL_MANUAL.md)
- [Architecture notes](docs/ARCHITECTURE.md)
- [Original blueprint](DRAGONFORGE_BLUEPRINT.md)

## Development Commands

```powershell
npm run build
npm run dev
npm run doctor
npm run launch
```

Useful helper scripts:

```powershell
.\scripts\doctor.ps1
.\scripts\launch.ps1 -InstallDependencies
.\scripts\init-project.ps1 -Path C:\path\to\project
```

## Configuration

DragonForge generates local runtime JSON files on first launch. Shareable examples live under `config/*.example.json`; machine-specific runtime files are intentionally ignored by Git so public repositories do not expose local paths, project registrations, or transcripts.

## Safety Model

DragonForge treats safety as part of the product:

- Read operations can run automatically inside registered roots.
- Build and test actions are previewed before execution.
- Writes, dependency installs, Git commits, network calls, and deletes require stronger review.
- Destructive commands such as `git reset --hard`, `git clean -fd`, and recursive forced deletes are blocked by default.
- Connector output is advisory until DragonForge owns and approves the next action.

See the [technical manual](docs/TECHNICAL_MANUAL.md) for the full policy model and API surface.

## Status

DragonForge is an MVP-stage engineering project. The current codebase is suitable for demonstration, local use, and continued development, while several workflow features are intentionally still in progress.
