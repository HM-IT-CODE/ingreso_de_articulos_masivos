import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  Button,
  Grid,
  Header,
  Icon,
  Message,
  Segment,
  Statistic,
  Table,
} from "semantic-ui-react";

const SERIES = {
  66000: { start: 66000, end: 66999, label: "Serie 66000" },
  67000: { start: 67000, end: 67999, label: "Serie 67000" },
  68000: { start: 68000, end: 68999, label: "Serie 68000" },
  69000: { start: 69000, end: 69999, label: "Serie 69000" },
  70000: { start: 70000, end: 70999, label: "Serie 70000" },
  71000: { start: 71000, end: 71999, label: "Serie 71000" },
  72000: { start: 72000, end: 72999, label: "Serie 72000" },
  73000: { start: 73000, end: 73999, label: "Serie 73000" },
  74000: { start: 74000, end: 74999, label: "Serie 74000" },
  75000: { start: 75000, end: 75999, label: "Serie 75000" },
  76000: { start: 76000, end: 76999, label: "Serie 76000" },
  77000: { start: 77000, end: 77999, label: "Serie 77000" },
  78000: { start: 78000, end: 78999, label: "Serie 78000" },
  79000: { start: 79000, end: 79999, label: "Serie 79000" },
  80000: { start: 80000, end: 89999, label: "Serie 80000" },
  90000: { start: 90000, end: 99999, label: "Serie 90000" },
};

