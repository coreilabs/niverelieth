$ErrorActionPreference = 'Stop'
$photoDirectory = Join-Path $PSScriptRoot 'assets/imgs'
$photos = @(Get-ChildItem -LiteralPath $photoDirectory -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|heic|dng)$' })
$failures = @()
$converted = 0
$bytesBefore = 0L
$bytesAfter = 0L
foreach ($photo in $photos) {
    $destination = Join-Path $photoDirectory ($photo.BaseName + '.webp')
    if (Test-Path -LiteralPath $destination) { throw "Destination already exists: $destination" }
    $stream = [System.IO.File]::OpenRead($photo.FullName)
    try { $first = $stream.ReadByte(); $second = $stream.ReadByte() } finally { $stream.Dispose() }
    $source = $photo.FullName
    if ($first -eq 255 -and $second -eq 216) { $source = 'jpeg:' + $source }
    & magick $source -auto-orient -colorspace sRGB -resize '1440x1920>' -strip -quality 78 -define webp:method=6 $destination 2>$null
    if ($LASTEXITCODE -ne 0) {
        $failures += $photo.Name
        continue
    }
    $details = & magick identify -format '%m %w %h' $destination
    if ($LASTEXITCODE -ne 0 -or $details -notmatch '^WEBP [1-9]\d* [1-9]\d*$') {
        $failures += $photo.Name
        continue
    }
    $bytesBefore += $photo.Length
    $bytesAfter += (Get-Item -LiteralPath $destination).Length
    Remove-Item -LiteralPath $photo.FullName
    $converted++
    Write-Output "Converted $converted/$($photos.Count): $($photo.Name)"
}
Write-Output "RESULT converted=$converted originalBytes=$bytesBefore webpBytes=$bytesAfter"
if ($failures.Count) { throw ('Failed (originals retained): ' + ($failures -join ', ')) }
