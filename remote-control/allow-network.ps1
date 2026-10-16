$ErrorActionPreference='Stop'
try {
 $ruleName='Soundux Remote - rede local'
 if(-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)){
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3210 -RemoteAddress LocalSubnet -Profile Any -Program (Get-Command node.exe).Source | Out-Null
 }
 'OK' | Set-Content (Join-Path $env:LOCALAPPDATA 'Soundux-Pouf\remote-firewall.log')
}catch{
 $_ | Out-String | Set-Content (Join-Path $env:LOCALAPPDATA 'Soundux-Pouf\remote-firewall.log')
 exit 1
}
