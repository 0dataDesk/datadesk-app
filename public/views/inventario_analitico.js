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

    // Productos activos — incluir grupo
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, grupo')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Queries paralelas (recepciones, incidencias, conteos)
    const [
      recItemsRes,
      incidenciasRes,
      ultimoConteoRes,
      conteoDelPeriodoRes
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

      // Incidencias en rango
      togInc
        ? window._db
            .from('incidencias')
            .select('id_producto, cantidad')
            .eq('tenant_id', tenant_id)
            .gte('fecha', desde)
            .lte('fecha', hasta)
        : Promise.resolve({ data: [] }),

      // Último conteo: inventario completo más reciente ANTES de fecha_desde
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

      // Conteo del período: inventario más reciente DENTRO del rango
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

    // Verificar errores en queries paralelas
    if (recItemsRes.error)    throw new Error(`recepciones: ${recItemsRes.error.message}`)
    if (incidenciasRes.error) throw new Error(`incidencias: ${incidenciasRes.error.message}`)
    if (ultimoConteoRes.error)       throw new Error(`inventarios (último): ${ultimoConteoRes.error.message}`)
    if (conteoDelPeriodoRes.error)   throw new Error(`inventarios (período): ${conteoDelPeriodoRes.error.message}`)

    // Consumo teórico — query separada para que el error sea visible
    const consumoMap = {}
    if (togCon) {
      const { data: consumoData, error: consumoErr } = await window._db
        .from('consumo_teorico')
        .select('id_producto, cantidad_consumida')
        .eq('tenant_id', tenant_id)
        .gte('fecha_venta', desde)
        .lte('fecha_venta', hasta)
      if (consumoErr) throw new Error(`consumo_teorico: ${consumoErr.message}`)
      ;(consumoData || []).forEach(c => {
        if (c.id_producto) {
          consumoMap[c.id_producto] = (consumoMap[c.id_producto] || 0) + Number(c.cantidad_consumida)
        }
      })
    }

    // Acumular recepciones
    const recepMap = {}
    ;(recItemsRes.data || []).forEach(r => {
      if (r.id_producto) recepMap[r.id_producto] = (recepMap[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    // Acumular incidencias
    const incidMap = {}
    ;(incidenciasRes.data || []).forEach(i => {
      if (i.id_producto) incidMap[i.id_producto] = (incidMap[i.id_producto] || 0) + Number(i.cantidad || 0)
    })

    // Items del último conteo (antes del período)
    const inicialMap = {}
    const invInicial = ultimoConteoRes.data?.[0]
    if (invInicial) {
      const { data: itemsIni } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invInicial.id)
      ;(itemsIni || []).forEach(r => { inicialMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Items del conteo del período (dentro del rango)
    const finalMap = {}
    const invFinal = conteoDelPeriodoRes.data?.[0]
    if (invFinal) {
      const { data: itemsFin } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invFinal.id)
      ;(itemsFin || []).forEach(r => { finalMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Unión de ids con movimiento según toggles activos
    const idsConMovimiento = new Set([
      ...(togCto ? Object.keys(inicialMap) : []),
      ...(togCto ? Object.keys(finalMap)   : []),
      ...(togRec ? Object.keys(recepMap)   : []),
      ...(togCon ? Object.keys(consumoMap) : []),
      ...(togInc ? Object.keys(incidMap)   : []),
    ])

    const filas = []
    idsConMovimiento.forEach(id => {
      const p       = prodMap[id] || {}
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
        nombre: p.producto || id,
        unidad: p.unidad_medida || '',
        grupo:  p.grupo || 'Sin clasificar',
        inicial,
        recep,
        consumo,
        incid,
        teorico,
        final_v,
        diff,
        pct,
        colorDiff,
        esRojo: colorDiff === '#B85C2A'
      })
    })

    // Agrupar por grupo
    const grupos = {}
    filas.forEach(f => {
      if (!grupos[f.grupo]) grupos[f.grupo] = []
      grupos[f.grupo].push(f)
    })

    // Ordenar filas dentro de cada grupo: mayor desviación primero, luego alfabético
    Object.values(grupos).forEach(arr => arr.sort((a, b) => {
      if (a.pct !== null && b.pct !== null) return Math.abs(b.pct) - Math.abs(a.pct)
      if (a.pct !== null) return -1
      if (b.pct !== null) return 1
      return a.nombre.localeCompare(b.nombre)
    }))

    // Ordenar grupos alfabéticamente, "Sin clasificar" al final
    const nombresGrupos = Object.keys(grupos).sort((a, b) => {
      if (a === 'Sin clasificar') return 1
      if (b === 'Sin clasificar') return -1
      return a.localeCompare(b)
    })

    const fmtNum = v => v === null ? '—' : Number(v).toFixed(2)
    const fmtPct = v => v === null ? '—' : v.toFixed(1) + '%'

    const colCount = 2
      + (togCto ? 1 : 0)
      + (togRec ? 1 : 0)
      + (togCon ? 1 : 0)
      + (togInc ? 1 : 0)
      + 1
      + (togCto ? 3 : 0)

    const renderFilas = arr => arr.map(f => `
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

    if (!filas.length) {
      wrap.innerHTML = `<p style="color:var(--color-text-muted);padding:24px 0">Sin movimientos en el período seleccionado.</p>`
      return
    }

    wrap.innerHTML = `
      <div class="tabla-wrapper">
        <table class="tabla" id="ia-tabla">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Unidad</th>
              ${togCto ? '<th style="text-align:right">Último conteo</th>' : ''}
              ${togRec ? '<th style="text-align:right">Recepciones</th>' : ''}
              ${togCon ? '<th style="text-align:right">Consumo teórico</th>' : ''}
              ${togInc ? '<th style="text-align:right">Incidencias</th>' : ''}
              <th style="text-align:right">Teórico esperado</th>
              ${togCto ? '<th style="text-align:right">Conteo del período</th>' : ''}
              ${togCto ? '<th style="text-align:right">Diferencia</th>' : ''}
              ${togCto ? '<th style="text-align:right">%</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${nombresGrupos.map((gNombre, gi) => {
              const arr = grupos[gNombre]
              const tieneRojo = arr.some(f => f.esRojo)
              const grupoId = `ia-grupo-${gi}`
              return `
                <tr class="ia-grupo-header" data-grupo="${grupoId}"
                  style="cursor:pointer;background:var(--color-surface-raised,var(--color-surface));user-select:none"
                  onclick="(function(el){
                    const body=document.querySelectorAll('[data-grupo-body=\\'${grupoId}\\']');
                    const chev=el.querySelector('.ia-chev');
                    const open=chev.textContent==='▼';
                    body.forEach(r=>r.style.display=open?'none':'');
                    chev.textContent=open?'▶':'▼';
                  })(this)">
                  <td colspan="${colCount}" style="font-weight:700;font-size:12px;letter-spacing:.5px;padding:8px 12px">
                    <span class="ia-chev" style="margin-right:6px;font-size:10px">▼</span>
                    ${gNombre.toUpperCase()}
                    <span style="font-weight:400;color:var(--color-text-muted);margin-left:6px">${arr.length} insumo${arr.length !== 1 ? 's' : ''}</span>
                    ${tieneRojo ? ' <span title="Tiene insumos con diferencia >10%">🔴</span>' : ''}
                  </td>
                </tr>
                ${arr.map(f => `
                  <tr data-grupo-body="${grupoId}">
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
                  </tr>`).join('')}
              `
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
        Período: ${desde} → ${hasta}
        ${togCto && invInicial ? ` · Último conteo: ${invInicial.fecha}` : ''}
        ${togCto && invFinal   ? ` · Conteo del período: ${invFinal.fecha}` : ''}
        · ${nombresGrupos.length} grupo${nombresGrupos.length !== 1 ? 's' : ''}
      </p>
    `
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
