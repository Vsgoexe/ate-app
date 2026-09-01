const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("verilumenDesktop", {
  offline: true,
});
