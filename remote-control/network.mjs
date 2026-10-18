export function lanAddresses(interfaces, physicalNames=null) {
 const virtual=/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|tailscale|zerotier|tunnel|vpn/i;
 const entries=Object.entries(interfaces).filter(([name])=>physicalNames ? physicalNames.includes(name) : !virtual.test(name));
 if(physicalNames)entries.sort((a,b)=>physicalNames.indexOf(a[0])-physicalNames.indexOf(b[0]));
 return [...new Set(entries.flatMap(([,addresses])=>(addresses||[]).filter(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.')).map(i=>i.address)))];
}
