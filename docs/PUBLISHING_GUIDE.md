# Publishing Guide

## Goal

This guide prepares DragonForge for a clean public presentation on GitHub and later as a portfolio project on LinkedIn.

## Before the First Public Push

1. Review the README and technical manual for accuracy.
2. Keep only shareable examples under `config/`; do not commit local runtime JSON files.
3. Confirm `projects/registered.json`, `logs/`, transcripts, and local attachments are not included in the commit.
4. Decide on a license before making the repository public.
5. Capture a small set of polished screenshots from the dashboard.
6. Run a clean build before publishing:

```powershell
npm run build
```

## Recommended GitHub Presentation

Suggested repository description:

```text
Windows-first local AI coding agent shell with command approvals, Git-aware workflows, and Claude/Codex/Kimi connector routing.
```

Suggested repository topics:

```text
typescript
fastify
react
vite
ai-agents
developer-tools
windows
powershell
local-first
game-development
```

Suggested screenshots:

1. Dashboard overview with AI activity visible.
2. Workspace page with scan summary and task panel.
3. Command preview or approval queue showing the safety model.
4. Settings page showing connector availability.

## Recommended Repository Files

Already included:

- `README.md`
- `docs/TECHNICAL_MANUAL.md`
- `docs/ARCHITECTURE.md`
- `docs/PUBLISHING_GUIDE.md`
- `config/*.example.json`
- `projects/registered.example.json`

Still worth deciding later:

- `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- issue and pull request templates

## LinkedIn Framing

Good project angle:

> I built DragonForge, a Windows-first local AI coding agent shell that keeps model assistance inside explicit developer controls: project registration, live agent activity, command previews, approval workflows, Git-aware operations, and local audit logs.

Strong points to mention:

- local-first architecture rather than a hosted black box
- safety-first command model
- multi-connector orchestration across Claude, Codex, and Kimi
- practical debugging use case through an SDL/C game project
- full-stack implementation across TypeScript, Fastify, React, Vite, PowerShell, and JSON-backed storage

Suggested post structure:

1. What problem you wanted to solve.
2. What DragonForge does differently.
3. A short list of the core features.
4. One image of the dashboard.
5. One sentence on what you learned or what you plan next.
6. Link to the GitHub repository.

## Portfolio Talking Points

- Why a local-only server was chosen.
- Why agent output is advisory while DragonForge owns approvals.
- How the permission system balances usefulness with safety.
- How project scanning adapts to mixed codebases such as SDL/C games.
- Why JSON storage was the right MVP decision and what would replace it later.

## Final Release Check

Before sharing publicly, verify:

- the build passes
- the README quick start works from a fresh clone
- no local absolute paths are committed in public config files
- no transcripts, logs, screenshots, or registered project data leak unintentionally
- the screenshots show only content you are comfortable publishing
- the repository name, description, and topics match the project story
