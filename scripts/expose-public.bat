@echo off
REM Share JARVIS over the internet (HTTPS tunnel) for testing on another laptop.
REM Backend + frontend must already be running on this PC.
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0expose-public.ps1" %*
