@echo off
cd /d "%~dp0oct-ai-backend"
python -m uvicorn main:app --reload
pause
