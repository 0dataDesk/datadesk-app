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

    // Productos activos
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, grupo')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Queries paralelas
    const [
      recItemsRes,
      incidenciasRes,
      ultimoConteoRes,
      conteoDelPeriodoRes
    ] = await Promise.all([
      // Recepciones en rango
      window._db
        .from('recepcion_items')
        .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
        .eq('recepciones.tenant_id', tenant_id)
        .gte('recepciones.fecha', desde)
        .lte('recepciones.fecha', hasta),

      // Incidencias en rango
      window._db
        .from('incidencias')
        .select('id_producto, cantidad')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta),

      // Último conteo: inventario completo más reciente con fecha <= desde (incluyendo mismo día)
      window._db
        .from('inventarios')
        .select('id, fecha')
        .eq('tenant_id', tenant_id)
        .eq('estado', 'completo')
        .lte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(1),

      // Conteo del período: inventario más reciente DENTRO del rango
      window._db
        .from('inventarios')
        .select('id, fecha')
        .eq('tenant_id', tenant_id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .limit(1)
    ])

    if (recItemsRes.error)          throw new Error(`recepciones: ${recItemsRes.error.message}`)
    if (incidenciasRes.error)       throw new Error(`incidencias: ${incidenciasRes.error.message}`)
    if (ultimoConteoRes.error)      throw new Error(`inventarios (último): ${ultimoConteoRes.error.message}`)
    if (conteoDelPeriodoRes.error)  throw new Error(`inventarios (período): ${conteoDelPeriodoRes.error.message}`)

    // Consumo teórico — error RLS manejado sin romper la vista
    const consumoMap = {}
    const { data: consumoData, error: consumoErr } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', desde)
      .lte('fecha_venta', hasta)
    if (consumoErr) {
      console.warn('consumo_teorico:', consumoErr.message)
    }
    ;(consumoData || []).forEach(c => {
      if (c.id_producto) {
        consumoMap[c.id_producto] = (consumoMap[c.id_producto] || 0) + Number(c.cantidad_consumida)
      }
    })

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

    // Items del último conteo (conteo base)
    const inicialMap = {}
    const invInicial = ultimoConteoRes.data?.[0] || null
    if (invInicial) {
      const { data: itemsIni } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invInicial.id)
      ;(itemsIni || []).forEach(r => { inicialMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Items del conteo del período (conteo final)
    // Si es el mismo record que el base y el rango abarca más de un día → no hay cierre real
    const finalMap = {}
    let invFinal = conteoDelPeriodoRes.data?.[0] || null
    if (invFinal && invInicial && invFinal.id === invInicial.id && desde !== hasta) {
      invFinal = null
    }
    if (invFinal) {
      const { data: itemsFin } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', invFinal.id)
      ;(itemsFin || []).forEach(r => { finalMap[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Unión de ids con movimiento en cualquier fuente
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
      const recep   = recepMap[id] || 0
      const consumo = consumoMap[id] || 0
      const incid   = incidMap[id] || 0
      const final_v = finalMap[id] ?? null

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

    // Ordenar filas: mayor desviación primero, luego alfabético
    Object.values(grupos).forEach(arr => arr.sort((a, b) => {
      if (a.pct !== null && b.pct !== null) return Math.abs(b.pct) - Math.abs(a.pct)
      if (a.pct !== null) return -1
      if (b.pct !== null) return 1
      return a.nombre.localeCompare(b.nombre)
    }))

    // Ordenar grupos, "Sin clasificar" al final
    const nombresGrupos = Object.keys(grupos).sort((a, b) => {
      if (a === 'Sin clasificar') return 1
      if (b === 'Sin clasificar') return -1
      return a.localeCompare(b)
    })

    const fmtNum = v => v === null ? '—' : Number(v).toFixed(2)
    const fmtPct = v => v === null ? '—' : v.toFixed(1) + '%'

    // 10 columnas fijas: Insumo, Unidad, Último conteo, Recepciones, Consumo teórico,
    //                    Incidencias, Teórico esperado, Conteo del período, Diferencia, %
    const colCount = 10

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
              <th style="text-align:right">Último conteo</th>
              <th style="text-align:right">Recepciones</th>
              <th style="text-align:right">Consumo teórico</th>
              <th style="text-align:right">Incidencias</th>
              <th style="text-align:right">Teórico esperado</th>
              <th style="text-align:right">Conteo del período</th>
              <th style="text-align:right">Diferencia</th>
              <th style="text-align:right">%</th>
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
                    <td style="text-align:right">${fmtNum(f.inicial)}</td>
                    <td style="text-align:right">${fmtNum(f.recep)}</td>
                    <td style="text-align:right">${fmtNum(f.consumo)}</td>
                    <td style="text-align:right">${fmtNum(f.incid)}</td>
                    <td style="text-align:right">${fmtNum(f.teorico)}</td>
                    <td style="text-align:right;font-weight:600">${fmtNum(f.final_v)}</td>
                    <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtNum(f.diff)}</td>
                    <td style="text-align:right;font-weight:600;color:${f.colorDiff||'var(--color-text)'}">${fmtPct(f.pct)}</td>
                  </tr>`).join('')}
              `
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
        Período: ${desde} → ${hasta}
        ${invInicial ? ` · Último conteo: ${invInicial.fecha}` : ''}
        ${invFinal   ? ` · Conteo del período: ${invFinal.fecha}` : ''}
        · ${nombresGrupos.length} grupo${nombresGrupos.length !== 1 ? 's' : ''}
      </p>
    `
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
