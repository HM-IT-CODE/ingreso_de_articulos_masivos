const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
require("@electron/remote/main").initialize();
const sql = require("mssql");
const fs = require("fs");
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir);
  } catch (e) {}
}
const logFile = path.join(logDir, "insercion.log");
function writeLog(line) {
  const ts = new Date().toISOString();
  fs.appendFile(logFile, `[${ts}] ${line}\n`, () => {});
}

app.disableHardwareAcceleration();

if (isDev) {
  require("electron-reload")(path.join(__dirname, "../"));
}

// Configuración de conexión para cada base de datos
const dbConfigs = {
  venepac: {
    user: "sa",
    password: "Rsistems86",
    database: "venepac", // server: "localhost",
    server: "192.168.1.16\\saint",

    options: {
      encrypt: true, // No usar SSL
      trustServerCertificate: true, // Opción recomendada para entornos de desarrollo
    },
  },

  prueba_venepac: {
    user: "sa",
    password: "Rsistems86",
    database: "venepac",
    server: "localhost",

    options: {
      encrypt: true, // No usar SSL
      trustServerCertificate: true, // Opción recomendada para entornos de desarrollo
    },
  },

  dfsk: {
    user: "sa",
    password: "Rsistems86",
    database: "dfsk",
    server: "10.20.40.16\\saint",
    options: {
      encrypt: false, // No usar SSL
      trustServerCertificate: true, // Opción recomendada para entornos de desarrollo
    },
  },

  prueba_dfsk: {
    user: "sa",
    password: "Rsistems86",
    database: "dfsk",
    server: "localhost",
    //server: "10.20.40.16\\saint",
    options: {
      encrypt: false, // No usar SSL
      trustServerCertificate: true, // Opción recomendada para entornos de desarrollo
    },
  },
};
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: true, // Desactiva el redimensionamiento
    maximizable: true, // Desactiva el maximizar
    // frame: false, // Desactiva el marco de la ventana
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(
    isDev
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Manejador IPC para test de conexión
ipcMain.on("test-conexion", async (event, database) => {
  const sqlConfig = dbConfigs[database];
  if (!sqlConfig) {
    event.reply("test-conexion-respuesta", {
      success: false,
      mensaje: "Base de datos no válida seleccionada.",
    });
    return;
  }
  try {
    await sql.connect(sqlConfig);
    event.reply("test-conexion-respuesta", {
      success: true,
      mensaje: `Conexión exitosa a la base de datos: ${database}`,
    });
  } catch (err) {
    event.reply("test-conexion-respuesta", {
      success: false,
      mensaje: `Error de conexión: ${err.message}`,
    });
  } finally {
    sql.close();
  }
});

// Obtener categorías y grupos (para DFSk)
ipcMain.on("obtener-categorias", async (event, database) => {
  const sqlConfig = dbConfigs[database];
  if (!sqlConfig) {
    event.reply("obtener-categorias-respuesta", {
      success: false,
      mensaje: "Base de datos inválida",
      data: [],
    });
    return;
  }
  try {
    await sql.connect(sqlConfig);
    const query = `SELECT 
      CR.IDCATEGORIA,
      CR.IDGRUPO,
      CR.CATEGORIA,
      G.GRUPO
    FROM CATEGORIAREPUESTO CR
    LEFT JOIN GRUPOSREPUESTO G ON CR.IDGRUPO = G.IDGRUPO
    WHERE CR.ESTADO = 1
    ORDER BY CR.IDGRUPO, CR.IDCATEGORIA;`;
    const result = await sql.query(query);
    event.reply("obtener-categorias-respuesta", {
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    event.reply("obtener-categorias-respuesta", {
      success: false,
      mensaje: err.message,
      data: [],
    });
  } finally {
    sql.close();
  }
});

// Obtener marcas (CODIGOS tipo 'M')
ipcMain.on("obtener-marcas", async (event, database) => {
  const sqlConfig = dbConfigs[database];
  if (!sqlConfig) {
    event.reply("obtener-marcas-respuesta", {
      success: false,
      mensaje: "Base de datos inválida",
      data: [],
    });
    return;
  }
  try {
    await sql.connect(sqlConfig);
    const result = await sql.query(
      `SELECT CODIGO, DESCRIPCION FROM CODIGOS WHERE TIPO='M'`
    );
    event.reply("obtener-marcas-respuesta", {
      success: true,
      data: result.recordset || [],
    });
  } catch (err) {
    event.reply("obtener-marcas-respuesta", {
      success: false,
      mensaje: err.message,
      data: [],
    });
  } finally {
    sql.close();
  }
});

ipcMain.on("insertar-datos", async (event, datos) => {
  writeLog(`Solicitud insercion recibida base=${datos && datos.database}`);
  if (
    !datos ||
    !Array.isArray(datos.data) ||
    datos.data.length === 0 ||
    !datos.database
  ) {
    writeLog("Datos inválidos en solicitud");
    event.reply("insertar-datos-respuesta", "No se recibieron datos válidos.");
    return;
  }

  const sqlConfig = dbConfigs[datos.database];

  if (!sqlConfig) {
    writeLog("Base de datos no válida seleccionada");
    event.reply(
      "insertar-datos-respuesta",
      "Base de datos no válida seleccionada."
    );
    return;
  }

  let transaction;
  try {
    const pool = await sql.connect(sqlConfig);
    let respuesta = [];

    // Cargar mapa de MODELOS (usar DESCRIPCION y/o MODELO en una sola pasada)
    let modelosMap = {}; // KEY (texto upper) -> IDMODELO
    try {
      const rs = await pool
        .request()
        .query("SELECT IDMODELO, DESCRIPCION, MODELO FROM MODELOS");
      rs.recordset.forEach((r) => {
        if (r.DESCRIPCION) {
          const k1 = String(r.DESCRIPCION).trim().toUpperCase();
          if (k1) modelosMap[k1] = r.IDMODELO;
        }
        if (r.MODELO) {
          const k2 = String(r.MODELO).trim().toUpperCase();
          if (k2) modelosMap[k2] = r.IDMODELO;
        }
      });
      writeLog("Modelos cargados (claves)=" + Object.keys(modelosMap).length);
    } catch (e) {
      writeLog("Error cargando modelos: " + e.message);
    }

    // Obtener metadata de columnas clave de ARTICULOS (una sola vez) para diagnosticar tipos y saber si existe USUARIO/FECHACIF
    let colEsNum = {};
    let columnasArticulos = new Set();
    try {
      const meta = await pool
        .request()
        .query(
          "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULOS'"
        );
      colEsNum = meta.recordset.reduce((acc, r) => {
        acc[r.COLUMN_NAME.toUpperCase()] =
          /int|numeric|decimal|bigint|smallint|tinyint/i.test(r.DATA_TYPE);
        return acc;
      }, {});
      meta.recordset.forEach((r) =>
        columnasArticulos.add(r.COLUMN_NAME.toUpperCase())
      );
      writeLog(
        "Meta columnas ARTICULOS: " +
          meta.recordset
            .map(
              (r) =>
                r.COLUMN_NAME +
                "=" +
                r.DATA_TYPE +
                (colEsNum[r.COLUMN_NAME.toUpperCase()] ? "(NUM)" : "(TEX)")
            )
            .join(",")
      );
    } catch (e) {
      writeLog("No se pudo leer metadata columnas ARTICULOS: " + e.message);
    }

    // Crear y comenzar la transacción
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const dato of datos.data) {
      writeLog(`Procesando articulo=${dato.CODIGO}`);
      if (dato.USUARIO !== undefined) {
        writeLog(
          `Dato.USUARIO='${dato.USUARIO}' (tipo=${typeof dato.USUARIO})`
        );
      } else {
        writeLog(
          `Dato sin propiedad USUARIO. Claves disponibles: ${Object.keys(
            dato
          ).join(",")}`
        );
      }
      const codigoArticulo = String(dato.CODIGO).trim();
      const articuloMarcaRaw =
        dato.MARCA != null ? String(dato.MARCA).trim() : "";
      const articuloGrupoRaw =
        dato.GRUPO != null ? String(dato.GRUPO).trim() : "";

      // Conversión numérica segura (si son numéricos devolver número, si no, dejar cadena)
      // Detectar si MARCA debe ser numérica: si contiene sólo dígitos la parseamos para evitar error de conversión en columnas INT
      const articuloMarca = /^\d+$/.test(articuloMarcaRaw)
        ? parseInt(articuloMarcaRaw, 10)
        : articuloMarcaRaw;
      const articuloGrupo = /^\d+$/.test(articuloGrupoRaw)
        ? parseInt(articuloGrupoRaw, 10)
        : articuloGrupoRaw;

      // Normalizar posibles números con coma decimal
      const normNum = (v) => {
        if (v == null || v === "") return 0;
        const s = String(v).replace(/,/g, ".").trim();
        const n = Number(s);
        return isFinite(n) ? n : 0;
      };
      const CIF = normNum(dato.CIF);
      const GARANTIA = normNum(dato.GARANTIA);
      const IVA = normNum(dato.IVA) || 16.0;
      const REPOSICION = 0.0; // fijo por ahora
      const VENTA = 0.0;

      if (
        codigoArticulo === "" ||
        articuloMarca === "" ||
        articuloGrupo === ""
      ) {
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: "ARTICULO, MARCA o GRUPO inválido",
        });
        continue;
      }

      // Reglas: si la columna en la BD es numérica (según metadata) debemos enviar número; aplica para dfsk y prueba_dfsk
      let valorMarcaInsert = articuloMarca;
      let valorGrupoInsert = articuloGrupo;

      const bdRequiereNumerico = ["dfsk", "prueba_dfsk"].includes(
        datos.database
      );

      // Si hay IDGRUPO proporcionado y es numérico lo usamos como grupo para estas bases
      if (bdRequiereNumerico && /^\d+$/.test(String(dato.IDGRUPO || ""))) {
        valorGrupoInsert = parseInt(dato.IDGRUPO, 10);
      }

      const columnaMarcaEsNum = !!colEsNum["MARCA"];
      const columnaGrupoEsNum = !!colEsNum["GRUPO"];

      // Intentar convertir si se espera numérico
      if (columnaMarcaEsNum && /^\d+$/.test(String(valorMarcaInsert))) {
        valorMarcaInsert = parseInt(valorMarcaInsert, 10);
      }
      if (columnaGrupoEsNum && /^\d+$/.test(String(valorGrupoInsert))) {
        valorGrupoInsert = parseInt(valorGrupoInsert, 10);
      }

      // Validaciones estrictas si la columna es numérica (rechazar antes del INSERT)
      if (columnaMarcaEsNum && typeof valorMarcaInsert !== "number") {
        writeLog(
          `NO INSERT articulo=${codigoArticulo} -> MARCA columna numerica recibe='${valorMarcaInsert}'`
        );
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: "MARCA texto donde se requiere código numérico",
        });
        continue;
      }
      if (columnaGrupoEsNum && typeof valorGrupoInsert !== "number") {
        writeLog(
          `NO INSERT articulo=${codigoArticulo} -> GRUPO columna numerica recibe='${valorGrupoInsert}'`
        );
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: "GRUPO texto donde se requiere código numérico",
        });
        continue;
      }

      try {
        const tieneUsuario = columnasArticulos.has("USUARIO");
        const tieneFechacif = columnasArticulos.has("FECHACIF");
        const colsBase = [
          "ARTICULO",
          "DESCRIPCION",
          "MARCA",
          "UNIDAD",
          "REPOSICION",
          "IVA",
        ];
        if (tieneFechacif) colsBase.push("FECHACIF");
        colsBase.push(
          "CIF",
          "TIPO",
          "GARANTIA",
          "DESCUENTO",
          "FECHA",
          "FECHAACTUAL",
          "GRUPO",
          "VENTA"
        );
        if (tieneUsuario) colsBase.push("USUARIO");
        const placeholders = colsBase.map((c) => {
          if (c === "FECHA" || c === "FECHAACTUAL") return "GETDATE()";
          if (c === "FECHACIF") return "@FECHACIF";
          return "@" + c;
        });
        const queryArticulos = `INSERT INTO ARTICULOS (${colsBase.join(
          ", "
        )}) VALUES (${placeholders.join(", ")})`;
        writeLog(
          `Cols INSERT detectadas: ${colsBase.join(
            ","
          )} tieneUsuario=${tieneUsuario} tieneFechacif=${tieneFechacif}`
        );
        const reqArticulo = transaction.request();
        reqArticulo.input("ARTICULO", sql.VarChar, codigoArticulo);
        reqArticulo.input("DESCRIPCION", sql.VarChar, dato.DESCRIPCION);
        // Si MARCA es número usar Int, si no VarChar
        if (typeof valorMarcaInsert === "number") {
          reqArticulo.input("MARCA", sql.Int, valorMarcaInsert);
        } else {
          reqArticulo.input("MARCA", sql.VarChar, valorMarcaInsert);
        }
        reqArticulo.input("UNIDAD", sql.VarChar, dato.UNIDAD);
        reqArticulo.input("REPOSICION", sql.Decimal(18, 2), REPOSICION);
        reqArticulo.input("IVA", sql.Decimal(18, 2), IVA);
        if (tieneFechacif) {
          // Intentar parsear FECHACIF del dato si viene, aceptar formatos DD/MM/YYYY o YYYY-MM-DD
          let fechaCif = null;
          if (dato.FECHACIF) {
            const raw = String(dato.FECHACIF).trim();
            let parsed = null;
            const mDMY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
            if (mDMY) {
              const d = parseInt(mDMY[1], 10),
                mo = parseInt(mDMY[2], 10) - 1,
                y = parseInt(
                  mDMY[3].length === 2 ? "20" + mDMY[3] : mDMY[3],
                  10
                );
              parsed = new Date(y, mo, d);
            } else {
              const t = Date.parse(raw);
              if (!isNaN(t)) parsed = new Date(t);
            }
            if (parsed) fechaCif = parsed;
          }
          if (fechaCif) reqArticulo.input("FECHACIF", sql.DateTime, fechaCif);
          else reqArticulo.input("FECHACIF", sql.DateTime, new Date());
        }
        reqArticulo.input("CIF", sql.Decimal(18, 2), CIF);
        reqArticulo.input("TIPO", sql.VarChar, dato.TIPO || "A");
        reqArticulo.input("GARANTIA", sql.Decimal(18, 2), GARANTIA);
        reqArticulo.input("DESCUENTO", sql.Decimal(18, 2), 0.0);
        // Usar valorGrupoInsert (ya validado) para dfsk o fallback a articuloGrupo
        const grupoFinal = valorGrupoInsert; // ya normalizado o texto, según metadata
        if (typeof grupoFinal === "number") {
          reqArticulo.input("GRUPO", sql.Int, grupoFinal);
        } else {
          reqArticulo.input("GRUPO", sql.VarChar, grupoFinal);
        }
        reqArticulo.input("VENTA", sql.Decimal(18, 2), VENTA);
        if (tieneUsuario) {
          reqArticulo.input("USUARIO", sql.VarChar, dato.USUARIO || "");
        }
        writeLog(
          `INSERT ARTICULOS valores -> MARCA(${typeof valorMarcaInsert}=${valorMarcaInsert}) GRUPO(${typeof grupoFinal}=${grupoFinal}) CIF=${CIF} GARANTIA=${GARANTIA} USUARIO=${
            dato.USUARIO || ""
          }`
        );
        await reqArticulo.query(queryArticulos);

        const queryKardex = `
          INSERT INTO KARDEX
          (FECHA, ARTICULO, SALDO, CANT_ENT, CANT_IN, CANT_FACT, CANT_OUT, CANT_ENS)
          VALUES (GETDATE(), @ARTICULO, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00)
        `;
        await transaction
          .request()
          .input("ARTICULO", sql.VarChar, codigoArticulo)
          .query(queryKardex);

        // Inserción en ARTICULOSFICHAS con NUMEROPARTE, APLICA y MODELO (dfsk y prueba_dfsk)
        if (datos.database === "dfsk" || datos.database === "prueba_dfsk") {
          const queryArticulosFichasDfsk = `
            INSERT INTO ARTICULOSFICHAS
            (ARTICULO, FOTO, CARACTERISTICAS, NUMEROPARTE, APLICA, IDMODELO, IDGRUPO, IDCATEGORIA, URLIMAGEN)
            VALUES (@ARTICULO, Null, @CARACTERISTICAS, @NUMEROPARTE, @APLICA, @IDMODELO, @IDGRUPO, @IDCATEGORIA, @URLIMAGEN)
          `;
          const reqFichaDfsk = transaction.request();
          reqFichaDfsk.input("ARTICULO", sql.VarChar, codigoArticulo);
          reqFichaDfsk.input(
            "CARACTERISTICAS",
            sql.VarChar,
            dato.CARACTERISTICAS || dato.DESCRIPCION || ""
          );
          reqFichaDfsk.input(
            "NUMEROPARTE",
            sql.VarChar,
            dato.NUMEROPARTE || ""
          );
          reqFichaDfsk.input("APLICA", sql.VarChar, dato.APLICA || "");
          writeLog(
            `Ficha APLICA base=${
              datos.database
            } articulo=${codigoArticulo} aplica='${dato.APLICA || ""}'`
          );
          // Resolver IDMODELO si no viene explícito
          let idModeloResolved = null;
          if (dato.IDMODELO != null && dato.IDMODELO !== "") {
            idModeloResolved = dato.IDMODELO;
          } else if (dato.MODELO) {
            const keyModelo = String(dato.MODELO).trim().toUpperCase();
            if (modelosMap[keyModelo] != null) {
              idModeloResolved = modelosMap[keyModelo];
            } else {
              writeLog(
                `MODELO no encontrado articulo=${codigoArticulo} modelo='${dato.MODELO}'`
              );
            }
          }
          // Log de valor y tipo resuelto
          writeLog(
            `IDMODELO resolve articulo=${codigoArticulo} valor=${idModeloResolved} tipo=${typeof idModeloResolved}`
          );
          if (/^\d+$/.test(String(idModeloResolved || ""))) {
            reqFichaDfsk.input(
              "IDMODELO",
              sql.Int,
              idModeloResolved == null ? null : parseInt(idModeloResolved, 10)
            );
          } else {
            reqFichaDfsk.input(
              "IDMODELO",
              sql.VarChar,
              idModeloResolved == null ? null : String(idModeloResolved)
            );
          }
          // IDGRUPO / IDCATEGORIA pueden venir null o string; sólo pasar Int si es número
          if (/^\d+$/.test(String(dato.IDGRUPO || ""))) {
            reqFichaDfsk.input("IDGRUPO", sql.Int, parseInt(dato.IDGRUPO, 10));
          } else {
            reqFichaDfsk.input("IDGRUPO", sql.Int, null);
          }
          if (/^\d+$/.test(String(dato.IDCATEGORIA || ""))) {
            reqFichaDfsk.input(
              "IDCATEGORIA",
              sql.Int,
              parseInt(dato.IDCATEGORIA, 10)
            );
          } else {
            reqFichaDfsk.input("IDCATEGORIA", sql.Int, null);
          }
          reqFichaDfsk.input("URLIMAGEN", sql.VarChar, dato.URLIMAGEN || null);
          await reqFichaDfsk.query(queryArticulosFichasDfsk);
        } else {
          // Extender para otras bases: incluir APLICA, IDGRUPO, IDCATEGORIA, URLIMAGEN si existen columnas.
          // Intentaremos primero con conjunto extendido; si falla por columnas desconocidas, haremos fallback.
          let idModeloGenerico = (function () {
            let val = null;
            if (dato.IDMODELO != null && /^\d+$/.test(String(dato.IDMODELO))) {
              val = parseInt(dato.IDMODELO, 10);
            } else if (dato.MODELO) {
              const k = String(dato.MODELO).trim().toUpperCase();
              if (modelosMap[k] != null) val = modelosMap[k];
            }
            return val == null ? null : val;
          })();
          const tryExtended = async () => {
            const qExt = `
              INSERT INTO ARTICULOSFICHAS
              (ARTICULO, FOTO, CARACTERISTICAS, NUMEROPARTE, APLICA, IDMODELO, IDGRUPO, IDCATEGORIA, URLIMAGEN)
              VALUES (@ARTICULO, Null, @CARACTERISTICAS, @NUMEROPARTE, @APLICA, @IDMODELO, @IDGRUPO, @IDCATEGORIA, @URLIMAGEN)
            `;
            const rExt = transaction.request();
            rExt.input("ARTICULO", sql.VarChar, codigoArticulo);
            rExt.input(
              "CARACTERISTICAS",
              sql.VarChar,
              dato.CARACTERISTICAS || dato.DESCRIPCION || ""
            );
            rExt.input("NUMEROPARTE", sql.VarChar, dato.NUMEROPARTE || "");
            rExt.input("APLICA", sql.VarChar, dato.APLICA || "");
            if (idModeloGenerico == null) {
              rExt.input("IDMODELO", sql.Int, null);
            } else {
              rExt.input("IDMODELO", sql.Int, idModeloGenerico);
            }
            if (/^\d+$/.test(String(dato.IDGRUPO || ""))) {
              rExt.input("IDGRUPO", sql.Int, parseInt(dato.IDGRUPO, 10));
            } else {
              rExt.input("IDGRUPO", sql.Int, null);
            }
            if (/^\d+$/.test(String(dato.IDCATEGORIA || ""))) {
              rExt.input(
                "IDCATEGORIA",
                sql.Int,
                parseInt(dato.IDCATEGORIA, 10)
              );
            } else {
              rExt.input("IDCATEGORIA", sql.Int, null);
            }
            rExt.input("URLIMAGEN", sql.VarChar, dato.URLIMAGEN || null);
            await rExt.query(qExt);
          };
          try {
            await tryExtended();
          } catch (eExt) {
            writeLog(
              `Fallo inserción extendida ARTICULOSFICHAS articulo=${codigoArticulo} msg=${eExt.message} -> intentando fallback básico`
            );
            // Fallback a versión corta ya existente
            const qBasic = `
              INSERT INTO ARTICULOSFICHAS
              (ARTICULO, FOTO, CARACTERISTICAS, NUMEROPARTE, IDMODELO)
              VALUES (@ARTICULO, Null, @CARACTERISTICAS, @NUMEROPARTE, @IDMODELO)
            `;
            const rBasic = transaction.request();
            rBasic.input("ARTICULO", sql.VarChar, codigoArticulo);
            rBasic.input(
              "CARACTERISTICAS",
              sql.VarChar,
              dato.CARACTERISTICAS || dato.DESCRIPCION || ""
            );
            rBasic.input("NUMEROPARTE", sql.VarChar, dato.NUMEROPARTE || "");
            rBasic.input(
              "IDMODELO",
              sql.Int,
              idModeloGenerico == null ? null : idModeloGenerico
            );
            await rBasic.query(qBasic);
          }
        }

        // Advertencia si APLICA vino vacío
        const advertencias = [];
        if (!dato.APLICA) advertencias.push("APLICA vacío");
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Insertado",
          warn: advertencias.join("; "),
        });
        writeLog(`Insertado articulo=${dato.CODIGO}`);
      } catch (err) {
        console.error(`Error al insertar ARTICULO: ${dato.CODIGO}`, err);
        writeLog(`Error articulo=${dato.CODIGO} msg=${err.message}`);
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: err.message,
        });
      }
    }

    await transaction.commit();
    writeLog("Commit OK");
    event.reply("insertar-datos-respuesta", respuesta);
  } catch (err) {
    console.error("Error al insertar datos:", err);
    writeLog(`Error general transaccion=${err.message}`);
    if (transaction) {
      await transaction.rollback();
      writeLog("Rollback ejecutado");
    }
    event.reply(
      "insertar-datos-respuesta",
      `Error al insertar datos en la base de datos: ${err.message}`
    );
  } finally {
    writeLog("Cerrando conexión SQL");
    sql.close();
  }
});

