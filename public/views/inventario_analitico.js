// ── Vista: Inventario Analítico ───────────────────────────────────────────────
async function vistaInventarioAnalitico() {
  const content = document.getElementById('content')

  const hoy = new Date()
  const hace7 = new Date(hoy)
  hace7.setDate(hoy.getDate() - 7)
  const fmt = d => d.toISOString().slice(0, 10)

  content.innerHTML = `
    <div class="vista-header">
      <h2>Inventario Analítico</h2>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:20px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Desde
        <input type="date" id="ia-desde" value="${fmt(hace7)}"
          style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Hasta
        <input type="date" id="ia-hasta" value="${fmt(hoy)}"
          style="padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)">
      </label>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-bottom:2px">
        ${['consumo','recepciones','conteos','incidencias'].map(k => `
          <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="ia-tog-${k}" checked> ${_iaLabel(k)}
          </label>`).join('')}
      </div>

      <button id="ia-aplicar" class="btn-accion btn-aprobar" style="padding:7px 18px">Aplicar</button>
    </div>

    <div id="ia-tabla-wrap">
      <p style="color:var(--color-text-muted)">Cargando...</p>
    </div>
  `

  document.getElementById('ia-aplicar').addEventListener('click', _iaCargar)
  _iaCargar()
}

function _iaLabel(k) {
  return { consumo: 'Consumo teórico', recepciones: 'Recepciones', conteos: 'Conteos', incidencias: 'Incidencias' }[k]
}

