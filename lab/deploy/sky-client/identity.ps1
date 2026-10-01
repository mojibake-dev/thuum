param([string]$Client = 'c1', [int]$Profile = 1)
# Give a clone its own identity: the scenario client name lab-driver reports
# as (lab-driver-settings.txt: client) and the profile id skymp5-client logs in
# with (skymp5-client-settings.txt: gameData.profileId), in C:\sky-lab and in
# the game's Data\Platform\Plugins. The template carries c1 / 1; every clone
# after the first needs its own, after client-dist (which lays the template's
# files again) and before the launch test. Run as SYSTEM through the guest
# agent (`just client-identity <vmid> <client> <profile>`).
$ErrorActionPreference = 'Stop'
$game = (Get-Content 'C:\sky-lab\game-dir.txt' -Raw).Trim()
$plugins = Join-Path $game 'Data\Platform\Plugins'
$r = [ordered]@{}
foreach ($dir in @('C:\sky-lab', $plugins)) {
  $d = Join-Path $dir 'lab-driver-settings.txt'
  $j = Get-Content $d -Raw | ConvertFrom-Json
  $j.client = $Client
  $j | ConvertTo-Json | Set-Content -Path $d -Encoding ASCII
  $s = Join-Path $dir 'skymp5-client-settings.txt'
  $k = Get-Content $s -Raw | ConvertFrom-Json
  $k.gameData.profileId = $Profile
  $k | ConvertTo-Json | Set-Content -Path $s -Encoding ASCII
  $r[$dir] = 'client=' + (Get-Content $d -Raw | ConvertFrom-Json).client + ' profileId=' + (Get-Content $s -Raw | ConvertFrom-Json).gameData.profileId
}
$r | ConvertTo-Json -Compress
