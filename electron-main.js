const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 개발 모드인지 확인 (npm run electron으로 실행했는지)
  const isDev = process.env.npm_lifecycle_event === "electron";

  if (isDev) {
    // 개발 중일 땐 Vite 서버(localhost)를 띄움
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // 개발자 도구 열기
  } else {
    // 빌드 후엔 만들어진 html 파일을 띄움
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});