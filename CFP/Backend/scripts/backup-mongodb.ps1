param(
  [string]$MongoUri = $env:MONGODB_URI,
  [string]$OutDir = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ''
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $separator = $trimmed.IndexOf('=')
    if ($separator -le 0) {
      continue
    }

    $name = $trimmed.Substring(0, $separator).Trim()
    if ($name -ne $Key) {
      continue
    }

    return $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
  }

  return ''
}

if ([string]::IsNullOrWhiteSpace($MongoUri)) {
  $envPath = Join-Path $PSScriptRoot '..\.env'
  $MongoUri = Read-EnvValue -Path $envPath -Key 'MONGODB_URI'
}

if ([string]::IsNullOrWhiteSpace($MongoUri)) {
  throw 'MONGODB_URI was not found. Set it in Backend\.env or pass -MongoUri.'
}

$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongodump) {
  throw 'mongodump was not found. Install MongoDB Database Tools first: https://www.mongodb.com/try/download/database-tools'
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $OutDir "classic_fitness_park-$timestamp.archive.gz"

& $mongodump.Source "--uri=$MongoUri" "--archive=$archivePath" '--gzip'

if ($LASTEXITCODE -ne 0) {
  throw "mongodump failed with exit code $LASTEXITCODE"
}

Write-Host "Backup created: $archivePath"
