param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\icon')
)

Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Add-RoundedRectangle {
  param($Graphics, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = New-RoundedPath $X $Y $Width $Height $Radius
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

$sourceSize = 1024
$scale = $sourceSize / 128
$source = [System.Drawing.Bitmap]::new($sourceSize, $sourceSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($source)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$blue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1d4ed8'))
$white = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))
$lightBlue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#bfdbfe'))
$navy = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))

Add-RoundedRectangle $graphics $blue (8*$scale) (8*$scale) (112*$scale) (112*$scale) (26*$scale)
Add-RoundedRectangle $graphics $white (27*$scale) (43*$scale) (20*$scale) (47*$scale) (6*$scale)
Add-RoundedRectangle $graphics $lightBlue (54*$scale) (29*$scale) (20*$scale) (61*$scale) (6*$scale)
Add-RoundedRectangle $graphics $white (81*$scale) (50*$scale) (20*$scale) (40*$scale) (6*$scale)
Add-RoundedRectangle $graphics $navy (21*$scale) (88*$scale) (86*$scale) (10*$scale) (5*$scale)
Add-RoundedRectangle $graphics $navy (30*$scale) (98*$scale) (8*$scale) (12*$scale) (4*$scale)
Add-RoundedRectangle $graphics $navy (90*$scale) (98*$scale) (8*$scale) (12*$scale) (4*$scale)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
foreach ($size in 16, 32, 48, 96, 128) {
  $target = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $targetGraphics = [System.Drawing.Graphics]::FromImage($target)
  $targetGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $targetGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $targetGraphics.DrawImage($source, 0, 0, $size, $size)
  $target.Save((Join-Path $OutputDirectory "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $targetGraphics.Dispose()
  $target.Dispose()
}

$blue.Dispose()
$white.Dispose()
$lightBlue.Dispose()
$navy.Dispose()
$graphics.Dispose()
$source.Dispose()
