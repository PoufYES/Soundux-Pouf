$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'core-audio.cs'))
$source+=' public static class DefaultAudioName { public static string Get(){ var e=(IE)new Enumerator(); ID d; e.GetDefaultAudioEndpoint(0,1,out d); IPS s;d.OpenPropertyStore(0,out s);var k=new PK();k.g=new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");k.id=14;PV v;s.GetValue(ref k,out v);return Marshal.PtrToStringUni(v.ptr);}}'
Add-Type -TypeDefinition $source
[DefaultAudioName]::Get()