/* TODO I-BUENO 
ipcMain.on("insertar-datos", async (event, datos) => {
  if (
    !datos ||
    !Array.isArray(datos.data) ||
    datos.data.length === 0 ||
    !datos.database
  ) {
    event.reply("insertar-datos-respuesta", "No se recibieron datos válidos.");
    return;
  }

  const sqlConfig = dbConfigs[datos.database];

  if (!sqlConfig) {
    event.reply(
      "insertar-datos-respuesta",
      "Base de datos no válida seleccionada."
    );
    return;
  }

  try {
    const pool = await sql.connect(sqlConfig);
    let respuesta = [];
          // Mapa para conocer si las columnas MARCA / GRUPO son numéricas realmente
          var colEsNum = {};
          meta.recordset.forEach((r) => {
            colEsNum[r.COLUMN_NAME.toUpperCase()] = /int|numeric|decimal/i.test(
              r.DATA_TYPE
            );
          });
          // Guardar referencia en variable local para uso en el loop
          var columnaMarcaEsNumerica = !!colEsNum["MARCA"];
          var columnaGrupoEsNumerica = !!colEsNum["GRUPO"];
          // Adjuntar a pool para depuración (no esencial)
          pool._columnaMarcaEsNumerica = columnaMarcaEsNumerica;
          pool._columnaGrupoEsNumerica = columnaGrupoEsNumerica;
    //! creo una trasaccion asincrona
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Proceso de inserción de datos
    for (const dato of datos.data) {
      const codigoArticulo = String(dato.CODIGO).trim();
      const articuloMarca = String(dato.MARCA).trim();
      const articuloGrupo = String(dato.GRUPO).trim();
      // Convertir a string y quitar espacios

      if (codigoArticulo === "") {
        console.error(`Valor inválido para ARTICULO: ${dato.CODIGO}`);
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: "ARTICULO inválido",
        });
        continue; // Salta a la siguiente iteración
      }

      if (articuloMarca === "") {
        console.error(`Valor inválido para ARTICULO: ${dato.MARCA}`);
        respuesta.push({
          codigo: dato.MARCA,
          status: "Fallido",
          mensaje: "MARCA inválido",
        });
        continue; // Salta a la siguiente iteración
      }

      if (articuloGrupo === "") {
        console.error(`Valor inválido para ARTICULO: ${dato.GRUPO}`);
        respuesta.push({
          codigo: dato.GRUPO,
          status: "Fallido",
          mensaje: "GRUPO inválido",
        });
        continue; // Salta a la siguiente iteración
      }

      try {
        const queryArticulos = `
          INSERT INTO ARTICULOS
          (ARTICULO, DESCRIPCION, MARCA, UNIDAD, REPOSICION, IVA, FECHACIF, CIF, TIPO, GARANTIA, DESCUENTO, FECHA, FECHAACTUAL, GRUPO, VENTA)
          VALUES (@ARTICULO, @DESCRIPCION, @MARCA, @UNIDAD, @REPOSICION, @IVA, GETDATE(), @CIF, @TIPO, @GARANTIA, @DESCUENTO, GETDATE(), GETDATE(), @GRUPO, @VENTA)
        `;

        await transaction
          .request()
          .input("ARTICULO", sql.VarChar, codigoArticulo)
          .input("DESCRIPCION", sql.VarChar, dato.DESCRIPCION)
          .input("MARCA", sql.VarChar, articuloMarca)
          .input("UNIDAD", sql.VarChar, dato.UNIDAD)
          .input("REPOSICION", sql.Decimal, 0.0)
          .input("IVA", sql.Decimal, 16.0)
          .input("CIF", sql.Decimal, dato.CIF || 0)
          .input("TIPO", sql.VarChar, dato.TIPO || "A")
          .input("GARANTIA", sql.Decimal, dato.GARANTIA || 0)
          .input("DESCUENTO", sql.Decimal, 0.0)
          .input("GRUPO", sql.VarChar, articuloGrupo)
          .input("VENTA", sql.Decimal, 0.0)
          .query(queryArticulos);

        // Insertar en KARDEX
        const queryKardex = `
      INSERT INTO KARDEX
      (FECHA, ARTICULO, SALDO, CANT_ENT, CANT_IN, CANT_FACT, CANT_OUT, CANT_ENS)
      VALUES (GETDATE(), @ARTICULO, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00)
    `;
        await transaction
          .request()
          .input("ARTICULO", sql.VarChar, dato.CODIGO)
          .query(queryKardex);

        // Insertar en ARTICULOSFICHAS
        const queryArticulosFichas = `
   INSERT INTO ARTICULOSFICHAS
   (ARTICULO, FOTO, CARACTERISTICAS)
   VALUES (@ARTICULO, NULL, @CARACTERISTICAS)
 `;

        await transaction
          .request()
          .input("ARTICULO", sql.VarChar, dato.CODIGO)
          .input("CARACTERISTICAS", sql.VarChar, dato.CARACTERISTICAS || "N/A")
          .query(queryArticulosFichas);

        respuesta.push({ codigo: dato.CODIGO, status: "Insertado" });
      } catch (err) {
        console.error(`Error al insertar ARTICULO: ${dato.CODIGO}`, err);
        respuesta.push({
          codigo: dato.CODIGO,
          status: "Fallido",
          mensaje: err.message,
        });
      }
    }

    //TODO Confirma la transacción si todo ha ido bien
    await transaction.commit();

    event.reply("insertar-datos-respuesta", respuesta);
  } catch (err) {
    console.error("Error al insertar datos:", err);
    // Deshace la transacción en caso de error
    if (transaction) {
      await transaction.rollback();
    } // Captura más detalles del error
    event.reply(
      "insertar-datos-respuesta",
      `Error al insertar datos en la base de datos: ${err.message}`
    );
  } finally {
    sql.close(); // Cerrar la conexión a la base de datos
  }
});
*/

