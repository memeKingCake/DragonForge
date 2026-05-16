param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$Server = "http://127.0.0.1:4545"
)

$ErrorActionPreference = "Stop"
$Resolved = Resolve-Path $Path
$Body = @{
  rootPath = $Resolved.Path
} | ConvertTo-Json

Invoke-RestMethod -Uri "$Server/api/projects/register-local" -Method Post -ContentType "application/json" -Body $Body

