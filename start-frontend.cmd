@echo off
cd /d "%~dp0"
set "PATH=C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;%PATH%"
"C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".\node_modules\next\dist\bin\next" dev --hostname 127.0.0.1 --port 3000
pause