/* const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
require("@electron/remote/main").initialize();
const sql = require("mssql");

// Configuración de la conexión a SQL Server
const sqlConfig = {
  user: "sa",
  password: "Rsistems86",
  database: "almacen",
  server: "localhost", // o el nombre de tu servidor
  options: {
    encrypt: false, // No usar SSL
    trustServerCertificate: true, // Opción recomendada para entornos de desarrollo
  },
};

// Función para crear la ventana principal de la aplicación
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(
    isDev
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );
}

app.whenReady().then(() => {
  createWindow();

  // Establecer la conexión con SQL Server
  sql.connect(sqlConfig).catch((err) => {
    console.error("Error al conectar a SQL Server:", err.message);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Manejador para el mensaje 'insertar-datos'
ipcMain.on("insertar-datos", async (event, datosExcel) => {
  if (!datosExcel || datosExcel.length === 0) {
    event.reply("insertar-datos-respuesta", "No se recibieron datos válidos.");
    return;
  }

  try {
    const pool = await sql.connect(sqlConfig);
    let respuesta = [];

    for (let i = 0; i < datosExcel.length; i++) {
      const dato = datosExcel[i];
      const query = `
        INSERT INTO ARTICULOS
        (ARTICULO, DESCRIPCION, MARCA, UNIDAD, REPOSICION, IVA, FECHACIF, CIF, TIPO, GARANTIA, DESCUENTO, FECHA, FECHAACTUAL, GRUPO, VENTA)
        VALUES (@ARTICULO, @DESCRIPCION, @MARCA, @UNIDAD, @REPOSICION, @IVA, GETDATE(), @CIF, @TIPO, @GARANTIA, @DESCUENTO, GETDATE(), GETDATE(), @GRUPO, @VENTA)
      `;

      await pool
        .request()
        .input("ARTICULO", sql.VarChar, dato.CODIGO)
        .input("DESCRIPCION", sql.VarChar, dato.DESCRIPCION)
        .input("MARCA", sql.VarChar, dato.MARCA)
        .input("UNIDAD", sql.VarChar, dato.UNIDAD)
        .input("REPOSICION", sql.Decimal, 0.0)
        .input("IVA", sql.Decimal, 16.0)
        .input("CIF", sql.Decimal, dato.CIF || 0)
        .input("TIPO", sql.VarChar, dato.TIPO || "A")
        .input("GARANTIA", sql.Decimal, dato.GARANTIA || 0)
        .input("DESCUENTO", sql.Decimal, 0.0)
        .input("GRUPO", sql.VarChar, dato.GRUPO)
        .input("VENTA", sql.Decimal, 0.0)
        .query(query);

      respuesta.push({ codigo: dato.CODIGO, status: "Insertado" });
    }

    event.reply("insertar-datos-respuesta", respuesta);
  } catch (error) {
    event.reply("insertar-datos-respuesta", `Error: ${error.message}`);
  }
});
 */
