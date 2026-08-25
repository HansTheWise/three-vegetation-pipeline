@echo off
setlocal

set "VEG_PROJECT_DIR=%~dp0"
set "VEG_NODE="

where node.exe >nul 2>nul
if not errorlevel 1 set "VEG_NODE=node.exe"

if not defined VEG_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "VEG_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if not defined VEG_NODE (
  echo veg-compile: Node.js was not found.
  echo Install Node.js or add node.exe to PATH, then run this command again.
  exit /b 1
)

if not exist "%VEG_PROJECT_DIR%node_modules\typescript\bin\tsc" (
  echo veg-compile: Project dependencies are missing.
  echo Install the dependencies before compiling a VEGFILE.
  exit /b 1
)

"%VEG_NODE%" "%VEG_PROJECT_DIR%node_modules\typescript\bin\tsc" -p "%VEG_PROJECT_DIR%tsconfig.build.json"
if errorlevel 1 exit /b %errorlevel%

"%VEG_NODE%" --experimental-strip-types "%VEG_PROJECT_DIR%tooling\veg-compile.mjs" %*
exit /b %errorlevel%
