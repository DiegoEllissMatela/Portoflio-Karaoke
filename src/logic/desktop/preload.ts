import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  requestFirewallAccess: async () => {
    return ipcRenderer.invoke('request-firewall-access');
  },
});

