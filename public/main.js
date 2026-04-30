const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
require("@electron/remote/main").initialize();
const sql = require("mssql");
const fs = require("fs");
const logDir = path.join(app.getPath("userData"), "logs");
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir);
  } catch (e) { }
}
const logFile = path.join(logDir, "insercion.log");
function writeLog(line) {
  const ts = new Date().toISOString();
  fs.appendFile(logFile, `[${ts}] ${line}\n`, () => { });
}

function writeDebugObject(label, payload) {
  try {
    const serialized = JSON.stringify(payload);
    writeLog(`${label} ${serialized}`);
  } catch (error) {
    const fallback = String(error && error.message ? error.message : error);
    writeLog(`${label} <no serializable> ${fallback}`);
  }
}

app.disableHardwareAcceleration();

if (isDev) {
  require("electron-reload")(path.join(__dirname, "../"));
}

function resolveDbConfigPath() {
  const candidatePaths = [
    path.join(process.resourcesPath || "", "db-config.json"),
    path.join(app.getAppPath(), "db-config.json"),
    path.join(__dirname, "../db-config.json"),
    path.join(process.cwd(), "db-config.json"),
  ].filter(Boolean);

  return candidatePaths.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadDbConfigs() {
  const resolvedPath = resolveDbConfigPath();

  if (!resolvedPath) {
    writeLog(
      "No se encontró db-config.json en resources, appPath, __dirname ni process.cwd()",
    );
    return {};
  }

  try {
    const rawConfig = fs.readFileSync(resolvedPath, "utf8");
    writeLog(`db-config.json cargado desde: ${resolvedPath}`);
    const configs = JSON.parse(rawConfig);
    // Inyectar timeouts globales
    Object.keys(configs).forEach(k => {
      configs[k].connectionTimeout = 30000;
      configs[k].requestTimeout = 60000;
    });
    return configs;
  } catch (error) {
    writeLog(`Error leyendo db-config.json: ${error.message}`);
    console.error("Error leyendo db-config.json:", error);
    return {};
  }
}

// Configuración de conexión para cada base de datos
let dbConfigs = loadDbConfigs();
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
      : `file://${path.join(__dirname, "../build/index.html")}`,
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
      exito: true,
      error: `Conexión exitosa a la base de datos: ${database}`,
    });
  } catch (err) {
    event.reply("test-conexion-respuesta", {
      exito: false,
      error: `Error de conexión: ${err.message}`,
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
      exito: false,
      error: "Base de datos inválida",
      data: [],
    });
    return;
  }
  try {
    await sql.connect(sqlConfig);
    const query = `SELECT 
      CR.IDCATEGORIA,
      G.IDGRUPO,
      CR.CATEGORIA,
      G.GRUPO
    FROM GRUPOSREPUESTO G
    LEFT JOIN CATEGORIAREPUESTO CR
      ON CR.IDGRUPO = G.IDGRUPO
      AND CR.ESTADO = 1
    WHERE G.GRUPO IS NOT NULL
    ORDER BY G.IDGRUPO, CR.IDCATEGORIA;`;
    const result = await sql.query(query);
    event.reply("obtener-categorias-respuesta", {
      exito: true,
      data: result.recordset || [],
    });
  } catch (err) {
    event.reply("obtener-categorias-respuesta", {
      exito: false,
      error: err.message,
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
      `SELECT CODIGO, DESCRIPCION FROM CODIGOS WHERE TIPO='M'`,
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

ipcMain.on("obtener-resumen-series", async (event, payload) => {
  const { database, rangeStart, rangeEnd, limitMissing = 50 } = payload || {};
  const sqlConfig = dbConfigs[database];

  if (!sqlConfig) {
    event.reply("obtener-resumen-series-respuesta", {
      success: false,
      mensaje: "Base de datos inválida",
      summary: null,
      missingCodes: [],
      existingCodes: [],
    });
    return;
  }

  const desde = Number(rangeStart);
  const hasta = Number(rangeEnd);

  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde >= hasta) {
    event.reply("obtener-resumen-series-respuesta", {
      success: false,
      mensaje: "Rango de serie inválido",
      summary: null,
      missingCodes: [],
      existingCodes: [],
    });
    return;
  }

  try {
    const pool = await sql.connect(sqlConfig);
    const seriesRequest = pool.request();
    const serieTexto = String(desde);
    const fichaColumnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ARTICULOSFICHAS'
    `);
    const fichaColumns = new Set(
      (fichaColumnsResult.recordset || []).map((row) =>
        String(row.COLUMN_NAME || "").toUpperCase(),
      ),
    );
    const hasNumeroParte = fichaColumns.has("NUMEROPARTE");
    seriesRequest.input("serieLength", sql.Int, serieTexto.length);
    seriesRequest.input("rangeStart", sql.Int, desde);
    seriesRequest.input("rangeEnd", sql.Int, hasta);

    async function getSeries() {
      return await seriesRequest.query(`
        SELECT
          LTRIM(RTRIM(A.ARTICULO)) AS CODIGO,
          A.DESCRIPCION,
          A.MODELO,
          A.MARCA,
          ${hasNumeroParte ? "F.NUMEROPARTE" : "NULL AS NUMEROPARTE"}
        FROM ARTICULOS A
        ${hasNumeroParte
          ? `OUTER APPLY (
          SELECT
            TOP 1
            LTRIM(RTRIM(NUMEROPARTE)) AS NUMEROPARTE
          FROM ARTICULOSFICHAS
          WHERE LTRIM(RTRIM(ARTICULO)) = LTRIM(RTRIM(A.ARTICULO))
          ORDER BY CASE
              WHEN NUMEROPARTE IS NULL OR LTRIM(RTRIM(NUMEROPARTE)) IN ('', '.') THEN 1
              ELSE 0
            END,
            LTRIM(RTRIM(NUMEROPARTE)) DESC
        ) F`
          : ""
        }
        WHERE LTRIM(RTRIM(A.ARTICULO)) <> ''
          AND LEN(LTRIM(RTRIM(A.ARTICULO))) = @serieLength
          AND ISNUMERIC(LTRIM(RTRIM(A.ARTICULO))) = 1
          AND LTRIM(RTRIM(A.ARTICULO)) NOT LIKE '%[^0-9]%'
          AND CASE 
                WHEN LTRIM(RTRIM(A.ARTICULO)) NOT LIKE '%[^0-9]%' 
                THEN CAST(LTRIM(RTRIM(A.ARTICULO)) AS INT) 
                ELSE -1 
              END BETWEEN @rangeStart AND @rangeEnd
        ORDER BY LTRIM(RTRIM(A.ARTICULO)) ASC;
      `);
    }
    const seriesResultData = await getSeries();

    event.reply("obtener-resumen-series-respuesta", {
      success: true,
      summary: {
        DESDE: String(desde),
        HASTA: String(hasta),
        CAPACIDAD_TOTAL: hasta - desde + 1,
        LIMIT_MISSING: Number(limitMissing),
      },
      missingCodes: [],
      existingCodes: seriesResultData.recordset || [],
      seriesRows: [],
    });
  } catch (err) {
    event.reply("obtener-resumen-series-respuesta", {
      success: false,
      mensaje: err.message,
      summary: null,
      missingCodes: [],
      existingCodes: [],
      seriesRows: [],
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
      "Base de datos no válida seleccionada.",
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
            "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULOS' AND COLUMN_NAME IN ('MARCA','GRUPO','SUBGRUPO','MODELO','DESCRIPCION','UNIDAD','USUARIO')",
          );
        rsMeta.recordset.forEach((r) => {
          metaCols[r.COLUMN_NAME.toUpperCase()] = {
            isNum: /int|numeric|decimal|bigint|smallint|tinyint/i.test(
              r.DATA_TYPE,
            ),
            max: r.CHARACTER_MAXIMUM_LENGTH,
          };
        });
      } catch (e) {
        writeLog(
          "VENEPAC_SIMPLE Error leyendo metadata columnas: " + e.message,
        );
      }
      const marcaEsNum = !!(metaCols.MARCA && metaCols.MARCA.isNum);
      const grupoEsNum = !!(metaCols.GRUPO && metaCols.GRUPO.isNum);
      const subgrupoEsNum = !!(metaCols.SUBGRUPO && metaCols.SUBGRUPO.isNum);
      const modeloEsNum = !!(metaCols.MODELO && metaCols.MODELO.isNum);
      if (metaCols.DESCRIPCION) {
        writeLog(
          `VENEPAC_SIMPLE Meta DESCRIPCION tipoNum=${metaCols.DESCRIPCION.isNum} maxLen=${metaCols.DESCRIPCION.max}`,
        );
      } else {
        writeLog(
          "VENEPAC_SIMPLE Meta DESCRIPCION no encontrada en INFORMATION_SCHEMA",
        );
      }
      writeLog(
        `VENEPAC_SIMPLE Tipos -> MARCA_NUM=${marcaEsNum} GRUPO_NUM=${grupoEsNum} SUBGRUPO_NUM=${subgrupoEsNum} MODELO_NUM=${modeloEsNum}`,
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
              `SELECT CODIGO, DESCRIPCION FROM CODIGOS WHERE TIPO='${tipo}'`,
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
            `VENEPAC_SIMPLE Error cargando catalogo tipo=${tipo}: ${e.message}`,
          );
          return {};
        }
      };
      let mapaMarcas = marcaEsNum ? await loadCatalogo("M") : {};
      let mapaGrupos = grupoEsNum ? await loadCatalogo("G") : {};
      let mapaSubgrupos = subgrupoEsNum ? await loadCatalogo("S") : {};
      writeLog(
        `VENEPAC_SIMPLE Catalogos -> marcas=${Object.keys(mapaMarcas).length
        } grupos=${Object.keys(mapaGrupos).length} subgrupos=${Object.keys(mapaSubgrupos).length
        }`,
      );
      // Pre-cargar artículos existentes para evitar duplicados
      const codigosLote = [
        ...new Set(
          datos.data.map((d) => String(d.CODIGO || "").trim()).filter(Boolean),
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
              `SELECT ARTICULO FROM ARTICULOS WHERE ARTICULO IN (${listaIn})`,
            );
          rsExist.recordset.forEach((r) =>
            existentes.add(String(r.ARTICULO).trim()),
          );
          writeLog(
            `VENEPAC_SIMPLE Duplicados preexistentes=${existentes.size}`,
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
        const articuloYaExiste = existentes.has(codigoArticulo);
        if (articuloYaExiste) {
          writeLog(`VENEPAC_SIMPLE Actualizando en BD ${codigoArticulo}`);
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
                    "SELECT MAX(CAST(CODIGO AS INT)) AS MAXCOD FROM CODIGOS WHERE TIPO='M' AND ISNUMERIC(CODIGO)=1",
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
                  "INSERT INTO CODIGOS (CODIGO, DESCRIPCION, TIPO) VALUES (@CODIGO, @DESCRIPCION, @TIPO)",
                );
                mapaMarcas[key] = nextCod;
                marcaValor = nextCod <= 0 ? 1 : nextCod;
                writeLog(
                  `VENEPAC_SIMPLE Marca creada CODIGO=${marcaValor} DESCRIPCION='${rawMarca}'`,
                );
              } catch (eNewMarca) {
                respuesta.push({
                  codigo: codigoArticulo,
                  status: "Fallido",
                  mensaje: "No se pudo crear MARCA: " + eNewMarca.message,
                });
                writeLog(
                  `VENEPAC_SIMPLE Error creando marca '${rawMarca}' articulo=${codigoArticulo} msg=${eNewMarca.message}`,
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
                `VENEPAC_SIMPLE Grupo no mapeado articulo=${codigoArticulo} valor='${rawGrupo}'`,
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
                    "SELECT MAX(CAST(CODIGO AS INT)) AS MAXCOD FROM CODIGOS WHERE TIPO='S' AND ISNUMERIC(CODIGO)=1",
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
                  "INSERT INTO CODIGOS (CODIGO, DESCRIPCION, TIPO) VALUES (@CODIGO, @DESCRIPCION, @TIPO)",
                );
                mapaSubgrupos[sKey] = nextCodS;
                subgrupoValor = nextCodS;
                writeLog(
                  `VENEPAC_SIMPLE Subgrupo creado CODIGO=${nextCodS} DESCRIPCION='${subgrupoValor}'`,
                );
              } catch (eNewS) {
                writeLog(
                  `VENEPAC_SIMPLE Error creando subgrupo '${subgrupoValor}' articulo=${codigoArticulo} msg=${eNewS.message}`,
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
            modelCandidate.length ? modelCandidate : codigoArticulo,
          );
          usoFallback = true;
        }
        writeLog(
          `VENEPAC_SIMPLE Desc articulo=${codigoArticulo} raw='${rawDescOriginal}' trim='${rawDesc}' final='${descFinal}' fallback=${usoFallback}`,
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
          Number(String(dato.GARANTIA).replace(",", ".")),
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
          let qArt;
          if (articuloYaExiste) {
            const setClauses = columnasInsert
              .filter((c) => c !== "ARTICULO")
              .map((c) => {
                if (c === "FECHA") return null;
                if (c === "FECHAACTUAL") return "FECHAACTUAL=GETDATE(), UBICACION=@UBICACION";
                if (c === "FECHACIF") return "FECHACIF=@FECHACIF";
                return `${c}=@${c}`;
              })
              .filter(Boolean);
            qArt = `UPDATE ARTICULOS SET ${setClauses.join(", ")} WHERE ARTICULO=@ARTICULO`;
          } else {
            qArt = `INSERT INTO ARTICULOS (${columnasInsert.join(", ")}) VALUES (${valores.join(", ")})`;
          }
          writeLog(
            `VENEPAC_SIMPLE PreInsert/Update articulo=${codigoArticulo} descFinal='${descFinal}' len=${(descFinal || "").length
            }`,
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
            isFinite(Number(dato.CIF)) ? Number(dato.CIF) : 0.0,
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
                "SELECT DESCRIPCION FROM ARTICULOS WHERE ARTICULO=@ARTICULO",
              );
            const dbDesc = rsCheck.recordset[0]
              ? (rsCheck.recordset[0].DESCRIPCION || "").trim()
              : "";
            if (!dbDesc && descFinal) {
              writeLog(
                `VENEPAC_SIMPLE PostInsert DESCRIPCION vacia en BD, aplicando UPDATE articulo=${codigoArticulo} valor='${descFinal}'`,
              );
              await transaction
                .request()
                .input("DESCRIPCION", sql.VarChar, descFinal)
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .query(
                  "UPDATE ARTICULOS SET DESCRIPCION=@DESCRIPCION WHERE ARTICULO=@ARTICULO",
                );
              // Segunda lectura tras update
              try {
                const rsCheck2 = await transaction
                  .request()
                  .input("ARTICULO", sql.VarChar, codigoArticulo)
                  .query(
                    "SELECT DESCRIPCION FROM ARTICULOS WHERE ARTICULO=@ARTICULO",
                  );
                const dbDesc2 = rsCheck2.recordset[0]
                  ? (rsCheck2.recordset[0].DESCRIPCION || "").trim()
                  : "";
                writeLog(
                  `VENEPAC_SIMPLE PostUpdate DESCRIPCION='${dbDesc2}' articulo=${codigoArticulo}`,
                );
              } catch (e2) {
                writeLog(
                  `VENEPAC_SIMPLE Error segunda verificacion descripcion articulo=${codigoArticulo} msg=${e2.message}`,
                );
              }
            } else {
              writeLog(
                `VENEPAC_SIMPLE PostInsert DESCRIPCION='${dbDesc}' articulo=${codigoArticulo}`,
              );
            }
          } catch (eChk) {
            writeLog(
              `VENEPAC_SIMPLE Error verificacion descripcion articulo=${codigoArticulo} msg=${eChk.message}`,
            );
          }
          // Insertar ficha: usar SOLO la descripción (o fallback si venía vacía) sin concatenar MODELO
          try {
            const fichaTxt = descFinal; // ya contiene fallback si DESCRIPCION venía vacía

            // Lógica especial 8% o 9% -> NUMEROPARTE/APLICA = '.' si vacíos
            const start89 = /^([89])/.test(codigoArticulo);
            let numeroparte = dato.NUMEROPARTE || "";
            let aplica = dato.APLICA || "";
            if (start89) {
              if (!numeroparte) numeroparte = ".";
              if (!aplica) aplica = ".";
            }

            const rsFicha = await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query(
                "SELECT ARTICULO FROM ARTICULOSFICHAS WHERE ARTICULO=@ARTICULO",
              );
            const existsFicha = rsFicha.recordset.length > 0;

            if (existsFicha) {
              // Update
              const qU = transaction
                .request()
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .input("CARACTERISTICAS", sql.VarChar, fichaTxt);
              let setParts = ["CARACTERISTICAS=@CARACTERISTICAS"];

              if (metaFichas.NUMEROPARTE) {
                qU.input("NUMEROPARTE", sql.VarChar, numeroparte);
                setParts.push("NUMEROPARTE=@NUMEROPARTE");
              }
              if (metaFichas.APLICA) {
                qU.input("APLICA", sql.VarChar, aplica);
                setParts.push("APLICA=@APLICA");
              }

              if (metaFichas.CAT && dato.IDCATEGORIA) {
                qU.input("CAT", sql.Int, dato.IDCATEGORIA);
                setParts.push("CAT=@CAT");
              } else if (metaFichas.IDCATEGORIA && dato.IDCATEGORIA) {
                qU.input("IDCATEGORIA", sql.Int, dato.IDCATEGORIA);
                setParts.push("IDCATEGORIA=@IDCATEGORIA");
              }
              // IDGRUPO si aplica... (omitido para brevedad a menos que crítico)

              await qU.query(
                `UPDATE ARTICULOSFICHAS SET ${setParts.join(", ")} WHERE ARTICULO=@ARTICULO`,
              );
            } else {
              // Insert
              const qI = transaction
                .request()
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .input("CARACTERISTICAS", sql.VarChar, fichaTxt);

              let cols = ["ARTICULO", "CARACTERISTICAS", "FOTO"];
              let vals = ["@ARTICULO", "@CARACTERISTICAS", "NULL"];

              if (metaFichas.NUMEROPARTE) {
                qI.input("NUMEROPARTE", sql.VarChar, numeroparte);
                cols.push("NUMEROPARTE");
                vals.push("@NUMEROPARTE");
              }
              if (metaFichas.APLICA) {
                qI.input("APLICA", sql.VarChar, aplica);
                cols.push("APLICA");
                vals.push("@APLICA");
              }
              if (metaFichas.CAT && dato.IDCATEGORIA) {
                qI.input("CAT", sql.Int, dato.IDCATEGORIA);
                cols.push("CAT");
                vals.push("@CAT");
              } else if (metaFichas.IDCATEGORIA && dato.IDCATEGORIA) {
                qI.input("IDCATEGORIA", sql.Int, dato.IDCATEGORIA);
                cols.push("IDCATEGORIA");
                vals.push("@IDCATEGORIA");
              }

              await qI.query(
                `INSERT INTO ARTICULOSFICHAS (${cols.join(",")}) VALUES (${vals.join(",")})`,
              );
            }

            // --- ARTICULOSUBICACIONES ---
            if (tablaUbicaciones && dato.UBICACION) {
              // Delete previo o update? Asumo borrar previo para ese artículo y poner la nueva
              // OJO: "select top 1 *" implied singular.
              // Delete simple para evitar duplicados si la PK es compuesta o no existe
              await transaction
                .request()
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .query(
                  "DELETE FROM ARTICULOSUBICACIONES WHERE ARTICULO=@ARTICULO",
                );

              const qUbi = transaction
                .request()
                .input("ARTICULO", sql.VarChar, codigoArticulo)
                .input("DESCRIPCION", sql.VarChar, descFinal)
                .input("BOD", sql.Decimal(18, 2), 0)
                .input("CANT", sql.Decimal(18, 2), 0)
                .input("UBICACION", sql.VarChar, String(dato.UBICACION).trim());
              await qUbi.query(
                "INSERT INTO ARTICULOSUBICACIONES (ARTICULO, DESCRIPCION, BOD, CANT, UBICACION) VALUES (@ARTICULO, @DESCRIPCION, @BOD, @CANT, @UBICACION)",
              );
              writeLog(
                `Ubicacion insertada ARTICULO=${codigoArticulo} UBI=${dato.UBICACION}`,
              );
            }
          } catch (eFicha) {
            writeLog(
              `VENEPAC_SIMPLE Advertencia ficha no insertada articulo=${codigoArticulo} msg=${eFicha.message}`,
            );
          }
          if (!articuloYaExiste) {
            await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query(
                "INSERT INTO KARDEX (FECHA, ARTICULO, SALDO, CANT_ENT, CANT_IN, CANT_FACT, CANT_OUT, CANT_ENS) VALUES (GETDATE(), @ARTICULO,0,0,0,0,0,0)",
              );
          }
          insertadosEnLote.add(codigoArticulo);
          respuesta.push({ codigo: codigoArticulo, status: articuloYaExiste ? "Actualizado" : "Insertado" });
          writeLog(`VENEPAC_SIMPLE Guardado articulo=${codigoArticulo}`);
        } catch (eIns) {
          writeLog(
            `VENEPAC_SIMPLE Error articulo=${codigoArticulo} msg=${eIns.message}`,
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
          .query("SELECT IDMODELO, DESCRIPCION, MODELO FROM MODELOS WHERE ESTADO=1");
        rs.recordset.forEach((r) => {
          if (r.DESCRIPCION) {
            const k1 = normalizeCatalogKey(r.DESCRIPCION);
            if (k1) modelosMap[k1] = r.IDMODELO;
          }
          if (r.MODELO) {
            const k2 = normalizeCatalogKey(r.MODELO);
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

    const normalizeCatalogKey = (value) =>
      value == null
        ? ""
        : String(value)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();

    const loadCodigosTipo = async (tipo) => {
      try {
        const rs = await pool
          .request()
          .input("TIPO", sql.VarChar, tipo)
          .query(
            "SELECT CODIGO, DESCRIPCION FROM CODIGOS WHERE TIPO=@TIPO AND DESCRIPCION IS NOT NULL",
          );
        const byDescription = {};
        rs.recordset.forEach((row) => {
          const key = normalizeCatalogKey(row.DESCRIPCION);
          if (!key || row.CODIGO == null) return;
          byDescription[key] = String(row.CODIGO).trim();
        });
        writeLog(
          `Catalogo CODIGOS tipo=${tipo} cargado registros=${Object.keys(byDescription).length}`,
        );
        return byDescription;
      } catch (e) {
        writeLog(`Error cargando CODIGOS tipo=${tipo}: ${e.message}`);
        return {};
      }
    };

    const catalogosCodigos = {
      gruposGenerales: await loadCodigosTipo("G"),
      transmisiones: await loadCodigosTipo("U"),
      puertas: await loadCodigosTipo("V"),
      marcas: await loadCodigosTipo("M"),
    };

    const loadGruposFicha = async () => {
      try {
        const rs = await pool
          .request()
          .query(
            "SELECT IDGRUPO, GRUPO FROM GRUPOSREPUESTO WHERE GRUPO IS NOT NULL",
          );
        const byName = {};
        rs.recordset.forEach((row) => {
          const key = normalizeCatalogKey(row.GRUPO);
          if (!key || row.IDGRUPO == null) return;
          byName[key] = parseInt(row.IDGRUPO, 10);
        });
        writeLog(
          `Catalogo GRUPOSREPUESTO cargado registros=${Object.keys(byName).length}`,
        );
        return byName;
      } catch (e) {
        writeLog(`Error cargando GRUPOSREPUESTO: ${e.message}`);
        return {};
      }
    };

    const loadCategoriasFicha = async () => {
      try {
        const rs = await pool.request().query(`
          SELECT
            CR.IDCATEGORIA,
            CR.IDGRUPO,
            CR.CATEGORIA,
            G.GRUPO
          FROM CATEGORIAREPUESTO CR
          LEFT JOIN GRUPOSREPUESTO G
            ON G.IDGRUPO = CR.IDGRUPO
          WHERE (CR.ESTADO = 1 OR CR.ESTADO IS NULL)
        `);
        const byName = {};
        const byGroupAndName = {};
        rs.recordset.forEach((row) => {
          const categoryKey = normalizeCatalogKey(row.CATEGORIA);
          const groupKey = normalizeCatalogKey(row.GRUPO);
          if (!categoryKey || row.IDCATEGORIA == null) return;
          const payload = {
            IDCATEGORIA: parseInt(row.IDCATEGORIA, 10),
            IDGRUPO: row.IDGRUPO == null ? null : parseInt(row.IDGRUPO, 10),
          };
          if (!byName[categoryKey]) byName[categoryKey] = payload;
          if (groupKey) byGroupAndName[`${groupKey}::${categoryKey}`] = payload;
        });
        writeLog(
          `Catalogo CATEGORIAREPUESTO cargado registros=${Object.keys(byGroupAndName).length}`,
        );
        return { byName, byGroupAndName };
      } catch (e) {
        writeLog(`Error cargando CATEGORIAREPUESTO: ${e.message}`);
        return { byName: {}, byGroupAndName: {} };
      }
    };

    const gruposFichaMap = await loadGruposFicha();
    const categoriasFichaMap = await loadCategoriasFicha();

    // Obtener metadata de columnas clave de ARTICULOS (una sola vez) para diagnosticar tipos y saber si existe USUARIO/FECHACIF
    let colEsNum = {};
    let columnasArticulos = new Set();
    try {
      const meta = await pool
        .request()
        .query(
          "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULOS'",
        );
      colEsNum = meta.recordset.reduce((acc, r) => {
        acc[r.COLUMN_NAME.toUpperCase()] =
          /int|numeric|decimal|bigint|smallint|tinyint/i.test(r.DATA_TYPE);
        return acc;
      }, {});
      meta.recordset.forEach((r) =>
        columnasArticulos.add(r.COLUMN_NAME.toUpperCase()),
      );
      writeLog(
        "Meta columnas ARTICULOS: " +
        meta.recordset
          .map(
            (r) =>
              r.COLUMN_NAME +
              "=" +
              r.DATA_TYPE +
              (colEsNum[r.COLUMN_NAME.toUpperCase()] ? "(NUM)" : "(TEX)"),
          )
          .join(","),
      );
    } catch (e) {
      writeLog("No se pudo leer metadata columnas ARTICULOS: " + e.message);
    }

    // Verificar si EXISTEN columnas NUMEROPARTE / APLICA en ARTICULOSFICHAS (para no romper si la BD no está actualizada)
    let metaFichas = {};
    try {
      const mf = await pool
        .request()
        .query(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ARTICULOSFICHAS'",
        );
      mf.recordset.forEach(
        (r) => (metaFichas[String(r.COLUMN_NAME).toUpperCase()] = true),
      );
    } catch (eF) {
      writeLog("Error leyendo metadata ARTICULOSFICHAS: " + eF.message);
    }

    // Verificar si EXISTE tabla ARTICULOSUBICACIONES
    let tablaUbicaciones = false;
    try {
      const mu = await pool
        .request()
        .query(
          "SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ARTICULOSUBICACIONES'",
        );
      if (mu.recordset.length > 0) tablaUbicaciones = true;
    } catch (eU) {
      writeLog("Error verifica ubicaciones: " + eU.message);
    }

    // Crear y comenzar la transacción
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    for (const dato of datos.data) {
      writeLog(`Procesando articulo=${dato.CODIGO}`);
      if (dato.USUARIO !== undefined) {
        writeLog(
          `Dato.USUARIO='${dato.USUARIO}' (tipo=${typeof dato.USUARIO})`,
        );
      } else {
        writeLog(
          `Dato sin propiedad USUARIO. Claves disponibles: ${Object.keys(
            dato,
          ).join(",")}`,
        );
      }
      const codigoArticulo = String(dato.CODIGO).trim();
      const articuloMarcaRaw =
        dato.MARCA != null ? String(dato.MARCA).trim() : "";
      const articuloGrupoRaw =
        dato.GRUPOG != null && String(dato.GRUPOG).trim() !== ""
          ? String(dato.GRUPOG).trim()
          : dato.GRUPO != null
            ? String(dato.GRUPO).trim()
            : "";

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
        if (isFinite(n)) return n;
        const m = s.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : 0;
      };
      const resolveCodigoCatalogo = (value, catalogo, fallbackValue = null) => {
        if (value == null || value === "") return fallbackValue;
        const raw = String(value).trim();
        if (/^\d+$/.test(raw)) return parseInt(raw, 10);
        const resolved = catalogo[normalizeCatalogKey(raw)];
        if (resolved != null && /^\d+$/.test(String(resolved).trim())) {
          return parseInt(String(resolved).trim(), 10);
        }
        return fallbackValue;
      };
      const fichaGroupNameRaw =
        dato.FICHA_GRUPO != null && String(dato.FICHA_GRUPO).trim() !== ""
          ? String(dato.FICHA_GRUPO).trim()
          : dato.GRUPOF != null && String(dato.GRUPOF).trim() !== ""
            ? String(dato.GRUPOF).trim()
            : "SIN GRUPO";
      const fichaCategoryNameRaw =
        dato.CATEGORIAF != null && String(dato.CATEGORIAF).trim() !== ""
          ? String(dato.CATEGORIAF).trim()
          : dato.CATEGORIA != null && String(dato.CATEGORIA).trim() !== ""
            ? String(dato.CATEGORIA).trim()
            : "SIN CATEGORIA";
      let idGrupoFichaResolved = /^\d+$/.test(String(dato.IDGRUPO || ""))
        ? parseInt(dato.IDGRUPO, 10)
        : null;
      let idCategoriaFichaResolved = /^\d+$/.test(
        String(dato.IDCATEGORIA || ""),
      )
        ? parseInt(dato.IDCATEGORIA, 10)
        : null;
      const fichaGroupKey = normalizeCatalogKey(fichaGroupNameRaw);
      const fichaCategoryKey = normalizeCatalogKey(fichaCategoryNameRaw);
      if (idGrupoFichaResolved == null && fichaGroupKey) {
        idGrupoFichaResolved = gruposFichaMap[fichaGroupKey] ?? null;
      }
      if (idCategoriaFichaResolved == null && fichaCategoryKey) {
        const byGroup =
          fichaGroupKey && idGrupoFichaResolved != null
            ? categoriasFichaMap.byGroupAndName[
            `${fichaGroupKey}::${fichaCategoryKey}`
            ]
            : null;
        const byName = categoriasFichaMap.byName[fichaCategoryKey] ?? null;
        const categoriaResolved = byGroup || byName;
        if (categoriaResolved) {
          idCategoriaFichaResolved = categoriaResolved.IDCATEGORIA;
          if (
            idGrupoFichaResolved == null &&
            categoriaResolved.IDGRUPO != null
          ) {
            idGrupoFichaResolved = categoriaResolved.IDGRUPO;
          }
        }
      }
      if (idGrupoFichaResolved != null) dato.IDGRUPO = idGrupoFichaResolved;
      if (idCategoriaFichaResolved != null)
        dato.IDCATEGORIA = idCategoriaFichaResolved;
      writeDebugObject(`FICHA IDs resueltos articulo=${codigoArticulo}`, {
        GRUPOF: fichaGroupNameRaw || null,
        CATEGORIAF: fichaCategoryNameRaw || null,
        IDGRUPO_ORIGEN: /^\d+$/.test(String(dato.IDGRUPO || ""))
          ? parseInt(dato.IDGRUPO, 10)
          : idGrupoFichaResolved,
        IDCATEGORIA_ORIGEN: /^\d+$/.test(String(dato.IDCATEGORIA || ""))
          ? parseInt(dato.IDCATEGORIA, 10)
          : idCategoriaFichaResolved,
      });
      const normTransmision = (v) => {
        if (v == null || v === "") return 1;
        const s = String(v).trim().toUpperCase();
        const fromCatalog = resolveCodigoCatalogo(
          s,
          catalogosCodigos.transmisiones,
          null,
        );
        if (fromCatalog != null) return fromCatalog;
        const byNum = normNum(s);
        if (byNum) return byNum;
        if (s.includes("AUTOM")) return 2;
        if (s.includes("SINCR") || s.includes("MANUAL")) return 1;
        if (s === "N/A" || s === "NA") return 0;
        return 1;
      };
      const normPuertas = (v) => {
        if (v == null || v === "") return 2;
        const s = String(v).trim().toUpperCase();
        const fromCatalog = resolveCodigoCatalogo(
          s,
          catalogosCodigos.puertas,
          null,
        );
        if (fromCatalog != null) return fromCatalog;
        const byNum = normNum(s);
        if (byNum) return byNum;
        if (s === "N/A" || s === "NA") return 0;
        return 2;
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

      if (typeof valorMarcaInsert !== "number") {
        const marcaCatalogo = resolveCodigoCatalogo(
          valorMarcaInsert,
          catalogosCodigos.marcas,
          null,
        );
        if (marcaCatalogo != null) valorMarcaInsert = marcaCatalogo;
      }
      if (typeof valorGrupoInsert !== "number") {
        const grupoCatalogo = resolveCodigoCatalogo(
          valorGrupoInsert,
          catalogosCodigos.gruposGenerales,
          null,
        );
        if (grupoCatalogo != null) valorGrupoInsert = grupoCatalogo;
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
          `NO INSERT articulo=${codigoArticulo} -> MARCA columna numerica recibe='${valorMarcaInsert}'`,
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
          `NO INSERT articulo=${codigoArticulo} -> GRUPO columna numerica recibe='${valorGrupoInsert}'`,
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
          // Campos originales y nuevos del script del usuario
          "ARTICULO",
          "DESCRIPCION",
          "TIPO",
          "MARCA",
          "UNIDAD",
          "IVA",
          "GARANTIA",
          "DESCUENTO",
          "STOCKMINIMO",
          "REPOSICION",
          "FECHA",
          "FECHAACTUAL",
          "FECHACIF",
          "CIF",
          "USUARIO",
          "EMPAQUE",
          "EAN",
          "GRUPO",
          "CBM",
          "VENTA",
          "MODELO",
          "TIPOC",
          "USO",
          "COLOR",
          "ANO",
          "EXENTO",
          "TRANSMISION",
          "PUERTAS",
          "COLOR1",
          "COLOR1T",
          "COLOR2",
          "COLOR2T",
          "ANOF",
          "ANOM",
          "PESO",
          "RIN",
          "PUESTOS",
          "MODELOI",
          "CAPCARGA",
          "SERIE",
          "EJESI",
          "SERVICIO",
          "COMBUSTIBLE",
          "TIPOI",
          "USOI",
          "CLASEI",
          "TIPOT",
          "USOT",
          "CLASET",
          "GRUPOA",
        ];
        if (columnasArticulos.has("UBICACION")) colsBase.push("UBICACION");

        const placeholders = colsBase.map((c) => {
          if (c === "FECHA" || c === "FECHAACTUAL") return "GETDATE()";
          if (c === "FECHACIF") return "@FECHACIF";
          return "@" + c;
        });

        const queryArticulos = `INSERT INTO ARTICULOS (${colsBase.join(", ")}) VALUES (${placeholders.join(", ")})`;

        writeLog(`INSERT ARTICULOS extendido: ${codigoArticulo}`);

        // --- RESOLUCIÓN DE IDs PARA DFSK (MODELO, GRUPO, CATEGORIA) ---
        let idModeloResolved = null;
        if (datos.database === "dfsk" || datos.database === "prueba_dfsk") {
          if (dato.IDMODELO != null && dato.IDMODELO !== "") {
            idModeloResolved = dato.IDMODELO;
          } else if (dato.MODELO) {
            const keyModelo = normalizeCatalogKey(dato.MODELO);
            if (modelosMap[keyModelo] != null) {
              idModeloResolved = modelosMap[keyModelo];
            } else {
              // Búsqueda parcial normalizada
              const bestMatch = Object.keys(modelosMap).find(
                (k) => k.includes(keyModelo) || keyModelo.includes(k),
              );
              if (bestMatch) idModeloResolved = modelosMap[bestMatch];
            }
          }
          // Fallback: si MODELO es un número, asumirlo como ID
          if (
            idModeloResolved == null &&
            /^\d+$/.test(String(dato.MODELO || ""))
          ) {
            idModeloResolved = parseInt(dato.MODELO, 10);
          }
          
          // Fallback de IDs para Ficha si vienen como "-" en Excel pero tenemos el código en GRUPOG
          if (idGrupoFichaResolved == null && /^\d+$/.test(String(articuloGrupo || ""))) {
            idGrupoFichaResolved = parseInt(articuloGrupo, 10);
          }

          // ASIGNACIÓN FINAL CORREGIDA (Extraer del objeto si existe)
          const finalModelId = (idModeloResolved && typeof idModeloResolved === "object") ? idModeloResolved.id : idModeloResolved;
          const finalModelName = (idModeloResolved && typeof idModeloResolved === "object") ? idModeloResolved.nombreOficial : dato.MODELO;

          if (finalModelName) dato.MODELO = finalModelName;
          dato.MODELOI = finalModelId != null ? finalModelId : null;
        }

        const reqArticulo = transaction.request();
        reqArticulo.input("ARTICULO", sql.VarChar, codigoArticulo);
        reqArticulo.input("DESCRIPCION", sql.VarChar, dato.DESCRIPCION || ""); // Asegurar no null

        // Marca y Grupo: lógica especial numérica vs texto
        if (typeof valorMarcaInsert === "number")
          reqArticulo.input("MARCA", sql.Int, valorMarcaInsert);
        else reqArticulo.input("MARCA", sql.VarChar, valorMarcaInsert || 0); // Default 0 si es texto vacío? script dice int.

        if (typeof valorGrupoInsert === "number")
          reqArticulo.input("GRUPO", sql.Int, valorGrupoInsert);
        else
          reqArticulo.input(
            "GRUPO",
            sql.VarChar,
            valorGrupoInsert || "MUESTRA",
          ); // Fallback seguro

        // Campos básicos
        reqArticulo.input("UNIDAD", sql.VarChar, dato.UNIDAD || "UNID");
        reqArticulo.input("IVA", sql.Decimal(18, 2), IVA);
        reqArticulo.input("GARANTIA", sql.Decimal(18, 2), GARANTIA);
        reqArticulo.input(
          "DESCUENTO",
          sql.Decimal(18, 2),
          normNum(dato.DESCUENTO),
        );
        reqArticulo.input("REPOSICION", sql.Int, normNum(dato.REPOSICION)); // Script dice int
        reqArticulo.input("STOCKMINIMO", sql.Int, normNum(dato.STOCKMINIMO));
        reqArticulo.input("CIF", sql.Decimal(18, 2), CIF); // Int en script usuario? dice @cif int pero pasa 0. Dejemos decimal para seguridad o int
        reqArticulo.input("VENTA", sql.Decimal(18, 2), VENTA);
        reqArticulo.input("CBM", sql.Decimal(18, 2), normNum(dato.CBM));

        // Fechas
        if (tieneFechacif && dato.FECHACIF) {
          let fechaCif = null;
          // ... (lógica parsing fecha existente) ...
          const raw = String(dato.FECHACIF).trim();
          // Intento parsing simple
          const mDMY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
          if (mDMY) {
            const d = parseInt(mDMY[1], 10),
              mo = parseInt(mDMY[2], 10) - 1,
              y = parseInt(mDMY[3].length === 2 ? "20" + mDMY[3] : mDMY[3], 10);
            fechaCif = new Date(y, mo, d);
          } else {
            const t = Date.parse(raw);
            if (!isNaN(t)) fechaCif = new Date(t);
          }
          if (fechaCif) reqArticulo.input("FECHACIF", sql.DateTime, fechaCif);
          else reqArticulo.input("FECHACIF", sql.DateTime, new Date());
        } else {
          reqArticulo.input("FECHACIF", sql.DateTime, new Date());
        }

        reqArticulo.input("USUARIO", sql.VarChar, dato.USUARIO || "ADMN"); // Default ADMN del script
        reqArticulo.input("TIPO", sql.VarChar, dato.TIPO || "A");
        reqArticulo.input("EXENTO", sql.VarChar, dato.EXENTO || "N"); // Default N

        // Campos nuevos (Strings defaults vacíos)
        const strFields = [
          "MODELO",
          "TIPOC",
          "USO",
          "COLOR",
          "ANO",
          "COLOR1",
          "COLOR1T",
          "COLOR2",
          "COLOR2T",
          "ANOF",
          "ANOM",
          "PESO",
          "RIN",
          "PUESTOS",
          "MODELOI",
          "CAPCARGA",
          "SERIE",
          "EJESI",
          "SERVICIO",
          "COMBUSTIBLE",
          "TIPOI",
          "USOI",
          "CLASEI",
          "TIPOT",
          "USOT",
          "CLASET",
          "GRUPOA",
          "EAN", // ean nvarchar(1) en script ?? Revisar. Pondré varchar normal
        ];
        strFields.forEach((f) => {
          const isNum = !!colEsNum[f.toUpperCase()];
          const rawVal = dato[f];
          const isEmpty =
            rawVal === undefined ||
            rawVal === null ||
            String(rawVal).trim() === "";

          if (isNum) {
            // Si es numérico, intentamos parsear o mandamos null
            if (isEmpty) {
              reqArticulo.input(f, sql.Int, null);
            } else {
              const parsed = parseInt(String(rawVal).trim(), 10);
              reqArticulo.input(f, sql.Int, isNaN(parsed) ? null : parsed);
            }
          } else {
            // Si es texto, mandamos cadena vacía o el valor
            reqArticulo.input(f, sql.VarChar, isEmpty ? "" : String(rawVal));
          }
        });

        // Campos nuevos (Int defaults 0)
        reqArticulo.input(
          "TRANSMISION",
          sql.Int,
          normTransmision(dato.TRANSMISION),
        ); // Default 1 en script
        reqArticulo.input("PUERTAS", sql.Int, normPuertas(dato.PUERTAS)); // Default 2 en script
        reqArticulo.input("EMPAQUE", sql.Int, normNum(dato.EMPAQUE) || 1); // Default 1 en script
        const articuloExistenteRs = await transaction
          .request()
          .input("ARTICULO", sql.VarChar, codigoArticulo)
          .query(
            "SELECT TOP 1 ARTICULO FROM ARTICULOS WHERE ARTICULO=@ARTICULO",
          );
        const articuloYaExiste = articuloExistenteRs.recordset.length > 0;

        writeDebugObject(`ARTICULOS payload articulo=${codigoArticulo}`, {
          accion: articuloYaExiste ? "update" : "insert",
          ARTICULO: codigoArticulo,
          DESCRIPCION: dato.DESCRIPCION || "",
          MARCA: valorMarcaInsert,
          UNIDAD: dato.UNIDAD || "UNID",
          GRUPO: valorGrupoInsert,
          GRUPOA: dato.GRUPOA || "",
          MODELO: dato.MODELO || "",
          NUMEROPARTE: dato.NUMEROPARTE || "",
          APLICA: dato.APLICA || "",
          IDGRUPO: idGrupoFichaResolved,
          IDCATEGORIA: idCategoriaFichaResolved,
          TRANSMISION: normTransmision(dato.TRANSMISION),
          PUERTAS: normPuertas(dato.PUERTAS),
          UBICACION: dato.UBICACION || "",
        });

        if (articuloYaExiste) {
          writeLog(`ARTICULO existente -> actualizando ${codigoArticulo}`);
          
          const updateSetsArt = [];
          const addUpdateParam = (col, val, sourceRaw) => {
            if (col === "ARTICULO") return;
            // Verificamos si el valor en el Excel está realmente vacío
            const isEmptySource = sourceRaw === undefined || sourceRaw === null || String(sourceRaw).trim() === "";
            if (!isEmptySource) {
              updateSetsArt.push(`${col}=@${col}`);
            }
          };

          // Campos base con verificación de origen
          addUpdateParam("DESCRIPCION", dato.DESCRIPCION, dato.DESCRIPCION);
          addUpdateParam("MARCA", valorMarcaInsert, articuloMarcaRaw);
          addUpdateParam("UNIDAD", dato.UNIDAD, dato.UNIDAD);
          addUpdateParam("IVA", IVA, dato.IVA);
          addUpdateParam("GARANTIA", GARANTIA, dato.GARANTIA);
          addUpdateParam("DESCUENTO", normNum(dato.DESCUENTO), dato.DESCUENTO);
          addUpdateParam("STOCKMINIMO", normNum(dato.STOCKMINIMO), dato.STOCKMINIMO);
          addUpdateParam("REPOSICION", normNum(dato.REPOSICION), dato.REPOSICION);
          addUpdateParam("CIF", CIF, dato.CIF);
          addUpdateParam("VENTA", VENTA, dato.VENTA);
          addUpdateParam("EAN", dato.EAN, dato.EAN);
          addUpdateParam("GRUPO", valorGrupoInsert, articuloGrupoRaw);
          addUpdateParam("CBM", normNum(dato.CBM), dato.CBM);
          addUpdateParam("EMPAQUE", normNum(dato.EMPAQUE), dato.EMPAQUE);
          addUpdateParam("UBICACION", dato.UBICACION, dato.UBICACION);
          addUpdateParam("TRANSMISION", normTransmision(dato.TRANSMISION), dato.TRANSMISION);
          addUpdateParam("PUERTAS", normPuertas(dato.PUERTAS), dato.PUERTAS);
          addUpdateParam("EXENTO", dato.EXENTO, dato.EXENTO);

          // Campos de strFields
          strFields.forEach(f => {
            addUpdateParam(f, dato[f], dato[f]);
          });

          // Caso especial: FECHACIF (solo si viene en el excel)
          if (dato.FECHACIF) {
            updateSetsArt.push("FECHACIF=@FECHACIF");
          }

          if (updateSetsArt.length > 0) {
            const queryUpdateArticulos = `
              UPDATE ARTICULOS
              SET ${updateSetsArt.join(", ")},
                  FECHAACTUAL=GETDATE()
              WHERE ARTICULO=@ARTICULO
            `;
            reqArticulo.input("UBICACION", sql.VarChar, dato.UBICACION || "");
            await reqArticulo.query(queryUpdateArticulos);
          }
        } else {
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
        }

        // Inserción en ARTICULOSFICHAS dinámica (según metaFichas)
        if (datos.database === "dfsk" || datos.database === "prueba_dfsk") {
          const reqFichaDfsk = transaction.request();
          reqFichaDfsk.input("ARTICULO", sql.VarChar, codigoArticulo);

          const fichaCols = ["ARTICULO", "FOTO"];
          const fichaVals = ["@ARTICULO", "Null"];
          const updateSets = [];

          const addFichaParam = (col, val, type) => {
            if (metaFichas[col.toUpperCase()]) {
              // Solo agregar al UPDATE si tiene valor real
              const hasValue = val !== null && val !== "" && val !== undefined;
              
              reqFichaDfsk.input(col, type, val);
              fichaCols.push(col);
              fichaVals.push("@" + col);
              
              if (hasValue) {
                updateSets.push(`${col}=@${col}`);
              }
            }
          };

          addFichaParam(
            "CARACTERISTICAS",
            dato.CARACTERISTICAS || "",
            sql.VarChar,
          );
          addFichaParam("NUMEROPARTE", dato.NUMEROPARTE || "", sql.VarChar);
          addFichaParam("APLICA", dato.APLICA || "", sql.VarChar);
          addFichaParam(
            "IDMODELO",
            (idModeloResolved && typeof idModeloResolved === "object") ? idModeloResolved.id : idModeloResolved,
            sql.Int,
          );
          addFichaParam("IDGRUPO", idGrupoFichaResolved || null, sql.Int);
          addFichaParam("IDCATEGORIA", idCategoriaFichaResolved || null, sql.Int);
          addFichaParam("URLIMAGEN", dato.URLIMAGEN || null, sql.VarChar);
          addFichaParam("UBICACION", dato.UBICACION || null, sql.VarChar);

          const fichaExistenteRs = await transaction
            .request()
            .input("ARTICULO", sql.VarChar, codigoArticulo)
            .query(
              "SELECT TOP 1 ARTICULO FROM ARTICULOSFICHAS WHERE ARTICULO=@ARTICULO",
            );

          if (fichaExistenteRs.recordset.length > 0) {
            if (updateSets.length > 0) {
              await reqFichaDfsk.query(`
                UPDATE ARTICULOSFICHAS
                SET ${updateSets.join(", ")}
                WHERE ARTICULO=@ARTICULO
              `);
            }
          } else {
            await reqFichaDfsk.query(`
              INSERT INTO ARTICULOSFICHAS (${fichaCols.join(", ")})
              VALUES (${fichaVals.join(", ")})
            `);
          }
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
            const fichaGenRs = await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query("SELECT TOP 1 ARTICULO FROM ARTICULOSFICHAS WHERE ARTICULO=@ARTICULO");

            const rExt = transaction.request();
            rExt.input("ARTICULO", sql.VarChar, codigoArticulo);
            rExt.input("CARACTERISTICAS", sql.VarChar, dato.CARACTERISTICAS || dato.DESCRIPCION || "");
            rExt.input("NUMEROPARTE", sql.VarChar, dato.NUMEROPARTE || "");
            rExt.input("APLICA", sql.VarChar, dato.APLICA || "");
            if (idModeloGenerico == null) rExt.input("IDMODELO", sql.Int, null);
            else rExt.input("IDMODELO", sql.Int, idModeloGenerico);

            if (/^\d+$/.test(String(dato.IDGRUPO || ""))) rExt.input("IDGRUPO", sql.Int, parseInt(dato.IDGRUPO, 10));
            else rExt.input("IDGRUPO", sql.Int, null);

            if (/^\d+$/.test(String(dato.IDCATEGORIA || ""))) rExt.input("IDCATEGORIA", sql.Int, parseInt(dato.IDCATEGORIA, 10));
            else rExt.input("IDCATEGORIA", sql.Int, null);

            rExt.input("URLIMAGEN", sql.VarChar, dato.URLIMAGEN || null);

            if (fichaGenRs.recordset.length > 0) {
              await rExt.query(`
                UPDATE ARTICULOSFICHAS
                SET CARACTERISTICAS=@CARACTERISTICAS, NUMEROPARTE=@NUMEROPARTE, APLICA=@APLICA, IDMODELO=@IDMODELO, IDGRUPO=@IDGRUPO, IDCATEGORIA=@IDCATEGORIA, URLIMAGEN=@URLIMAGEN
                WHERE ARTICULO=@ARTICULO
              `);
            } else {
              await rExt.query(`
                INSERT INTO ARTICULOSFICHAS (ARTICULO, FOTO, CARACTERISTICAS, NUMEROPARTE, APLICA, IDMODELO, IDGRUPO, IDCATEGORIA, URLIMAGEN)
                VALUES (@ARTICULO, Null, @CARACTERISTICAS, @NUMEROPARTE, @APLICA, @IDMODELO, @IDGRUPO, @IDCATEGORIA, @URLIMAGEN)
              `);
            }
          };
          try {
            await tryExtended();
          } catch (eExt) {
            writeLog(
              `Fallo inserción/actualización extendida ARTICULOSFICHAS articulo=${codigoArticulo} msg=${eExt.message} -> intentando fallback básico`,
            );
            const fichaGenRs = await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query("SELECT TOP 1 ARTICULO FROM ARTICULOSFICHAS WHERE ARTICULO=@ARTICULO");

            const rBasic = transaction.request();
            rBasic.input("ARTICULO", sql.VarChar, codigoArticulo);
            rBasic.input("CARACTERISTICAS", sql.VarChar, dato.CARACTERISTICAS || dato.DESCRIPCION || "");
            rBasic.input("NUMEROPARTE", sql.VarChar, dato.NUMEROPARTE || "");
            rBasic.input("IDMODELO", sql.Int, idModeloGenerico == null ? null : idModeloGenerico);

            if (fichaGenRs.recordset.length > 0) {
              await rBasic.query(`
                UPDATE ARTICULOSFICHAS
                SET CARACTERISTICAS=@CARACTERISTICAS, NUMEROPARTE=@NUMEROPARTE, IDMODELO=@IDMODELO
                WHERE ARTICULO=@ARTICULO
              `);
            } else {
              await rBasic.query(`
                INSERT INTO ARTICULOSFICHAS (ARTICULO, FOTO, CARACTERISTICAS, NUMEROPARTE, IDMODELO)
                VALUES (@ARTICULO, Null, @CARACTERISTICAS, @NUMEROPARTE, @IDMODELO)
              `);
            }
          }
        }

        // --- INSERT BODEGAS ---
        if (!articuloYaExiste) {
          try {
            await transaction
              .request()
              .input("articulo", sql.VarChar, codigoArticulo)
              .input("bodega", sql.Int, 0)
              .input("cantidad", sql.Decimal(18, 2), 0)
              .query(
                "INSERT INTO Bodegas (articulo, bodega, existencia) VALUES (@articulo, @bodega, @cantidad)",
              );
          } catch (eBod) {
            writeLog(
              `Error insertando en Bodegas articulo=${codigoArticulo}: ${eBod.message}`,
            );
          }
        }

        // --- ARTICULOSUBICACIONES (Regla 60000/80000/90000) ---
        // Regla: si 60000/80000/90000 y no hay ubicación -> S/U. Para otros, si viene ubicación se guarda.
        const is689 = /^([689])/.test(codigoArticulo);
        let ubiFinal = dato.UBICACION;
        if (is689 && !ubiFinal) {
          ubiFinal = "S/U";
          writeLog(
            `Articulo ${codigoArticulo} sin ubicacion -> Asignando S/U por regla 60000/80000/90000`,
          );
        }

        if (ubiFinal) {
          try {
            // Borrar existe previo (por si acaso update)
            const tableName = tablaUbicaciones ? "ARTICULOSUBICACIONES" : "UBICACIONES";
            await transaction
              .request()
              .input("ARTICULO", sql.VarChar, codigoArticulo)
              .query(`DELETE FROM ${tableName} WHERE ARTICULO=@ARTICULO`);

            const qUbi = transaction
              .request()
              .input("articulo", sql.NVarChar(20), codigoArticulo)
              .input("descripcion", sql.NVarChar(100), dato.DESCRIPCION || "")
              .input("bodega", sql.NVarChar(10), "0")
              .input("cantidad", sql.Decimal(18, 2), 0)
              .input("ubicacion", sql.NVarChar(20), String(ubiFinal).trim());
            await qUbi.query(
              `INSERT INTO ${tableName} (ARTICULO, DESCRIPCION, BOD, CANT, UBICACION) VALUES (@articulo, @descripcion, @bodega, @cantidad, @ubicacion)`
            );
            writeLog(
              `Ubicacion insertada en UBICACIONES ARTICULO=${codigoArticulo} UBI=${ubiFinal}`,
            );
          } catch (eUbi) {
            writeLog(
              `Error insertando ubicacion (Tabla UBICACIONES) articulo=${codigoArticulo}: ${eUbi.message}`,
            );
          }
        }

        // Advertencia si APLICA vino vacío
        const advertencias = [];
        if (!dato.APLICA) advertencias.push("APLICA vacío");
        respuesta.push({
          codigo: dato.CODIGO,
          status: articuloYaExiste ? "Actualizado" : "Insertado",
          warn: advertencias.join("; "),
        });
        writeLog(`Guardado articulo=${dato.CODIGO}`);
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
      `Error al insertar datos en la base de datos: ${err.message}`,
    );
  } finally {
    writeLog("Cerrando conexión SQL");
    sql.close();
  }
});
