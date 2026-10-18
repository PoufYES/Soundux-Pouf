$ErrorActionPreference='Stop'
try {
 $ruleName='Soundux Remote - rede local'
 if(-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)){
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3210 -RemoteAddress LocalSubnet -Profile Any -Program (Get-Command node.exe).Source | Out-Null
 }
 Enable-NetFirewallRule -DisplayName $ruleName
 $mdnsRule='Soundux Remote - nome local'
 if(-not (Get-NetFirewallRule -DisplayName $mdnsRule -ErrorAction SilentlyContinue)){
  New-NetFirewallRule -DisplayName $mdnsRule -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353 -RemoteAddress LocalSubnet -Profile Any -Program (Get-Command node.exe).Source | Out-Null
 }
 Enable-NetFirewallRule -DisplayName $mdnsRule
 'OK' | Set-Content (Join-Path $env:LOCALAPPDATA 'Soundux-Pouf\remote-firewall.log')
}catch{
 $_ | Out-String | Set-Content (Join-Path $env:LOCALAPPDATA 'Soundux-Pouf\remote-firewall.log')
 exit 1
}
