import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectScanSummary, SuggestedCommand } from "@dragonforge/shared";

const sourceExtensions = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".cs", ".ts", ".tsx", ".js", ".jsx"]);
const assetFolderNames = new Set(["assets", "asset", "data", "res", "resources", "content", "textures", "sprites", "audio"]);
const buildFolderNames = new Set(["build", "build_mingw64", "out", "bin", "dist", "release"]);
const skipFolders = new Set([".git", "node_modules", ".vs", ".vscode", ".idea", "obj"]);

type WalkResult = {
  files: string[];
  folders: string[];
};

async function walk(rootPath: string, limit = 5000): Promise<WalkResult> {
  const files: string[] = [];
  const folders: string[] = [];

  async function visit(current: string) {
    if (files.length >= limit) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(rootPath, absolute).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        folders.push(relative);
        if (!skipFolders.has(entry.name.toLowerCase())) {
          await visit(absolute);
        }
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  await visit(rootPath);
  return { files, folders };
}

async function readTextIfPresent(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function relativeDir(file: string) {
  const directory = path.posix.dirname(file);
  return directory === "." ? "." : directory;
}

function commandPath(relativePath: string) {
  const normalized = relativePath === "." ? "." : relativePath;
  return /[\s'()]/.test(normalized) ? `'${normalized.replaceAll("'", "''")}'` : normalized;
}

export async function scanProject(rootPath: string): Promise<ProjectScanSummary> {
  const { files, folders } = await walk(rootPath);
  const markers: string[] = [];
  const projectTypes: string[] = [];
  const sdlSignals: string[] = [];
  const suggestedCommands: SuggestedCommand[] = [];
  const cmakeFiles = files.filter((file) => path.posix.basename(file).toLowerCase() === "cmakelists.txt");
  const makeFiles = files.filter((file) => path.posix.basename(file).toLowerCase() === "makefile");
  const solutionFiles = files.filter((file) => file.toLowerCase().endsWith(".sln"));
  const vcxprojFiles = files.filter((file) => file.toLowerCase().endsWith(".vcxproj"));
  const packageFiles = files.filter((file) => path.posix.basename(file).toLowerCase() === "package.json");

  if (cmakeFiles.length > 0) {
    markers.push(...cmakeFiles);
    projectTypes.push("CMake");
    const cmakeDir = relativeDir(cmakeFiles[0]);
    const buildDir = cmakeDir === "." ? "build" : `${cmakeDir}/build`;
    suggestedCommands.push(
      { label: "Configure CMake", command: `cmake -S ${commandPath(cmakeDir)} -B ${commandPath(buildDir)}`, category: "build" },
      { label: "Build CMake", command: `cmake --build ${commandPath(buildDir)}`, category: "build" }
    );
  }
  if (makeFiles.length > 0) {
    markers.push(...makeFiles);
    projectTypes.push("Make");
    const makeDir = relativeDir(makeFiles[0]);
    suggestedCommands.push({
      label: "Build Makefile",
      command: makeDir === "." ? "make" : `make -C ${commandPath(makeDir)}`,
      category: "build"
    });
  }
  if (solutionFiles.length > 0) {
    markers.push(...solutionFiles);
    projectTypes.push(".NET/Visual Studio");
    suggestedCommands.push({ label: "Build solution", command: `dotnet build ${commandPath(solutionFiles[0])}`, category: "build" });
  }
  if (vcxprojFiles.length > 0) {
    markers.push(...vcxprojFiles);
    projectTypes.push("Visual C++");
  }
  if (packageFiles.length > 0) {
    markers.push(...packageFiles);
    projectTypes.push("Node");
    const packageDir = relativeDir(packageFiles[0]);
    suggestedCommands.push({
      label: "Run tests",
      command: packageDir === "." ? "npm test" : `npm test --prefix ${commandPath(packageDir)}`,
      category: "test"
    });
  }

  const sourceFiles = files.filter((file) => sourceExtensions.has(path.extname(file).toLowerCase()));
  for (const cmakeFile of cmakeFiles.slice(0, 20)) {
    const cmakeText = await readTextIfPresent(path.join(rootPath, cmakeFile));
    if (/SDL2|SDL3|find_package\s*\(\s*SDL/i.test(cmakeText)) {
      sdlSignals.push(`CMake SDL package reference in ${cmakeFile}`);
    }
  }

  for (const file of sourceFiles.slice(0, 200)) {
    if (!/\.(c|cc|cpp|cxx|h|hpp)$/i.test(file)) {
      continue;
    }
    const text = await readTextIfPresent(path.join(rootPath, file));
    if (/#include\s*[<"]SDL/.test(text)) {
      sdlSignals.push(`SDL include in ${file}`);
      break;
    }
  }

  if (sdlSignals.length > 0 && !projectTypes.includes("SDL/C")) {
    projectTypes.push("SDL/C");
  }

  const assetFolders = folders.filter((folder) => assetFolderNames.has(path.basename(folder).toLowerCase()));
  const buildFolders = folders.filter((folder) => buildFolderNames.has(path.basename(folder).toLowerCase()));

  return {
    scannedAt: new Date().toISOString(),
    rootPath,
    fileCount: files.length,
    sourceCount: sourceFiles.length,
    assetFolders,
    buildFolders,
    markers,
    projectTypes: [...new Set(projectTypes)],
    sdlSignals: [...new Set(sdlSignals)],
    suggestedCommands
  };
}
