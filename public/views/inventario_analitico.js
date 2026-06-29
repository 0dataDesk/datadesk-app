// ── Vista: Inventario Analítico ───────────────────────────────────────────────
async function vistaInventarioAnalitico() {
  const content = document.getElementById('content')

  const hoy = new Date()
  const fmt = d => d.toISOString().slice(0, 10)

  content.innerHTML = `
    <div class="vista-header">
      <h2>Inventario Analítico</h2>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:20px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Desde
        <input type="date" id="ia-desde" value="${fmt(hoy)}"
          style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Hasta
        <input type="date" id="ia-hasta" value="${fmt(hoy)}"
          style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
      </label>
      <button id="ia-aplicar" class="btn-accion btn-aprobar" style="padding:7px 18px">Aplicar</button>
    </div>

    <div id="ia-tabla-wrap">
      <p style="color:var(--color-text-muted)">Cargando...</p>
    </div>
  `

  document.getElementById('ia-aplicar').addEventListener('click', _iaCargar)
  _iaCargar()
}

async function _iaCargar() {
  const wrap = document.getElementById('ia-tabla-wrap')
  if (!wrap) return
  wrap.innerHTML = `<p style="color:var(--color-text-muted)">Calculando...</p>`

  const desde = document.getElementById('ia-desde').value
  const hasta = document.getElementById('ia-hasta').value

  try {
    const tenant_id = await getTenantId()

    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, grupo, stock_maximo, stock_alerta_porcentaje')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Conteo de productos activos por grupo (para badges de pills)
    const contPorGrupo = {}
    let totalProds = 0
    ;(productos || []).forEach(p => {
      const g = p.grupo || 'Sin clasificar'
      contPorGrupo[g] = (contPorGrupo[g] || 0) + 1
      totalProds++
    })

    const [
      recItemsRes,
      incidenciasRes,
      ultimoConteoRes,
      conteoDelPeriodoRes
    ] = await Promise.all([
      window._db
        .from('recepcion_items')
        .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
        .eq('recepciones.tenant_id', tenant_id)
        .gte('recepciones.fecha', desde)
        .lte('recepciones.fecha', hasta),

      window._db
        .from('incidencias')
        .select('id_producto, cantidad')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta),

      window._db
        .from('inventarios')
        .select('id, fecha')
        .eq('tenant_id', tenant_id)
        .eq('estado', 'completo')
        .lte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(1),

      window._db
        .from('inventarios')
        .select('id, fecha')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .limit(1)
    ])

    if (recItemsRes.error)         throw new Error(`recepciones: ${recItemsRes.error.message}`)
    if (incidenciasRes.error)      throw new Error(`incidencias: ${incidenciasRes.error.message}`)
    if (ultimoConteoRes.error)     throw new Error(`inventarios (último): ${ultimoConteoRes.error.message}`)
    if (conteoDelPeriodoRes.error) throw new Error(`inventarios (período): ${conteoDelPeriodoRes.error.message}`)

    const consumoMap = {}
    const { data: consumoData, error: consumoErr } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', desde)
      .lte('fecha_venta', hasta)
    if (consumoErr) console.warn('consumo_teorico:', consumoErr.message)
    ;(consumoData || []).forEach(c => {
      if (c.id_producto) consumoMap[c.id_producto] = (consumoMap[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    const recepMap = {}
    ;(recItemsRes.data || []).forEach(r => {
      if (r.id_producto) recepMap[r.id_producto] = (recepMap[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    const incidMap = {}
    ;(incidenciasRes.data || []).forEach(i => {
      if (i.id_producto) incidMap[i.id_producto] = (incidMap[i.id_producto] || 0) + Number(i.cantidad || 0)
    })

    const inicialMap = {}
    const invInicial = ultimoConteoRes.data?.[0] || null
    if (invInicial) {
      const { data: itemsIni } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invInicial.id)
      ;(itemsIni || []).forEach(r => { inicialMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    const finalMap = {}
    let invFinal = conteoDelPeriodoRes.data?.[0] || null
    if (invFinal && invInicial && invFinal.id === invInicial.id && desde !== hasta) invFinal = null
    if (invFinal) {
      const { data: itemsFin } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invFinal.id)
      ;(itemsFin || []).forEach(r => { finalMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    const idsConMovimiento = new Set([
      ...Object.keys(inicialMap),
      ...Object.keys(finalMap),
      ...Object.keys(recepMap),
      ...Object.keys(consumoMap),
      ...Object.keys(incidMap),
    ])

    const filas = []
    idsConMovimiento.forEach(id => {
      const p       = prodMap[id] || {}
      const inicial = inicialMap[id] ?? null
      const recep   = recepMap[id]  || 0
      const consumo = consumoMap[id] || 0
      const incid   = incidMap[id]  || 0
      const final_v = finalMap[id]  ?? null

      const teorico = (inicial !== null ? inicial : 0) + recep - consumo - incid
      const diff    = final_v !== null ? final_v - teorico : null
      const pct     = diff !== null && teorico !== 0 ? diff / teorico * 100 : null

      let colorDiff = ''
      if (pct !== null) {
        const absPct = Math.abs(pct)
        colorDiff = absPct <= 5 ? '#3A8C3E' : absPct <= 10 ? '#c8892a' : '#B85C2A'
      }

      // Existencia efectiva para alertas
      const existActual = final_v !== null ? final_v : teorico

      // Alerta: 0 = ninguna, 1 = amarilla, 2 = roja
      const sm  = p.stock_maximo
      const sap = p.stock_alerta_porcentaje
      const stock_critico = (sm != null && sap != null) ? sm * (sap / 100) : null
      let alerta = 0
      if (stock_critico !== null) {
        if (existActual <= stock_critico)            alerta = 2
        else if (existActual <= stock_critico * 1.5) alerta = 1
      }

      filas.push({
        nombre: p.producto || id,
        unidad: p.unidad_medida || '',
        grupo:  p.grupo || 'Sin clasificar',
        inicial, recep, consumo, incid, teorico, final_v, diff, pct, colorDiff,
        alerta, existActual
      })
    })

    if (!filas.length) {
      wrap.innerHTML = `<p style="color:var(--color-text-muted);padding:24px 0">Sin movimientos en el período seleccionado.</p>`
      return
    }

    // Grupos únicos de los productos con movimiento (orden alfabético, "Sin clasificar" al final)
    const gruposUnicos = [...new Set(filas.map(f => f.grupo))].sort((a, b) => {
      if (a === 'Sin clasificar') return 1
      if (b === 'Sin clasificar') return -1
      return a.localeCompare(b)
    })

    // Guardar estado global
    window._iaFilas       = filas
    window._iaGrupoActivo = '__todos__'
    window._iaBusq        = ''
    window._iaSortCol     = 'alerta'
    window._iaSortDir     = -1   // -1 = desc → críticos primero
    window._iaContGrupo   = contPorGrupo
    window._iaTotalProds  = totalProds
    window._iaDesde       = desde
    window._iaHasta       = hasta
    window._iaInvInicial  = invInicial
    window._iaInvFinal    = invFinal

    wrap.innerHTML = `
      <style>
        .ia-pills-scroll { display:flex; align-items:center; gap:6px; margin-bottom:14px; }
        .ia-pills-track  { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; flex:1; }
        .ia-pills-track::-webkit-scrollbar { display:none; }
        .ia-pill {
          flex-shrink:0; padding:5px 14px; border-radius:999px;
          border:1px solid var(--color-border); background:var(--color-surface);
          color:var(--color-text); font-size:13px; cursor:pointer; white-space:nowrap;
          transition:background .12s,color .12s,border-color .12s;
        }
        .ia-pill:hover { background:var(--color-bg-alt,rgba(0,0,0,0.05)); }
        .ia-pill.active {
          background:var(--color-primary,#3D0014); color:#fff;
          border-color:var(--color-primary,#3D0014);
        }
        .ia-scroll-btn {
          flex-shrink:0; width:28px; height:28px; border-radius:50%;
          border:1px solid var(--color-border); background:var(--color-surface);
          cursor:pointer; font-size:14px; display:flex; align-items:center;
          justify-content:center; line-height:1;
        }
        .ia-scroll-btn:hover { background:var(--color-bg-alt,rgba(0,0,0,0.05)); }
        .ia-th { cursor:pointer; user-select:none; white-space:nowrap; }
        .ia-th:hover { color:var(--color-primary); }
      </style>

      <input type="text" id="ia-buscador" placeholder="Buscar insumo..."
        style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:14px;margin-bottom:12px"
        oninput="_iaBuscarAnalitico(this.value)">

      <div class="ia-pills-scroll">
        <button class="ia-scroll-btn" onclick="_iaScrollPills(-1)">‹</button>
        <div class="ia-pills-track" id="ia-pills-track">
          <button class="ia-pill active" data-grupo="__todos__"
            onclick="_iaFiltrarGrupo('__todos__')">Todos (${totalProds})</button>
          ${gruposUnicos.map(g =>
            `<button class="ia-pill" data-grupo="${g.replace(/"/g,'&quot;')}"
               onclick="_iaFiltrarGrupo(this.dataset.grupo)">${g} (${contPorGrupo[g] || 0})</button>`
          ).join('')}
        </div>
        <button class="ia-scroll-btn" onclick="_iaScrollPills(1)">›</button>
      </div>

      <div class="tabla-wrapper" style="overflow-x:auto">
        <table class="tabla" id="ia-tabla">
          <thead>
            <tr>
              <th class="ia-th" data-col="alerta" onclick="_iaOrdenar('alerta')" style="text-align:center" title="Alerta de stock">⚠</th>
              <th class="ia-th" data-col="nombre" onclick="_iaOrdenar('nombre')">Insumo</th>
              <th class="ia-th" data-col="unidad" onclick="_iaOrdenar('unidad')">Unidad</th>
              <th class="ia-th" data-col="inicial" onclick="_iaOrdenar('inicial')" style="text-align:right">Último conteo</th>
              <th class="ia-th" data-col="recep"   onclick="_iaOrdenar('recep')"   style="text-align:right">Recepciones</th>
              <th class="ia-th" data-col="consumo" onclick="_iaOrdenar('consumo')" style="text-align:right">Consumo teórico</th>
              <th class="ia-th" data-col="incid"   onclick="_iaOrdenar('incid')"   style="text-align:right">Incidencias</th>
              <th class="ia-th" data-col="teorico" onclick="_iaOrdenar('teorico')" style="text-align:right">Teórico esperado</th>
              <th class="ia-th" data-col="final_v" onclick="_iaOrdenar('final_v')" style="text-align:right">Conteo del período</th>
              <th class="ia-th" data-col="diff"    onclick="_iaOrdenar('diff')"    style="text-align:right">Diferencia</th>
              <th class="ia-th" data-col="pct"     onclick="_iaOrdenar('pct')"     style="text-align:right">%</th>
            </tr>
          </thead>
          <tbody id="ia-tbody"></tbody>
        </table>
      </div>

      <p id="ia-pie" style="font-size:11px;color:var(--color-text-muted);margin-top:8px"></p>
    `

    _iaRenderTabla()

  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _iaRenderTabla() {
  const tbody = document.getElementById('ia-tbody')
  const pie   = document.getElementById('ia-pie')
  if (!tbody) return

  const filas      = window._iaFilas        || []
  const grupo      = window._iaGrupoActivo  || '__todos__'
  const busq       = (window._iaBusq        || '').toLowerCase().trim()
  const col        = window._iaSortCol      || 'alerta'
  const dir        = window._iaSortDir      ?? -1
  const desde      = window._iaDesde        || ''
  const hasta      = window._iaHasta        || ''
  const invInicial = window._iaInvInicial
  const invFinal   = window._iaInvFinal

  const fmtNum = v => formatNum(v)
  const fmtPct = v => v === null ? '—' : formatNum(v, 1) + '%'

  const alertaCell = a => {
    if (a === 2) return `<span style="color:#c0392b;font-size:15px" title="Stock crítico">⚠️</span>`
    if (a === 1) return `<span style="color:#f39c12;font-size:15px" title="Stock bajo">⚠️</span>`
    return ''
  }

  // Filtrar
  let filtered = filas.filter(f => {
    if (grupo !== '__todos__' && f.grupo !== grupo) return false
    if (busq && !f.nombre.toLowerCase().includes(busq)) return false
    return true
  })

  // Ordenar
  filtered = [...filtered].sort((a, b) => {
    switch (col) {
      case 'alerta': {
        // dir=-1 (desc): dir*(a-b) = -(a-b) → b-a → mayor alerta primero ✓
        const ad = dir * (a.alerta - b.alerta)
        if (ad !== 0) return ad
        // Desempate: existencia asc (menos stock primero)
        return a.existActual - b.existActual
      }
      case 'nombre':  return dir * a.nombre.localeCompare(b.nombre)
      case 'unidad':  return dir * a.unidad.localeCompare(b.unidad)
      case 'inicial': return dir * ((a.inicial ?? -Infinity) - (b.inicial ?? -Infinity))
      case 'recep':   return dir * (a.recep   - b.recep)
      case 'consumo': return dir * (a.consumo - b.consumo)
      case 'incid':   return dir * (a.incid   - b.incid)
      case 'teorico': return dir * (a.teorico - b.teorico)
      case 'final_v': return dir * ((a.final_v ?? -Infinity) - (b.final_v ?? -Infinity))
      case 'diff':    return dir * ((a.diff   ?? -Infinity) - (b.diff   ?? -Infinity))
      case 'pct':     return dir * ((a.pct    ?? -Infinity) - (b.pct    ?? -Infinity))
      default:        return 0
    }
  })

  // Actualizar indicadores de orden en headers
  document.querySelectorAll('.ia-th').forEach(th => {
    const thCol = th.dataset.col
    // Guardar texto base en data-label la primera vez
    if (!th.dataset.label) th.dataset.label = th.textContent.trim()
    const base = th.dataset.label
    if (thCol === col) {
      th.textContent  = base + (dir === 1 ? ' ▲' : ' ▼')
      th.style.color  = 'var(--color-primary)'
    } else {
      th.textContent  = base
      th.style.color  = ''
    }
  })

  tbody.innerHTML = filtered.map(f => `
    <tr data-grupo="${f.grupo.replace(/"/g,'&quot;')}">
      <td style="text-align:center">${alertaCell(f.alerta)}</td>
      <td>${f.nombre}</td>
      <td style="color:var(--color-text-muted)">${f.unidad}</td>
      <td style="text-align:right">${fmtNum(f.inicial)}</td>
      <td style="text-align:right">${fmtNum(f.recep)}</td>
      <td style="text-align:right">${fmtNum(f.consumo)}</td>
      <td style="text-align:right">${fmtNum(f.incid)}</td>
      <td style="text-align:right">${fmtNum(f.teorico)}</td>
      <td style="text-align:right;font-weight:600">${fmtNum(f.final_v)}</td>
      <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtNum(f.diff)}</td>
      <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtPct(f.pct)}</td>
    </tr>`).join('')

  if (pie) {
    pie.textContent = `Período: ${desde} → ${hasta}`
      + (invInicial ? ` · Último conteo: ${invInicial.fecha}` : '')
      + (invFinal   ? ` · Conteo del período: ${invFinal.fecha}` : '')
      + ` · ${filtered.length} insumo${filtered.length !== 1 ? 's' : ''} mostrado${filtered.length !== 1 ? 's' : ''}`
  }
}

function _iaFiltrarGrupo(grupo) {
  window._iaGrupoActivo = grupo
  document.querySelectorAll('.ia-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grupo === grupo)
  })
  _iaRenderTabla()
}

function _iaOrdenar(col) {
  if (window._iaSortCol === col) {
    window._iaSortDir = (window._iaSortDir ?? -1) * -1
  } else {
    window._iaSortCol = col
    // Texto: asc por defecto; numérico/alerta: desc por defecto
    window._iaSortDir = (col === 'nombre' || col === 'unidad') ? 1 : -1
  }
  _iaRenderTabla()
}

function _iaBuscarAnalitico(q) {
  window._iaBusq = q
  _iaRenderTabla()
}

function _iaScrollPills(dir) {
  const track = document.getElementById('ia-pills-track')
  if (track) track.scrollBy({ left: dir * 160, behavior: 'smooth' })
}
