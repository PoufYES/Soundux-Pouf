import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lanAddresses} from './network.mjs';
const ip=address=>({family:'IPv4',address,internal:false});
test('QR uses physical LAN and excludes virtual and disconnected interfaces',()=>{
 const interfaces={'vEthernet (Default Switch)':[ip('172.23.80.1')],Ethernet:[ip('192.168.3.9')],'Wi-Fi':[ip('169.254.2.1')],lo:[{...ip('127.0.0.1'),internal:true}]};
 assert.deepEqual(lanAddresses(interfaces),['192.168.3.9']);
 assert.deepEqual(lanAddresses(interfaces,['Ethernet']),['192.168.3.9']);
 assert.deepEqual(lanAddresses({...interfaces,Ethernet:[ip('192.168.3.20')]},['Ethernet']),['192.168.3.20']);
 assert.deepEqual(lanAddresses(interfaces,[]),[]);
});
