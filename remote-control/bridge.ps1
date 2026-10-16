param([ValidateSet('sync','keys')][string]$Mode='sync', [string]$Keys='')
$ErrorActionPreference='Stop'
$runDir=Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
$configPath=Join-Path $env:APPDATA 'Soundux\config.json'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Threading;
public static class RemoteKeys {
 [DllImport("user32.dll")] static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool PostThreadMessage(uint t,uint m,UIntPtr w,IntPtr l);
 public static void Send(byte[] keys) { try { foreach(byte k in keys){keybd_event(k,0,0,UIntPtr.Zero);Thread.Sleep(20);} Thread.Sleep(80); } finally { for(int i=keys.Length-1;i>=0;i--){keybd_event(keys[i],0,2,UIntPtr.Zero);Thread.Sleep(20);} } }
}
'@
if($Mode -eq 'keys'){
 $values=@($Keys.Split(',') | ForEach-Object { [byte]$_ })
 if($values.Count -lt 1 -or $values.Count -gt 8){throw 'Atalho invalido'}
 if(-not (Get-Process soundux -ErrorAction SilentlyContinue)){throw 'Abra o Soundux primeiro'}
 [RemoteKeys]::Send([byte[]]$values)
 'OK'; exit
}
foreach($p in @(Get-Process soundux -ErrorAction SilentlyContinue)){
 if($p.Path -ne (Join-Path $runDir 'soundux.exe')){throw 'Outra instalacao do Soundux esta aberta'}
 [uint32]$appPid=0
 $tid=[RemoteKeys]::GetWindowThreadProcessId($p.MainWindowHandle,[ref]$appPid)
 if(-not $tid){throw 'Mostre a janela do Soundux e tente novamente'}
 [RemoteKeys]::PostThreadMessage($tid,18,[UIntPtr]::Zero,[IntPtr]::Zero)|Out-Null
 if(-not $p.WaitForExit(10000)){throw 'Soundux nao encerrou. Feche pelo icone da bandeja.'}
}
Copy-Item -LiteralPath $configPath -Destination ($configPath+'.remote-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$used=New-Object 'System.Collections.Generic.HashSet[string]'
foreach($tab in $config.data.tabs){foreach($sound in $tab.sounds){if($sound.hotkeys.Count){[void]$used.Add(($sound.hotkeys -join ','))}}}
if(-not $config.settings.stopHotkey.Count){$config.settings.stopHotkey=@(162,164,160,19)}
foreach($tab in $config.data.tabs){foreach($sound in $tab.sounds){
 if(($sound.hotkeys -join ',') -eq ($config.settings.stopHotkey -join ',')){$config.settings.stopHotkey=@(162,164,160,19)}
}}
[void]$used.Add(($config.settings.stopHotkey -join ','))
$pool=@(124..135)+@(65..90)+@(48..57)+@(112..123)
foreach($tab in $config.data.tabs){foreach($sound in $tab.sounds){
 if(-not $sound.hotkeys.Count){
  $chosen=$null
  foreach($key in $pool){$candidate=@(162,164,160,$key);if(-not $used.Contains(($candidate -join ','))){$chosen=$candidate;break}}
  if(-not $chosen){throw 'Limite de 60 atalhos automaticos atingido'}
  $sound.hotkeys=$chosen;[void]$used.Add(($chosen -join ','))
 }
}}
$config.settings.tabHotkeysOnly=$false
[IO.File]::WriteAllText($configPath,($config|ConvertTo-Json -Depth 50 -Compress),(New-Object Text.UTF8Encoding($false)))
Start-Process -FilePath (Join-Path $runDir 'soundux.exe') -WorkingDirectory $runDir
'OK'
