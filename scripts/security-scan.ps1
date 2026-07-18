param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Push-Location $Root
try {
  $patterns = @(
    "mongodb\+srv://",
    "NEXT_PUBLIC_[A-Z0-9_]*(BACKEND|SERVICE_ROLE|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=",
    "sk-[A-Za-z0-9_-]{20,}",
    "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
  )

  $exclude = @(
    "-g", "!AFIO_PRIVATE_SECURITY_NOTES/**",
    "-g", "!.env*",
    "-g", "!test/**",
    "-g", "!rand test pics/**",
    "-g", "!node_modules/**",
    "-g", "!retina-ai-backend/node_modules/**",
    "-g", "!*.png",
    "-g", "!*.jpg",
    "-g", "!*.jpeg",
    "-g", "!*.webp",
    "-g", "!*.pth",
    "-g", "!*.h5",
    "-g", "!*.onnx",
    "-g", "!*.onnx.data",
    "-g", "!scripts/security-scan.ps1"
  )

  $failed = $false
  foreach ($pattern in $patterns) {
    $matches = & rg -n --hidden @exclude $pattern .
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Potential security finding for pattern: $pattern" -ForegroundColor Red
      $matches | ForEach-Object { Write-Host $_ }
      $failed = $true
    } elseif ($LASTEXITCODE -gt 1) {
      throw "ripgrep failed while scanning pattern: $pattern"
    }
  }

  if ($failed) {
    throw "Security scan found potential secret/public-backend exposure. Review before commit/deploy."
  }

  Write-Host "Security scan passed." -ForegroundColor Green
} finally {
  Pop-Location
}
