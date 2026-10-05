# Выкладывает проект на сервер: тесты и сборка локально, готовый архив — на сервер по SSH.
#
#   npm run deploy                          # настройки из deploy.config.json
#   npm run deploy -- -Server root@1.2.3.4  # или параметрами
#   npm run deploy -- -DryRun               # собрать и упаковать, на сервер не ходить
#
# На сервере нужны Docker и доступ по SSH (root, пользователь из группы docker или с sudo).
param(
  [string]$Server,
  [string]$AppDir,
  [string]$Service,
  [int]$Port,
  [string]$Domain,
  [switch]$SkipTests,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Параметры командной строки важнее файла настроек, файл важнее значений по умолчанию.
#   service  — имя контейнера и образа на сервере;
#   domain   — если задан, редактор отдаётся по HTTPS на этом домене (ставится Caddy);
#   aliases  — ещё домены, на которых открывается тот же редактор (через запятую или списком);
#   redirects — домены, которые перенаправляют на основной (например, www и старый адрес);
#   password — пароль входа; пусто — оставить тот, что уже на сервере (при первом деплое создаётся случайный);
#   public   — true: сайт открыт всем, пароль на сервере снимается (у пользователей свои учётные записи).
$config = @{ server = ''; appDir = '/opt/loot-filter'; service = 'loot-filter'; port = 8080; domain = ''; aliases = ''; redirects = ''; password = ''; public = $false }
$configFile = Join-Path $root 'deploy.config.json'
if (Test-Path $configFile) {
  # Без явной кодировки Windows PowerShell прочитает файл как ANSI и испортит пароль не на латинице.
  $saved = Get-Content $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($key in @($config.Keys)) {
    if ($null -ne $saved.$key -and "$($saved.$key)" -ne '') { $config[$key] = $saved.$key }
  }
}
if ($Server) { $config.server = $Server }
if ($AppDir) { $config.appDir = $AppDir }
if ($Service) { $config.service = $Service }
if ($Port) { $config.port = $Port }
if ($Domain) { $config.domain = $Domain }
$config.domain = "$($config.domain)".Trim().ToLower()
# Списки доменов: в файле — массив или строка через запятую.
function Get-Domains($value) { @("$(@($value) -join ',')".ToLower() -split '[,\s]+' | Where-Object { $_ }) }
$aliases = @(Get-Domains $config.aliases)
$redirects = @(Get-Domains $config.redirects)
$config.password = "$($config.password)"
$public = $config.public -eq $true -or "$($config.public)" -eq 'true'
if ($public -and $config.password) { throw 'Заданы и public, и password: выберите что-то одно.' }

if (-not $DryRun -and -not $config.server) {
  throw 'Не указан сервер. Передайте -Server user@host или создайте deploy.config.json по образцу deploy.config.example.json.'
}
# Эти значения попадают в команды на сервере, поэтому допускаем только безопасные символы.
if ($config.appDir -notmatch '^/[A-Za-z0-9_./-]+$') { throw "Недопустимый каталог приложения: $($config.appDir)" }
if ($config.service -notmatch '^[a-z][a-z0-9_-]*$') { throw "Недопустимое имя контейнера: $($config.service)" }
if ($config.domain -and $config.domain -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
  throw "Недопустимый домен: $($config.domain). Нужно имя вида loot.example.com, без https:// и пути."
}
$domainRe = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
foreach ($extra in $aliases + $redirects) {
  if ($extra -notmatch $domainRe) { throw "Недопустимый домен: $extra" }
}
if (($aliases.Count -or $redirects.Count) -and -not $config.domain) { throw 'aliases и redirects работают только вместе с domain.' }
if ($config.password -match '[\r\n]') { throw 'Пароль не должен содержать переводов строки.' }

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
  if ($aliases.Count) { Write-Host "Тот же сайт: $($aliases -join ', ')" }
  if ($redirects.Count) { Write-Host "Перенаправление на основной: $($redirects -join ', ')" }
  if ($config.domain) { Write-Host "Домен: $($config.domain)" } else { Write-Host 'Домен не задан: редактор будет доступен по HTTP на порту.' }
  if ($public) { Write-Host 'Пароль: снимается, сайт открыт всем.' }
  elseif ($config.password) { Write-Host 'Пароль: будет взят из deploy.config.json.' } else { Write-Host 'Пароль: останется тот, что на сервере.' }
  Write-Host 'Пробный запуск: на сервер ничего не отправлено.' -ForegroundColor Yellow
  exit 0
}

$target = $config.server
$remoteTmp = '/tmp/loot-deploy-' + (Get-Date -Format 'yyyyMMddHHmmss')
$uploads = @($archive, (Join-Path $PSScriptRoot 'remote-install.sh'), (Join-Path $PSScriptRoot 'release.Dockerfile'))
# Метка образа: по ней на сервере видно, какой коммит и когда выложен.
$tag = "$commit-" + (Get-Date -Format 'yyyyMMddHHmmss')

# Пароль едет файлом, а не аргументом команды: аргументы видны на сервере в списке процессов.
$passwordFile = Join-Path ([IO.Path]::GetTempPath()) 'password.txt'
if ($config.password) {
  [IO.File]::WriteAllText($passwordFile, $config.password, (New-Object Text.UTF8Encoding($false)))
  $uploads += $passwordFile
}

try {
  Invoke-Step "Отправка на $target" {
    # Каталог доступен только владельцу: в нём на время установки лежит пароль.
    ssh $target "mkdir -m 700 $remoteTmp"
    if ($LASTEXITCODE -ne 0) { return }
    scp $uploads "${target}:$remoteTmp/"
    if ($LASTEXITCODE -ne 0) { return }
    ssh $target "mv $remoteTmp/loot-filter-release.tar.gz $remoteTmp/release.tar.gz"
  }
} finally {
  Remove-Item $passwordFile -ErrorAction SilentlyContinue
}

$domainArg = if ($config.domain) { $config.domain } else { '-' }
$aliasesArg = if ($aliases.Count) { $aliases -join ',' } else { '-' }
$redirectsArg = if ($redirects.Count) { $redirects -join ',' } else { '-' }
$accessArg = if ($public) { 'public' } else { 'password' }
# -t нужен, чтобы sudo на сервере мог спросить пароль.
Invoke-Step 'Установка на сервере' {
  ssh -t $target "bash $remoteTmp/remote-install.sh $($config.appDir) $($config.service) $($config.port) $tag $domainArg $aliasesArg $redirectsArg $accessArg"
}

Remove-Item $archive -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "Выложено: образ $($config.service):$tag на $target" -ForegroundColor Green
