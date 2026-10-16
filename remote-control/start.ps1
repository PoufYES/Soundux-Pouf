$ErrorActionPreference='Stop'
$node=(Get-Command node.exe).Source
$runDir=Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$existing=Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if(-not $existing){
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'bridge.ps1') -Mode sync
 if($LASTEXITCODE -ne 0){throw 'Nao foi possivel preparar o Soundux'}
 Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $PSScriptRoot 'server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'remote.log') -RedirectStandardError (Join-Path $runDir 'remote-error.log')
 $ready=$false
 for($attempt=0;$attempt -lt 30;$attempt++){
  Start-Sleep -Milliseconds 300
  if(Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue){$ready=$true;break}
 }
 if(-not $ready){throw "O servidor nao iniciou. Consulte $runDir\remote-error.log"}
}
$token=Get-Content (Join-Path $runDir 'remote-token') -Raw
Start-Process ('http://127.0.0.1:3210/?key='+$token.Trim())
