// ============ PANTALLA 1: LISTADO DE CIERRES ============
async function vistaResultados() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando resultados...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: cierres, error } = await window._db
      .from('cierres')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('periodo_inicio', { ascending: false })

    if (error) throw error
    window._cierres_data = cierres || []

    const badge = {
      BORRADOR: 'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      CERRADO:  'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    window._cierres_badge = badge

    content.innerHTML = `
      <div class="vista-header">
        <h2>Resultados Semanales</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormCierre()">+ Nuevo periodo</button>
      </div>
      <div id="form-cierre-wrap"></div>
      <div id="cierres-lista"></div>
    `

    renderListaCierres(window._cierres_data)
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function renderListaCierres(lista) {
  const wrap = document.getElementById('cierres-lista')
  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay periodos registrados.</p>`
    return
  }
  wrap.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead><tr><th>Periodo</th><th>Estatus</th><th></th></tr></thead>
        <tbody>
          ${lista.map(c => `
            <tr style="cursor:pointer" onclick="verDetalleCierre('${c.id}')">
              <td>${c.periodo_inicio} → ${c.periodo_fin}</td>
              <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${window._cierres_badge[c.estatus] || ''}">${c.estatus}</span></td>
              <td style="text-align:right">
                <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();verDetalleCierre('${c.id}')">Ver</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

async function mostrarFormCierre() {
  const hoy = new Date()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)

  document.getElementById('form-cierre-wrap').innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nuevo periodo de resultados</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Inicio</label>
          <input type="date" id="cz-inicio" class="filtro-select" value="${lunes.toISOString().split('T')[0]}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fin</label>
          <input type="date" id="cz-fin" class="filtro-select" value="${domingo.toISOString().split('T')[0]}">
        </div>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:12px">
        Se calculará el ingreso del periodo desde Ventas. Los gastos por centro de costo se cargan desde Gastos/CXP
        y se pueden ajustar manualmente.
      </p>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="crearCierre()">Crear periodo</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-cierre-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
}

async function crearCierre() {
  const tenant_id = await getTenantId()
  const periodo_inicio = document.getElementById('cz-inicio')?.value
  const periodo_fin    = document.getElementById('cz-fin')?.value
  if (!periodo_inicio || !periodo_fin) { alert('Ambas fechas son obligatorias'); return }

  const { data: cierre, error: errC } = await window._db.from('cierres')
    .insert({ tenant_id, periodo_inicio, periodo_fin, estatus: 'BORRADOR', created_by: window._email || null })
    .select().single()

  if (errC) { alert(`Error: ${errC.message}`); return }

  // 1. Ingreso del periodo (suma de ventas cerradas)
  const { data: ventas } = await window._db.from('ventas')
    .select('total').eq('tenant_id', tenant_id).eq('estado', 'cerrada')
    .gte('created_at', periodo_inicio).lte('created_at', periodo_fin + 'T23:59:59')

  const ingresoTotal = (ventas || []).reduce((s, v) => s + Number(v.total || 0), 0)

  const rows = []
  rows.push({
    id_cierre: cierre.id, concepto: 'Ventas del periodo', id_centro_costo: null,
    importe: ingresoTotal, importe_semanal: ingresoTotal, tipo: 'INGRESO'
  })

  // 2. Gastos aprobados/pagados por centro de costo dentro del periodo
  const { data: gastos } = await window._db.from('gastos')
    .select('importe_factura, id_centro_costo, fecha_recibo')
    .eq('tenant_id', tenant_id)
    .in('estatus', ['APROBADO','PAGADO'])
    .gte('fecha_recibo', periodo_inicio).lte('fecha_recibo', periodo_fin)

  const { data: centros } = await window._db.from('centros_costo').select('id, nombre').eq('tenant_id', tenant_id)
  const nombreCentro = {}
  ;(centros || []).forEach(c => { nombreCentro[c.id] = c.nombre })

  const porCentro = {}
  ;(gastos || []).forEach(g => {
    const key = g.id_centro_costo || 'sin_centro'
    porCentro[key] = (porCentro[key] || 0) + Number(g.importe_factura || 0)
  })

  Object.entries(porCentro).forEach(([centroId, total]) => {
    rows.push({
      id_cierre: cierre.id,
      concepto: centroId === 'sin_centro' ? 'Gastos sin centro asignado' : (nombreCentro[centroId] || 'Centro de costo'),
      id_centro_costo: centroId === 'sin_centro' ? null : centroId,
      importe: total, importe_semanal: total,
      tipo: 'COSTO_VARIABLE'
    })
  })

  const { error: errI } = await window._db.from('cierre_items').insert(rows)
  if (errI) { alert(`Error al generar items: ${errI.message}`); return }

  document.getElementById('form-cierre-wrap').innerHTML = ''
  await vistaResultados()
  await verDetalleCierre(cierre.id)
}

// ============ PANTALLA 2: DETALLE / DASHBOARD ============
async function verDetalleCierre(id) {
  const tenant_id = await getTenantId()
  const cierre = window._cierres_data.find(c => c.id === id) || (await window._db.from('cierres').select('*').eq('id', id).single()).data

  const { data: items } = await window._db.from('cierre_items').select('*').eq('id_cierre', id).order('tipo')

  const soloLectura = cierre.estatus === 'CERRADO'
  window._cierre_items_actual = items || []

  const ingresos = (items || []).filter(i => i.tipo === 'INGRESO')
  const costos    = (items || []).filter(i => i.tipo === 'COSTO_VARIABLE')
  const gastosEst = (items || []).filter(i => i.tipo === 'GASTO_ESTRUCTURA')
  const inversion = (items || []).filter(i => i.tipo === 'INVERSION')

  const totalIngresos = ingresos.reduce((s,i) => s + Number(i.importe_semanal || 0), 0)
  const totalCostos   = costos.reduce((s,i) => s + Number(i.importe_semanal || 0), 0)
  const totalGastos   = gastosEst.reduce((s,i) => s + Number(i.importe_semanal || 0), 0)
  const totalInv      = inversion.reduce((s,i) => s + Number(i.importe_semanal || 0), 0)

  const primeCost = totalIngresos > 0 ? ((totalCostos / totalIngresos) * 100) : 0
  const margen    = totalIngresos - totalCostos - totalGastos - totalInv
  const margenPct = totalIngresos > 0 ? (margen / totalIngresos * 100) : 0

  const renderFilas = (lista) => lista.map(it => `
    <tr data-item="${it.id}">
      <td>${it.concepto}</td>
      <td style="text-align:right">
        ${soloLectura ? '$' + Number(it.importe_semanal).toFixed(2) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="cz-imp-${it.id}" value="${it.importe_semanal}" step="any" onchange="actualizarCierreItem('${it.id}')">`}
      </td>
    </tr>
  `).join('')

  const wrap = document.getElementById('form-cierre-wrap')
  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Resultados — ${cierre.periodo_inicio} → ${cierre.periodo_fin}</h3>
        </div>
        <span class="badge-status" style="${window._cierres_badge[cierre.estatus]}">${cierre.estatus}</span>
      </div>

      <div class="dashboard-grid" style="margin-top:16px">
        <div class="dashboard-card">
          <div class="card-valor">$${totalIngresos.toFixed(2)}</div>
          <div class="card-label">Ventas del periodo</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">${primeCost.toFixed(1)}%</div>
          <div class="card-label">Prime Cost (costo / venta)</div>
        </div>
        <div class="dashboard-card ${margen >= 0 ? 'aprobado' : 'archivado'}">
          <div class="card-valor">$${margen.toFixed(2)}</div>
          <div class="card-label">Margen (${margenPct.toFixed(1)}%)</div>
        </div>
      </div>

      <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Ingresos</h4>
      <table class="tabla"><tbody>${renderFilas(ingresos)}</tbody></table>

      <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Costos variables (por centro de costo)</h4>
      <table class="tabla"><tbody>${renderFilas(costos)}</tbody></table>

      <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Gastos de estructura</h4>
      ${gastosEst.length ? `<table class="tabla"><tbody>${renderFilas(gastosEst)}</tbody></table>` : `<p style="font-size:12px;color:var(--color-text-muted)">Sin gastos de estructura registrados — labor cost pendiente de módulo nómina.</p>`}

      ${inversion.length ? `
        <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Inversión</h4>
        <table class="tabla"><tbody>${renderFilas(inversion)}</tbody></table>
      ` : ''}

      <div style="display:flex;gap:10px;margin-top:20px">
        ${!soloLectura ? `<button class="btn-accion btn-aprobar" onclick="cerrarPeriodo('${id}')">Cerrar periodo</button>` : ''}
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-cierre-wrap').innerHTML=''">Cerrar vista</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function actualizarCierreItem(id) {
  const importe = parseFloat(document.getElementById(`cz-imp-${id}`)?.value) || 0
  const { error } = await window._db.from('cierre_items').update({ importe_semanal: importe }).eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  const idx = window._cierre_items_actual.findIndex(i => i.id === id)
  if (idx >= 0) window._cierre_items_actual[idx].importe_semanal = importe
}

async function cerrarPeriodo(id) {
  if (!confirm('¿Cerrar este periodo? Ya no podrás editar los valores.')) return
  const { error } = await window._db.from('cierres').update({ estatus: 'CERRADO' }).eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaResultados()
  await verDetalleCierre(id)
}
