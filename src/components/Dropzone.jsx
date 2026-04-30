import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import {
  Table,
  Icon,
  Header,
  Message,
  Button,
  Select,
  Container,
  Menu,
} from "semantic-ui-react";
import "./styles.css";
import SeriesControl from "./SeriesControl";
import pkg from "../../package.json";

const STORAGE_SELECTED_DB = "dz:selectedDatabase";
const STORAGE_ACTIVE_DB = "dz:activeDatabase";

const DISPLAY_COLUMNS_VENEPAC = [
  "CODIGO", "DESCRIPCION", "MODELO", "MARCA", "UNIDAD", "GRUPO", "SUBGRUPO", "FECHACIF", "IVA", "GARANTIA", "USUARIO"
];

const DISPLAY_COLUMNS_DFSK = [
  "CODIGO", "DESCRIPCION", "MARCA", "UNIDAD", "GRUPOG", "CLASIFICACION", "GRUPOF", "CATEGORIAF", "MODELOF", "CARACTERISTICASF", "NUMEROPARTEF", "APLICAF", "UBICACIONF", "TRANSMISIONF", "PUERTASF", "STATUS_FICHA"
];

const readStorage = (key) => {
  try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
};

const writeStorage = (key, value) => {
  try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch {}
};

const Dropzone = () => {
  const [selectedDatabase, setSelectedDatabase] = useState(() => readStorage(STORAGE_SELECTED_DB));
  const [testResult, setTestResult] = useState(null);
  const [conexionActiva, setConexionActiva] = useState(() => readStorage(STORAGE_ACTIVE_DB));
  const [data, setData] = useState([]);
  const [displayColumns, setDisplayColumns] = useState([]);
  const [rowErrors, setRowErrors] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [activeView, setActiveView] = useState("carga");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isDFSK = selectedDatabase === "dfsk" || selectedDatabase === "prueba_dfsk";
  const isVenepacBase = selectedDatabase === "venepac" || selectedDatabase === "prueba_venepac";

  useEffect(() => { writeStorage(STORAGE_SELECTED_DB, selectedDatabase); }, [selectedDatabase]);
  useEffect(() => { writeStorage(STORAGE_ACTIVE_DB, conexionActiva); }, [conexionActiva]);

  const testConexion = () => {
    if (!selectedDatabase) {
      setTestResult("Error: Selecciona una base de datos");
      return;
    }
    setTestResult("Probando conexión...");
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send("test-conexion", selectedDatabase);
      window.electron.ipcRenderer.once("test-conexion-respuesta", (res) => {
        if (res.exito) {
          setTestResult("Conexión exitosa a " + selectedDatabase);
          setConexionActiva(selectedDatabase);
        } else {
          setTestResult("Error: " + (res.error || "No se pudo conectar al servidor SQL"));
          setConexionActiva("");
        }
      });
    }
  };

  const processExcelData = (rawData) => {
    const errs = [];
    const processed = rawData.map((row, index) => {
      const cleanRow = {};
      Object.keys(row).forEach(k => cleanRow[String(k).trim().toUpperCase()] = row[k]);

      const dato = {
        CODIGO: cleanRow.CODIGO || cleanRow.ARTICULO || "",
        DESCRIPCION: cleanRow.DESCRIPCION || "",
        MARCA: cleanRow.MARCA || "",
        UNIDAD: cleanRow.UNIDAD || "",
        GRUPOG: cleanRow.GRUPOG || cleanRow["GRUPO G"] || "",
        CLASIFICACION: cleanRow.CLASIFICACION || cleanRow.GRUPOA || "",
        GRUPOF: cleanRow.GRUPOF || cleanRow.GRUPO || "",
        CATEGORIAF: cleanRow.CATEGORIAF || cleanRow.CATEGORIA || "",
        MODELOF: cleanRow.MODELOF || cleanRow.MODELO || "",
        STATUS_FICHA: "OK"
      };

      if (!dato.CODIGO) errs.push({ index, field: "CODIGO", msg: "Falta código" });
      
      if (isDFSK) {
        const faltantes = [];
        if (!dato.GRUPOF) faltantes.push("GRUPO");
        if (!dato.CATEGORIAF) faltantes.push("CAT");
        if (!dato.MODELOF) faltantes.push("MOD");
        if (faltantes.length) dato.STATUS_FICHA = "FALTAN: " + faltantes.join(",");
      }

      return { ...row, ...dato };
    });

    setData(processed);
    setRowErrors(errs);
    setDisplayColumns(isDFSK ? DISPLAY_COLUMNS_DFSK : DISPLAY_COLUMNS_VENEPAC);
  };

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const bstr = e.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws);
      processExcelData(rawData);
    };
    reader.readAsBinaryString(file);
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const generarPlantillaVenepac = () => {
    const ws = XLSX.utils.json_to_sheet([{ CODIGO: "", DESCRIPCION: "", MODELO: "", MARCA: "", UNIDAD: "UNID", GRUPO: "", SUBGRUPO: "" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_venepac.xlsx");
  };

  const generarPlantillaDfsk = () => {
    const ws = XLSX.utils.json_to_sheet([{ CODIGO: "", DESCRIPCION: "", MARCA: "", UNIDAD: "UNID", GRUPOG: "", CLASIFICACION: "", GRUPOF: "", CATEGORIAF: "", MODELOF: "", CARACTERISTICASF: "", NUMEROPARTEF: "", APLICAF: "", UBICACIONF: "" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_DFSK");
    XLSX.writeFile(wb, "plantilla_dfsk.xlsx");
  };

  const sendToBackend = () => {
    if (!conexionActiva) return;
    setFeedback(<Message info content="Procesando carga..." />);
    window.electron.ipcRenderer.send("insertar-datos", { database: selectedDatabase, data: data });
    window.electron.ipcRenderer.once("insertar-datos-respuesta", (res) => {
      if (res.exito) setFeedback(<Message positive content={`Procesados ${res.procesados} registros.`} />);
      else setFeedback(<Message negative content={res.error} />);
    });
  };

  const connectionState = conexionActiva === selectedDatabase ? "Conectado" : "Desconectado";
  const connectionTone = conexionActiva === selectedDatabase ? "dz-status-pill-ok" : "dz-status-pill-error";

  const instructivo = isVenepacBase 
    ? ["Plantilla VENEPAC: CODIGO, DESCRIPCION, MODELO", "Seleccionar base y Probar Conexión"]
    : ["Plantilla DFSK: CODIGO, DESCRIPCION, MARCA", "Se validan catálogos en tiempo real"];

  return (
    <div className="app-root-bg">
      <Container fluid className="dz-wrapper dz-animate-fade">
        <div className="dz-header-pro">
          <div className="dz-header-pro-left" style={{ minWidth: '300px' }}>
            <Icon name="shield alternate" size="large" inverted circular style={{ background: 'var(--gradient-pro)', margin: 0 }} />
            <div style={{ marginLeft: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-main)', fontWeight: 800 }}>PANEL DE CONTROL</span>
                <span style={{ color: '#e2e8f0' }}>•</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 800 }}>v{pkg.version} Enterprise</span>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>
                Última Compilación: {new Date().toLocaleDateString()} {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="dz-header-pro-right">
            <Button.Group size="tiny" basic>
              <Button color="teal" icon="file excel" content="Plantilla VENEPAC" onClick={generarPlantillaVenepac} />
              <Button color="violet" icon="file excel" content="Plantilla DFSK" onClick={generarPlantillaDfsk} />
            </Button.Group>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <aside className="dz-sidebar">
            <div className="dz-panel">
              <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem' }}><Icon name="options" /> Configuración</h4>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Base de Datos</label>
              <Select
                fluid size="small"
                options={[
                  { key: "v", value: "venepac", text: "VENEPAC (Producción)" },
                  { key: "pv", value: "prueba_venepac", text: "VENEPAC (Pruebas)" },
                  { key: "d", value: "dfsk", text: "DFSK (Producción)" },
                  { key: "pd", value: "prueba_dfsk", text: "DFSK (Pruebas)" },
                ]}
                value={selectedDatabase}
                onChange={(e, { value }) => { 
                  setSelectedDatabase(value); 
                  if (value !== conexionActiva) setConexionActiva(""); 
                }}
                style={{ marginBottom: '10px' }}
              />
              <Button fluid size="small" secondary onClick={testConexion} style={{ height: '34px' }}>
                <Icon name="plug" /> Probar Conexión
              </Button>
              {testResult && <Message size="mini" positive={testResult.includes("exitosa")} negative={testResult.includes("Error")} content={testResult} style={{ marginTop: '10px' }} />}
              <div className="dz-status-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
                <div className="dz-status-card"><span className="dz-status-label">Estado</span><div className={`dz-status-pill ${connectionTone}`} style={{ fontSize: '0.65rem' }}>{connectionState}</div></div>
                <div className="dz-status-card"><span className="dz-status-label">Filas</span><strong style={{ fontSize: '0.85rem' }}>{data.length}</strong></div>
              </div>
              <div className="dz-instructivo-box" style={{ marginTop: '1.2rem' }}>
                <h5 style={{ fontSize: '0.8rem' }}><Icon name="info circle" /> Guía</h5>
                <ul className="dz-instructivo-list">
                  {instructivo.map((t, i) => <li key={i} style={{ fontSize: '0.7rem' }}>{t}</li>)}
                </ul>
              </div>
            </div>
          </aside>

          <main className="dz-main-content">
            <Menu pointing secondary className="dz-tabs-menu" size="small">
              <Menu.Item name="Importación Masiva" active={activeView === "carga"} onClick={() => setActiveView("carga")} />
              <Menu.Item name="Control de Series" active={activeView === "series"} onClick={() => setActiveView("series")} />
            </Menu>
            <div className="dz-panel" style={{ marginTop: '0.8rem', minHeight: '520px' }}>
              {activeView === "carga" ? (
                <>
                  <div {...getRootProps()} className={`dz-dropzone ${data.length ? 'dz-dropzone-compact' : ''}`} style={{ padding: data.length ? '1rem' : '2.5rem' }}>
                    <input {...getInputProps()} />
                    <Icon name="cloud upload" size={data.length ? "large" : "huge"} color={data.length ? "grey" : "blue"} />
                    <Header as={data.length ? "h5" : "h4"} style={{ margin: '5px 0 0' }}>{uploadedFileName || "Subir Excel"}</Header>
                  </div>
                  {data.length > 0 && (
                    <div className="dz-animate-fade" style={{ marginTop: '1rem' }}>
                      <div className="dz-table-wrapper">
                        <div className="dz-table-header">
                          <Header as="h6" style={{ margin: 0 }}>Vista Previa</Header>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                             <Button size="tiny" basic icon="trash" onClick={() => { setData([]); setUploadedFileName(""); }} />
                             <Button primary size="tiny" onClick={sendToBackend} disabled={rowErrors.length > 0 || !conexionActiva}>Iniciar Carga</Button>
                          </div>
                        </div>
                        <div className="dz-table-scroll">
                          <Table celled striped compact selectable className="dz-preview-table">
                            <Table.Header><Table.Row>{displayColumns.map(k => <Table.HeaderCell key={k}>{k}</Table.HeaderCell>)}</Table.Row></Table.Header>
                            <Table.Body>
                              {data.map((row, i) => (
                                <Table.Row key={i}>
                                  {displayColumns.map(k => (
                                    <Table.Cell key={k} style={{ background: k === 'STATUS_FICHA' && row[k] !== 'OK' ? '#fff4e6' : '' }}>{row[k]}</Table.Cell>
                                  ))}
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table>
                        </div>
                      </div>
                    </div>
                  )}
                  {feedback && <div style={{ marginTop: '1rem' }}>{feedback}</div>}
                </>
              ) : <SeriesControl selectedDatabase={selectedDatabase} canQuery={conexionActiva === selectedDatabase} />}
            </div>
          </main>
        </div>
      </Container>
    </div>
  );
};

export default Dropzone;
