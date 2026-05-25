# DragonForge Architecture

DragonForge starts as an orchestrator around local developer tools. The API owns project registration, command policy, approvals, Git safety, and logs. Model connectors are expected to operate inside those boundaries.

For the full operational and API reference, see [TECHNICAL_MANUAL.md](TECHNICAL_MANUAL.md).

## Runtime Shape

- `apps/server`: Fastify API and local storage.
- `apps/dashboard`: Vite React dashboard.
- `packages/shared`: shared route types, command policy types, settings models, and Zod schemas.
- `config`: runtime settings plus shareable example files.
- `projects`: local project registration state and managed workspaces.
- `logs`: command, agent, and audit records.

## Safety Boundary

All shell execution must begin as a `CommandPreview`. The preview records the exact command, cwd, project, reason, category, risk, expected writes, and approval requirement. Blocked commands never execute through the API.

Model connectors are also bounded. Codex is launched through `codex exec` with a read-only sandbox and no approval bypass. Claude is launched only with plan/edit/shell restrictions when the Claude CLI is available. Connector output is treated as analysis or a patch proposal; DragonForge still owns command approvals and future write approvals.

Agent tasks also record activity state and a heartbeat timestamp while connectors are running. The dashboard uses that signal to distinguish active work from stale or interrupted runs.

## Local Storage

This MVP intentionally uses JSON files so the behavior is inspectable and easy to reset during development. A later install profile can map the same structure to `C:\AiAgents\DragonForge`.

Version control should include only the `*.example.json` configuration templates; local runtime JSON, project registrations, transcripts, and audit files remain machine-specific state.
