$ErrorActionPreference = 'Stop'

$projectDirectory = $PSScriptRoot
$appUrl = 'http://localhost:5173'
$apiUrl = 'http://localhost:3001/api/health'
$chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)

function Test-LocalUrl {
    param([Parameter(Mandatory)][string]$Url)

    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

if (-not ((Test-LocalUrl -Url $appUrl) -and (Test-LocalUrl -Url $apiUrl))) {
    $command = "title Tee Time Finder & cd /d `"$projectDirectory`" & npm run dev"
    Start-Process -FilePath $env:ComSpec -ArgumentList '/k', $command

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-LocalUrl -Url $appUrl) {
            break
        }
        Start-Sleep -Milliseconds 500
    }
}

$chromePath = $chromeCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

if (-not $chromePath) {
    throw 'Google Chrome could not be found on this computer.'
}

Start-Process -FilePath $chromePath -ArgumentList $appUrl
