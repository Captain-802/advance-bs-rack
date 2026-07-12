$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path $root 'index.html'
$outDir = Join-Path $root 'dist'
$outPath = Join-Path $outDir 'advance-bs-rack.html'
$utf8 = [Text.UTF8Encoding]::new($false)
$html = [IO.File]::ReadAllText($indexPath, $utf8)

$designerPath = Join-Path $root 'cantilever-designer.html'
if (-not (Test-Path $designerPath)) { throw "Missing beam designer: $designerPath" }
$designerBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($designerPath))
$html = $html.Replace('__CANTILEVER_DESIGNER_BASE64__', $designerBase64)

$pattern = '<script src="([^"]+)"></script>'
$html = [regex]::Replace($html, $pattern, {
  param($match)
  $src = $match.Groups[1].Value
  $cleanSrc = ($src -split '\?', 2)[0]
  $path = Join-Path $root ($cleanSrc -replace '/', '\')
  if (-not (Test-Path $path)) { return $match.Value }
  $js = [IO.File]::ReadAllText($path, $utf8)
  return '<script>' + "`r`n" + $js.Trim() + "`r`n" + '</script>'
})

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
[IO.File]::WriteAllText($outPath, $html, $utf8)
Write-Host "Built $outPath"
