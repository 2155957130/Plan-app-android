function Resolve-PlanJdk([string]$JdkPath) {
  if (-not $JdkPath) { $JdkPath = $env:JAVA_HOME }
  if (-not $JdkPath) {
    $settingsPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'local.properties'
    if (Test-Path -LiteralPath $settingsPath) {
      foreach ($line in Get-Content -LiteralPath $settingsPath) {
        if ($line -match '^\s*jdk\.dir\s*=\s*(.+?)\s*$') { $JdkPath = $Matches[1]; break }
      }
    }
  }
  if (-not $JdkPath) {
    $compiler = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($compiler) { $JdkPath = Split-Path -Parent (Split-Path -Parent $compiler.Source) }
  }
  if (-not $JdkPath) { throw 'Set JAVA_HOME or pass -JdkPath with a JDK 17 or newer.' }
  $resolvedJdk = (Resolve-Path -LiteralPath $JdkPath).Path
  foreach ($tool in @('java.exe','javac.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedJdk "bin\$tool"))) {
      throw "The selected JDK is missing $tool. Install a full JDK 17 or newer."
    }
  }
  $compilerVersion = (& (Join-Path $resolvedJdk 'bin\javac.exe') -version 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $compilerVersion -notmatch 'javac\s+(\d+)' -or [int]$Matches[1] -lt 17) {
    throw "JDK 17 or newer is required. Detected: $compilerVersion"
  }
  return $resolvedJdk
}
