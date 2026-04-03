@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title JARVIS AI Brain

echo.
echo  ==================================================
echo               JARVIS AI BRAIN
echo  ==================================================
echo.
echo  [ SYSTEM STATUS ]
echo  Checking Docker, Ollama, and service images...
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker CLI was not found. Install Docker Desktop first.
    goto :fail
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Start Docker Desktop first.
    goto :fail
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] The Docker Compose plugin is unavailable. Update Docker Desktop and try again.
    goto :fail
)

if not exist .env (
    copy /Y .env.example .env >nul
    echo [INFO] Created .env from .env.example
)

where ollama >nul 2>&1
if errorlevel 1 (
    echo [INFO] Ollama was not found in PATH. The app can still work with GROQ fallback.
) else (
    ollama list >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Ollama CLI found, but the Ollama service is not running. Skipping model pull.
    ) else (
        echo [INFO] Ollama detected. Ensuring llama3.2 is available...
        ollama pull llama3.2
    )
)

echo.
echo [INFO] Pre-pulling required images to avoid mid-build Docker Hub timeouts...
call :pull_image qdrant/qdrant:latest "Qdrant"
if errorlevel 1 goto :fail
call :pull_image python:3.11-slim "Backend base image"
if errorlevel 1 goto :fail
call :pull_image node:20-alpine "Frontend base image"
if errorlevel 1 (
    echo [WARN] Could not pre-pull node:20-alpine after multiple attempts.
    echo [WARN] Continuing anyway in case Docker already has a usable cached copy.
)

echo.
echo [INFO] Starting infrastructure and backend...
docker compose up --build -d qdrant backend
if errorlevel 1 (
    echo [ERROR] Backend services failed to start.
    goto :fail
)

echo.
echo [INFO] Starting frontend...
docker compose up --build -d frontend
if errorlevel 1 (
    echo [WARN] Frontend failed to start.
    call :print_frontend_help
    goto :partial_success
)

echo.
echo [OK] JARVIS is starting up.
echo.
echo   Frontend : http://localhost:5050
echo   Backend  : http://localhost:8001
echo   API Docs : http://localhost:8001/docs
echo   Qdrant   : http://localhost:6335/dashboard
echo.
echo [TIP] First run: click "+ GITHUB" in the UI and enter your GitHub username.
echo [TIP] Then click the VOICE tab and press "HOLD TO SPEAK" to talk to JARVIS.
echo.
echo  ==================================================
echo               JARVIS AI BRAIN
echo  ==================================================
goto :end

:pull_image
set "IMAGE=%~1"
set "LABEL=%~2"
set /a ATTEMPT=1

:pull_retry
echo [INFO] Pulling %LABEL% (%IMAGE%), attempt !ATTEMPT!/3...
docker pull %IMAGE%
if not errorlevel 1 exit /b 0
if !ATTEMPT! geq 3 (
    echo [WARN] Failed to pull %IMAGE% after 3 attempts.
    exit /b 1
)
echo [WARN] Pull failed. Waiting 5 seconds before retrying...
timeout /t 5 /nobreak >nul
set /a ATTEMPT+=1
goto :pull_retry

:print_frontend_help
echo.
echo [INFO] Backend may still be available at http://localhost:8001
echo [INFO] The frontend failed while resolving or pulling node:20-alpine from Docker Hub.
echo [INFO] Try one of these next:
echo        1. Run: docker pull node:20-alpine
echo        2. Re-run this script after Docker Desktop network stabilizes
echo        3. Start the frontend locally:
echo           cd frontend
echo           npm install
echo           npm run dev
echo.
exit /b 0

:partial_success
echo.
echo [WARN] JARVIS backend services are up, but the frontend still needs attention.
goto :end

:fail
echo.
echo [ERROR] Startup stopped before JARVIS was fully online.
echo [INFO] If the failure mentions node:20-alpine or a TLS handshake timeout,
echo [INFO] that points to Docker Hub connectivity rather than a frontend code error.
goto :end_with_error

:end_with_error
echo.
pause
exit /b 1

:end
echo.
pause
exit /b 0
