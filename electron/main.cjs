const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  session,
} = require("electron");

const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

const execFileAsync = promisify(execFile);

let buddyWindow = null;
let clickThroughEnabled = false;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function configuredPath(value, fallback) {
  return path.resolve(__dirname, "..", value || fallback);
}

const WHISPER_CLI_PATH = configuredPath(
  process.env.WHISPER_CLI_PATH,
  "./tools/whisper-cli.exe"
);

const FFMPEG_PATH = configuredPath(
  process.env.FFMPEG_PATH,
  "./tools/ffmpeg.exe"
);

const WHISPER_MODEL_PATH = configuredPath(
  process.env.WHISPER_MODEL_PATH,
  "./tools/ggml-base.en.bin"
);

function createBuddyWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  buddyWindow = new BrowserWindow({
    width,
    height: 220,
    x,
    y: y + height - 220,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  buddyWindow.setAlwaysOnTop(true, "screen-saver");
  buddyWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  buddyWindow.once("ready-to-show", () => {
    buddyWindow?.show();
  });

  if (app.isPackaged) {
    buddyWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    buddyWindow.loadURL("http://localhost:5173");
  }

  buddyWindow.on("closed", () => {
    buddyWindow = null;
  });
}

function configureMediaPermissions() {
  const appSession = session.defaultSession;

  appSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const isBuddyWindow =
        buddyWindow &&
        !buddyWindow.isDestroyed() &&
        webContents.id === buddyWindow.webContents.id;

      const url = webContents.getURL();

      const isTrusted =
        url.startsWith("file://") ||
        url.startsWith("http://localhost:5173/");

      callback(Boolean(isBuddyWindow && isTrusted && permission === "media"));
    }
  );

  appSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const isBuddyWindow =
        buddyWindow &&
        !buddyWindow.isDestroyed() &&
        webContents?.id === buddyWindow.webContents.id;

      const isTrusted =
        typeof requestingOrigin === "string" &&
        (
          requestingOrigin.startsWith("file://") ||
          requestingOrigin.startsWith("http://localhost:5173")
        );

      return Boolean(isBuddyWindow && isTrusted && permission === "media");
    }
  );
}

function setClickThrough(enabled) {
  if (!buddyWindow || buddyWindow.isDestroyed()) return;

  clickThroughEnabled = enabled;

  buddyWindow.setIgnoreMouseEvents(enabled, { forward: true });
  buddyWindow.webContents.send("buddy:click-mode", enabled);
}

ipcMain.on("buddy:toggle-click-through", () => {
  setClickThrough(!clickThroughEnabled);
});

ipcMain.on("buddy:close", () => {
  buddyWindow?.close();
});

async function transcribeOffline(audioBuffer, jobId) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "jarwis-voice-")
  );

  const inputPath = path.join(tempDir, "audio.webm");
  const wavPath = path.join(tempDir, "audio.wav");
  const outputBase = path.join(tempDir, "transcript");
  const outputTextPath = `${outputBase}.txt`;

  try {
    if (!(await fileExists(WHISPER_CLI_PATH))) {
      throw new Error(`Whisper executable not found: ${WHISPER_CLI_PATH}`);
    }

    if (!(await fileExists(FFMPEG_PATH))) {
      throw new Error(`FFmpeg executable not found: ${FFMPEG_PATH}`);
    }

    if (!(await fileExists(WHISPER_MODEL_PATH))) {
      throw new Error(`Whisper model not found: ${WHISPER_MODEL_PATH}`);
    }

    await fs.writeFile(inputPath, audioBuffer);

    await execFileAsync(
      FFMPEG_PATH,
      [
        "-y",
        "-i", inputPath,
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        wavPath,
      ],
      { windowsHide: true, timeout: 30000 }
    );

    await execFileAsync(
      WHISPER_CLI_PATH,
      [
        "-m", WHISPER_MODEL_PATH,
        "-f", wavPath,
        "-l", "en",
        "-nt",
        "-np",
        "-otxt",
        "-of", outputBase,
      ],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const transcript = await fs.readFile(outputTextPath, "utf8");
    return transcript.trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function transcribeOnline(audioBuffer, mimeType) {
  if (!openai) {
    throw new Error(
      "Online transcription is unavailable. Add OPENAI_API_KEY to your .env file."
    );
  }

  const extension = mimeType.includes("mp4") ? "m4a" : "webm";

  const audioFile = await toFile(audioBuffer, `jarwis-audio.${extension}`, {
    type: mimeType || "audio/webm",
  });

  const result = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "gpt-transcribe",
    language: "en",
  });

  return (result.text || "").trim();
}

ipcMain.handle("voice:transcribe", async (event, payload) => {
  if (
    !buddyWindow ||
    buddyWindow.isDestroyed() ||
    event.sender.id !== buddyWindow.webContents.id
  ) {
    throw new Error("Unauthorized voice request.");
  }

  if (!payload || typeof payload.audioBase64 !== "string") {
    throw new Error("No audio was received.");
  }

  if (payload.audioBase64.length > 8 * 1024 * 1024) {
    throw new Error("Audio segment is too large.");
  }

  const audioBuffer = Buffer.from(payload.audioBase64, "base64");
  const mimeType = String(payload.mimeType || "audio/webm");
  const preferredMode =
    payload.preferredMode === "online" ? "online" : "offline";

  if (!audioBuffer.length) {
    return { text: "", mode: preferredMode };
  }

  const first = preferredMode;
  const second = first === "offline" ? "online" : "offline";
  let firstError;

  try {
    const text = first === "offline"
      ? await transcribeOffline(audioBuffer)
      : await transcribeOnline(audioBuffer, mimeType);

    return { text, mode: first };
  } catch (error) {
    firstError = error;
    console.error(`${first} transcription failed:`, error.message);
  }

  try {
    const text = second === "offline"
      ? await transcribeOffline(audioBuffer)
      : await transcribeOnline(audioBuffer, mimeType);

    return {
      text,
      mode: second,
      fallback: true,
      firstError: firstError.message,
    };
  } catch (secondError) {
    throw new Error(
      `${first} failed: ${firstError.message}. ` +
      `${second} fallback failed: ${secondError.message}`
    );
  }
});

app.whenReady().then(() => {
  configureMediaPermissions();
  createBuddyWindow();

  globalShortcut.register("F8", () => {
    setClickThrough(!clickThroughEnabled);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createBuddyWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});