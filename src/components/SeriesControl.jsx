import React, { useState, useEffect } from "react";
import {
  Button,
  Header,
  Icon,
  Message,
  Table,
  Grid,
  Segment,
  Statistic,
} from "semantic-ui-react";

const SERIES = [
  66000, 67000, 68000, 69000, 70000, 71000, 72000, 73000, 74000, 75000, 76000, 77000, 78000, 79000, 80000, 90000
];

const SeriesControl = ({ selectedDatabase, canQuery }) => {
  const [activeSerie, setActiveSerie] = useState(SERIES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingCodes, setExistingCodes] = useState([]);
  const [summary, setSummary] = useState(null);

  const fetchSeriesData = () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);

    const rangeStart = activeSerie;
    const rangeEnd = activeSerie + 9999;

    window.electron.ipcRenderer.send("obtener-resumen-series", {
      database: selectedDatabase,
      rangeStart,
      rangeEnd,
    });

    window.electron.ipcRenderer.once("obtener-resumen-series-respuesta", (res) => {
      setLoading(false);
      if (res.success) {
        setExistingCodes(res.existingCodes || []);
        setSummary(res.summary);
      } else {
        setError(res.mensaje);
      }
    });
  };

  useEffect(() => {
    if (canQuery) fetchSeriesData();
  }, [activeSerie, canQuery]);

  const existingSet = new Set(existingCodes.map((c) => parseInt(c.CODIGO)));
  const rangeStart = summary ? parseInt(summary.DESCE) || activeSerie : activeSerie;
  const rangeEnd = activeSerie + 9999;

  const usedCount = existingCodes.length;
  const availableCount = 10000 - usedCount;
  
  let nextSuggested = activeSerie;
  for (let i = activeSerie; i <= rangeEnd; i++) {
    if (!existingSet.has(i)) {
      nextSuggested = i;
      break;
    }
  }

  const recommended = [];
  for (let i = activeSerie; i <= rangeEnd && recommended.length < 50; i++) {
    if (!existingSet.has(i)) recommended.push(i);
  }

  const last25 = [...existingCodes]
    .sort((a, b) => parseInt(b.CODIGO) - parseInt(a.CODIGO))
    .slice(0, 25);

  const fullRangePreview = [];
  for (let i = activeSerie; i <= activeSerie + 100; i++) {
    const codeStr = String(i);
    const found = existingCodes.find((c) => parseInt(c.CODIGO) === i);
    fullRangePreview.push({
      codigo: codeStr,
      estado: found ? "CREADO" : "FALTANTE",
      descripcion: found ? found.DESCRIPCION : "",
      modelo: found ? found.MODELO : "",
      numeroParte: found ? found.NUMEROPARTE : "",
    });
  }

  return (
    <div className="dz-animate-fade">
      <div className="dz-header-inline" style={{ marginBottom: '1.5rem' }}>
        <div>
          <Header as="h2" style={{ margin: 0, color: 'var(--color-text-main)' }}>Control de Series</Header>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Análisis de disponibilidad y huecos en el catálogo para la serie <strong>{activeSerie}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <Button primary icon labelPosition="left" onClick={fetchSeriesData} loading={loading} size="small">
            <Icon name="refresh" /> Actualizar
          </Button>
          <Button basic icon labelPosition="left" size="small">
            <Icon name="file excel outline" /> Exportar Excel
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
        {SERIES.map((s) => (
          <Button
            key={s}
            size="mini"
            basic={activeSerie !== s}
            color={activeSerie === s ? "blue" : null}
            onClick={() => setActiveSerie(s)}
            style={{ borderRadius: '8px', margin: 0, fontWeight: 700 }}
          >
            SERIE {s}
          </Button>
        ))}
      </div>

      {error && <Message negative icon="warning sign" header="Error SQL" content={error} />}

      {/* --- STATS DASHBOARD --- */}
      <div className="dz-panel" style={{ marginBottom: '2rem', background: 'var(--gradient-surface)' }}>
        <Grid columns={4} divided stackable textAlign="center">
          <Grid.Row>
            <Grid.Column>
              <Statistic size="tiny">
                <Statistic.Value style={{ color: '#ef4444' }}>{usedCount}</Statistic.Value>
                <Statistic.Label style={{ fontSize: '0.7rem' }}>USADOS</Statistic.Label>
              </Statistic>
            </Grid.Column>
            <Grid.Column>
              <Statistic size="tiny">
                <Statistic.Value style={{ color: '#10b981' }}>{availableCount}</Statistic.Value>
                <Statistic.Label style={{ fontSize: '0.7rem' }}>DISPONIBLES</Statistic.Label>
              </Statistic>
            </Grid.Column>
            <Grid.Column>
              <Statistic size="tiny">
                <Statistic.Value style={{ color: '#3b82f6' }}>{nextSuggested}</Statistic.Value>
                <Statistic.Label style={{ fontSize: '0.7rem' }}>SUGERIDO</Statistic.Label>
              </Statistic>
            </Grid.Column>
            <Grid.Column>
              <Statistic size="tiny">
                <Statistic.Value style={{ color: '#64748b' }}>10,000</Statistic.Value>
                <Statistic.Label style={{ fontSize: '0.7rem' }}>CAPACIDAD</Statistic.Label>
              </Statistic>
            </Grid.Column>
          </Grid.Row>
        </Grid>
        
        <div style={{ 
          marginTop: '1.5rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          fontSize: '0.8rem',
          color: 'var(--color-text-muted)'
        }}>
          <span><Icon name="map outline" /> Rango: <strong>{activeSerie} - {rangeEnd}</strong></span>
          <span><Icon name="arrow circle right" /> Primero: <strong>{existingCodes.length ? Math.min(...existingCodes.map(c => parseInt(c.CODIGO))) : 'N/A'}</strong></span>
          <span><Icon name="arrow circle left" /> Último: <strong>{existingCodes.length ? Math.max(...existingCodes.map(c => parseInt(c.CODIGO))) : 'N/A'}</strong></span>
        </div>
      </div>

      <Grid stackable>
        <Grid.Column width={6}>
          <div className="dz-table-wrapper">
            <div className="dz-table-header">
               <Header as="h5" style={{ margin: 0 }}>Huecos Disponibles</Header>
               <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Siguientes 50</span>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '1rem' }}>
              <Grid columns={3} padded="horizontally">
                {recommended.map(r => (
                  <Grid.Column key={r} style={{ padding: '4px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                    {r}
                  </Grid.Column>
                ))}
              </Grid>
            </div>
          </div>
        </Grid.Column>

        <Grid.Column width={10}>
          <div className="dz-table-wrapper">
            <div className="dz-table-header">
               <Header as="h5" style={{ margin: 0 }}>Últimos Registrados</Header>
               <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Top 25 descendente</span>
            </div>
            <div className="dz-table-scroll" style={{ maxHeight: '400px' }}>
              <Table celled striped compact selectable className="dz-preview-table">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Cód</Table.HeaderCell>
                    <Table.HeaderCell>Descripción</Table.HeaderCell>
                    <Table.HeaderCell>Parte</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {last25.map((c, i) => (
                    <Table.Row key={i}>
                      <Table.Cell style={{ fontWeight: 700 }}>{c.CODIGO}</Table.Cell>
                      <Table.Cell>{c.DESCRIPCION}</Table.Cell>
                      <Table.Cell>{c.NUMEROPARTE}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>
        </Grid.Column>
      </Grid>

      <div className="dz-table-wrapper" style={{ marginTop: '2rem' }}>
        <div className="dz-table-header">
           <Header as="h5" style={{ margin: 0 }}>Mapa Completo (Primeros 100)</Header>
        </div>
        <div className="dz-table-scroll">
          <Table celled striped compact selectable className="dz-preview-table">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell width={2}>Código</Table.HeaderCell>
                <Table.HeaderCell width={2}>Estado</Table.HeaderCell>
                <Table.HeaderCell>Descripción Actual</Table.HeaderCell>
                <Table.HeaderCell>Nro Parte</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {fullRangePreview.map((item, i) => (
                <Table.Row key={i}>
                  <Table.Cell style={{ fontWeight: 700 }}>{item.codigo}</Table.Cell>
                  <Table.Cell>
                    <span className={`dz-status-pill ${item.estado === 'CREADO' ? 'dz-status-pill-ok' : 'dz-status-pill-warn'}`}>
                      {item.estado}
                    </span>
                  </Table.Cell>
                  <Table.Cell>{item.descripcion}</Table.Cell>
                  <Table.Cell>{item.numeroParte}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default SeriesControl;
