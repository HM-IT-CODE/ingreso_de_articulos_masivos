const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel, data) => {
      const validChannels = [
        "insertar-datos",
        "enviando",
        "test-conexion",
        "obtener-categorias",
        "obtener-marcas",
        "obtener-resumen-series",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    once: (channel, func) => {
      const validChannels = [
        "insertar-datos-respuesta",
        "exitoso",
        "test-conexion-respuesta",
        "obtener-categorias-respuesta",
        "obtener-marcas-respuesta",
        "obtener-resumen-series-respuesta",
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    },
  },
});

// End of preload
