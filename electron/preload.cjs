const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("buddy", {
  toggleClickThrough: () => {
    ipcRenderer.send("buddy:toggle-click-through");
  },

  onClickMode: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on("buddy:click-mode", listener);

    return () => {
      ipcRenderer.removeListener("buddy:click-mode", listener);
    };
  },

  transcribeAudio: (payload) => {
    return ipcRenderer.invoke("voice:transcribe", payload);
  },

  close: () => {
    ipcRenderer.send("buddy:close");
  },
});