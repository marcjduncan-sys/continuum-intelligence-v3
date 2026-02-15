# Continuum Intelligence — One-Click Deploy
# Usage: powershell -File C:\Users\User\continuum-platform\deploy.ps1
#
# Pulls latest from continuum-platform, copies files to continuum-website, commits, and pushes.

$platformDir = "C:\Users\User\continuum-platform"
$websiteDir  = "C:\Users\User\continuum-website"

Write-Host "=== Pulling latest from continuum-platform ===" -ForegroundColor Cyan
Set-Location $platformDir
git pull origin claude/dynamic-narrative-engine-noe5s

Write-Host "`n=== Copying files to continuum-website ===" -ForegroundColor Cyan
Copy-Item "$platformDir\index.html" "$websiteDir\index.html" -Force
if (Test-Path "$platformDir\scripts") {
    if (-not (Test-Path "$websiteDir\scripts")) { New-Item -ItemType Directory -Path "$websiteDir\scripts" -Force | Out-Null }
    Copy-Item "$platformDir\scripts\*" "$websiteDir\scripts\" -Force -Recurse
}

Write-Host "`n=== Committing and pushing to continuum-intelligence ===" -ForegroundColor Cyan
Set-Location $websiteDir
git add index.html
if (Test-Path "$websiteDir\scripts") { git add scripts/ }
$status = git status --porcelain
if ($status) {
    git commit -m "Deploy from continuum-platform"
    git push origin main
    Write-Host "`n=== Deployed successfully ===" -ForegroundColor Green
} else {
    Write-Host "`n=== No changes to deploy ===" -ForegroundColor Yellow
}
