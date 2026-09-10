@echo off
title VTube Studio - prueba de conexion
cd /d "%~dp0"
echo.
echo  Comprobando que VTube Studio tenga la API encendida...
echo.
node vts.mjs estado
echo.
echo  Pidiendo permiso (acepta la ventana en VTube Studio si aparece)...
echo.
node vts.mjs conectar
echo.
pause
