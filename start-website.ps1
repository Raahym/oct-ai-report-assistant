$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectDir "oct-ai-backend"
$NodeExe = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$NextBin = Join-Path $ProjectDir "node_modules\next\dist\bin\next"

function Test-Url($Url) {
  try {
    Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
$backend = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue

if (-not $backend) {
  Start-Process -FilePath "python" -ArgumentList @("-m", "uvicorn", "main:app", "--reload") -WorkingDirectory $BackendDir -WindowStyle Minimized
}

if (-not $frontend) {
  Start-Process -FilePath $NodeExe -ArgumentList @($NextBin, "dev", "--hostname", "127.0.0.1", "--port", "3000") -WorkingDirectory $ProjectDir -WindowStyle Minimized
}

Write-Host "Starting OCT AI Report Assistant..."

$okFrontend = $false
$okBackend = $false

for ($i = 0; $i -lt 45; $i++) {
  if (-not $okFrontend) {
    $okFrontend = Test-Url "http://127.0.0.1:3000/login"
  }
  if (-not $okBackend) {
    $okBackend = Test-Url "http://127.0.0.1:8000/health"
  }
  if ($okFrontend -and $okBackend) {
    break
  }
  Start-Sleep -Seconds 1
}

if ($okFrontend) {
  Start-Process "http://127.0.0.1:3000/login"
}

if ($okFrontend) {
  Write-Host "Frontend: ready at http://127.0.0.1:3000/login"
} else {
  Write-Host "Frontend: not ready yet"
}

if ($okBackend) {
  Write-Host "Backend:  ready at http://127.0.0.1:8000/health"
} else {
  Write-Host "Backend:  not ready yet"
}

Write-Host ""
Write-Host "If the browser did not open, go to:"
Write-Host "http://127.0.0.1:3000/login"
