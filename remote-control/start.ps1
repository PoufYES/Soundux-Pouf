$ErrorActionPreference='Stop'
$node=(Get-Command node.exe).Source
$runDir=Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/qrcode/package.json')) -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/multicast-dns/package.json'))){
 & npm.cmd ci --omit=dev --prefix $PSScriptRoot
 if($LASTEXITCODE -ne 0){throw 'Nao foi possivel instalar os componentes do controle.'}
}
$rules=@(Get-NetFirewallRule -DisplayName 'Soundux Remote - rede local','Soundux Remote - nome local' -ErrorAction SilentlyContinue)
if(@($rules | Where-Object {$_.Enabled -eq 'True'}).Count -lt 2){
 $firewallScript=Join-Path $PSScriptRoot 'allow-network.ps1'
 $setup=Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$firewallScript+'"') -Verb RunAs -WindowStyle Hidden -Wait -PassThru
 if($setup.ExitCode -ne 0){throw 'Nao foi possivel liberar a conexao local no Firewall do Windows.'}
}
$existing=Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if(-not $existing){
 Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $PSScriptRoot 'server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'remote.log') -RedirectStandardError (Join-Path $runDir 'remote-error.log')
 $ready=$false
 for($attempt=0;$attempt -lt 30;$attempt++){
  Start-Sleep -Milliseconds 300
  if(Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue){$ready=$true;break}
 }
 if(-not $ready){throw "O servidor nao iniciou. Consulte $runDir\remote-error.log"}
}
