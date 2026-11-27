# MisFinanzas DEV v1.2 — servidor local sin Python. Solo localhost; Ctrl+C para detener.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'web'))
if (!(Test-Path (Join-Path $root 'index.html'))) { throw 'No existe web/index.html' }
$port = 8765
$server = New-Object System.Net.HttpListener
$server.Prefixes.Add("http://localhost:$port/")
try {
    $server.Start()
    $url = "http://localhost:$port/"
    Write-Host "MisFinanzas DEV: $url" -ForegroundColor Green
    Start-Process $url
    while ($server.IsListening) {
        $ctx = $server.GetContext()
        try {
            $relative = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if (!$relative) { $relative = 'index.html' }
            $full = [IO.Path]::GetFullPath((Join-Path $root ($relative -replace '/', '\')))
            if (!$full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $full -PathType Leaf)) {
                $ctx.Response.StatusCode = 404
            } else {
                $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
                $mime = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.svg'='image/svg+xml';'.png'='image/png';'.ico'='image/x-icon'}
                $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) {$mime[$ext]} else {'application/octet-stream'}
                $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
                $ctx.Response.Headers.Add('Cache-Control', 'no-store')
                $data = [IO.File]::ReadAllBytes($full)
                $ctx.Response.ContentLength64 = $data.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') {$ctx.Response.OutputStream.Write($data,0,$data.Length)}
            }
        } catch { try {$ctx.Response.StatusCode = 500} catch {} }
        finally { $ctx.Response.Close() }
    }
} finally {if ($server.IsListening) {$server.Stop()};$server.Close()}
