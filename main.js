const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let win;
let pythonServer;

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 400,
    minWidth: 300,
    minHeight: 300,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // win.setBackgroundMaterial('acrylic'); // Disabled to increase transparency/see-through effect
  win.loadFile('index.html');
}

function startPythonServer() {
  pythonServer = spawn('python', [path.join(__dirname, 'server.py')], {
    stdio: 'pipe',
  });

  pythonServer.stdout.on('data', (d) => process.stdout.write(d));
  pythonServer.stderr.on('data', (d) => process.stderr.write(d));
}

app.whenReady().then(() => {
  startPythonServer();

  // Give Flask a moment to start
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (pythonServer) pythonServer.kill();
  app.quit();
});

// IPC handlers for window controls
ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('close', () => win?.close());
