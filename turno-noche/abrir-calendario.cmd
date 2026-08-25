@echo off
title Turno Noche - panel
cd /d "%~dp0"
start "" http://localhost:4747
node server.mjs
