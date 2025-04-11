const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
} = require("electron");

const path = require("path");
const fs = require("fs");
const { exec, spawn } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);
const serverPath = path.join(process.resourcesPath, "server.exe");

let mainWindow;
let tray;
let currentApiKey = "";

const configPath = path.join(__dirname, "config.json");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  return;
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function loadApiKey() {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    currentApiKey = config.apiKey || "";
  }
}

function saveApiKey(apiKey) {
  fs.writeFileSync(configPath, JSON.stringify({ apiKey }, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 780,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile("index.html");
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.hide();
}

function createTray() {
  tray = new Tray(path.join(__dirname, "icon.ico"));
  const contextMenu = Menu.buildFromTemplate([
    { label: "Mở", click: () => mainWindow.show() },
    {
      label: "Thoát",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("SnapAI");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    mainWindow.show();
  });
}

const isRunning = async (name) => {
  const { stdout } = await execAsync(`tasklist`);
  return stdout.toLowerCase().includes(name.toLowerCase());
};

app.whenReady().then(async () => {
  loadApiKey();
  createWindow();
  createTray();
  globalShortcut.register("Ctrl+Alt+X", handleGlobalShortcut);

  const serverRunning = await isRunning("server.exe");
  if (!serverRunning) {
    spawn(serverPath, {
      detached: false,
      stdio: "inherit",
      windowsHide: true,
    });

    mainWindow.webContents.on("did-finish-load", () => {
      const status = app.getLoginItemSettings().openAtLogin;
      mainWindow.webContents.send("autostart_status", status);
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("save_api_key", (event, apiKey) => {
  saveApiKey(apiKey);
});

ipcMain.handle("get_api_key", () => {
  loadApiKey();
  return currentApiKey;
});

async function handleGlobalShortcut() {
  mainWindow.hide();
  await handleSnippingTool();
  startListening();
}

async function handleSnippingTool() {
  const isRunning = await isSnipActive();
  if (!isRunning) {
    await openSnippingTool();
    await waitForSnippingToolToOpen();
  }
}

async function waitForSnippingToolToOpen() {
  while (true) {
    const isRunning = await isSnipActive();
    if (isRunning) break;
    await delay(100);
  }
}

async function openSnippingTool() {
  try {
    await execAsync("explorer ms-screenclip:");
    return true;
  } catch (err) {
    return false;
  }
}

ipcMain.on("trigger_capture", (_, args) => {
  handleGlobalShortcut();
});

const processes = [
  "SnippingTool.exe",
  "SnipTool.exe",
  "ScreenClippingHost.exe",
];

async function isSnipActive() {
  try {
    const { stdout } = await execAsync("tasklist");
    return processes.some((name) => stdout.includes(name));
  } catch (err) {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const createMouse = require("win-mouse");
const mouse = createMouse();

let isListening = false;

function startListening() {
  if (isListening) return;
  isListening = true;
  console.log("Listening...");
  mouse.on("left-down", onMouseDown);
  mouse.on("left-up", onMouseUp);
}

function stopListening() {
  if (!isListening) return;
  isListening = false;
  mouse.removeListener("left-down", onMouseDown);
  mouse.removeListener("left-up", onMouseUp);
}

let startX = null;
let startY = null;
let endX = null;
let endY = null;

function onMouseDown(x, y) {
  console.log(x, y);
  startX = x;
  startY = y;
}

function onMouseUp(x, y) {
  console.log(x, y);
  endX = x;
  endY = y;
  const isDragged = isDrag();
  handleMouseActionResult(isDragged);
}

function isDrag() {
  const deltaX = Math.abs(endX - startX);
  const deltaY = Math.abs(endY - startY);
  const threshold = 5;
  return deltaX > threshold || deltaY > threshold;
}

async function handleMouseActionResult(isDragged) {
  if (isDragged) {
    mainWindow.webContents.send("trigger_capture");
    stopListening();
  }
  const stillRunning = await isSnipActive();
  if (!stillRunning) {
    stopListening();
  }
}

ipcMain.on("show_main_windows", () => {
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.on("log_from_renderer", (_, args) => {
  console.log("[Renderer]", ...args);
});

ipcMain.on("set_autostart", (_, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
});

const killServer = () => {
  const cmd = "taskkill /IM server.exe /F";
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("Failed to kill server.exe:", stderr);
    } else {
      console.log("server.exe killed.");
    }
  });
};

app.on("before-quit", killServer);
app.on("will-quit", killServer);
process.on("exit", killServer);
process.on("SIGINT", () => {
  killServer();
  process.exit();
});
process.on("uncaughtException", (err) => {
  console.error("Unhandled error:", err);
  killServer();
  process.exit(1);
});
process.on("SIGINT", () => {
  console.log("SIGINT received (Ctrl+C)");
  killServer();
  process.exit();
});
