# Make the game's reach outside the lab fail fast, and fail the way the game
# gives up on; Steam's startup update check too (3). Machine-wide, so it runs
# as SYSTEM through the guest agent (`just client-game-firewall`); README,
# "The game's traffic outside the lab".
#
# 1. The firewall rule. The lab VLAN is dark, and SkyrimSE.exe opens TCP
# connections to bethesda.net from the main menu (Creations, the bnet login);
# with the SYNs dropped the game sat in connect() retries and Skyrim Platform
# never got its first tick (sky-c1, 2026-10-01: four SynSent sockets to
# 99.84.41.x:443 and no plugin load in ten minutes, where the same client had
# logged in within two minutes while egress was open). A Windows Firewall block
# rule for the exe outside 10.10.70.0/24 refuses those connections at once.
#
# 2. The WinHTTP proxy. Refused, the game's Bethesda.net request retries at
# once and never closes the failed one: hundreds of tries a second, each
# leaking two Event handles and about 43 KB, until an idle client runs out of
# memory in two to five hours (2026-10-05). The request goes through WinHTTP
# with the machine proxy (WinHttpOpen with DEFAULT_PROXY), and its error
# handler retries only on a refused or broken connection (12004, 12015, 12029,
# 12030, 12032; ghidra/notes/bnet-leak-1-7-104.md, HYPOTHESIS from the static
# read). A machine proxy whose name never resolves (.invalid, RFC 2606) fails
# every request with 12007 instead, which the handler closes: on sky-c2 the
# handles fell from +930 to -920 every 30 s within a minute, commit stayed
# flat, and a fresh launch logged in with 1,500 handles that did not grow. The
# lab itself bypasses the proxy. The firewall rule stays for any connection
# that does not go through WinHTTP.
#
# 3. Steam's update hosts. An image that Steam saved in a "check for update on
# startup" state asks its three update hosts for a client manifest at every
# boot ("Checking for update on startup" in Steam\logs\bootstrap_log.txt), and
# in the dark lab each ask failed only after 21 to 22 s ("http error 0"): the
# web helper, and the game after it, came 64 s late on every boot of that
# image (sky-c2, 2026-10-16: client rollbacks of 142 to 264 s against 61 to
# 87). Steam's bootstrapper does not take the WinHTTP proxy. The hosts file
# answers the three names with 0.0.0.0 before any DNS, so the check fails at
# the connect, and the boot goes on.
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$updateHosts = 'client-update.fastly.steamstatic.com', 'client-update.akamai.steamstatic.com', 'client-update.steamstatic.com'
$kept = @(Get-Content $hosts | Where-Object { $_ -notmatch '# sky-lab: Steam update host$' })
Set-Content -Path $hosts -Encoding ascii -Value ($kept + ($updateHosts | ForEach-Object { "0.0.0.0 $_ # sky-lab: Steam update host" }))
Clear-DnsClientCache
Write-Output ('hosts ' + ((Get-Content $hosts | Select-String -Pattern '# sky-lab: Steam update host$' | ForEach-Object { ($_.Line -replace ' # sky-lab: Steam update host$', '') }) -join '; '))
$exe ='C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\SkyrimSE.exe'
$name = 'sky-lab: SkyrimSE outside the lab'
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
$rule = New-NetFirewallRule -DisplayName $name -Direction Outbound -Action Block -Program $exe -RemoteAddress '0.0.0.0-10.10.69.255', '10.10.71.0-255.255.255.255' -Profile Any -Enabled True
Write-Output ('rule ' + $rule.DisplayName + ': ' + $rule.Direction + ' ' + $rule.Action + ' enabled=' + $rule.Enabled + ' remote=' + (($rule | Get-NetFirewallAddressFilter).RemoteAddress -join ','))
netsh winhttp set proxy proxy-server="bnet-off.invalid:3128" bypass-list="<local>;10.10.70.*" | Out-Null
Write-Output ('winhttp ' + ((netsh winhttp show proxy | Select-String -Pattern 'Proxy Server|Bypass List' | ForEach-Object { ($_.Line -replace '\s+', ' ').Trim() }) -join '; '))