const SeriesControl = ({ selectedDatabase, canQuery }) => {
  const [serieActiva, setSerieActiva] = useState("66000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [missingCodes, setMissingCodes] = useState([]);
  const [existingCodes, setExistingCodes] = useState([]);
  const [seriesRows, setSeriesRows] = useState([]);

  const buildSeriesCodes = (serie) => {
    const rows = [];
    for (let code = serie.start; code <= serie.end; code += 1) {
      rows.push(String(code));
    }
    return rows;
  };

  const buildSummary = (serie, createdRows, limitMissingRows) => {
    const createdMap = new Map(
      createdRows
        .map((item) => [String(item.CODIGO || "").trim(), item])
        .filter(([code]) => code),
    );
    const allSeriesCodes = buildSeriesCodes(serie);
    const mergedRows = allSeriesCodes.map((code) => {
      const existing = createdMap.get(code);
      if (existing) {
        return {
          CODIGO: code,
          ESTADO_CODIGO: "CREADO",
          DESCRIPCION: existing.DESCRIPCION,
          MODELO: existing.MODELO,
          NUMEROPARTE: existing.NUMEROPARTE,
          MARCA: existing.MARCA,
        };
      }
      return {
        CODIGO: code,
        ESTADO_CODIGO: "FALTANTE",
        DESCRIPCION: null,
        MODELO: null,
        NUMEROPARTE: null,
        MARCA: null,
      };
    });

    const missingRows = mergedRows.filter(
      (item) => item.ESTADO_CODIGO === "FALTANTE",
    );
    const existingSorted = createdRows
      .map((item) => String(item.CODIGO || "").trim())
      .filter(Boolean)
      .sort();
    const missing = missingRows.slice(0, limitMissingRows);

    return {
      summary: {
        DESDE: String(serie.start),
        HASTA: String(serie.end),
        CAPACIDAD_TOTAL: mergedRows.length,
        CODIGOS_USADOS: createdRows.length,
        CODIGOS_RESTANTES: missingRows.length,
        PRIMER_CODIGO_USADO: existingSorted[0] || null,
        ULTIMO_CODIGO_USADO: existingSorted[existingSorted.length - 1] || null,
        SIGUIENTE_SUGERIDO: missing[0]?.CODIGO || null,
      },
      missingCodes: missing.map((item) => ({ CODIGO_FALTANTE: item.CODIGO })),
      createdRows,
      seriesRows: mergedRows,
    };
  };

  const loadSeriesData = (serieKey = serieActiva) => {
    if (!selectedDatabase) {
      setError("Selecciona una base de datos antes de consultar series.");
      return;
    }
    if (!window.electron || !window.electron.ipcRenderer) {
      setError("No se detecta el entorno Electron.");
      return;
    }

    const serie = SERIES[serieKey];
    setLoading(true);
    setError("");
    window.electron.ipcRenderer.send("obtener-resumen-series", {
      database: selectedDatabase,
      rangeStart: serie.start,
      rangeEnd: serie.end,
      limitMissing: 60,
    });
    window.electron.ipcRenderer.once(
      "obtener-resumen-series-respuesta",
      (resp) => {
        setLoading(false);
        if (!resp.success) {
          setError(resp.mensaje || "No se pudo consultar la serie.");
          setSummary(null);
          setMissingCodes([]);
          setExistingCodes([]);
          setSeriesRows([]);
          return;
        }
        const rows = (resp.existingCodes || []).filter((item) => {
          const code = Number(String(item.CODIGO || "").trim());
          return (
            Number.isInteger(code) && code >= serie.start && code <= serie.end
          );
        });
        const computed = buildSummary(
          serie,
          rows,
          resp.summary?.LIMIT_MISSING || 60,
        );
        setSummary(computed.summary);
        setMissingCodes(computed.missingCodes);
        setExistingCodes(computed.createdRows.slice(-25).reverse());
        setSeriesRows(computed.seriesRows);
      },
    );
  };

  const exportSeriesToExcel = () => {
    if (!seriesRows.length) {
      setError("No hay datos de serie para exportar.");
      return;
    }

    const exportRows = seriesRows.map((item) => ({
      CODIGO: item.CODIGO,
      ESTADO_CODIGO: item.ESTADO_CODIGO,
      DESCRIPCION: item.DESCRIPCION || "",
      MODELO: item.MODELO || "",
      NUMEROPARTE: item.NUMEROPARTE || "",
      MARCA: item.MARCA || "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, "SERIE");
    XLSX.writeFile(wb, `serie_${serie.start}_${serie.end}.xlsx`);
  };

  useEffect(() => {
    setSummary(null);
    setMissingCodes([]);
    setExistingCodes([]);
    setSeriesRows([]);
    setError("");
    if (canQuery && selectedDatabase) {
      loadSeriesData(serieActiva);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatabase, canQuery, serieActiva]);

  const serie = SERIES[serieActiva];

  return (
    <div className="series-control-root">
      <div className="series-toolbar">
        <div>
          <Header as="h3" style={{ marginBottom: 6 }}>
            Control de series
          </Header>
          <p className="series-subtitle">
            Revisa cuántos códigos ya existen, cuánto cupo queda y cuáles puedes
            crear en la {serie.label.toLowerCase()}.
          </p>
        </div>
        <div className="series-toolbar-actions">
          {Object.keys(SERIES).map((key) => (
            <Button
              key={key}
              basic={serieActiva !== key}
              color="blue"
              onClick={() => setSerieActiva(key)}
            >
              {SERIES[key].label}
            </Button>
          ))}
          <Button
            primary
            icon
            labelPosition="left"
            loading={loading}
            disabled={!selectedDatabase}
            onClick={() => loadSeriesData()}
          >
            <Icon name="sync" /> Actualizar
          </Button>
          <Button
            basic
            color="green"
            icon
            labelPosition="left"
            disabled={!seriesRows.length}
            onClick={exportSeriesToExcel}
          >
            <Icon name="file excel outline" /> Exportar Excel
          </Button>
        </div>
      </div>

      {!selectedDatabase && (
        <Message info>
          Selecciona una base de datos y prueba conexión para consultar esta
          pestaña.
        </Message>
      )}

      {error && <Message negative>{error}</Message>}

      {summary && (
        <>
          <Segment className="series-summary-panel">
            <Grid stackable columns={4}>
              <Grid.Column>
                <Statistic size="tiny">
                  <Statistic.Value>{summary.CODIGOS_USADOS}</Statistic.Value>
                  <Statistic.Label>Usados</Statistic.Label>
                </Statistic>
              </Grid.Column>
              <Grid.Column>
                <Statistic size="tiny" color="green">
                  <Statistic.Value>{summary.CODIGOS_RESTANTES}</Statistic.Value>
                  <Statistic.Label>Disponibles</Statistic.Label>
                </Statistic>
              </Grid.Column>
              <Grid.Column>
                <Statistic size="tiny" color="blue">
                  <Statistic.Value>
                    {summary.SIGUIENTE_SUGERIDO ?? "Sin cupo"}
                  </Statistic.Value>
                  <Statistic.Label>Siguiente sugerido</Statistic.Label>
                </Statistic>
              </Grid.Column>
              <Grid.Column>
                <Statistic size="tiny">
                  <Statistic.Value>{summary.CAPACIDAD_TOTAL}</Statistic.Value>
                  <Statistic.Label>Capacidad total</Statistic.Label>
                </Statistic>
              </Grid.Column>
            </Grid>
            <div className="series-summary-meta">
              <span>
                Rango: {summary.DESDE} - {summary.HASTA}
              </span>
              <span>
                Primer usado: {summary.PRIMER_CODIGO_USADO ?? "Ninguno"}
              </span>
              <span>
                Ultimo usado: {summary.ULTIMO_CODIGO_USADO ?? "Ninguno"}
              </span>
            </div>
          </Segment>

          <Grid stackable columns={2}>
            <Grid.Column>
              <Segment className="series-list-panel">
                <Header as="h4">Codigos recomendados para crear</Header>
                <p className="series-panel-hint">
                  Estos son los primeros huecos disponibles dentro del rango
                  seleccionado.
                </p>
                {missingCodes.length ? (
                  <div className="series-chip-grid">
                    {missingCodes.map((item) => (
                      <div
                        key={item.CODIGO_FALTANTE}
                        className="series-chip series-chip-available"
                      >
                        {item.CODIGO_FALTANTE}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Message warning>
                    No hay codigos disponibles en este rango.
                  </Message>
                )}
              </Segment>
            </Grid.Column>

            <Grid.Column>
              <Segment className="series-list-panel">
                <Header as="h4">Ultimos codigos registrados</Header>
                <p className="series-panel-hint">
                  Muestra los 25 codigos mas altos que ya existen en la serie.
                </p>
                <div className="series-table-scroll">
                  <Table compact striped celled>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Codigo</Table.HeaderCell>
                        <Table.HeaderCell>Descripcion</Table.HeaderCell>
                        <Table.HeaderCell>Modelo</Table.HeaderCell>
                        <Table.HeaderCell>Numero parte</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {existingCodes.length ? (
                        existingCodes.map((item) => (
                          <Table.Row key={item.CODIGO}>
                            <Table.Cell>{item.CODIGO}</Table.Cell>
                            <Table.Cell>{item.DESCRIPCION}</Table.Cell>
                            <Table.Cell>{item.MODELO}</Table.Cell>
                            <Table.Cell>{item.NUMEROPARTE}</Table.Cell>
                          </Table.Row>
                        ))
                      ) : (
                        <Table.Row>
                          <Table.Cell colSpan="4">
                            No hay codigos registrados en este rango.
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table>
                </div>
              </Segment>
            </Grid.Column>
          </Grid>

          <Segment className="series-list-panel">
            <Header as="h4">Serie completa</Header>
            <p className="series-panel-hint">
              Consulta toda la serie y revisa si cada codigo ya esta creado o
              sigue faltante.
            </p>
            <div className="series-table-scroll">
              <Table compact striped celled>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Codigo</Table.HeaderCell>
                    <Table.HeaderCell>Estado</Table.HeaderCell>
                    <Table.HeaderCell>Descripcion</Table.HeaderCell>
                    <Table.HeaderCell>Modelo</Table.HeaderCell>
                    <Table.HeaderCell>Numero parte</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {seriesRows.length ? (
                    seriesRows.map((item) => (
                      <Table.Row key={item.CODIGO}>
                        <Table.Cell>{item.CODIGO}</Table.Cell>
                        <Table.Cell>
                          <span
                            className={
                              item.ESTADO_CODIGO === "CREADO"
                                ? "series-status series-status-created"
                                : "series-status series-status-missing"
                            }
                          >
                            {item.ESTADO_CODIGO}
                          </span>
                        </Table.Cell>
                        <Table.Cell>{item.DESCRIPCION}</Table.Cell>
                        <Table.Cell>{item.MODELO}</Table.Cell>
                        <Table.Cell>{item.NUMEROPARTE}</Table.Cell>
                      </Table.Row>
                    ))
                  ) : (
                    <Table.Row>
                      <Table.Cell colSpan="5">
                        No hay resultados para esta serie.
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </div>
          </Segment>
        </>
      )}
    </div>
  );
};

export default SeriesControl;
