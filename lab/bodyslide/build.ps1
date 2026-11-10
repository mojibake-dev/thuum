# lab/bodyslide/build.ps1 -Inputs <dir> -Work <dir> -Out <dir> -SevenZip <7z.exe>: CBBE SFW Edition's BodySlide projects built with
# morph files (lab/bodyslide/README.md). The inputs are the two Nexus archives inputs.tsv names, checked by md5; everything else is
# here: BodySlide 6.1.0's tree and SFW's two BodySlide trees laid into one Data\CalienteTools as a mod manager lays them, BodySlide's
# config preset for Skyrim SE with its dialogs off (a headless run has no one to answer them), then two batch builds with the
# preset SFW's own prebuilt meshes are built with, "CBBE Curvy (Outfit)" (Eli's call: "keep the shipped sfw shape"), and
# --trimorphs: the NeverNude body, feet, hands and beast hands, then every outfit group. "CBBE (SFW)" is the group SFW's 14
# presets belong to, not a preset: named on the command line, BodySlide 6.1.0 builds at the projects' default sliders without
# a word (SliderManager::GetBigPresetValue falls back), which jobs 19669 and before did. A sweep of the 14 on sky-build
# (2026-11-07) matched SFW's prebuilt femalebody_1.nif to CBBE Curvy (Outfit) alone (mean 0.0002, max 0.018 units), so the
# preset is named here and checked against the preset files before anything is built.
# Out receives Data-layout meshes, each with a BODYTRI link to its .tri; the run fails when one is missing or a build hangs.
param([Parameter(Mandatory)][string]$Inputs, [Parameter(Mandatory)][string]$Work, [Parameter(Mandatory)][string]$Out, [Parameter(Mandatory)][string]$SevenZip)
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$rows = Get-Content (Join-Path $here 'inputs.tsv') | Where-Object { $_ -and -not $_.StartsWith('#') } | Select-Object -Skip 1 | ForEach-Object { $f = $_ -split "`t"; [pscustomobject]@{ Name = $f[0]; File = $f[2]; Md5 = $f[3] } }
$archive = @{}
foreach ($r in $rows) {
  $p = Join-Path $Inputs $r.File
  if (-not (Test-Path -LiteralPath $p)) { throw "missing input $p (lab/tools/bodyslide-inputs.sh places it)" }
  $md5 = (Get-FileHash -Algorithm MD5 -LiteralPath $p).Hash.ToLower()
  if ($md5 -ne $r.Md5) { throw "$($r.File) md5 $md5 is not $($r.Md5)" }
  $archive[$r.Name] = $p; "input ok: $($r.File)"
}
foreach ($d in @($Work, $Out)) { if (Test-Path $d) { Remove-Item -Recurse -Force $d }; New-Item -ItemType Directory -Force $d | Out-Null }
$x = Join-Path $Work 'x'; $data = Join-Path $Work 'Data'
& $SevenZip x -y "-o$x\bs" $archive['bodyslide'] 'CalienteTools\*' | Out-Null; if ($LASTEXITCODE) { throw "7z bodyslide $LASTEXITCODE" }
& $SevenZip x -y "-o$x\sfw" $archive['cbbe-sfw'] '00 Required\CalienteTools\*' '11 Outfits BodySlide\CalienteTools\*' | Out-Null; if ($LASTEXITCODE) { throw "7z sfw $LASTEXITCODE" }
New-Item -ItemType Directory -Force $data | Out-Null
foreach ($src in @("$x\bs\CalienteTools", "$x\sfw\00 Required\CalienteTools", "$x\sfw\11 Outfits BodySlide\CalienteTools")) {
  & robocopy $src "$data\CalienteTools" /E /NFL /NDL /NJH /NJS /NP | Out-Null; if ($LASTEXITCODE -ge 8) { throw "robocopy $src $LASTEXITCODE" }
}
$bsdir = Join-Path $data 'CalienteTools\BodySlide'; $bs = Join-Path $bsdir 'BodySlide.exe'
$cfg = Join-Path $bsdir 'Config.xml'; $c = [IO.File]::ReadAllText($cfg)
foreach ($pair in @(@('<TargetGame>-1</TargetGame>', '<TargetGame>4</TargetGame>'), @('<WarnMissingGamePath>true</WarnMissingGamePath>', '<WarnMissingGamePath>false</WarnMissingGamePath>'), @('<BSATextureScan>true</BSATextureScan>', '<BSATextureScan>false</BSATextureScan>'))) {
  if (-not $c.Contains($pair[0])) { throw "Config.xml lacks $($pair[0])" }; $c = $c.Replace($pair[0], $pair[1])
}
[IO.File]::WriteAllText($cfg, $c); "BodySlide " + (Get-Item $bs).VersionInfo.FileVersion + ", config preset for Skyrim SE"
function Build([string[]]$a, [string]$what) {
  $t0 = Get-Date; $p = Start-Process -FilePath $bs -ArgumentList $a -PassThru -WorkingDirectory $bsdir
  if (-not $p.WaitForExit(1500000)) { try { $p.Kill() } catch {}; throw "$what hung after 25 min (a dialog in the headless session?)" }
  if ($p.ExitCode -ne 0) { throw "$what exit $($p.ExitCode)" }
  "$what ok after " + [int]((Get-Date) - $t0).TotalSeconds + " s"
}
$preset = 'CBBE Curvy (Outfit)'
$known = @(Get-ChildItem (Join-Path $bsdir 'SliderPresets') -Filter *.xml -File | ForEach-Object {
    ([xml](Get-Content -Raw -LiteralPath $_.FullName)).SliderPresets.Preset | ForEach-Object { $_.name } })
if ($known -notcontains $preset) { throw "preset '$preset' is in no SliderPresets file (BodySlide would build at default sliders)" }
$common = @('--preset', "`"$preset`"", '--targetdir', "`"$Out`"", '--trimorphs', '--quiet')
# the body group also holds the Underwear body, which writes the same files; NeverNude (vanilla-styled) by name
Build (@('--build', '"CBBE Feet (SFW),CBBE Hands (SFW),CBBE Hands Beast (SFW),CBBE NeverNude (SFW)"') + $common) 'body build'
# the group names the files define, not their titles: Vanilla, Dawnguard, Dragonborn and Vanilla 1st Person are all "CBBE Vanilla Outfits (SFW)"
Build (@('--groupbuild', '"CBBE Vanilla Outfits (SFW),CBBE Creation Club (SFW),CBBE Creation Club 1st Person (SFW)"') + $common) 'outfit build'
$nifs = @(Get-ChildItem $Out -Recurse -Filter *.nif -File); $tris = @(Get-ChildItem $Out -Recurse -Filter *.tri -File)
$unlinked = @($nifs | Where-Object { -not ([IO.File]::ReadAllText($_.FullName, [Text.Encoding]::GetEncoding(28591)).Contains('BODYTRI')) })
"output: $($nifs.Count) nif, $($tris.Count) tri, $($unlinked.Count) without a BODYTRI link"
if ($nifs.Count -eq 0 -or $unlinked.Count -gt 0) { throw "the build's output is incomplete" }
Get-Content (Join-Path $bsdir 'Log_BS.txt') | Where-Object { $_ -match 'belong to the specified|successfully|[Ee]rror|[Ff]ailed' }
