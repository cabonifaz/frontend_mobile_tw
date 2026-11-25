import type { CabeceraInforme, LecturaGeneral } from '@/api/informe';

/**
 * Pre-informe generado EN EL TELÉFONO (sin señal): el mismo contenido que el PDF del servidor (GeneradorPreInformePdf) en HTML para expo-print.
 * Es un BORRADOR: lleva la marca «generado en el teléfono» y el pie aclara que el PDF oficial del pre-informe se descarga con señal. Función pura.
 */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (s: string | null | undefined): string => (s && s.trim() ? esc(s.trim()) : '—');
const num = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : String(Math.round(n * 10000) / 10000));
const siNo = (v: boolean | null | undefined): string => (v === null || v === undefined ? '—' : v ? 'Sí' : 'No');
const SEVERIDAD: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
const ESTADO: Record<string, string> = { operativo: 'Operativo', con_observaciones: 'Operativo con observaciones', inoperativo: 'Inoperativo' };
const resultado = (r: string | null | undefined, critico = false): string => (critico ? 'Error crítico' : r === 'conforme' ? 'Conforme' : r === 'no_conforme' ? 'Fuera de EMP' : '—');
const posicion = (p: number | null | undefined): string => (p === 1 ? 'Centro' : p && p >= 2 ? `Esquina ${p}` : '—');
const emp = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `±${num(v)}`);

