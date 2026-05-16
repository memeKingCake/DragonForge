import type { DragonforgeSettings, ModelsConfig, PermissionsConfig } from "@dragonforge/shared";
import { defaultModels, defaultPermissions, defaultSettings } from "@dragonforge/shared";
import { dataPaths } from "./paths.js";
import { mergeObjects, readJson, writeJson } from "../storage/jsonStore.js";

export async function ensureConfigFiles() {
  await Promise.all([
    readJson(dataPaths.settings, defaultSettings).then((settings) => writeJson(dataPaths.settings, settings)),
    readJson(dataPaths.permissions, defaultPermissions).then((permissions) => writeJson(dataPaths.permissions, permissions)),
    readJson(dataPaths.models, defaultModels).then((models) => writeJson(dataPaths.models, models)),
    readJson(dataPaths.registeredProjects, []).then((projects) => writeJson(dataPaths.registeredProjects, projects)),
    readJson(dataPaths.commandQueue, []).then((commands) => writeJson(dataPaths.commandQueue, commands)),
    readJson(dataPaths.agentTasks, []).then((tasks) => writeJson(dataPaths.agentTasks, tasks))
  ]);
}

export async function readSettings(): Promise<DragonforgeSettings> {
  return readJson(dataPaths.settings, defaultSettings);
}

export async function patchSettings(patch: Partial<DragonforgeSettings>) {
  const current = await readSettings();
  return writeJson(dataPaths.settings, mergeObjects(current as unknown as Record<string, unknown>, patch as Record<string, unknown>) as unknown as DragonforgeSettings);
}

export async function readPermissions(): Promise<PermissionsConfig> {
  return readJson(dataPaths.permissions, defaultPermissions);
}

export async function patchPermissions(patch: Partial<PermissionsConfig>) {
  const current = await readPermissions();
  return writeJson(dataPaths.permissions, mergeObjects(current as unknown as Record<string, unknown>, patch as Record<string, unknown>) as unknown as PermissionsConfig);
}

export async function readModels(): Promise<ModelsConfig> {
  return readJson(dataPaths.models, defaultModels);
}

export async function patchModels(patch: Partial<ModelsConfig>) {
  const current = await readModels();
  return writeJson(dataPaths.models, mergeObjects(current as unknown as Record<string, unknown>, patch as Record<string, unknown>) as unknown as ModelsConfig);
}

export async function patchModelProvider(provider: string, patch: Record<string, unknown>) {
  const current = await readModels();
  const existing = current.providers[provider] ?? {
    displayName: provider,
    enabled: false,
    cliPath: null,
    roles: []
  };
  const next: ModelsConfig = {
    ...current,
    providers: {
      ...current.providers,
      [provider]: {
        ...existing,
        ...patch
      }
    }
  };
  return writeJson(dataPaths.models, next);
}
