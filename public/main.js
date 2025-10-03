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
    width: 1200,
    height: 800,
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

    // RUTA SIMPLE VENEPAC (sin MODELOS, con mapeo MARCA si numérica) ------------------
    const dbName = String(datos.database || "")
      .trim()
      .toLowerCase();
    if (dbName === "venepac" || dbName === "prueba_venepac") {
      writeLog(`Modo VENEPAC_SIMPLE activo base=${dbName}`);
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      // --- Metadata columnas relevantes (tipos + longitud) ---
      let metaCols = {};
      try {
        const rsMeta = await pool
          .request()
          .query(
            "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULOS' AND COLUMN_NAME IN ('MARCA','GRUPO','SUBGRUPO','MODELO','DESCRIPCION','UNIDAD','USUARIO')"
          );
        rsMeta.recordset.forEach((r) => {
          metaCols[r.COLUMN_NAME.toUpperCase()] = {
            isNum: /int|numeric|decimal|bigint|smallint|tinyint/i.test(
              r.DATA_TYPE
            ),
            max: r.CHARACTER_MAXIMUM_LENGTH,
          };
        });
      } catch (e) {
        writeLog(
          "VENEPAC_SIMPLE Error leyendo metadata columnas: " + e.message
        );
      }
      const marcaEsNum = !!(metaCols.MARCA && metaCols.MARCA.isNum);
      const grupoEsNum = !!(metaCols.GRUPO && metaCols.GRUPO.isNum);
      const subgrupoEsNum = !!(metaCols.SUBGRUPO && metaCols.SUBGRUPO.isNum);
      const modeloEsNum = !!(metaCols.MODELO && metaCols.MODELO.isNum);
      if (metaCols.DESCRIPCION) {
        writeLog(
          `VENEPAC_SIMPLE Meta DESCRIPCION tipoNum=${metaCols.DESCRIPCION.isNum} maxLen=${metaCols.DESCRIPCION.max}`
        );
      } else {
        writeLog(
          "VENEPAC_SIMPLE Meta DESCRIPCION no encontrada en INFORMATION_SCHEMA"
        );
      }
      writeLog(
        `VENEPAC_SIMPLE Tipos -> MARCA_NUM=${marcaEsNum} GRUPO_NUM=${grupoEsNum} SUBGRUPO_NUM=${subgrupoEsNum} MODELO_NUM=${modeloEsNum}`
      );
      const trunc = (colName, val) => {
        if (val == null) return val;
        const mc = metaCols[colName];
        if (!mc || mc.max == null || typeof val !== "string") return val;
        // mc.max = -1 indica VARCHAR(MAX) en SQL Server => no truncar
        if (mc.max === -1) return val;
        if (val.length > mc.max) return val.substring(0, mc.max);
        return val;
      };
      // --- Cargar catálogos (M,G,S) si columnas numéricas ---
      const loadCatalogo = async (tipo) => {
        try {
          const rs = await pool
            .request()
            .query(
              `SELECT CODIGO, DESCRIPCION FROM CODIGOS WHERE TIPO='${tipo}'`
            );
          const map = {};
          rs.recordset.forEach((r) => {
            if (r.DESCRIPCION && r.CODIGO != null) {
              map[String(r.DESCRIPCION).trim().toUpperCase()] = r.CODIGO;
            }
          });
          return map;
        } catch (e) {
          writeLog(
            `VENEPAC_SIMPLE Error cargando catalogo tipo=${tipo}: ${e.message}`
          );
          return {};
        }
      };
      let mapaMarcas = marcaEsNum ? await loadCatalogo("M") : {};
      let mapaGrupos = grupoEsNum ? await loadCatalogo("G") : {};
      let mapaSubgrupos = subgrupoEsNum ? await loadCatalogo("S") : {};
      writeLog(
        `VENEPAC_SIMPLE Catalogos -> marcas=${
          Object.keys(mapaMarcas).length
        } grupos=${Object.keys(mapaGrupos).length} subgrupos=${
          Object.keys(mapaSubgrupos).length
        }`
      );
      // Pre-cargar artículos existentes para evitar duplicados
      const codigosLote = [
        ...new Set(
          datos.data.map((d) => String(d.CODIGO || "").trim()).filter(Boolean)
        ),
      ];
      let existentes = new Set();
      if (codigosLote.length) {
        try {
          const listaIn = codigosLote
            .map((c) => `'${c.replace(/'/g, "''")}'`)
            .join(",");
          const rsExist = await pool
            .request()
            .query(
              `SELECT ARTICULO FROM ARTICULOS WHERE ARTICULO IN (${listaIn})`
            );
          rsExist.recordset.forEach((r) =>
            existentes.add(String(r.ARTICULO).trim())
          );
          writeLog(
            `VENEPAC_SIMPLE Duplicados preexistentes=${existentes.size}`
          );
        } catch (eDup) {
          writeLog("VENEPAC_SIMPLE Error precarga duplicados: " + eDup.message);
        }
      }
      const insertadosEnLote = new Set();
      for (const dato of datos.data) {
        const codigoArticulo = String(dato.CODIGO || "").trim();
        // Defaults solicitados: MARCA=GENERAL, GRUPO=MUESTRA, SUBGRUPO=ACCESORIES
        const rawMarca = String(dato.MARCA || "GENERAL").trim();
        const rawGrupo = String(dato.GRUPO || "MUESTRA").trim();
        const rawSubgrupo = String(dato.SUBGRUPO || "ACCESORIES").trim();
        const rawModelo = String(dato.MODELO || "").trim();
        if (!codigoArticulo || !rawMarca || !rawGrupo) {
          respuesta.push({
            codigo: codigoArticulo || dato.CODIGO,
            status: "Fallido",
            mensaje: "ARTICULO, MARCA o GRUPO vacío",
          });
          continue;
        }
        if (existentes.has(codigoArticulo)) {
          respuesta.push({
            codigo: codigoArticulo,
            status: "Duplicado",
            mensaje: "Ya existe en BD",
          });
          writeLog(`VENEPAC_SIMPLE Duplicado BD ${codigoArticulo}`);
          continue;
        }
        if (insertadosEnLote.has(codigoArticulo)) {
          respuesta.push({
            codigo: codigoArticulo,
            status: "Duplicado",
            mensaje: "Repetido en archivo",
          });
          writeLog(`VENEPAC_SIMPLE Duplicado archivo ${codigoArticulo}`);
          continue;
        }
        // Resolver / mapear MARCA
        let marcaValor = rawMarca;
        if (marcaEsNum) {
          if (/^\d+$/.test(rawMarca)) {
            marcaValor = parseInt(rawMarca, 10);
          } else {
            const key = rawMarca.toUpperCase();
            if (mapaMarcas[key] != null) {
              marcaValor = parseInt(mapaMarcas[key], 10);
            } else {
              try {
                const rsMax = await pool
                  .request()
                  .query(
                    "SELECT MAX(CAST(CODIGO AS INT)) AS MAXCOD FROM CODIGOS WHERE TIPO='M' AND ISNUMERIC(CODIGO)=1"
                  );
                const nextCod =
                  rsMax.recordset[0] && rsMax.recordset[0].MAXCOD
                    ? parseInt(rsMax.recordset[0].MAXCOD, 10) + 1
                    : 1;
                const nuevoReq = transaction.request();
                nuevoReq.input("CODIGO", sql.VarChar, String(nextCod));
                nuevoReq.input("DESCRIPCION", sql.VarChar, rawMarca);
                nuevoReq.input("TIPO", sql.VarChar, "M");
                await nuevoReq.query(
                  "INSERT INTO CODIGOS (CODIGO, DESCRIPCION, TIPO) VALUES (@CODIGO, @DESCRIPCION, @TIPO)"
                );
                mapaMarcas[key] = nextCod;
                marcaValor = nextCod <= 0 ? 1 : nextCod;
                writeLog(
                  `VENEPAC_SIMPLE Marca creada CODIGO=${marcaValor} DESCRIPCION='${rawMarca}'`
                );
              } catch (eNewMarca) {
                respuesta.push({
                  codigo: codigoArticulo,
                  status: "Fallido",
                  mensaje: "No se pudo crear MARCA: " + eNewMarca.message,
                });
                writeLog(
                  `VENEPAC_SIMPLE Error creando marca '${rawMarca}' articulo=${codigoArticulo} msg=${eNewMarca.message}`
                );
                continue;
              }
            }
          }
        }
        // Resolver / mapear GRUPO
        let grupoValor = rawGrupo;
        if (grupoEsNum) {
          if (/^\d+$/.test(rawGrupo)) grupoValor = parseInt(rawGrupo, 10);
          else {
            const gKey = rawGrupo.toUpperCase();
            if (mapaGrupos[gKey] != null)
              grupoValor = parseInt(mapaGrupos[gKey], 10);
            else {
              respuesta.push({
                codigo: codigoArticulo,
                status: "Fallido",
                mensaje: `GRUPO '${rawGrupo}' no mapeado`,
              });
              writeLog(
                `VENEPAC_SIMPLE Grupo no mapeado articulo=${codigoArticulo} valor='${rawGrupo}'`
              );
              continue;
            }
          }
        }
        // Resolver / mapear SUBGRUPO (opcional) con creación automática
        let subgrupoValor = rawSubgrupo || null;
        if (subgrupoValor && subgrupoEsNum) {
          if (/^\d+$/.test(subgrupoValor)) {
            subgrupoValor = parseInt(subgrupoValor, 10);
          } else {
            const sKey = subgrupoValor.toUpperCase();
            if (mapaSubgrupos[sKey] != null) {
              subgrupoValor = parseInt(mapaSubgrupos[sKey], 10);
            } else {
              try {
                const rsMaxS = await pool
                  .request()
                  .query(
                    "SELECT MAX(CAST(CODIGO AS INT)) AS MAXCOD FROM CODIGOS WHERE TIPO='S' AND ISNUMERIC(CODIGO)=1"
                  );
                const nextCodS =
                  rsMaxS.recordset[0] && rsMaxS.recordset[0].MAXCOD
                    ? parseInt(rsMaxS.recordset[0].MAXCOD, 10) + 1
                    : 1;
                const reqS = transaction.request();
                reqS.input("CODIGO", sql.VarChar, String(nextCodS));
                reqS.input("DESCRIPCION", sql.VarChar, subgrupoValor);
                reqS.input("TIPO", sql.VarChar, "S");
                await reqS.query(
                  "INSERT INTO CODIGOS (CODIGO, DESCRIPCION, TIPO) VALUES (@CODIGO, @DESCRIPCION, @TIPO)"
                );
                mapaSubgrupos[sKey] = nextCodS;
                subgrupoValor = nextCodS;
                writeLog(
                  `VENEPAC_SIMPLE Subgrupo creado CODIGO=${nextCodS} DESCRIPCION='${subgrupoValor}'`
                );
              } catch (eNewS) {
                writeLog(
                  `VENEPAC_SIMPLE Error creando subgrupo '${subgrupoValor}' articulo=${codigoArticulo} msg=${eNewS.message}`
                );
                subgrupoValor = null;
              }
            }
          }
        }
        // MODELO (solo guardar si existe columna). No hay catálogo, se almacena como viene (o numérico si la columna es numérica y el valor lo es)
        let modeloValor = rawModelo || null;
        if (modeloValor && modeloEsNum) {
          if (/^\d+$/.test(modeloValor))
            modeloValor = parseInt(modeloValor, 10);
          else {
            // Si columna es numérica y el valor no es número => error
            respuesta.push({
              codigo: codigoArticulo,
              status: "Fallido",
              mensaje: "MODELO debe ser numérico",
            });
            continue;
          }
        }
        // Truncar campos de texto susceptibles + fallback descripción (solo si realmente viene vacía)
        const rawDescOriginal = dato.DESCRIPCION;
        const rawDesc = ((dato.DESCRIPCION ?? "") + "").trim();
        let descFinal = trunc("DESCRIPCION", rawDesc);
        if (rawDesc && !descFinal) {
          // Evitar caso anómalo donde trunc retorna vacío indebidamente
          descFinal = rawDesc;
        }
        let usoFallback = false;
        if (rawDesc.length === 0) {
          const modelCandidate = (rawModelo || "").trim();
          descFinal = trunc(
            "DESCRIPCION",
            modelCandidate.length ? modelCandidate : codigoArticulo
          );
          usoFallback = true;
        }
        writeLog(
          `VENEPAC_SIMPLE Desc articulo=${codigoArticulo} raw='${rawDescOriginal}' trim='${rawDesc}' final='${descFinal}' fallback=${usoFallback}`
        );
        const unidadFinal = trunc("UNIDAD", dato.UNIDAD || "UND");
        const usuarioFinal = trunc("USUARIO", dato.USUARIO || "");
        if (typeof marcaValor === "string")
          marcaValor = trunc("MARCA", marcaValor);
        if (typeof grupoValor === "string")
          grupoValor = trunc("GRUPO", grupoValor);
        if (typeof subgrupoValor === "string")
          subgrupoValor = trunc("SUBGRUPO", subgrupoValor);
        if (typeof modeloValor === "string")
          modeloValor = trunc("MODELO", modeloValor);
        // FECHACIF
        let fechaCif = new Date();
        if (dato.FECHACIF) {
          const rawF = String(dato.FECHACIF).trim();
          const mF = rawF.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
          if (mF) {
            const d = parseInt(mF[1], 10),
              mo = parseInt(mF[2], 10) - 1,
              y = parseInt(mF[3].length === 2 ? "20" + mF[3] : mF[3], 10);
            fechaCif = new Date(y, mo, d);
          } else {
            const t = Date.parse(rawF);
            if (!isNaN(t)) fechaCif = new Date(t);
          }
        }
        const IVA = isFinite(Number(String(dato.IVA).replace(",", ".")))
          ? Number(String(dato.IVA).replace(",", "."))
          : 16.0;
        const GARANTIA = isFinite(
          Number(String(dato.GARANTIA).replace(",", "."))
        )
          ? Number(String(dato.GARANTIA).replace(",", "."))
          : 0.0;
        try {
          const columnasInsert = [
            "ARTICULO",
            "DESCRIPCION",
            "MARCA",
            "UNIDAD",
            "REPOSICION",
            "IVA",
            "FECHACIF",
            "CIF",
            "TIPO",
            "GARANTIA",
            "DESCUENTO",
            "FECHA",
            "FECHAACTUAL",
            "GRUPO",
            "VENTA",
          ];
          if ("USUARIO" in dato) columnasInsert.push("USUARIO");
          if (metaCols.SUBGRUPO) columnasInsert.push("SUBGRUPO");
          // MODELO si existe metadata
          if (metaCols.MODELO) columnasInsert.push("MODELO");
          const valores = columnasInsert.map((c) => {
            if (c === "FECHA" || c === "FECHAACTUAL") return "GETDATE()";
            if (c === "FECHACIF") return "@FECHACIF";
            return "@" + c;
          });
          const qArt = `INSERT INTO ARTICULOS (${columnasInsert.join(
            ", "
          )}) VALUES (${valores.join(", ")})`;
          writeLog(
            `VENEPAC_SIMPLE PreInsert articulo=${codigoArticulo} descFinal='${descFinal}' len=${
              (descFinal || "").length
            }`
          );
          const rA = transaction.request();
          rA.input("ARTICULO", sql.VarChar, codigoArticulo);
          rA.input("DESCRIPCION", sql.VarChar, descFinal);
          if (typeof marcaValor === "number")
            rA.input("MARCA", sql.Int, marcaValor);
          else rA.input("MARCA", sql.VarChar, marcaValor);
          rA.input("UNIDAD", sql.VarChar, unidadFinal);
          // Parámetros numéricos constantes
          rA.input("REPOSICION", sql.Decimal(18, 2), 0.0);
          rA.input("IVA", sql.Decimal(18, 2), IVA);
          rA.input("FECHACIF", sql.DateTime, fechaCif);
          rA.input(
            "CIF",
            sql.Decimal(18, 2),
            isFinite(Number(dato.CIF)) ? Number(dato.CIF) : 0.0
          );
          rA.input("TIPO", sql.VarChar, dato.TIPO || "A");
          rA.input("GARANTIA", sql.Decimal(18, 2), GARANTIA);
          rA.input("DESCUENTO", sql.Decimal(18, 2), 0.0);
          if (typeof grupoValor === "number")
            rA.input("GRUPO", sql.Int, grupoValor);
          else rA.input("GRUPO", sql.VarChar, grupoValor);
          rA.input("VENTA", sql.Decimal(18, 2), 0.0);
          if ("USUARIO" in dato) rA.input("USUARIO", sql.VarChar, usuarioFinal);
          if (metaCols.SUBGRUPO) {
            if (subgrupoValor == null) rA.input("SUBGRUPO", sql.VarChar, null);
            else if (typeof subgrupoValor === "number")
              rA.input("SUBGRUPO", sql.Int, subgrupoValor);
            else rA.input("SUBGRUPO", sql.VarChar, subgrupoValor);
          }
          if (metaCols.MODELO) {
            if (modeloValor == null) rA.input("MODELO", sql.VarChar, null);
            else if (typeof modeloValor === "number")
              rA.input("MODELO", sql.Int, modeloValor);
            else rA.input("MODELO", sql.VarChar, modeloValor);
          }
          await rA.query(qArt);
          // Verificar inmediatamente lo insertado (diagnóstico)
          try {
            const rsCheck = await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query(
                "SELECT DESCRIPCION FROM ARTICULOS WHERE ARTICULO=@ARTICULO"
              );
            const dbDesc = rsCheck.recordset[0]
              ? (rsCheck.recordset[0].DESCRIPCION || "").trim()
              : "";
            if (!dbDesc && descFinal) {
              writeLog(
                `VENEPAC_SIMPLE PostInsert DESCRIPCION vacia en BD, aplicando UPDATE articulo=${codigoArticulo} valor='${descFinal}'`
              );
              await transaction
                .request()
                .input("DESCRIPCION", sql.VarChar, descFinal)
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .query(
                  "UPDATE ARTICULOS SET DESCRIPCION=@DESCRIPCION WHERE ARTICULO=@ARTICULO"
                );
              // Segunda lectura tras update
              try {
                const rsCheck2 = await transaction
                  .request()
                  .input("ARTICULO", sql.VarChar, codigoArticulo)
                  .query(
                    "SELECT DESCRIPCION FROM ARTICULOS WHERE ARTICULO=@ARTICULO"
                  );
                const dbDesc2 = rsCheck2.recordset[0]
                  ? (rsCheck2.recordset[0].DESCRIPCION || "").trim()
                  : "";
                writeLog(
                  `VENEPAC_SIMPLE PostUpdate DESCRIPCION='${dbDesc2}' articulo=${codigoArticulo}`
                );
              } catch (e2) {
                writeLog(
                  `VENEPAC_SIMPLE Error segunda verificacion descripcion articulo=${codigoArticulo} msg=${e2.message}`
                );
              }
            } else {
              writeLog(
                `VENEPAC_SIMPLE PostInsert DESCRIPCION='${dbDesc}' articulo=${codigoArticulo}`
              );
            }
          } catch (eChk) {
            writeLog(
              `VENEPAC_SIMPLE Error verificacion descripcion articulo=${codigoArticulo} msg=${eChk.message}`
            );
          }
          // Insertar ficha: usar SOLO la descripción (o fallback si venía vacía) sin concatenar MODELO
          try {
            const fichaTxt = descFinal; // ya contiene fallback si DESCRIPCION venía vacía
            await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .input("CARACTERISTICAS", sql.VarChar, fichaTxt)
              .query(
                "INSERT INTO ARTICULOSFICHAS (ARTICULO, FOTO, CARACTERISTICAS) VALUES (@ARTICULO, NULL, @CARACTERISTICAS)"
              );
          } catch (eFicha) {
            writeLog(
              `VENEPAC_SIMPLE Advertencia ficha no insertada articulo=${codigoArticulo} msg=${eFicha.message}`
            );
          }
          await transaction
            .request()
            .input("ARTICULO", sql.VarChar, codigoArticulo)
            .query(
              "INSERT INTO KARDEX (FECHA, ARTICULO, SALDO, CANT_ENT, CANT_IN, CANT_FACT, CANT_OUT, CANT_ENS) VALUES (GETDATE(), @ARTICULO,0,0,0,0,0,0)"
            );
          insertadosEnLote.add(codigoArticulo);
          respuesta.push({ codigo: codigoArticulo, status: "Insertado" });
          writeLog(`VENEPAC_SIMPLE Insertado articulo=${codigoArticulo}`);
        } catch (eIns) {
          writeLog(
            `VENEPAC_SIMPLE Error articulo=${codigoArticulo} msg=${eIns.message}`
          );
          respuesta.push({
            codigo: codigoArticulo,
            status: "Fallido",
            mensaje: eIns.message,
          });
        }
      }
      await transaction.commit();
      writeLog("VENEPAC_SIMPLE Commit OK");
      event.reply("insertar-datos-respuesta", respuesta);
      writeLog("Cerrando conexión SQL");
      sql.close();
      return; // NO continuar a ruta avanzada
    }

    // Cargar mapa de MODELOS sólo para bases dfsk (venepac no tiene tabla MODELOS)
    let modelosMap = {}; // KEY (texto upper) -> IDMODELO
    if (!["venepac", "prueba_venepac"].includes(datos.database)) {
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
    } else {
      writeLog("Base venepac: se omite carga de MODELOS");
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
