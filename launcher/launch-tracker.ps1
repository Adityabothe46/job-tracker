# Desktop launcher for Job Tracker (run via launch-tracker.vbs so no console
# window ever appears). Starts the dev server hidden if it isn't already up,
# waits until it answers, opens the tracker in its own app-style Chrome window,
# and — only if this launcher started the server — stops the server again once
# that window is closed.

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:3000"
$logFile = Join-Path $projectDir "data\server.log"
# Dedicated Chrome profile: gives the tracker its own browser process that we
# can wait on (and keeps it separate from normal browsing tabs).
$chromeProfile = Join-Path $env:LOCALAPPDATA "JobTracker\chrome-profile"

Add-Type -AssemblyName System.Windows.Forms

function Test-ServerUp {
    # Next.js may listen on IPv6 only ("::"), so try both loopbacks.
    foreach ($address in @("::1", "127.0.0.1")) {
        try {
            $ip = [System.Net.IPAddress]::Parse($address)
            $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
            $connect = $client.BeginConnect($ip, 3000, $null, $null)
            $ok = $connect.AsyncWaitHandle.WaitOne(500) -and $client.Connected
            $client.Close()
            if ($ok) { return $true }
        } catch {
            # try the next address
        }
    }
    return $false
}

function Test-PageReady {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

$serverProcess = $null
if (-not (Test-ServerUp)) {
    New-Item -ItemType Directory -Force (Split-Path $logFile) | Out-Null
    $serverProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/d /c npm run dev > `"$logFile`" 2>&1" `
        -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru

    # First start compiles the app, which can take ~30-60s.
    $deadline = (Get-Date).AddSeconds(150)
    while (-not (Test-ServerUp)) {
        if ((Get-Date) -gt $deadline -or $serverProcess.HasExited) {
            [System.Windows.Forms.MessageBox]::Show(
                "Job Tracker couldn't start. Details are in:`n$logFile",
                "Job Tracker", "OK", "Error") | Out-Null
            exit 1
        }
        Start-Sleep -Milliseconds 700
    }
    # Warm up the page so the window doesn't open onto a half-compiled app.
    Test-PageReady | Out-Null
}

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($chrome) {
    $window = Start-Process -FilePath $chrome -PassThru -ArgumentList @(
        "--app=$url",
        "--user-data-dir=`"$chromeProfile`"",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1500,920"
    )
    if ($serverProcess) {
        # Wait for the tracker window to close, then shut the server down.
        $window.WaitForExit()
        & taskkill.exe /PID $serverProcess.Id /T /F | Out-Null
    }
} else {
    # No Chrome: fall back to the default browser (server keeps running).
    Start-Process $url
}
