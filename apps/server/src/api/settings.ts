import type { FastifyInstance } from "fastify";
import type { DragonforgeSettings, ModelsConfig, PermissionsConfig } from "@dragonforge/shared";
import { patchModelProvider, patchModels, patchPermissions, patchSettings, readModels, readPermissions, readSettings } from "../config/configStore.js";

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => readSettings());

  app.patch("/api/settings", async (request) => patchSettings(request.body as Partial<DragonforgeSettings>));

  app.get("/api/models", async () => readModels());

  app.patch("/api/models", async (request) => patchModels(request.body as Partial<ModelsConfig>));

  app.patch("/api/models/:provider", async (request) => {
    const { provider } = request.params as { provider: string };
    return patchModelProvider(provider, request.body as Record<string, unknown>);
  });

  app.get("/api/permissions", async () => readPermissions());

  app.patch("/api/permissions", async (request) => patchPermissions(request.body as Partial<PermissionsConfig>));
}
