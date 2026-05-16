$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
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

function Test-Tool {
  param([string]$Name)
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($Command) {
    Write-Host "[ok] $Name -> $($Command.Source)"
  } else {
    Write-Host "[missing] $Name"
  }
}

Write-Host "DragonForge doctor"
Write-Host "Root: $Root"
Test-Tool "node"
Test-Tool "npm"
Test-Tool "git"
Test-Tool "rg"
Test-Tool "codex"
Test-Tool "claude"
Test-Tool "kimi"
Test-Tool "powershell.exe"

$RequiredFiles = @(
  "package.json",
  "apps\server\package.json",
  "apps\dashboard\package.json",
  "packages\shared\package.json",
  "packages\ui\package.json",
  "config\dragonforge.json",
  "config\permissions.json",
  "config\models.json"
)

foreach ($File in $RequiredFiles) {
  $Path = Join-Path $Root $File
  if (Test-Path $Path) {
    Write-Host "[ok] $File"
  } else {
    Write-Host "[missing] $File"
  }
}

if (Test-Path (Join-Path $Root "node_modules")) {
  Write-Host "[ok] dependencies installed"
} else {
  Write-Host "[missing] dependencies not installed"
}
