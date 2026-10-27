const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');

let mainWindow = null;
let miniPlayerWindow = null;
let tray = null;
let isQuitting = false;

// Remove native OS top menu bar entirely (Spotify style)
Menu.setApplicationMenu(null);

// Target MattLab Music host (configurable via environment variable or default)
const MATTLAB_MUSIC_URL = process.env.MATTLAB_URL || 'https://music.mattdrive.com';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    frame: false,            // Spotify style: frameless, no native OS title bar or top menu
    titleBarStyle: 'hidden', // Completely removes OS title bar
    title: 'MattLab Music',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // Ensures gapless audio stays smooth in background
    },
  });

  // Launch maximized edge-to-edge fullscreen desktop style
  mainWindow.maximize();

  mainWindow.loadURL(MATTLAB_MUSIC_URL);

  // Notify renderer of maximize/unmaximize state for button icons
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximize-status', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximize-status', false);
    }
  });

  // Intercept close event: hide to tray so music plays in background uninterrupted
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMiniPlayerWindow() {
  if (miniPlayerWindow) {
    miniPlayerWindow.focus();
    return;
  }

  miniPlayerWindow = new BrowserWindow({
    width: 360,
    height: 140,
    minWidth: 260,
    minHeight: 90,
    maxWidth: 600,
    maxHeight: 250,
    frame: false,            // Borderless frameless window
    transparent: true,        // Native OS-level transparent background
    backgroundColor: '#00000000', // Hex with alpha 0 to avoid opaque borders on Windows DWM
    thickFrame: false,        // Disables standard OS border shadow that breaks border-radius
    alwaysOnTop: true,        // Hovers over other apps/games
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,         // Custom CSS shadow inside the card provides true smooth blur
    vibrancy: 'under-window', // macOS frosted glass effect
    backgroundMaterial: 'acrylic', // Windows 11 Acrylic blur
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-mini.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  miniPlayerWindow.loadFile(path.join(__dirname, 'miniplayer.html'));

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null;
  });
}

// Window Control IPC Handlers (Spotify-style custom window frame)
ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Hide to tray so playback continues uninterrupted in background
    mainWindow.hide();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

// IPC Handlers
ipcMain.on('toggle-floating-miniplayer', (_event, trackData) => {
  if (miniPlayerWindow) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
  } else {
    createMiniPlayerWindow();
    if (trackData && miniPlayerWindow) {
      miniPlayerWindow.webContents.on('did-finish-load', () => {
        miniPlayerWindow.webContents.send('miniplayer-state-update', trackData);
      });
    }
  }
});

ipcMain.on('update-miniplayer-track', (_event, state) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('miniplayer-state-update', state);
  }
});

ipcMain.on('set-miniplayer-opacity', (_event, opacity) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    const alpha = Math.max(0.2, Math.min(1.0, Number(opacity) / 100));
    miniPlayerWindow.setOpacity(alpha);
  }
});

ipcMain.on('close-floating-miniplayer', () => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
  }
});

// MiniPlayer -> Main Window Relay Handlers
ipcMain.on('miniplayer-close', () => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
  }
});

ipcMain.on('miniplayer-focus-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // If the main window is already focused, visible, and not minimized,
    // reverse the action (Win+D style toggle): minimize it to give focus back to previous app!
    if (mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
      mainWindow.minimize();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  }
});

ipcMain.on('miniplayer-action', (_event, { action, payload }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('control-action', { action, payload });
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createMainWindow();

  // Register Global OS Media Key Shortcuts
  globalShortcut.register('MediaPlayPause', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-command', 'play-pause');
    }
  });

  globalShortcut.register('MediaNextTrack', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-command', 'next-track');
    }
  });

  globalShortcut.register('MediaPreviousTrack', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-command', 'prev-track');
    }
  });

  // Tray setup
  try {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show MattLab Music',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Toggle Floating MiniPlayer',
        click: () => {
          if (miniPlayerWindow) {
            miniPlayerWindow.close();
          } else {
            createMiniPlayerWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Play / Pause',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('media-command', 'play-pause');
        },
      },
      {
        label: 'Next Track',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('media-command', 'next-track');
        },
      },
      {
        label: 'Previous Track',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('media-command', 'prev-track');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip('MattLab Music');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('System tray initialization bypassed:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
