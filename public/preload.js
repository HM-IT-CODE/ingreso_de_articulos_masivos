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
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    },
  },
});

//
/* const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electron', {
    ipcRenderer: {
      send: (channel, data) => {
        const validChannels = ['hola-mundo', 'test-comunicacion'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        }
      },
      once: (channel, func) => {
        const validChannels = ['hola-mundo-respuesta', 'test-comunicacion-respuesta'];
        if (validChannels.includes(channel)) {
          ipcRenderer.once(channel, (event, ...args) => func(...args));
        }
      }
    }
  }
);
 */
