param([ValidateSet('sync')][string]$Mode='sync')
$ErrorActionPreference='Stop'
$runDir=Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
$configPath=Join-Path $env:APPDATA 'Soundux\config.json'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class RemoteSave {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool PostThreadMessage(uint t,uint m,UIntPtr w,IntPtr l);
}
"@
foreach($p in @(Get-Process soundux -ErrorAction SilentlyContinue)){
 if($p.Path -ne (Join-Path $runDir 'soundux.exe')){throw 'Outra instalacao do Soundux esta aberta'}
 [uint32]$appPid=0
 $tid=[RemoteSave]::GetWindowThreadProcessId($p.MainWindowHandle,[ref]$appPid)
 if(-not $tid){throw 'Mostre a janela do Soundux e tente novamente'}
 [RemoteSave]::PostThreadMessage($tid,18,[UIntPtr]::Zero,[IntPtr]::Zero)|Out-Null
 if(-not $p.WaitForExit(10000)){throw 'Feche o Soundux pela bandeja'}
}
Copy-Item -LiteralPath $configPath -Destination ($configPath+'.remote-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($tab in $config.data.tabs){foreach($sound in $tab.sounds){$sound.hotkeys=@();$sound.hotkeySequence=''}}
$config.settings.stopHotkey=@()
$config.settings.pushToTalkKeys=@()
$config.settings.allowOverlapping=$false
[IO.File]::WriteAllText($configPath,($config|ConvertTo-Json -Depth 50 -Compress),(New-Object Text.UTF8Encoding($false)))
Start-Process -FilePath (Join-Path $runDir 'soundux.exe') -WorkingDirectory $runDir
'OK'
