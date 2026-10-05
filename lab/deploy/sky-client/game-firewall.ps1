# Make the game's reach outside the lab fail fast. The lab VLAN is dark by
# dropping, and SkyrimSE.exe opens TCP connections to bethesda.net from the
# main menu (Creations, the bnet login); with the SYNs dropped the game sits in
# connect() retries and Skyrim Platform never gets its first tick (sky-c1,
# 2026-10-01: four SynSent sockets to 99.84.41.x:443 and no plugin load in ten
# minutes, where the same client had logged in within two minutes while egress
# was open). A Windows Firewall block rule for the exe outside 10.10.70.0/24
# refuses those connections at once, the state the game handles. Machine-wide,
# so it runs as SYSTEM through the guest agent (`just client-game-firewall`).
# The price (2026-10-05): refused, the game retries api.bethesda.net hundreds
# of times a second and WinHTTP leaks each failed request, so an idle client
# runs out of memory in two to five hours (README, "The game's traffic outside
# the lab").
$exe = 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\SkyrimSE.exe'
$name = 'sky-lab: SkyrimSE outside the lab'
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
$rule = New-NetFirewallRule -DisplayName $name -Direction Outbound -Action Block -Program $exe -RemoteAddress '0.0.0.0-10.10.69.255', '10.10.71.0-255.255.255.255' -Profile Any -Enabled True
Write-Output ('rule ' + $rule.DisplayName + ': ' + $rule.Direction + ' ' + $rule.Action + ' enabled=' + $rule.Enabled + ' remote=' + (($rule | Get-NetFirewallAddressFilter).RemoteAddress -join ','))
