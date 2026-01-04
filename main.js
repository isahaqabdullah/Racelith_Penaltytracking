const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const { exec, spawn } = require('child_process');

const LICENSE_SECRET = 'RACELITH_LICENSE_SECRET';
let mainWindow;
let dockerBinaryPath;
let pendingLicenseResolve = null;
let currentFingerprint = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', message);
  }
  console.log(message);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: true,
    fullscreen: false,
    icon: path.join(__dirname, 'electron', 'resources', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
}

function getFingerprint() {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && iface.mac)
    .map((iface) => iface.mac.toLowerCase())
    .join(',');
  const raw = `${os.hostname()}|${process.platform}|${process.arch}|${macs}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function deriveLicense(fingerprint) {
  return `LIC-${crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(fingerprint)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()}`;
}

function validateLicense(code, fingerprint) {
  return typeof code === 'string' && code.trim() === deriveLicense(fingerprint);
}

function getLicensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

function loadStoredLicense() {
  try {
    const data = JSON.parse(fs.readFileSync(getLicensePath(), 'utf8'));
    return data.license;
  } catch (error) {
    return null;
  }
}

function persistLicense(code) {
  const licensePath = getLicensePath();
  fs.mkdirSync(path.dirname(licensePath), { recursive: true });
  fs.writeFileSync(licensePath, JSON.stringify({ license: code }, null, 2));
}

async function ensureLicense() {
  currentFingerprint = getFingerprint();
  const storedLicense = loadStoredLicense();
  if (validateLicense(storedLicense, currentFingerprint)) {
    sendLog('License validated');
    return storedLicense;
  }

  sendLog('License required');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('license-needed', currentFingerprint);
  }

  return new Promise((resolve) => {
    pendingLicenseResolve = resolve;
  });
}

function resolveDockerPath() {
  if (dockerBinaryPath) {
    return dockerBinaryPath;
  }
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.DOCKER_PATH,
          'C:\\\\Program Files\\\\Docker\\\\Docker\\\\resources\\\\bin\\\\docker.exe',
          'C:\\\\Program Files\\\\Docker\\\\Docker\\\\resources\\\\docker.exe',
        ]
      : [
          process.env.DOCKER_PATH,
          '/opt/homebrew/bin/docker',
          '/usr/local/bin/docker',
          '/usr/bin/docker',
        ];
  dockerBinaryPath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!dockerBinaryPath) {
    dockerBinaryPath = process.platform === 'win32' ? 'docker.exe' : 'docker';
  }
  return dockerBinaryPath;
}

function execCommand(command, options = {}) {
  const shell = process.platform === 'win32' ? process.env.ComSpec || 'C:\\\\Windows\\\\System32\\\\cmd.exe' : '/bin/zsh';
  const env = { ...process.env, ...options.env };
  const dockerPath = resolveDockerPath();
  if (dockerPath && path.isAbsolute(dockerPath)) {
    const dockerDir = path.dirname(dockerPath);
    env.PATH = env.PATH ? `${dockerDir}${path.delimiter}${env.PATH}` : dockerDir;
  }

  return new Promise((resolve, reject) => {
    exec(command, { shell, env, cwd: options.cwd }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function waitForDocker(retries = 20, delayMs = 5000) {
  const dockerPath = resolveDockerPath();
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await execCommand(`"${dockerPath}" info`);
      return;
    } catch (error) {
      sendLog(`Waiting for Docker... (${attempt + 1}/${retries})`);
      await delay(delayMs);
    }
  }
  throw new Error('Docker is not available');
}

async function startDockerDesktop() {
  if (process.platform === 'win32') {
    const desktopPath = 'C:\\\\Program Files\\\\Docker\\\\Docker\\\\Docker Desktop.exe';
    if (fs.existsSync(desktopPath)) {
      sendLog('Starting Docker Desktop...');
      spawn(desktopPath, [], { detached: true, stdio: 'ignore' }).unref();
    }
  } else if (process.platform === 'darwin') {
    sendLog('Starting Docker...');
    try {
      await execCommand('open -a Docker');
    } catch (error) {
      sendLog('Unable to start Docker automatically');
    }
  }
}

async function detectDocker() {
  const dockerPath = resolveDockerPath();
  try {
    await execCommand(`"${dockerPath}" info`);
    sendLog('Docker is available');
  } catch (error) {
    await startDockerDesktop();
    await waitForDocker();
  }
}

function getDockerDir() {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(base, 'electron', 'resources', 'docker');
}

async function loadDockerImages() {
  const dockerDir = getDockerDir();
  const dockerPath = resolveDockerPath();
  const images = ['backend.tar', 'frontend.tar', 'postgres.tar'];
  images.forEach((image) => {
    const imagePath = path.join(dockerDir, image);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Missing Docker image: ${imagePath}`);
    }
  });

  for (const image of images) {
    const imagePath = path.join(dockerDir, image);
    sendLog(`Loading Docker image ${image}...`);
    await execCommand(`"${dockerPath}" load -i "${imagePath}"`);
  }
}

async function resolveComposeCommand() {
  const dockerPath = resolveDockerPath();
  try {
    await execCommand(`"${dockerPath}" compose version`);
    return `"${dockerPath}" compose`;
  } catch (error) {
    try {
      await execCommand('docker-compose --version');
      return 'docker-compose';
    } catch (innerError) {
      try {
        await execCommand('docker-compose.exe --version');
        return 'docker-compose.exe';
      } catch (missing) {
        throw new Error('Docker Compose not found');
      }
    }
  }
}

async function startDockerCompose() {
  const composeCommand = await resolveComposeCommand();
  const composeFile = path.join(getDockerDir(), 'docker-compose.yml');
  sendLog('Starting Docker Compose...');
  await execCommand(`${composeCommand} -f "${composeFile}" up -d`, {
    cwd: path.dirname(composeFile),
  });
}

async function waitForBackend() {
  const url = 'http://localhost:8000/api/health';
  const retries = 30;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const healthy = await new Promise((resolve) => {
      const request = http.get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(response.statusCode === 200);
        });
      });
      request.on('error', () => resolve(false));
      request.setTimeout(2000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (healthy) {
      sendLog('Backend is healthy');
      return;
    }

    sendLog('Waiting for backend to become healthy...');
    await delay(2000);
  }

  throw new Error('Backend did not become healthy');
}

async function startApplication() {
  try {
    await ensureLicense();
    await detectDocker();
    await loadDockerImages();
    await startDockerCompose();
    await waitForBackend();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL('http://localhost:3002');
    }
  } catch (error) {
    sendLog(error.message || 'Application failed to start');
  }
}

ipcMain.handle('submit-license', async (event, code) => {
  const fingerprint = currentFingerprint || getFingerprint();
  if (validateLicense(code, fingerprint)) {
    const cleaned = code.trim();
    persistLicense(cleaned);
    if (pendingLicenseResolve) {
      pendingLicenseResolve(cleaned);
      pendingLicenseResolve = null;
    }
    sendLog('License accepted');
    return { success: true };
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('license-needed', fingerprint);
  }
  return { success: false, fingerprint };
});

app.whenReady().then(() => {
  createWindow();
  startApplication();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      startApplication();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
