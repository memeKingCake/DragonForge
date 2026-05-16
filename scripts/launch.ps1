param(
  [int]$ApiPort = 4545,
  [int]$DashboardPort = 5173,
  [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeModules = Join-Path $Root "node_modules"
$NodeJs = "C:\Program Files\nodejs"

function Add-DragonForgePath {
  param([string]$Path)
  if ($Path -and (Test-Path $Path) -and ($env:Path -notlike "*$Path*")) {
    $env:Path = "$Path;$env:Path"
  }
}

Add-DragonForgePath $NodeJs
Add-DragonForgePath (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin")
Add-DragonForgePath (Join-Path $env:APPDATA "npm")
$ClaudeExe = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Packages\Claude_*\LocalCache\Roaming\Claude\claude-code\*\claude.exe") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($ClaudeExe) {
  Add-DragonForgePath $ClaudeExe.DirectoryName
}

if ($InstallDependencies -and -not (Test-Path $NodeModules)) {
  Push-Location $Root
  npm install
  Pop-Location
}

if (-not (Test-Path $NodeModules)) {
  Write-Host "Dependencies are not installed. Run npm install or launch with -InstallDependencies."
  exit 1
}

Push-Location $Root
npm run build -w @dragonforge/shared
Pop-Location

$ServerCommand = "cd '$Root'; `$env:DRAGONFORGE_PORT='$ApiPort'; npm run dev -w @dragonforge/server"
$DashboardCommand = "cd '$Root'; `$env:VITE_DRAGONFORGE_API='http://127.0.0.1:$ApiPort'; npm run dev -w @dragonforge/dashboard -- --port $DashboardPort"

Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $ServerCommand -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $DashboardCommand -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
  Start-Process "http://127.0.0.1:$DashboardPort"
} catch {
  Write-Host "Could not open browser automatically: $($_.Exception.Message)"
}

Write-Host "DragonForge server:    http://127.0.0.1:$ApiPort"
Write-Host "DragonForge dashboard: http://127.0.0.1:$DashboardPort"
