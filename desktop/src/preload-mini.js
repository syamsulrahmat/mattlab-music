const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniPlayerAPI', {
  platform: process.platform,

  // Window Controls
  close: () => ipcRenderer.send('miniplayer-close'),
  minimize: () => ipcRenderer.send('miniplayer-minimize'),
  setOpacity: (val) => ipcRenderer.send('miniplayer-set-opacity', val),
  focusMainApp: () => ipcRenderer.send('miniplayer-focus-main'),

  // Media Controls (relayed to main window)
  sendAction: (action, payload) => ipcRenderer.send('miniplayer-action', { action, payload }),

  // Receive state updates from main player window
  onStateUpdate: (callback) => {
    const subscription = (_event, state) => callback(state);
    ipcRenderer.on('miniplayer-state-update', subscription);
    return () => ipcRenderer.removeListener('miniplayer-state-update', subscription);
  }
});
