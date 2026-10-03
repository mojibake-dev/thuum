# Give "Right Attack/Block" a keyboard key in the game's control map, so
# lab-driver's hold-key can make a power attack (the engine decides a power
# attack by how long the attack is held; SKSE's HoldKey on the mouse button
# does nothing, thuum run 20261003-115633, docs/verbs/damage-flags.md).
#
# The stock control map is read out of the clone's own Skyrim - Interface.bsa
# (BSA version 105, uncompressed; layout per UESP "Skyrim Mod:Archive File
# Format") and written back as a loose file, which the game prefers to the
# archive's copy. The licensed file never leaves the clone; the repo holds
# only this script. Run as an administrator inside the VM or through the guest
# agent; idempotent. Prints the attack line before and after.
param([string]$Key = '0xc7')   # Home: no default binding
$ErrorActionPreference = 'Stop'
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$bsa = Join-Path $game 'Data\Skyrim - Interface.bsa'
$out = Join-Path $game 'Data\Interface\Controls\PC\controlmap.txt'

$fs = [IO.File]::OpenRead($bsa)
$br = New-Object IO.BinaryReader($fs)
try {
  $magic = $br.ReadBytes(4); $version = $br.ReadUInt32(); $folderOffset = $br.ReadUInt32()
  $flags = $br.ReadUInt32(); $folderCount = $br.ReadUInt32(); $fileCount = $br.ReadUInt32()
  [void]$br.ReadUInt32(); [void]$br.ReadUInt32(); [void]$br.ReadUInt32()
  if ([Text.Encoding]::ASCII.GetString($magic, 0, 3) -ne 'BSA' -or $version -ne 105) { throw "not a version 105 BSA" }
  if ($flags -band 4) { throw "a compressed archive; this reader handles uncompressed only" }
  $fs.Position = $folderOffset
  $folders = @()
  for ($i = 0; $i -lt $folderCount; $i++) {
    [void]$br.ReadUInt64(); $count = $br.ReadUInt32(); [void]$br.ReadUInt32(); [void]$br.ReadUInt64()
    $folders += $count
  }
  # each folder: its name (byte length with the null, then the bytes), then its file records
  $records = @()
  foreach ($count in $folders) {
    $len = $br.ReadByte(); $name = [Text.Encoding]::ASCII.GetString($br.ReadBytes($len)).TrimEnd([char]0)
    for ($j = 0; $j -lt $count; $j++) {
      [void]$br.ReadUInt64(); $size = $br.ReadUInt32(); $offset = $br.ReadUInt32()
      $records += [pscustomobject]@{ Folder = $name; Size = $size; Offset = $offset }
    }
  }
  # then every file name, null-terminated, in record order
  for ($k = 0; $k -lt $records.Count; $k++) {
    $bytes = New-Object Collections.Generic.List[byte]
    while (($b = $br.ReadByte()) -ne 0) { $bytes.Add($b) }
    $records[$k] | Add-Member -NotePropertyName Name -NotePropertyValue ([Text.Encoding]::ASCII.GetString($bytes.ToArray()))
  }
  $hit = $records | Where-Object { $_.Folder -eq 'interface\controls\pc' -and $_.Name -eq 'controlmap.txt' } | Select-Object -First 1
  if (-not $hit) { throw "interface\controls\pc\controlmap.txt is not in the archive" }
  if ($hit.Size -band 0x40000000) { throw "the control map is stored compressed" }
  $fs.Position = $hit.Offset
  $text = [Text.Encoding]::ASCII.GetString($br.ReadBytes($hit.Size))
} finally { $br.Close() }

$lines = $text -split "`r?`n"
$found = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
  # keep the stock file's tab alignment: replace only the keyboard column
  if ($lines[$i] -match '^Right Attack/Block\t+') {
    'before: ' + $lines[$i]
    $lines[$i] = $lines[$i] -replace '^(Right Attack/Block\t+)\S+', ('${1}' + $Key)
    'after:  ' + $lines[$i]
    $found = $true
  }
}
if (-not $found) { throw "no Right Attack/Block line" }
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
[IO.File]::WriteAllText($out, ($lines -join "`r`n"), [Text.Encoding]::ASCII)
'written ' + $out
