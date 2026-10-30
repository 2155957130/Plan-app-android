param([string]$JdkPath=$env:JAVA_HOME)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'java.ps1')
$JdkPath=Resolve-PlanJdk $JdkPath
New-Item -ItemType Directory -Force -Path build/native-tests | Out-Null
& (Join-Path $JdkPath 'bin/javac.exe') -encoding UTF-8 -d build/native-tests android/src/com/plan/paw/HabitSchedule.java android/src/com/plan/paw/WidgetContent.java tests/java/com/plan/paw/HabitScheduleTest.java tests/java/com/plan/paw/WidgetContentTest.java
if($LASTEXITCODE -ne 0){throw 'Native test compilation failed'}
& (Join-Path $JdkPath 'bin/java.exe') -cp build/native-tests com.plan.paw.HabitScheduleTest
if($LASTEXITCODE -ne 0){throw 'Native recurrence tests failed'}
& (Join-Path $JdkPath 'bin/java.exe') -cp build/native-tests com.plan.paw.WidgetContentTest
if($LASTEXITCODE -ne 0){throw 'Native widget tests failed'}
