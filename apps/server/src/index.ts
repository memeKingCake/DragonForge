import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAgentRoutes } from "./api/agents.js";
import { registerCommandRoutes } from "./api/commands.js";
import { registerGitRoutes } from "./api/git.js";
import { registerProjectRoutes } from "./api/projects.js";
import { registerSettingsRoutes } from "./api/settings.js";
import { recoverInterruptedAgentTasks } from "./agents/taskStore.js";
import { ensureDataDirs } from "./config/paths.js";
import { ensureConfigFiles, readSettings } from "./config/configStore.js";

await ensureDataDirs();
await ensureConfigFiles();
await recoverInterruptedAgentTasks();

const settings = await readSettings();
const host = process.env.DRAGONFORGE_HOST ?? settings.server.host ?? "127.0.0.1";
const port = Number(process.env.DRAGONFORGE_PORT ?? settings.server.port ?? 4545);

const app = Fastify({
  bodyLimit: 24 * 1024 * 1024,
  logger: {
    level: process.env.DRAGONFORGE_LOG_LEVEL ?? "info"
  }
});

await app.register(cors, {
  origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/]
});

app.get("/api/health", async () => ({
  ok: true,
  name: "DragonForge",
  time: new Date().toISOString()
}));

await registerProjectRoutes(app);
await registerCommandRoutes(app);
await registerAgentRoutes(app);
await registerGitRoutes(app);
await registerSettingsRoutes(app);

await app.listen({ host, port });
app.log.info(`DragonForge API listening on http://${host}:${port}`);
