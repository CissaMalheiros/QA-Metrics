param([switch]$Production)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$toolRoot = Join-Path $projectRoot '.tools'
$nodeBin = Join-Path $toolRoot 'node_modules\node\bin\node.exe'
$pnpmScript = Join-Path $toolRoot 'node_modules\pnpm\bin\pnpm.cjs'

if (-not (Test-Path -LiteralPath $nodeBin) -or -not (Test-Path -LiteralPath $pnpmScript)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale o Node.js 24 LTS e execute este comando novamente.' }
  Write-Output 'Preparando Node.js 24 e pnpm dentro da pasta do projeto...'
  & npm install --prefix $toolRoot node@24 pnpm@10.32.1 --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível preparar as ferramentas locais. Confira sua conexão.' }
}
$env:PATH = "$(Split-Path -Parent $nodeBin);$(Join-Path $toolRoot 'node_modules\.bin');$env:PATH"
$env:NEXT_TELEMETRY_DISABLED = '1'
& $nodeBin (Join-Path $PSScriptRoot 'init-env.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível preparar o .env.' }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker não encontrado. Inicie um PostgreSQL conforme o README e execute o servidor com as ferramentas locais.' }
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
  $desktopPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path -LiteralPath $desktopPath) {
    Write-Output 'Iniciando Docker Desktop...'
    Start-Process -FilePath $desktopPath -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Seconds 2
      & docker info --format '{{.ServerVersion}}' *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw 'O Docker ainda está iniciando. Aguarde seu status de execução e tente novamente.' }
  } else { throw 'Inicie o mecanismo Linux do Docker e tente novamente.' }
}
& docker compose up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o banco. Consulte o README.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\.bin\next.cmd'))) {
  & $nodeBin $pnpmScript install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências.' }
}
& $nodeBin $pnpmScript db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível aplicar as migrações.' }
if ($Production) {
  & $nodeBin $pnpmScript build
  if ($LASTEXITCODE -ne 0) { throw 'A compilação não foi concluída.' }
  & $nodeBin $pnpmScript start
} else {
  & $nodeBin $pnpmScript dev
}
exit $LASTEXITCODE
