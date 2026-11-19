# Opens the Agent Pals mascots in a small always-on-top Edge app window.
# Drag it above the Claude app's prompt. Close it with the window's X.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = ([System.Uri](Join-Path $here 'pals.html')).AbsoluteUri
$edge = (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if (-not $edge) { $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw 'Microsoft Edge not found.' }

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@

$profile = Join-Path $here 'edge-profile'
Start-Process $edge -ArgumentList @("--app=$page", "--user-data-dir=$profile", '--window-size=640,150', '--window-position=300,60', '--no-first-run')

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  $win = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Agent Pals' } | Select-Object -First 1
  if ($win) {
    # HWND_TOPMOST = -1; SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW = 0x43
    [void][Win]::SetWindowPos($win.MainWindowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x43)
    'Agent Pals window is up and pinned on top.'
    return
  }
}
'Window opened, but I could not pin it on top (find it by the title "Agent Pals").'
