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
      .select('id_producto, producto, unidad_medida, grupo')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

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

      filas.push({
        nombre: p.producto || id,
        unidad: p.unidad_medida || '',
        grupo:  p.grupo || 'Sin clasificar',
        inicial, recep, consumo, incid, teorico, final_v, diff, pct, colorDiff
      })
    })

    if (!filas.length) {
      wrap.innerHTML = `<p style="color:var(--color-text-muted);padding:24px 0">Sin movimientos en el período seleccionado.</p>`
      return
    }

    // Ordenar por |diff| descendente — nulls al final
    filas.sort((a, b) => {
      if (a.diff !== null && b.diff !== null) return Math.abs(b.diff) - Math.abs(a.diff)
      if (a.diff !== null) return -1
      if (b.diff !== null) return 1
      return a.nombre.localeCompare(b.nombre)
    })

    // Grupos únicos (orden alfabético, "Sin clasificar" al final)
    const gruposUnicos = [...new Set(filas.map(f => f.grupo))].sort((a, b) => {
      if (a === 'Sin clasificar') return 1
      if (b === 'Sin clasificar') return -1
      return a.localeCompare(b)
    })

    const fmtNum = v => formatNum(v)
    const fmtPct = v => v === null ? '—' : formatNum(v, 1) + '%'

    wrap.innerHTML = `
      <style>
        .ia-pills-scroll { display:flex; align-items:center; gap:6px; margin-bottom:14px; }
        .ia-pills-track  { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; flex:1; }
        .ia-pills-track::-webkit-scrollbar { display:none; }
        .ia-pill {
          flex-shrink:0;
          padding:5px 14px;
          border-radius:999px;
          border:1px solid var(--color-border);
          background:var(--color-surface);
          color:var(--color-text);
          font-size:13px;
          cursor:pointer;
          white-space:nowrap;
          transition:background .12s,color .12s,border-color .12s;
        }
        .ia-pill:hover { background:var(--color-bg-alt,rgba(0,0,0,0.05)); }
        .ia-pill.active {
          background:var(--color-primary,#3D0014);
          color:#fff;
          border-color:var(--color-primary,#3D0014);
        }
        .ia-scroll-btn {
          flex-shrink:0;
          width:28px; height:28px;
          border-radius:50%;
          border:1px solid var(--color-border);
          background:var(--color-surface);
          cursor:pointer;
          font-size:14px;
          display:flex; align-items:center; justify-content:center;
          line-height:1;
        }
        .ia-scroll-btn:hover { background:var(--color-bg-alt,rgba(0,0,0,0.05)); }
      </style>

      <div class="ia-pills-scroll">
        <button class="ia-scroll-btn" onclick="_iaScrollPills(-1)">‹</button>
        <div class="ia-pills-track" id="ia-pills-track">
          <button class="ia-pill active" data-grupo="__todos__" onclick="_iaFiltrarGrupo('__todos__')">Todos</button>
          ${gruposUnicos.map(g =>
            `<button class="ia-pill" data-grupo="${g.replace(/"/g,'&quot;')}"
               onclick="_iaFiltrarGrupo(this.dataset.grupo)">${g}</button>`
          ).join('')}
        </div>
        <button class="ia-scroll-btn" onclick="_iaScrollPills(1)">›</button>
      </div>

      <div class="tabla-wrapper" style="overflow-x:auto">
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
            ${filas.map(f => `
              <tr data-grupo="${f.grupo.replace(/"/g,'&quot;')}">
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
          </tbody>
        </table>
      </div>

      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">
        Período: ${desde} → ${hasta}
        ${invInicial ? ` · Último conteo: ${invInicial.fecha}` : ''}
        ${invFinal   ? ` · Conteo del período: ${invFinal.fecha}` : ''}
        · ${filas.length} insumo${filas.length !== 1 ? 's' : ''}
      </p>
    `

  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function _iaFiltrarGrupo(grupo) {
  document.querySelectorAll('#ia-tabla tbody tr').forEach(tr => {
    tr.style.display = (grupo === '__todos__' || tr.dataset.grupo === grupo) ? '' : 'none'
  })
  document.querySelectorAll('.ia-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grupo === grupo)
  })
}

function _iaScrollPills(dir) {
  const track = document.getElementById('ia-pills-track')
  if (track) track.scrollBy({ left: dir * 160, behavior: 'smooth' })
}
