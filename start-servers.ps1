# PowerShell Server Starter
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   🚀 Starting All Servers" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = $PSScriptRoot

Write-Host "🛑 Stopping any existing Node processes..." -ForegroundColor Yellow
try {
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} catch {
    Write-Host "No existing Node processes found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🚀 Starting servers..." -ForegroundColor Green

# Start API Server
Write-Host "Starting API Server (Port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; Write-Host 'API Server - Port 3000' -ForegroundColor Cyan; node server.js"

Start-Sleep -Seconds 2

# Start Webhook Server  
Write-Host "Starting Webhook Server (Port 3001)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; Write-Host 'Webhook Server - Port 3001' -ForegroundColor Magenta; node src/services/webhookReceiver.js"

Start-Sleep -Seconds 2

# Start Dashboard Server
Write-Host "Starting Dashboard Server (Port 3006)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; Write-Host 'Dashboard Server - Port 3006' -ForegroundColor Yellow; node dashboard/server.js"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "✅ All servers started in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Server URLs:" -ForegroundColor White
Write-Host "   • API Server:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "   • Webhook Server:  http://localhost:3001/webhook" -ForegroundColor Magenta  
Write-Host "   • Dashboard:       http://localhost:3006" -ForegroundColor Yellow
Write-Host ""
Write-Host "To stop all servers: npm run stop:all" -ForegroundColor Gray
Write-Host ""

# Check if servers are running
Write-Host "🔍 Checking server status..." -ForegroundColor White
Start-Sleep -Seconds 5
$ports = netstat -ano | Select-String ":3000|:3001|:3006"
if ($ports) {
    Write-Host "✅ Servers detected on ports:" -ForegroundColor Green
    $ports | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠️  Servers may still be starting up..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
