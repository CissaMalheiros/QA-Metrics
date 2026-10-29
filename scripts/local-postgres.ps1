param(
  [ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Start',
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localRoot = Join-Path $projectRoot '.local'
$dataPath = Join-Path $localRoot 'postgres'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$initDb = Join-Path $PostgresBin 'initdb.exe'
$createDb = Join-Path $PostgresBin 'createdb.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) { throw "PostgreSQL não encontrado em $PostgresBin. Informe -PostgresBin com o diretório bin instalado." }

if ($Action -eq 'Status') {
  if (-not (Test-Path -LiteralPath $dataPath)) { Write-Output 'O banco isolado deste projeto ainda não foi criado.'; exit 0 }
  & $pgCtl -D $dataPath status
  exit $LASTEXITCODE
}
if ($Action -eq 'Stop') {
  if (-not (Test-Path -LiteralPath $dataPath)) { Write-Output 'Nenhum banco isolado do projeto para interromper.'; exit 0 }
  & $pgCtl -D $dataPath -m fast -w stop
  exit $LASTEXITCODE
}

$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Crie o .env primeiro: node scripts/init-env.mjs' }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
  if ($line -match '^\s*(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|POSTGRES_PORT)=(.*)$') {
    $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
  }
}
$dbUser = $settings['POSTGRES_USER']
$dbPassword = $settings['POSTGRES_PASSWORD']
$dbName = $settings['POSTGRES_DB']
$dbPort = if ($settings['POSTGRES_PORT']) { [int]$settings['POSTGRES_PORT'] } else { 5433 }
if ($dbUser -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$' -or $dbName -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$' -or -not $dbPassword) {
  throw 'O .env deve conter POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB válidos. Usuário e banco devem usar letras, números e sublinhado.'
}
if ($dbPort -lt 1024 -or $dbPort -gt 65535) { throw 'POSTGRES_PORT deve estar entre 1024 e 65535.' }
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  $passwordPath = Join-Path $localRoot ('init-password-' + [guid]::NewGuid().ToString('N'))
  try {
    [System.IO.File]::WriteAllText($passwordPath, $dbPassword, [System.Text.UTF8Encoding]::new($false))
    & $initDb -D $dataPath -U $dbUser --pwfile=$passwordPath --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao inicializar o PostgreSQL isolado.' }
  } finally {
    if (Test-Path -LiteralPath $passwordPath) { Remove-Item -LiteralPath $passwordPath -Force }
  }
}
& $pgCtl -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
  $logPath = Join-Path $localRoot 'postgres.log'
  $arguments = @('-D', ('"' + $dataPath + '"'), '-l', ('"' + $logPath + '"'), '-w', '-o', ('"-p ' + $dbPort + ' -h 127.0.0.1"'), 'start')
  $process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Não foi possível iniciar o PostgreSQL. Verifique a porta $dbPort e o log em .local/postgres.log." }
}
$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $dbPassword
  [string]$exists = & $psql -h 127.0.0.1 -p $dbPort -U $dbUser -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
  if ($LASTEXITCODE -ne 0) { throw 'O banco isolado iniciou, mas a conexão falhou. Confira as credenciais do .env.' }
  if ($exists.Trim() -ne '1') {
    & $createDb -h 127.0.0.1 -p $dbPort -U $dbUser $dbName
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o banco da aplicação.' }
  }
} finally {
  if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
}
Write-Output "PostgreSQL isolado disponível em 127.0.0.1:$dbPort. Dados em .local/postgres; a instalação existente foi preservada."
