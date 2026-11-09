# Minimal static server for previewing Signal Room without Node.
# Serves ./public on http://localhost:5173 and mirrors the Cloudflare assets routing:
#   /stage        -> stage.html
#   /join/CODE    -> index.html (phone page)
#   anything else -> the matching file, or 404
# Delete this once Vite is in place.
param([int]$Port = 5173)

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\public")).Path
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".woff2"= "font/woff2"
  ".ico"  = "image/x-icon"
}

function Resolve-Asset([string]$urlPath) {
  $rel = [System.Uri]::UnescapeDataString($urlPath).TrimStart("/")
  if ($rel -eq "") { return (Join-Path $root "index.html") }
  $candidates = @(
    (Join-Path $root $rel),
    (Join-Path (Join-Path $root $rel) "index.html"),
    (Join-Path $root ($rel + ".html"))
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c -PathType Leaf) {
      $full = [System.IO.Path]::GetFullPath($c)
      if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { return $full }
    }
  }
  if ($rel -match "^join/") { return (Join-Path $root "index.html") }
  return $null
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $file = Resolve-Asset $ctx.Request.Url.AbsolutePath
    if ($file) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = "application/octet-stream" }
      $res.StatusCode = 200
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
