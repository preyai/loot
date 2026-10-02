# Выкладывает проект на сервер: тесты и сборка локально, готовый архив — на сервер по SSH.
#
#   npm run deploy                          # настройки из deploy.config.json
#   npm run deploy -- -Server root@1.2.3.4  # или параметрами
#   npm run deploy -- -DryRun               # собрать и упаковать, на сервер не ходить
#
# На сервере нужны Linux с systemd, Node.js 20+ и доступ по SSH (root или пользователь с sudo).
param(
  [string]$Server,
  [string]$AppDir,
  [string]$Service,
  [int]$Port,
  [switch]$SkipTests,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Параметры командной строки важнее файла настроек, файл важнее значений по умолчанию.
$config = @{ server = ''; appDir = '/opt/loot-filter'; service = 'loot-filter'; port = 8080 }
$configFile = Join-Path $root 'deploy.config.json'
if (Test-Path $configFile) {
  $saved = Get-Content $configFile -Raw | ConvertFrom-Json
  foreach ($key in @($config.Keys)) {
    if ($null -ne $saved.$key -and "$($saved.$key)" -ne '') { $config[$key] = $saved.$key }
  }
}
if ($Server) { $config.server = $Server }
if ($AppDir) { $config.appDir = $AppDir }
if ($Service) { $config.service = $Service }
if ($Port) { $config.port = $Port }

if (-not $DryRun -and -not $config.server) {
  throw 'Не указан сервер. Передайте -Server user@host или создайте deploy.config.json по образцу deploy.config.example.json.'
}
# Эти значения попадают в команды на сервере, поэтому допускаем только безопасные символы.
if ($config.appDir -notmatch '^/[A-Za-z0-9_./-]+$') { throw "Недопустимый каталог приложения: $($config.appDir)" }
if ($config.service -notmatch '^[a-z][a-z0-9_-]*$') { throw "Недопустимое имя службы: $($config.service)" }

function Invoke-Step([string]$Title, [scriptblock]$Action) {
  Write-Host ''
  Write-Host "== $Title" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "Шаг «$Title» завершился с ошибкой (код $LASTEXITCODE)." }
}

$dirty = git status --porcelain
if ($dirty) {
  Write-Host 'Внимание: есть незакоммиченные изменения — на сервер уедет то, что сейчас в рабочей папке.' -ForegroundColor Yellow
}

if (-not $SkipTests) { Invoke-Step 'Тесты' { npm test } }
Invoke-Step 'Сборка' { npm run build }

$archive = Join-Path ([IO.Path]::GetTempPath()) 'loot-filter-release.tar.gz'
Invoke-Step 'Упаковка' { tar -czf $archive -C $root dist dist-server }
$sizeMb = [math]::Round((Get-Item $archive).Length / 1MB, 2)
$commit = git rev-parse --short HEAD
Write-Host "Архив: $archive ($sizeMb МБ), коммит $commit"

if ($DryRun) {
  Write-Host ''
  Write-Host 'Пробный запуск: на сервер ничего не отправлено.' -ForegroundColor Yellow
  exit 0
}

$target = $config.server
$remoteTmp = '/tmp/loot-deploy-' + (Get-Date -Format 'yyyyMMddHHmmss')
$installer = Join-Path $PSScriptRoot 'remote-install.sh'

Invoke-Step "Отправка на $target" {
  ssh $target "mkdir -p $remoteTmp"
  if ($LASTEXITCODE -ne 0) { return }
  scp $archive "${target}:$remoteTmp/release.tar.gz"
  if ($LASTEXITCODE -ne 0) { return }
  scp $installer "${target}:$remoteTmp/remote-install.sh"
}

# -t нужен, чтобы sudo на сервере мог спросить пароль.
Invoke-Step 'Установка на сервере' {
  ssh -t $target "bash $remoteTmp/remote-install.sh $($config.appDir) $($config.service) $($config.port)"
}

Remove-Item $archive -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "Выложено: коммит $commit на $target" -ForegroundColor Green