const fila = (etiqueta: string, valor: string): string => `<tr><td class="et">${etiqueta}</td><td>${valor}</td></tr>`;
const seccion = (titulo: string, filas: [string, string][]): string => `<h2>${titulo}</h2><table class="kv">${filas.map(([e, v]) => fila(e, v)).join('')}</table>`;
const tabla = (cabeceras: string[], filas: string[][]): string =>
  `<table class="t"><tr>${cabeceras.map((h) => `<th>${h}</th>`).join('')}</tr>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const lecturas = (l: LecturaGeneral[]): string[][] => l.map((x) => [String(x.orden), num(x.carga), num(x.indicacion), num(x.error), emp(x.emp), resultado(x.resultado, x.critico)]);

export function htmlPreInforme(c: CabeceraInforme, generadoEn: Date = new Date()): string {
  const d = c.datos;
  const tipoEquipo = c.opciones.tiposEquipo.find((t) => t.codigo === c.detalle.tipoEquipo)?.nombre ?? c.detalle.tipoEquipo;
  const unir = (...p: (string | null | undefined)[]) => p.filter((x) => x && x.trim()).map((x) => esc(x!.trim())).join(' · ') || '—';
  const hechos = [...c.detalle.checklist].filter((p) => p.marcado).sort((a, b) => a.orden - b.orden).map((p) => `<li>${esc(p.titulo)}</li>`).join('');
  const pg = c.pruebasGenerales;
  const lima = new Date(generadoEn.getTime() - 5 * 3_600_000).toISOString();
  const fecha = `${lima.slice(8, 10)}/${lima.slice(5, 7)}/${lima.slice(0, 4)} ${lima.slice(11, 16)}`;

  const fallas = c.fallas.length === 0 ? '<p class="gris">Sin fallas.</p>' : c.fallas.map((f, i) => `
    <div class="caja"><b>${i + 1}. ${txt(f.clasificacionNombre ?? f.clasificacion)} · ${txt(f.componenteNombre ?? f.componente)} — Severidad ${esc(SEVERIDAD[f.severidad] ?? f.severidad ?? '—')}</b>
    <div>${txt(f.descripcion)}</div>${f.fotos.length > 0 ? `<div class="gris peq">Fotos de la falla: ${f.fotos.length}</div>` : ''}
    ${f.pruebas.length > 0 ? tabla(['Prueba', 'Carga L', 'Indicación I', 'Error E', 'EMP', 'Resultado'],
      f.pruebas.map((p) => [p.tipo === 'excentricidad' ? `Exc. ${posicion(p.posicion)}` : p.tipo === 'pesaje' ? 'Pesaje' : txt(String(p.tipo)), num(p.carga), num(p.indicacion), num(p.error), emp(p.emp), resultado(p.resultado)])) : ''}
    </div>`).join('');

  const generales = [
    pg.errorCritico?.trim() ? `<p class="rojo"><b>Error crítico: ${esc(pg.errorCritico.trim())}</b></p>` : '',
    pg.pesaje.length > 0 ? `<b>Pesaje (linealidad)</b>${tabla(['N°', 'Carga L', 'Indicación I', 'Error E', 'EMP', 'Resultado'], lecturas(pg.pesaje))}` : '',
    ...pg.excentricidad.map((g) => `<b>Excentricidad · carga ${num(g.carga)}</b>${tabla(['Posición', 'Indicación I', 'Error E', 'EMP', 'Resultado'],
      g.lecturas.map((l) => [posicion(l.orden), num(l.indicacion), num(l.error), emp(l.emp), resultado(l.resultado, l.critico)]))}`),
    pg.pesaje.length === 0 && pg.excentricidad.length === 0 ? '<p class="gris">Sin lecturas registradas.</p>' : '',
    c.comentarioPruebas?.trim() ? `<p>Comentario: ${esc(c.comentarioPruebas.trim())}</p>` : '',
  ].join('');

  const dg = c.diagnostico;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 34px; }
    body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #0F172A; }
    h1 { font-size: 20px; color: #0057B8; margin: 0; } h2 { font-size: 13px; color: #0057B8; margin: 14px 0 4px; }
    .cab { display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; }
    .gris { color: #64748B; } .peq { font-size: 10px; } .rojo { color: #B91C1C; }
    table.kv td { padding: 1px 0; vertical-align: top; } td.et { width: 150px; color: #64748B; }
    table.t { width: 100%; border-collapse: collapse; margin: 4px 0 8px; } table.t th { background: #EFF4FF; text-align: left; border-bottom: 1px solid #E2E8F0; padding: 3px; font-size: 10px; }
    table.t td { padding: 3px; font-size: 10.5px; } .caja { border: 1px solid #E2E8F0; padding: 6px; margin: 5px 0; }
    ul { margin: 2px 0 2px 16px; padding: 0; } .firma { border: 1px solid #E2E8F0; padding: 10px; margin-top: 14px; page-break-inside: avoid; }
    .linea { border-top: 1px solid #0F172A; margin-top: 56px; } .pie { margin-top: 14px; font-size: 9px; color: #64748B; }
  </style></head><body>
    <div class="cab"><div><h1>PRE-INFORME TÉCNICO</h1><div class="gris">${esc(d.tipoOrden)} ${txt(d.numeroOs)}${d.numeroRq ? ` · RQ ${esc(d.numeroRq)}` : ''}</div></div>
      <div style="text-align:right"><b class="rojo">DOCUMENTO NO OFICIAL</b><div class="gris peq">BORRADOR generado en el teléfono</div>
      <div class="gris peq">${d.generado && d.numeroInforme ? `Informe N° ${esc(d.numeroInforme)}` : 'N° de informe: se asigna al generar'}</div></div></div>
    ${seccion('Cliente y servicio', [
      ['Empresa', unir(d.empresa, d.ruc ? `RUC ${d.ruc}` : null)], ['Dirección', txt(d.direccion)], ['Contacto', unir(d.contacto, d.contactoCargo, d.contactoTelefono)],
      ['Tipo de servicio', txt(d.tipoServicio)], ['Fecha y horario', `${txt(d.fecha)} · ${txt(d.horaInicio)} a ${txt(d.horaFin)}`], ['Técnico', txt(d.tecnico)],
      ['Atiende en planta', unir(d.responsableNombre, d.responsableCargo, d.responsableTelefono)]])}
    ${seccion('Especificaciones del equipo', [
      ['Marca · modelo', `${txt(d.marca)} · ${txt(d.modelo)}`], ['Serie', txt(d.numSerie)], ['Código cliente · TW', `${txt(d.codigoCliente)} · ${txt(d.codigoTw)}`],
      ['Capacidad máx. · d · e', `${txt(d.capacidadMax)} · ${txt(d.d)} · ${txt(d.e)}`], ['Clase · ubicación', `${txt(d.clase)} · ${txt(d.ubicacion)}`]])}
    <h2>Detalle del servicio</h2>
    <div>Tipo de equipo: ${txt(tipoEquipo)} · Anillos de fijación: ${siNo(c.detalle.anillosFijacion)}</div>
    ${c.detalle.celdas.length > 0 ? `<div>Celdas (mV): ${c.detalle.celdas.map(num).join(' · ')}</div>` : ''}
    <div>Pruebas por sumatoria hasta: ${num(c.detalle.sumatoriaHasta)} · por comparación hasta: ${num(c.detalle.comparacionHasta)}</div>
    <div>${hechos ? 'Trabajos realizados:' : 'Trabajos realizados: —'}</div>${hechos ? `<ul>${hechos}</ul>` : ''}
    <h2>Recomendaciones inmediatas</h2>
    ${c.recomendaciones.length === 0 ? '<p class="gris">Sin recomendaciones.</p>' : `<ul>${c.recomendaciones.map((r) => `<li>${esc(r.titulo)}${r.descripcion?.trim() ? ` — ${esc(r.descripcion.trim())}` : ''}</li>`).join('')}</ul>`}
    <h2>Fallas y su prueba</h2>${fallas}
    <h2>Pruebas generales (Ensayos y Calibración)</h2>${generales}
    ${seccion('Diagnóstico final', [['Severidad general', esc(SEVERIDAD[dg.severidadGeneral ?? ''] ?? '—')], ['Estado del equipo', esc(ESTADO[dg.estadoEquipo ?? ''] ?? '—')],
      ['Revisión de Jefatura', siNo(dg.revisionJefatura)], ['Precotización', siNo(dg.precotizacion)], ['Segunda visita', siNo(dg.segundaVisita)], ['Aplica garantía', siNo(dg.aplicaGarantia)]])}
    <div class="firma"><b style="color:#0057B8;font-size:13px">Conformidad del encargado de planta</b>
      <div class="gris peq">Recibí este pre-informe. El informe técnico oficial se emitirá al finalizar el trabajo en el equipo.</div>
      <div class="linea"></div><div class="gris peq">Firma</div>
      <table style="width:100%;margin-top:8px"><tr><td><b>${txt(d.responsableNombre)}</b><div class="gris peq">Nombre</div></td><td><b>${txt(d.responsableCargo)}</b><div class="gris peq">Cargo</div></td>
      <td><div>&nbsp;</div><div class="gris peq">DNI</div></td><td><div>&nbsp;</div><div class="gris peq">Fecha</div></td></tr></table></div>
    <div class="pie">Borrador generado el ${fecha} (hora de Lima) en el teléfono, sin conexión, con lo guardado en la app de campo de Total Weight. No reemplaza al informe técnico oficial; con señal se puede descargar el pre-informe del servidor.</div>
  </body></html>`;
}