async function _iaCargar() {
  const wrap = document.getElementById('ia-tabla-wrap')
  if (!wrap) return
  wrap.innerHTML = `<p style="color:var(--color-text-muted)">Calculando...</p>`

  const desde  = document.getElementById('ia-desde').value
  const hasta  = document.getElementById('ia-hasta').value
  const togCon = document.getElementById('ia-tog-consumo').checked
  const togRec = document.getElementById('ia-tog-recepciones').checked
  const togCto = document.getElementById('ia-tog-conteos').checked
  const togInc = document.getElementById('ia-tog-incidencias').checked

  try {
    const tenant_id = await getTenantId()

    // Productos activos
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Queries paralelas
    const [
      recItemsRes,
      consumoRes,
      incidenciasRes,
      conteoInicialRes,
      conteoFinalRes
    ] = await Promise.all([
      // Recepciones en rango
      togRec
        ? window._db
            .from('recepcion_items')
            .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
            .eq('recepciones.tenant_id', tenant_id)
            .gte('recepciones.fecha', desde)
            .lte('recepciones.fecha', hasta)
        : Promise.resolve({ data: [] }),

      // Consumo teórico en rango
      togCon
        ? window._db
            .from('consumo_teorico')
            .select('id_producto, cantidad_consumida')
            .eq('tenant_id', tenant_id)
            .gte('fecha_venta', desde)
            .lte('fecha_venta', hasta)
        : Promise.resolve({ data: [] }),

      // Incidencias en rango
      togInc
        ? window._db
            .from('incidencias')
            .select('id_producto, cantidad')
            .eq('tenant_id', tenant_id)
            .gte('fecha', desde)
            .lte('fecha', hasta)
        : Promise.resolve({ data: [] }),

      // Conteo inicial: inventario completo más reciente ANTES de fecha_desde
      togCto
        ? window._db
            .from('inventarios')
            .select('id, fecha')
            .eq('tenant_id', tenant_id)
            .eq('estado', 'completo')
            .lt('fecha', desde)
            .order('fecha', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),

      // Conteo final: inventario más reciente DENTRO del rango
      togCto
        ? window._db
            .from('inventarios')
            .select('id, fecha')
            .eq('tenant_id', tenant_id)
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] })
    ])

    // Acumular recepciones
    const recepMap = {}
    ;(recItemsRes.data || []).forEach(r => {
      recepMap[r.id_producto] = (recepMap[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    // Acumular consumo
    const consumoMap = {}
    ;(consumoRes.data || []).forEach(c => {
      consumoMap[c.id_producto] = (consumoMap[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    // Acumular incidencias
    const incidMap = {}
    ;(incidenciasRes.data || []).forEach(i => {
      if (i.id_producto) incidMap[i.id_producto] = (incidMap[i.id_producto] || 0) + Number(i.cantidad || 0)
    })

    // Items del conteo inicial
    const inicialMap = {}
    const invInicial = conteoInicialRes.data?.[0]
    if (invInicial) {
      const { data: itemsIni } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invInicial.id)
      ;(itemsIni || []).forEach(r => { inicialMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Items del conteo final
    const finalMap = {}
    const invFinal = conteoFinalRes.data?.[0]
    if (invFinal) {
      const { data: itemsFin } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invFinal.id)
      ;(itemsFin || []).forEach(r => { finalMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Unión de todos los id_producto con movimientos en el período
    const todosIds = new Set([
      ...Object.keys(recepMap),
      ...Object.keys(consumoMap),
      ...Object.keys(incidMap),
      ...Object.keys(inicialMap),
      ...Object.keys(finalMap)
    ])

    const filas = []
    todosIds.forEach(id => {
      const prod    = prodMap[id] || {}
      const inicial = togCto ? (inicialMap[id] ?? null) : null
      const recep   = togRec ? (recepMap[id] || 0) : 0
      const consumo = togCon ? (consumoMap[id] || 0) : 0
      const incid   = togInc ? (incidMap[id] || 0) : 0
      const final_v = togCto ? (finalMap[id] ?? null) : null

      const teorico = (inicial !== null ? inicial : 0) + recep - consumo - incid
      const diff    = final_v !== null ? final_v - teorico : null
      const pct     = diff !== null && teorico !== 0 ? diff / teorico * 100 : null

      let colorDiff = ''
      if (pct !== null) {
        const absPct = Math.abs(pct)
        colorDiff = absPct <= 5 ? '#3A8C3E' : absPct <= 10 ? '#c8892a' : '#B85C2A'
      }

      filas.push({
        nombre: prod.producto || id,
        unidad: prod.unidad_medida || '',
        inicial,
        recep,
        consumo,
        incid,
        teorico,
        final_v,
        diff,
        pct,
        colorDiff
      })
    })

    filas.sort((a, b) => {
      if (a.pct !== null && b.pct !== null) return Math.abs(b.pct) - Math.abs(a.pct)
      if (a.pct !== null) return -1
      if (b.pct !== null) return 1
      return a.nombre.localeCompare(b.nombre)
    })

    const fmtNum = v => v === null ? '—' : Number(v).toFixed(2)
    const fmtPct = v => v === null ? '—' : v.toFixed(1) + '%'

    wrap.innerHTML = `
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Unidad</th>
              ${togCto ? '<th style="text-align:right">Conteo inicial</th>' : ''}
              ${togRec ? '<th style="text-align:right">Recepciones</th>' : ''}
              ${togCon ? '<th style="text-align:right">Consumo teórico</th>' : ''}
              ${togInc ? '<th style="text-align:right">Incidencias</th>' : ''}
              <th style="text-align:right">Teórico esperado</th>
              ${togCto ? '<th style="text-align:right">Conteo final</th>' : ''}
              ${togCto ? '<th style="text-align:right">Diferencia</th>' : ''}
              ${togCto ? '<th style="text-align:right">%</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${!filas.length
              ? `<tr><td colspan="12" style="text-align:center;color:var(--color-text-muted);padding:24px">Sin movimientos en el período seleccionado.</td></tr>`
              : filas.map(f => `
                <tr>
                  <td>${f.nombre}</td>
                  <td style="color:var(--color-text-muted)">${f.unidad}</td>
                  ${togCto ? `<td style="text-align:right">${fmtNum(f.inicial)}</td>` : ''}
                  ${togRec ? `<td style="text-align:right">${fmtNum(f.recep)}</td>` : ''}
                  ${togCon ? `<td style="text-align:right">${fmtNum(f.consumo)}</td>` : ''}
                  ${togInc ? `<td style="text-align:right">${fmtNum(f.incid)}</td>` : ''}
                  <td style="text-align:right">${fmtNum(f.teorico)}</td>
                  ${togCto ? `<td style="text-align:right;font-weight:600">${fmtNum(f.final_v)}</td>` : ''}
                  ${togCto ? `<td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtNum(f.diff)}</td>` : ''}
                  ${togCto ? `<td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtPct(f.pct)}</td>` : ''}
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
        Período: ${desde} → ${hasta}
        ${togCto && invInicial ? ` · Conteo inicial: ${invInicial.fecha}` : ''}
        ${togCto && invFinal   ? ` · Conteo final: ${invFinal.fecha}`    : ''}
      </p>
    `
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
