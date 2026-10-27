const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, isolated APIs to the renderer window
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Window Controls (Spotify-style frameless header)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeStatus: (callback) => {
    const subscription = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window-maximize-status', subscription);
    return () => ipcRenderer.removeListener('window-maximize-status', subscription);
  },

  // Open, close, toggle true OS-level floating semi-transparent miniplayer
  toggleFloatingMiniPlayer: (trackData) => ipcRenderer.send('toggle-floating-miniplayer', trackData),
  updateMiniPlayerTrack: (trackData) => ipcRenderer.send('update-miniplayer-track', trackData),
  setMiniPlayerOpacity: (opacity) => ipcRenderer.send('set-miniplayer-opacity', opacity),
  closeFloatingMiniPlayer: () => ipcRenderer.send('close-floating-miniplayer'),

  // Listen for media key events forwarded from global shortcuts
  onMediaCommand: (callback) => {
    const subscription = (_event, command) => callback(command);
    ipcRenderer.on('media-command', subscription);
    return () => ipcRenderer.removeListener('media-command', subscription);
  },

  // Listen for track control actions from miniplayer or tray
  onControlAction: (callback) => {
    const subscription = (_event, action) => callback(action);
    ipcRenderer.on('control-action', subscription);
    return () => ipcRenderer.removeListener('control-action', subscription);
  }
});
