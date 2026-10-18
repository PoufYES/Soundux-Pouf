param(
    [Parameter(Mandatory=$true)][int]$ProcessId,
    [Parameter(Mandatory=$true)][ValidateSet('state','close','click','minimize','quit','menu')][string]$Action,
    [string]$MenuText
)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SounduxTestWindow {
    [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
    [StructLayout(LayoutKind.Sequential)] struct MenuBarInfo {public int size;public Rect rect;public IntPtr menu,popup;public uint flags;}
    delegate bool EnumCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr first, IntPtr second);
    [DllImport("user32.dll")] static extern bool GetMenuBarInfo(IntPtr window,int objectId,int itemId,ref MenuBarInfo info);
    [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu,int position);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu,uint item,StringBuilder text,int count,uint flags);
    public static IntPtr PopupMenu(IntPtr window){var info=new MenuBarInfo();info.size=Marshal.SizeOf(info);return GetMenuBarInfo(window,-4,0,ref info)?info.menu:IntPtr.Zero;}
    public static string MenuText(IntPtr menu,int position){var text=new StringBuilder(512);GetMenuString(menu,(uint)position,text,text.Capacity,0x400);return text.ToString();}
    public static IntPtr Find(int process, string className) {
        IntPtr result=IntPtr.Zero;
        EnumWindows((window,parameter)=>{
            uint owner; GetWindowThreadProcessId(window,out owner);
            var name=new StringBuilder(256);GetClassName(window,name,name.Capacity);
            if(owner==process && name.ToString()==className){result=window;return false;}
            return true;
        },IntPtr.Zero);
        return result;
    }
}
'@
$window=[SounduxTestWindow]::Find($ProcessId,'Soundux')
$tray=[SounduxTestWindow]::Find($ProcessId,'soundux-tray')
switch($Action) {
    'state' {
        @{visible=[SounduxTestWindow]::IsWindowVisible($window);minimized=[SounduxTestWindow]::IsIconic($window);window=$window.ToInt64();tray=$tray.ToInt64()} | ConvertTo-Json -Compress
    }
    'close' { $null=[SounduxTestWindow]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) }
    'quit' { $null=[SounduxTestWindow]::PostMessage($window,0x12,[IntPtr]::Zero,[IntPtr]::Zero) }
    'click' { $null=[SounduxTestWindow]::PostMessage($tray,0x401,[IntPtr]::Zero,[IntPtr]0x202) }
    'minimize' { $null=[SounduxTestWindow]::ShowWindow($window,6) }
    'menu' {
        $null=[SounduxTestWindow]::PostMessage($tray,0x401,[IntPtr]::Zero,[IntPtr]0x205)
        for($attempt=0;$attempt -lt 30;$attempt++) {
            $popup=[SounduxTestWindow]::Find($ProcessId,'#32768')
            $menu=[SounduxTestWindow]::PopupMenu($popup)
            for($index=0;$index -lt [SounduxTestWindow]::GetMenuItemCount($menu);$index++) {
                if([SounduxTestWindow]::MenuText($menu,$index) -eq $MenuText) {
                    $command=[SounduxTestWindow]::GetMenuItemID($menu,$index)
                    $null=[SounduxTestWindow]::PostMessage($tray,0x1F,[IntPtr]::Zero,[IntPtr]::Zero)
                    $null=[SounduxTestWindow]::PostMessage($tray,0x111,[IntPtr]$command,[IntPtr]::Zero)
                    return
                }
            }
            Start-Sleep -Milliseconds 100
        }
        throw 'Tray menu item not found'
    }
}
