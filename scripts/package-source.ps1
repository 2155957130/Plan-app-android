$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $sourceRoot 'Plan-source.zip'
$sourceFiles = @()
foreach ($directory in @('android','scripts','tests')) {
  $directoryPath = Join-Path $sourceRoot $directory
  if ((Get-Item -LiteralPath $directoryPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source folders must not be links' }
  $children = @(Get-ChildItem -LiteralPath $directoryPath -Recurse -Force)
  if ($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Source files must not be links' }
  $sourceFiles += @($children | Where-Object { -not $_.PSIsContainer })
}
foreach ($file in @('README.md','LICENSE','package.json','.gitignore','.gitattributes')) {
  $sourceFiles += Get-Item -LiteralPath (Join-Path $sourceRoot $file)
}
$blockedFilePattern = '(?i)(\.(apk|zip|bundle|keystore|jks|p12|pfx|key)$|(^|/)(\.git|\.github|build|docs|local-only|node_modules)/|(^|/)\.env($|\.)|(^|/)plan-backup.*\.json$)'
foreach ($file in $sourceFiles) {
  if (-not $file.FullName.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Source file is outside this checkout' }
  $relativePath = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\','/')
  if ($relativePath -match $blockedFilePattern) { throw "Unexpected file in source package: $relativePath" }
}
if (Test-Path -LiteralPath $packagePath) {
  $previousPackage = Get-Item -LiteralPath $packagePath
  if ($previousPackage.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source package must not be a link' }
  Remove-Item -LiteralPath $packagePath -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [IO.Compression.ZipFile]::Open($packagePath,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $sourceFiles | Sort-Object FullName) {
    $relativePath = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,('Plan/' + $relativePath),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
Write-Output ("Source package: $packagePath ($($sourceFiles.Count) files)")
