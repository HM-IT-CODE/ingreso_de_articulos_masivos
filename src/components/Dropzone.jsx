import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import {
  Table,
  Icon,
  Segment,
  Header,
  Message,
  Button,
  Select,
  Container,
} from "semantic-ui-react";
import "./styles.css";

// Componente mínimo limpio. Próximos pasos: reintroducir catálogos y validaciones.
const Dropzone = () => {
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [conexionActiva, setConexionActiva] = useState("");
  const [data, setData] = useState([]);
  const [displayColumns, setDisplayColumns] = useState([]);
  const [rowErrors, setRowErrors] = useState([]);
  const [feedback, setFeedback] = useState(null);
  // Catálogos
  const [mapGrupos, setMapGrupos] = useState({});
  const [mapCategorias, setMapCategorias] = useState({});
  const [mapMarcas, setMapMarcas] = useState({});
  const [grupoKeys, setGrupoKeys] = useState([]);
  const [marcaKeys, setMarcaKeys] = useState([]);
  const [catStatus, setCatStatus] = useState(null);
  const [marcasStatus, setMarcasStatus] = useState(null);
  const [autoRevalidated, setAutoRevalidated] = useState(false);

  const isDFSK =
    selectedDatabase === "dfsk" || selectedDatabase === "prueba_dfsk";
  const isVenepacBase =
    selectedDatabase === "venepac" || selectedDatabase === "prueba_venepac";
  const norm = (v) =>
    v
      ? String(v)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase()
      : "";

  const instructivo = isVenepacBase
    ? [
        "Plantilla VENEPAC: CODIGO, DESCRIPCION(opc), MODELO(opc), MARCA(opc), UNIDAD, GRUPO(opc), SUBGRUPO(opc), FECHACIF(opc), IVA(opc), GARANTIA(opc), USUARIO(opc)",
        "Si DESCRIPCION se deja vacía se usará MODELO y si también falta MODELO se usará el CODIGO como descripción/ficha",
        "Defaults: MARCA=GENERAL, GRUPO=MUESTRA, SUBGRUPO=ACCESORIES si se dejan vacíos",
        "Seleccionar base venepac y probar conexión",
        "Cargar Excel y revisar errores mínimos",
        "Guardar",
      ]
    : [
        "Plantilla DFSK avanzada (botón Plantilla)",
        "Seleccionar base dfsk / prueba_dfsk y probar conexión",
        "Esperar carga de catálogos (marcas / grupos / categorías)",
        "Revisar STATUS_FICHA (OK / FALTAN: ...)",
        "Guardar",
      ];

  // Carga catálogos
  useEffect(() => {
    if (!isDFSK) {
      setMapGrupos({});
      setMapCategorias({});
      setMapMarcas({});
      setGrupoKeys([]);
      setMarcaKeys([]);
      setCatStatus(null);
      setMarcasStatus(null);
      setAutoRevalidated(false);
      return;
    }
    const target =
      selectedDatabase === "prueba_dfsk" ? "dfsk" : selectedDatabase;
    setCatStatus("Cargando categorías/grupos...");
    window.electron.ipcRenderer.send("obtener-categorias", target);
    window.electron.ipcRenderer.once("obtener-categorias-respuesta", (r) => {
      if (r.success) {
        const g = {},
          c = {};
        r.data.forEach((row) => {
          if (row.GRUPO && row.IDGRUPO) g[norm(row.GRUPO)] = row.IDGRUPO;
          if (row.CATEGORIA && row.IDCATEGORIA)
            c[norm(row.CATEGORIA)] = {
              IDCATEGORIA: row.IDCATEGORIA,
              IDGRUPO: row.IDGRUPO,
            };
        });
        setMapGrupos(g);
        setGrupoKeys(Object.keys(g));
        setMapCategorias(c);
        setCatStatus(`Categorías/Grupos cargados: ${r.data.length}`);
        if (data.length)
          setTimeout(() => revalidateRows(data, g, c, mapMarcas), 0);
      } else setCatStatus("Error catálogos: " + r.mensaje);
    });
    setMarcasStatus("Cargando marcas...");
    window.electron.ipcRenderer.send("obtener-marcas", target);
    window.electron.ipcRenderer.once("obtener-marcas-respuesta", (r) => {
      if (r.success) {
        const m = {};
        r.data.forEach((row) => {
          if (row.DESCRIPCION && row.CODIGO)
            m[norm(row.DESCRIPCION)] = row.CODIGO;
        });
        setMapMarcas(m);
        setMarcaKeys(Object.keys(m));
        setMarcasStatus(`Marcas cargadas: ${Object.keys(m).length}`);
        if (data.length)
          setTimeout(
            () => revalidateRows(data, mapGrupos, mapCategorias, m),
            0
          );
      } else setMarcasStatus("Error marcas: " + r.mensaje);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatabase]);

  useEffect(() => {
    if (
      isDFSK &&
      data.length &&
      Object.keys(mapGrupos).length &&
      Object.keys(mapMarcas).length &&
      !autoRevalidated
    ) {
      revalidateRows(data, mapGrupos, mapCategorias, mapMarcas);
      setAutoRevalidated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapGrupos, mapMarcas, mapCategorias, data]);

  const revalidateRows = (rows, grupos, categorias, marcas) => {
    if (!isDFSK) return;
    const aliasGrupoA = { CIERPRE: "GRUPO 1" };
    const errs = [];
    const updated = rows.map((row, index) => {
      let marcaCode = null;
      if (row.MARCA) {
        const mk = norm(row.MARCA);
        if (marcas[mk] != null) marcaCode = marcas[mk];
        else errs.push({ index, field: "MARCA", msg: "Marca no encontrada" });
      } else errs.push({ index, field: "MARCA", msg: "Falta MARCA" });
      let grpA = row.GRUPOA;
      if (grpA) {
        const alias = aliasGrupoA[norm(grpA)];
        if (alias) grpA = alias;
      }
      let idGrupoArticulo = null;
      if (grpA) {
        const gk = norm(grpA);
        if (grupos[gk] != null) idGrupoArticulo = grupos[gk];
        else {
          const m = /GRUPO\s*(\d+)/i.exec(String(grpA).replace(/\s+/g, " "));
          if (m) idGrupoArticulo = parseInt(m[1], 10);
        }
      }
      if (idGrupoArticulo == null)
        errs.push({ index, field: "GRUPO A", msg: "Grupo A no mapeado" });
      const catName = norm(row.CATEGORIA);
      const fichaName = norm(row.FICHA_GRUPO);
      let idGrupoFicha = null,
        idCategoriaFicha = null;
      if (catName && categorias[catName]) {
        idCategoriaFicha = categorias[catName].IDCATEGORIA;
        idGrupoFicha = categorias[catName].IDGRUPO;
      } else if (fichaName && grupos[fichaName] != null)
        idGrupoFicha = grupos[fichaName];
      else if (row.FICHA_GRUPO) {
        const gm = /GRUPO\s*(\d+)/i.exec(
          String(row.FICHA_GRUPO).replace(/\s+/g, " ")
        );
        if (gm) idGrupoFicha = parseInt(gm[1], 10);
      }
      if (!idGrupoFicha)
        errs.push({ index, field: "GRUPO", msg: "Grupo ficha no mapeado" });
      const faltan = [];
      if (!marcaCode) faltan.push("MARCA");
      if (idGrupoArticulo == null) faltan.push("GRUPO A");
      if (!idGrupoFicha) faltan.push("GRUPO FICHA");
      const STATUS_FICHA =
        faltan.length === 0 ? "OK" : "FALTAN: " + faltan.join(", ");
      return {
        ...row,
        MARCA_CODE: marcaCode,
        GRUPO: idGrupoArticulo != null ? idGrupoArticulo : row.GRUPO,
        IDGRUPO_FICHA: idGrupoFicha,
        IDCATEGORIA_FICHA: idCategoriaFicha,
        STATUS_FICHA,
      };
    });
    setData(updated);
    setRowErrors(errs);
  };

  const testConexion = () => {
    if (!selectedDatabase) {
      setTestResult("Debes seleccionar una base de datos.");
      return;
    }
    setTestResult("Probando conexión...");
    window.electron.ipcRenderer.send("test-conexion", selectedDatabase);
    window.electron.ipcRenderer.once("test-conexion-respuesta", (resp) => {
      if (resp.success) {
        setTestResult(resp.mensaje);
        setConexionActiva(selectedDatabase);
      } else {
        setTestResult(resp.mensaje);
        setConexionActiva("");
      }
      setTimeout(() => setTestResult(null), 2500);
    });
  };

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Leer headers crudos para auto-detección
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });
      const headers = (rawRows[0] || []).map((h) => String(h || "").trim());
      console.log("Headers detectados:", headers);
      // Auto-detección DFSK si aparecen columnas típicas
      const dfsKIndicadores = [
        "CARACTERISTICAS",
        "NUMEROPARTE",
        "APLICA",
        "GRUPO A",
        "CATEGORIA",
      ]; // mayúsculas
      const hasDfskSignature = headers.some((h) =>
        dfsKIndicadores.includes(h.toUpperCase())
      );
      const forzarDfsk = !isDFSK && hasDfskSignature; // Usuario no seleccionó base dfsk pero plantilla lo parece
      if (forzarDfsk) {
        console.warn(
          "Auto-detección: plantilla coincide con DFSK aunque no se seleccionó base DFSK."
        );
      }
      // Convertir a objetos manteniendo celdas vacías
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const errs = [];
      const parsed = json.map((row, index) => {
        const usarDfsk = (isDFSK || forzarDfsk) && !isVenepacBase;
        if (!usarDfsk && isVenepacBase) {
          const base = {
            CODIGO: row.CODIGO,
            DESCRIPCION: row.DESCRIPCION,
            MODELO: row.MODELO,
            MARCA: row.MARCA || "GENERAL",
            UNIDAD: row.UNIDAD,
            GRUPO: row.GRUPO || "MUESTRA",
            SUBGRUPO: row.SUBGRUPO || "ACCESORIES",
            FECHACIF: row.FECHACIF,
            IVA: row.IVA,
            GARANTIA: row.GARANTIA,
            USUARIO: row.USUARIO,
          };
          if (!base.CODIGO)
            errs.push({ index, field: "CODIGO", msg: "Falta CODIGO" });
          // DESCRIPCION ahora es opcional (backend hace fallback a MODELO o CODIGO)
          return base;
        }
        // DFSK (seleccionado o auto-detectado)
        const base = {
          CODIGO: row.CODIGO,
          DESCRIPCION: row.DESCRIPCION,
          MARCA: row.MARCA,
          UNIDAD: row.UNIDAD,
          IVA: row.IVA,
          FECHACIF: row.FECHACIF,
          GARANTIA: row.GARANTIA,
          GRUPOA: row["GRUPO A"] || row.GRUPOA || row.GRUPO_A,
          FICHA_GRUPO: row.GRUPO,
          CATEGORIA: row.CATEGORIA,
          MODELO: row.MODELO,
          USUARIO: row.USUARIO,
          NUMEROPARTE: row.NUMEROPARTE,
          CARACTERISTICAS: row.CARACTERISTICAS,
          APLICA: row.APLICA,
        };
        if (!base.CODIGO)
          errs.push({ index, field: "CODIGO", msg: "Falta CODIGO" });
        if (!base.MARCA)
          errs.push({ index, field: "MARCA", msg: "Falta MARCA" });
        if (!base.DESCRIPCION && !base.CARACTERISTICAS)
          errs.push({
            index,
            field: "DESCRIPCION",
            msg: "Falta DESCRIPCION o CARACTERISTICAS",
          });
        return base;
      });
      setData(parsed);
      setRowErrors(errs);
      if (parsed.length) {
        const preferredVen = [
          "CODIGO",
          "DESCRIPCION",
          "MODELO",
          "MARCA",
          "UNIDAD",
          "GRUPO",
          "SUBGRUPO",
          "FECHACIF",
          "IVA",
          "GARANTIA",
          "USUARIO",
        ];
        const preferredDfsk = [
          "CODIGO",
          "DESCRIPCION",
          "MARCA",
          "MARCA_CODE",
          "UNIDAD",
          "IVA",
          "FECHACIF",
          "GARANTIA",
          "IVA",
          "CIF",
          "GRUPOA",
          "GRUPO",
          "FICHA_GRUPO",
          "CATEGORIA",
          "MODELO",
          "IDMODELO",
          "NUMEROPARTE",
          "CARACTERISTICAS",
          "APLICA",
          "URLIMAGEN",
          "STATUS_FICHA",
          "IDGRUPO_FICHA",
          "IDCATEGORIA_FICHA",
          "USUARIO",
        ];
        const all = Object.keys(parsed[0]);
        const ord = (
          isVenepacBase && !forzarDfsk ? preferredVen : preferredDfsk
        ).filter((k) => all.includes(k));
        const rest = all.filter((k) => !ord.includes(k));
        setDisplayColumns([...ord, ...rest]);
      } else setDisplayColumns([]);
      if (!parsed.length) {
        setFeedback(
          "El archivo parece vacío o la primera hoja no contiene datos bajo los encabezados esperados."
        );
      } else if (!isDFSK && forzarDfsk) {
        setFeedback(
          "Plantilla detectada como DFSK: selecciona la base DFSK antes de guardar para validar catálogos."
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const sendToBackend = () => {
    if (!data.length) {
      setFeedback("No hay datos para enviar al backend.");
      return;
    }
    if (!selectedDatabase) {
      setFeedback("Debes seleccionar una base de datos.");
      return;
    }
    if (rowErrors.length) {
      setFeedback(
        `Existen ${rowErrors.length} errores. Corrige antes de enviar.`
      );
      return;
    }
    // Transformar para backend: DFSK usa códigos numéricos ya resueltos
    const toSend = isDFSK
      ? data.map((r) => {
          const c = { ...r };
          if (c.MARCA_CODE != null) {
            c.MARCA = c.MARCA_CODE;
            delete c.MARCA_CODE;
          }
          if (c.IDGRUPO_FICHA && !c.IDGRUPO) c.IDGRUPO = c.IDGRUPO_FICHA;
          if (c.IDCATEGORIA_FICHA && !c.IDCATEGORIA)
            c.IDCATEGORIA = c.IDCATEGORIA_FICHA;
          return c;
        })
      : data;
    setFeedback("Enviando datos...");
    window.electron.ipcRenderer.send("insertar-datos", {
      database: selectedDatabase,
      data: toSend,
    });
    window.electron.ipcRenderer.once("insertar-datos-respuesta", (resp) => {
      if (Array.isArray(resp)) {
        const ok = resp.filter((r) => r.status === "Insertado").length;
        const fail = resp.filter((r) => r.status !== "Insertado").length;
        const warns = resp.filter((r) => r.warn).length;
        setFeedback(
          `Insertados: ${ok} | Fallidos: ${fail}${
            warns ? " | Advertencias: " + warns : ""
          }`
        );
        // No limpiamos automáticamente para que el usuario pueda revisar; ofreceremos botón.
      } else setFeedback("Hubo un error en la inserción de datos: " + resp);
    });
  };

  const generarPlantillaVenepac = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      [
        "CODIGO",
        "DESCRIPCION",
        "MODELO",
        "MARCA",
        "UNIDAD",
        "GRUPO",
        "SUBGRUPO",
        "FECHACIF",
        "IVA",
        "GARANTIA",
        "USUARIO",
      ],
      [
        "VP0001",
        "EJEMPLO DESCRIPCION",
        "MODELOX",
        "GENERAL",
        "UND",
        "MUESTRA",
        "ACCESORIES",
        "02/10/2025",
        "16,00",
        "0.00",
        "ADMN",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "PLANTILLA_VENEPAC");
    XLSX.writeFile(wb, "plantilla_venepac.xlsx");
  };
  const generarPlantillaDfsk = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      [
        "CODIGO",
        "DESCRIPCION",
        "MARCA",
        "UNIDAD",
        "IVA",
        "FECHACIF",
        "GARANTIA",
        "GRUPO A",
        "USUARIO",
        "GRUPO",
        "CATEGORIA",
        "MODELO",
        "CARACTERISTICAS",
        "NUMEROPARTE",
        "APLICA",
      ],
      [
        "DF000012",
        "NEW-PRUEBAS",
        "ALISTAMIENTO",
        "UNID",
        "16,00",
        "02/10/2025",
        "0.00",
        "GRUPO  1",
        "ADMN",
        "A/A",
        "A/A",
        "D1",
        "new partes",
        "809050HM",
        "SIN MODELO, C31, C32, GLORY 330",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "PLANTILLA");
    if (marcaKeys.length || grupoKeys.length) {
      const wsCatData = [
        ["MARCAS"],
        ...marcaKeys.map((k) => [k]),
        [],
        ["GRUPOS"],
        ...grupoKeys.map((k) => [k]),
      ];
      const wsCat = XLSX.utils.aoa_to_sheet(wsCatData);
      XLSX.utils.book_append_sheet(wb, wsCat, "CATALOGOS");
    }
    XLSX.writeFile(wb, "plantilla_articulos_dfsk.xlsx");
  };

  return (
    <div className="app-root-bg" style={{ minHeight: "100vh", padding: "3vw" }}>
      <Container fluid>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <Button
            size="small"
            basic
            color="teal"
            icon
            labelPosition="left"
            onClick={generarPlantillaVenepac}
          >
            <Icon name="download" /> Plantilla VENEPAC
          </Button>
          <Button
            size="small"
            basic
            color="violet"
            icon
            labelPosition="left"
            onClick={generarPlantillaDfsk}
          >
            <Icon name="download" /> Plantilla DFSK
          </Button>
        </div>
        <div className="dz-wrapper">
          <div className="dz-panel dz-select-db">
            <div className="dz-header-inline">
              <Icon name="database" color="blue" /> <h4>Configuración</h4>
            </div>
            <Header as="h5" style={{ marginTop: 20, fontWeight: 600 }}>
              Base de datos
            </Header>
            <Select
              fluid
              placeholder="Selecciona base de datos"
              options={[
                { key: "venepac", value: "venepac", text: "VENEPAC" },
                {
                  key: "prueba_venepac",
                  value: "prueba_venepac",
                  text: "Prueba VENEPAC",
                },
                { key: "dfsk", value: "dfsk", text: "DFSK" },
                {
                  key: "prueba_dfsk",
                  value: "prueba_dfsk",
                  text: "Prueba DFSK",
                },
              ]}
              value={selectedDatabase}
              onChange={(e, { value }) => setSelectedDatabase(value)}
              style={{ marginTop: 6 }}
            />
            <Button
              fluid
              secondary
              icon
              labelPosition="left"
              style={{ marginTop: 14 }}
              onClick={testConexion}
            >
              <Icon name="plug" /> Probar conexión
            </Button>
            {testResult && (
              <Message
                size="tiny"
                style={{ marginTop: 12 }}
                positive={testResult.includes("exitosa")}
                negative={testResult.includes("Error")}
              >
                {testResult}
              </Message>
            )}
            {conexionActiva && (
              <div className="dz-badges" style={{ marginTop: 8 }}>
                <div className="dz-badge dz-chip-ok">
                  <Icon name="check circle" /> Conectado a {conexionActiva}
                </div>
              </div>
            )}
            {isDFSK && catStatus && (
              <Message
                size="tiny"
                style={{ marginTop: 16 }}
                info={!catStatus.startsWith("Error")}
                error={catStatus.startsWith("Error")}
              >
                {catStatus}
              </Message>
            )}
            {isDFSK && marcasStatus && (
              <Message
                size="tiny"
                style={{ marginTop: 8 }}
                info={!marcasStatus.startsWith("Error")}
                error={marcasStatus.startsWith("Error")}
              >
                {marcasStatus}
              </Message>
            )}
            <Header as="h5" style={{ marginTop: 28, fontWeight: 600 }}>
              Instructivo
            </Header>
            <ul className="dz-instructivo-list">
              {instructivo.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {rowErrors.length > 0 && (
              <Message error size="tiny" style={{ marginTop: 18 }}>
                <Message.Header style={{ fontSize: "0.85rem" }}>
                  Errores ({rowErrors.length})
                </Message.Header>
                <ul className="dz-errors-list">
                  {rowErrors.slice(0, 30).map((er, i) => (
                    <li key={i}>
                      Fila {er.index + 2} - {er.field}: {er.msg}
                    </li>
                  ))}
                  {rowErrors.length > 30 && (
                    <li>...más ({rowErrors.length - 30})</li>
                  )}
                </ul>
              </Message>
            )}
          </div>
          <div>
            <Segment className="dz-dropzone" {...getRootProps()}>
              <input {...getInputProps()} />
              <Icon name="cloud upload" size="huge" color="blue" />
              <Header as="h2" style={{ color: "#156fa6", marginTop: 10 }}>
                Sube tu archivo
              </Header>
              <p className="dz-hint">
                Arrastra o haz clic para seleccionar tu Excel
              </p>
            </Segment>
            {data.length > 0 && (
              <div className="dz-table-wrapper">
                <h5>
                  Vista previa ({data.length} fila{data.length !== 1 && "s"})
                </h5>
                <div className="dz-table-scroll">
                  <Table celled striped compact selectable>
                    <Table.Header>
                      <Table.Row>
                        {(displayColumns.length
                          ? displayColumns
                          : Object.keys(data[0])
                        ).map((k) => (
                          <Table.HeaderCell key={k}>{k}</Table.HeaderCell>
                        ))}
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.map((row, i) => (
                        <Table.Row key={i}>
                          {(displayColumns.length
                            ? displayColumns
                            : Object.keys(row)
                          ).map((k, j) => (
                            <Table.Cell key={j}>{row[k]}</Table.Cell>
                          ))}
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
                <div className="dz-actions">
                  <Button
                    primary
                    icon
                    labelPosition="left"
                    disabled={rowErrors.length > 0}
                    onClick={sendToBackend}
                  >
                    <Icon name="save" /> Guardar
                  </Button>
                  <Button
                    color="teal"
                    basic
                    icon
                    labelPosition="left"
                    onClick={() =>
                      isVenepacBase
                        ? generarPlantillaVenepac()
                        : generarPlantillaDfsk()
                    }
                  >
                    <Icon name="download" /> Plantilla
                  </Button>
                  <Button
                    basic
                    color="blue"
                    icon
                    labelPosition="left"
                    onClick={() => {
                      setData([]);
                      setRowErrors([]);
                      setFeedback(null);
                    }}
                  >
                    <Icon name="trash" /> Limpiar
                  </Button>
                </div>
              </div>
            )}
            {feedback && (
              <Message
                className="dz-feedback"
                onDismiss={() => setFeedback(null)}
                info
              >
                <Message.Header>Resultado inserción</Message.Header>
                <p>{feedback}</p>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <Button
                    size="tiny"
                    basic
                    color="blue"
                    onClick={() => {
                      setData([]);
                      setRowErrors([]);
                    }}
                  >
                    Limpiar tabla
                  </Button>
                  <Button
                    size="tiny"
                    basic
                    color="green"
                    onClick={() => setFeedback(null)}
                  >
                    Cerrar
                  </Button>
                </div>
              </Message>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
};

export default Dropzone;
