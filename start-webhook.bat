@echo off
echo Stopping any existing webhook/node/ngrok processes...
taskkill /IM node.exe /F 2>nul
taskkill /IM ngrok.exe /F 2>nul
echo.

echo Starting webhook server on port 3005...
cd /d "%~dp0"
start /min cmd /k "echo Webhook Server && node src/services/webhookReceiver.js"

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

echo Starting ngrok tunnel...
start /min cmd /k "echo Ngrok Tunnel && C:\Users\%USERNAME%\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe http 3005"
echo Waiting for ngrok to start...
echo.
echo Starting webhook server on port 3001...
cd /d "%~dp0"
start /min cmd /k "echo Webhook Server && node src/services/webhookReceiver.js"

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

echo Starting ngrok tunnel...
start /min cmd /k "echo Ngrok Tunnel && C:\Users\%USERNAME%\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe http 3001"

echo Waiting for ngrok to start...
timeout /t 5 /nobreak >nul

echo.
echo Getting webhook URL...
powershell -Command "try { $response = Invoke-RestMethod -Uri 'http://localhost:4040/api/tunnels' -ErrorAction Stop; if ($response.tunnels.Count -gt 0) { $url = $response.tunnels[0].public_url; Write-Host 'NEW WEBHOOK URL:' -ForegroundColor Green; $webhookUrl = $url + '/jira-webhook?issueKey={issue.key}&projectKey={project.key}&user={modifiedUser.accountId}'; Write-Host $webhookUrl -ForegroundColor Yellow; Write-Host ''; Write-Host 'Copy this URL to your Jira webhook configuration' -ForegroundColor Cyan; } else { Write-Host 'No ngrok tunnels found' -ForegroundColor Red; } } catch { Write-Host 'Could not get ngrok URL - check http://127.0.0.1:4040' -ForegroundColor Red; }"

echo.
echo Monitor at: http://127.0.0.1:4040
echo.
pause
