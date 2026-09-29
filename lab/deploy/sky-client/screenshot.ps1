# Capture the primary screen to C:\sky-lab\screenshots\<utc stamp>.png and
# latest.png. Runs in the interactive session through the on-demand task
# sky-lab-screenshot (schtasks /Run /TN sky-lab-screenshot from guest exec, then
# the file is read through the agent file API); session 0 cannot see the desktop.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$dir = 'C:\sky-lab\screenshots'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$name = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '.png'
$bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item (Join-Path $dir $name) (Join-Path $dir 'latest.png') -Force
$g.Dispose(); $bmp.Dispose()
