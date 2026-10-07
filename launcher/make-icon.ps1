# Generates the Job Tracker icon (navy->HUD-cyan rounded tile with "JT", matching
# the in-app logo) as launcher\job-tracker.ico for the desktop shortcut and
# src\app\icon.png, which Next.js serves as the favicon / app-window icon.
# Re-run only if you want to change the icon.

Add-Type -AssemblyName System.Drawing
$projectDir = Split-Path -Parent $PSScriptRoot

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"
    $g.TextRenderingHint = "AntiAliasGridFit"
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [int]($size * 0.24)
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d - 1, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d - 1, $size - $d - 1, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d - 1, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
        ([System.Drawing.Color]::FromArgb(255, 6, 30, 48)),
        ([System.Drawing.Color]::FromArgb(255, 27, 191, 224)), 45.0
    $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
    $blend.Colors = @(
        [System.Drawing.Color]::FromArgb(255, 6, 30, 48),
        [System.Drawing.Color]::FromArgb(255, 11, 115, 144),
        [System.Drawing.Color]::FromArgb(255, 27, 191, 224))
    $blend.Positions = @(0.0, 0.45, 1.0)
    $brush.InterpolationColors = $blend
    $g.FillPath($brush, $path)

    # Soft top highlight for a bit of depth.
    $highlight = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
        ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)),
        ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)), 90.0
    $g.FillPath($highlight, $path)

    $font = New-Object System.Drawing.Font "Segoe UI", ([float]($size * 0.40)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = "Center"
    $format.LineAlignment = "Center"
    $textRect = New-Object System.Drawing.RectangleF 0, ([float]($size * 0.02)), $size, $size
    $g.DrawString("JT", $font, [System.Drawing.Brushes]::White, $textRect, $format)

    $g.Dispose()
    return $bmp
}

function Get-PngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,$ms.ToArray()
}

# ICO with PNG-compressed entries (supported since Windows Vista).
$sizes = @(256, 64, 48, 32, 16)
$images = foreach ($s in $sizes) { ,(Get-PngBytes (New-IconBitmap $s)) }

$icoPath = Join-Path $PSScriptRoot "job-tracker.ico"
$fs = [System.IO.File]::Create($icoPath)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$images[$i].Length); $w.Write([UInt32]$offset)
    $offset += $images[$i].Length
}
foreach ($img in $images) { $w.Write($img) }
$w.Close()

$pngPath = Join-Path $projectDir "src\app\icon.png"
(New-IconBitmap 512).Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Output "Wrote $icoPath and $pngPath"
