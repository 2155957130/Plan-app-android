param(
  [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$JdkPath = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath
. (Join-Path $PSScriptRoot 'java.ps1')
$JdkPath = Resolve-PlanJdk $JdkPath
$toolsPath = Join-Path $SdkPath 'build-tools\35.0.1'
$androidJar = Join-Path $SdkPath 'platforms\android-35\android.jar'
$javaExe = Join-Path $JdkPath 'bin\java.exe'
$javacExe = Join-Path $JdkPath 'bin\javac.exe'
$keytoolExe = Join-Path $JdkPath 'bin\keytool.exe'
foreach ($requiredPath in @($androidJar,$keytoolExe,(Join-Path $toolsPath 'aapt2.exe'),(Join-Path $toolsPath 'zipalign.exe'),(Join-Path $toolsPath 'lib\d8.jar'),(Join-Path $toolsPath 'lib\apksigner.jar'),(Join-Path $toolsPath 'core-lambda-stubs.jar'))) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required build tool not found: $requiredPath" }
}
function Run-Checked([string]$program, [string[]]$arguments) {
  & $program @arguments
  if ($LASTEXITCODE -ne 0) { throw "Build command failed: $program" }
}
@('build','build\classes','build\generated','build\dex') | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
# Only remove generated compiler output inside this checkout's build directory.
$buildRoot = (Resolve-Path -LiteralPath 'build').Path
foreach ($relativeDirectory in @('classes','generated','dex')) {
  $outputDirectory = (Resolve-Path -LiteralPath (Join-Path $buildRoot $relativeDirectory)).Path
  if (-not $outputDirectory.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe build output path' }
  $outputItem = Get-Item -LiteralPath $outputDirectory
  if ($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Build output must not be a link' }
  $outputChildren = @(Get-ChildItem -LiteralPath $outputDirectory -Force -Recurse)
  if ($outputChildren | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Build output contains a link' }
  Get-ChildItem -LiteralPath $outputDirectory -Force | Remove-Item -Recurse -Force
}
Run-Checked (Join-Path $toolsPath 'aapt2.exe') @('compile','--dir','android/res','-o','build/resources.zip')
Run-Checked (Join-Path $toolsPath 'aapt2.exe') @('link','-o','build/plan-unsigned.apk','-I',$androidJar,'--manifest','android/AndroidManifest.xml','--java','build/generated','-A','android/assets','build/resources.zip')
$sources = @(Get-ChildItem -Path android/src,build/generated -Recurse -Filter '*.java' | ForEach-Object FullName)
Run-Checked $javacExe (@('-encoding','UTF-8','-source','8','-target','8','-bootclasspath',($androidJar + ';' + (Join-Path $toolsPath 'core-lambda-stubs.jar')),'-d','build/classes') + $sources)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$classArchive = Join-Path $buildRoot 'classes.jar'
if (Test-Path -LiteralPath $classArchive) { Remove-Item -LiteralPath $classArchive -Force }
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $buildRoot 'classes'),$classArchive)
Run-Checked $javaExe @('-cp',(Join-Path $toolsPath 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',$androidJar,'--output','build/dex','build/classes.jar')
$unsignedApk = [IO.Compression.ZipFile]::Open((Join-Path $buildRoot 'plan-unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try {
  $previousDex = $unsignedApk.GetEntry('classes.dex')
  if ($previousDex) { $previousDex.Delete() }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($unsignedApk,(Join-Path $buildRoot 'dex\classes.dex'),'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally { $unsignedApk.Dispose() }
Run-Checked (Join-Path $toolsPath 'zipalign.exe') @('-f','-p','4','build/plan-unsigned.apk','build/plan-aligned.apk')
if (-not (Test-Path 'build/plan-local.keystore')) {
  Run-Checked $keytoolExe @('-genkeypair','-keystore','build/plan-local.keystore','-storepass','plan-local-build','-keypass','plan-local-build','-alias','plan','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Plan Local, O=Plan, C=CN')
}
Run-Checked $javaExe @('-jar',(Join-Path $toolsPath 'lib\apksigner.jar'),'sign','--ks','build/plan-local.keystore','--ks-key-alias','plan','--ks-pass','pass:plan-local-build','--key-pass','pass:plan-local-build','--v4-signing-enabled','false','--out','Plan.apk','build/plan-aligned.apk')
Run-Checked $javaExe @('-jar',(Join-Path $toolsPath 'lib\apksigner.jar'),'verify','--verbose','Plan.apk')
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try {
  $apkHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([IO.File]::ReadAllBytes((Join-Path $projectPath 'Plan.apk')))).Replace('-','')
  Write-Output "SHA256: $apkHash"
} finally { $hashAlgorithm.Dispose() }
Write-Output 'Built: Plan.apk (local development signature)'
