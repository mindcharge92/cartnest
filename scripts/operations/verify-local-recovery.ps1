param(
  [string]$Container = 'cartnest-postgres',
  [string]$Database = 'cartnest_test_verified',
  [string]$DatabaseUser = 'cartnest'
)

$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^cartnest_test_[a-z0-9_]+$') {
  throw 'Recovery verification only accepts disposable cartnest_test databases.'
}
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$restoreDatabase = "cartnest_test_restore_$stamp"
$dumpPath = "/tmp/cartnest-recovery-$stamp.dump"
$artifactDirectory = Join-Path $PSScriptRoot '../../artifacts/recovery'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null

function Invoke-DockerChecked {
  param([string[]]$DockerArguments)
  $result = & docker @DockerArguments
  if ($LASTEXITCODE -ne 0) { throw "Docker recovery command failed with exit code $LASTEXITCODE" }
  return $result
}

function Invoke-PostgresQuery {
  param([string]$TargetDatabase, [string]$Sql)
  $result = $Sql | & docker exec -i $Container psql -U $DatabaseUser -d $TargetDatabase -At
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL recovery query failed with exit code $LASTEXITCODE" }
  return $result
}

$timer = [Diagnostics.Stopwatch]::StartNew()
Invoke-DockerChecked @('exec', $Container, 'pg_dump', '-U', $DatabaseUser, '-d', $Database, '-Fc', '-f', $dumpPath)
$checksum = Invoke-DockerChecked @('exec', $Container, 'sha256sum', $dumpPath)
Invoke-DockerChecked @('exec', $Container, 'createdb', '-U', $DatabaseUser, $restoreDatabase)
Invoke-DockerChecked @('exec', $Container, 'pg_restore', '-U', $DatabaseUser, '-d', $restoreDatabase, '--exit-on-error', '--no-owner', $dumpPath)
$query = 'SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Order"), (SELECT count(*) FROM "VendorOrder"), (SELECT count(*) FROM "PaymentIntent"), (SELECT COALESCE(sum("grandTotalAmountMinor"),0) FROM "Order"), (SELECT count(*) FROM pg_constraint WHERE contype = ''c''), (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL);'
$sourceCounts = Invoke-PostgresQuery $Database $query
$restoreCounts = Invoke-PostgresQuery $restoreDatabase $query
if (($sourceCounts -join '') -ne ($restoreCounts -join '')) { throw 'Restored database invariants differ from source.' }
$timer.Stop()
$report = [ordered]@{
  scope = 'local-disposable-database'
  sourceDatabase = $Database
  restoredDatabase = $restoreDatabase
  checksum = ($checksum -split ' ')[0]
  elapsedSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 2)
  sourceInvariants = $sourceCounts
  restoredInvariants = $restoreCounts
  passed = $true
  verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$report | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $artifactDirectory "recovery-$stamp.json")
$report | ConvertTo-Json
