@echo off
echo Starting WhatsApp Care System...

:: Kill anything on ports 4000 and 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%a >nul 2>&1

timeout /t 2 /nobreak >nul

:: Start API (auto-connects WhatsApp on startup)
start "WAC - API Server" cmd /k "cd /d C:\xampp\htdocs\Claude_code\CS\whatsapp-care\apps\api && npx dotenv-cli -e ..\..\\.env -- npx ts-node-dev --no-notify --transpile-only src/index.ts"

echo Waiting for API to start...
timeout /t 10 /nobreak >nul

:: Build + Start Dashboard in production mode (fast page loads)
start "WAC - Dashboard" cmd /k "cd /d C:\xampp\htdocs\Claude_code\CS\whatsapp-care\apps\dashboard && npx next build && npx next start"

echo.
echo =====================================================
echo  WhatsApp Care is running!
echo  Dashboard: http://localhost:3000
echo  API:       http://localhost:4000
echo  WhatsApp connects automatically - no QR needed.
echo  Close the two terminal windows to stop.
echo =====================================================
echo.
pause
