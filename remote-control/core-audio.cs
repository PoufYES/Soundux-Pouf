using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PK { public Guid g; public uint id; public PK(uint n){g=new Guid("24dbb0fc-9311-4b3d-9cf0-18ff155639d4");id=n;} }
[StructLayout(LayoutKind.Explicit, Size=24)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr ptr; [FieldOffset(8)] public short b; }
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class Enumerator {}
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IE { void EnumAudioEndpoints(int f,uint s,out IntPtr c); void GetDefaultAudioEndpoint(int f,int r,out ID d); void GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out ID d); }
[ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface ID { void Activate(ref Guid g,uint c,IntPtr p,out IntPtr o); void OpenPropertyStore(uint mode,out IPS store); void GetId(out IntPtr id); void GetState(out uint state); }
[ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IPS { void GetCount(out uint count); void GetAt(uint i,out PK key); void GetValue(ref PK key,out PV value); void SetValue(ref PK key,ref PV value); void Commit(); }
