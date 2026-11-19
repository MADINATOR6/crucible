# Record the Roblox Studio window to footage/raw.mp4, then find the sync flash.
# Usage: .\tools\record.ps1 -Episode 01-example -Seconds 30
# Studio must be the front window while recording. Start this, then press Play/run the director.
param(
    [Parameter(Mandatory)][string]$Episode,
    [int]$Seconds = 30,
    [string]$WindowTitle = "Roblox Studio"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$foot = Join-Path $root "$Episode\footage"
New-Item -ItemType Directory -Force $foot | Out-Null
$raw = Join-Path $foot "raw.mp4"
# gdigrab captures the window by title. libx264 ultrafast works on any machine; the NVENC encoder
# here needs a newer NVIDIA driver than is installed (ffmpeg 9 wants NVENC API 13.1, driver 610+).
ffmpeg -y -f gdigrab -framerate 30 -draw_mouse 0 -i "title=$WindowTitle" -t $Seconds `
    -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p $raw
Write-Host "Recorded $raw. Next: copy Studio output lines starting [FILM] into $foot\console.txt"
