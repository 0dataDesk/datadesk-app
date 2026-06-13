async function vistaConteos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando conteos...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: conteos, error } = await window._db
      .from('conteos')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    window._conteos_data = conteos || []

    const badge = {
      ABIERTO: 'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      CERRADO: 'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    window._conteos_badge = badge

    content.innerHTML = `
      <div class="vista-header">
        <h2>Conteos</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormConteo()">+ Nuevo conteo</button>
      </div>
      <div id="form-conteo-wrap"></div>
      <div id="conteos-lista"></div>
    `

    renderListaConteos(window._conteos_data)
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function renderListaConteos(lista) {
  const wrap = document.getElementById('conteos-lista')
  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay conteos registrados.</p>`
    return
  }
  wrap.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead><tr><th>Fecha</th><th>Periodo</th><th>Estatus</th><th></th></tr></thead>
        <tbody>
          ${lista.map(c => `
            <tr style="cursor:pointer" onclick="verDetalleConteo('${c.id}')">
              <td>${c.fecha}</td>
              <td>${c.periodo || '—'}</td>
              <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${window._conteos_badge[c.estatus] || ''}">${c.estatus}</span></td>
              <td style="text-align:right">
                ${c.estatus === 'ABIERTO'
                  ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();verDetalleConteo('${c.id}')">Capturar</button>`
                  : `<button class="btn-accion" style="font-size:11px;padding:4px 10px;border:1px solid var(--color-border)" onclick="event.stopPropagation();verDetalleConteo('${c.id}')">Ver</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

async function mostrarFormConteo() {
  const hoy = new Date().toISOString().split('T')[0]
  document.getElementById('form-conteo-wrap').innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nuevo conteo</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha</label>
          <input type="date" id="ct-fecha" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Periodo</label>
          <input type="text" id="ct-periodo" class="filtro-select" placeholder="Ej. Semana 24">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="crearConteo()">Crear y comenzar captura</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-conteo-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
}

async function crearConteo() {
  const tenant_id = await getTenantId()
  const fecha   = document.getElementById('ct-fecha')?.value
  const periodo = document.getElementById('ct-periodo')?.value?.trim() || null
  if (!fecha) { alert('La fecha es obligatoria'); return }

  const { data, error } = await window._db.from('conteos')
    .insert({ tenant_id, fecha, periodo, estatus: 'ABIERTO', created_by: window._email || null })
    .select().single()

  if (error) { alert(`Error: ${error.message}`); return }
  document.getElementById('form-conteo-wrap').innerHTML = ''
  await vistaConteos()
  await verDetalleConteo(data.id)
}

async function verDetalleConteo(id) {
  const tenant_id = await getTenantId()
  const conteo = window._conteos_data.find(c => c.id === id)
  if (!conteo) return

  const [
    { data: items },
    { data: productos },
    { data: existencias }
  ] = await Promise.all([
    window._db.from('conteo_items').select('*').eq('id_conteo', id),
    window._db.from('productos').select('id_producto, producto, unidad_medida, grupo').eq('tenant_id', tenant_id).eq('activo', true).order('grupo').order('producto'),
    window._db.from('existencias').select('id_producto, stock_actual').eq('tenant_id', tenant_id)
  ])

  const stockTeorico = {}
  ;(existencias || []).forEach(e => { stockTeorico[e.id_producto] = Number(e.stock_actual) })

  const itemsPorProducto = {}
  ;(items || []).forEach(i => { itemsPorProducto[i.id_producto] = i })

  const soloLectura = conteo.estatus === 'CERRADO'
  window._conteo_actual_id = id

  const porGrupo = {}
  ;(productos || []).forEach(p => {
    const g = p.grupo || 'General'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(p)
  })

  const wrap = document.getElementById('form-conteo-wrap')
  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Conteo — ${conteo.fecha}</h3>
          <p class="detalle-categoria">${conteo.periodo || ''}</p>
        </div>
        <span class="badge-status" style="${window._conteos_badge[conteo.estatus]}">${conteo.estatus}</span>
      </div>

      ${Object.keys(porGrupo).sort().map(grupo => `
        <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">${grupo}</h4>
        <div class="tabla-wrapper">
          <table class="tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th style="text-align:right;width:110px">Locación 1</th>
                <th style="text-align:right;width:110px">Locación 2</th>
                <th style="text-align:right;width:90px">Total</th>
                <th style="text-align:right;width:90px">Teórico</th>
                <th style="text-align:right;width:110px">Discrepancia</th>
              </tr>
            </thead>
            <tbody>
              ${porGrupo[grupo].map(p => {
                const item = itemsPorProducto[p.id_producto] || {}
                const teorico = stockTeorico[p.id_producto]
                const l1 = item.cantidad_locacion_1 ?? ''
                const l2 = item.cantidad_locacion_2 ?? ''
                const total = item.cantidad_total
                const disc = item.discrepancia
                const discPct = item.discrepancia_pct
                const colorDisc = disc == null ? '' : Math.abs(discPct || 0) > 10 ? 'color:#B85C2A;font-weight:600' : disc != 0 ? 'color:#c8892a' : 'color:#3A8C3E'
                return `
                <tr data-prod="${p.id_producto}">
                  <td>${p.producto}<div style="font-size:11px;color:var(--color-text-muted)">${p.unidad_medida || ''}</div></td>
                  <td style="text-align:right">
                    ${soloLectura ? (l1 ?? '—') : `<input type="number" class="edit-input edit-num" style="text-align:right" id="ct-l1-${p.id_producto}" value="${l1}" min="0" step="any" onchange="actualizarConteoItem('${p.id_producto}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? (l2 ?? '—') : `<input type="number" class="edit-input edit-num" style="text-align:right" id="ct-l2-${p.id_producto}" value="${l2}" min="0" step="any" onchange="actualizarConteoItem('${p.id_producto}')">`}
                  </td>
                  <td style="text-align:right;font-weight:600" id="ct-total-${p.id_producto}">${total ?? '—'}</td>
                  <td style="text-align:right;color:var(--color-text-muted)">${teorico ?? '—'}</td>
                  <td style="text-align:right;${colorDisc}" id="ct-disc-${p.id_producto}">${disc != null ? disc + (discPct != null ? ' (' + discPct + '%)' : '') : '—'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}

      <div style="display:flex;gap:10px;margin-top:20px">
        ${!soloLectura ? `<button class="btn-accion btn-aprobar" onclick="cerrarConteo('${id}')">Cerrar conteo</button>` : ''}
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-conteo-wrap').innerHTML=''">Cerrar vista</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function actualizarConteoItem(id_producto) {
  const tenant_id = await getTenantId()
  const id_conteo = window._conteo_actual_id

  const l1 = parseFloat(document.getElementById(`ct-l1-${id_producto}`)?.value) || 0
  const l2 = parseFloat(document.getElementById(`ct-l2-${id_producto}`)?.value) || 0

  const { data: existente } = await window._db.from('conteo_items')
    .select('id').eq('id_conteo', id_conteo).eq('id_producto', id_producto).maybeSingle()

  const { data: exist } = await window._db.from('existencias')
    .select('stock_actual').eq('tenant_id', tenant_id).eq('id_producto', id_producto).maybeSingle()

  const stock_teorico = exist ? Number(exist.stock_actual) : 0

  let row
  if (existente) {
    const { data } = await window._db.from('conteo_items')
      .update({ cantidad_locacion_1: l1, cantidad_locacion_2: l2, stock_teorico })
      .eq('id', existente.id).select().single()
    row = data
  } else {
    const { data } = await window._db.from('conteo_items')
      .insert({ id_conteo, id_producto, cantidad_locacion_1: l1, cantidad_locacion_2: l2, stock_teorico })
      .select().single()
    row = data
  }

  if (row) {
    document.getElementById(`ct-total-${id_producto}`).textContent = row.cantidad_total
    const disc = row.discrepancia
    const discPct = row.discrepancia_pct
    const el = document.getElementById(`ct-disc-${id_producto}`)
    el.textContent = disc != null ? disc + (discPct != null ? ' (' + discPct + '%)' : '') : '—'
    el.style = Math.abs(discPct || 0) > 10 ? 'color:#B85C2A;font-weight:600' : disc != 0 ? 'color:#c8892a' : 'color:#3A8C3E'
  }
}

async function cerrarConteo(id) {
  if (!confirm('¿Cerrar el conteo? Esto actualizará las existencias del sistema con lo capturado.')) return
  const { error } = await window._db.from('conteos').update({ estatus: 'CERRADO' }).eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  document.getElementById('form-conteo-wrap').innerHTML = ''
  await vistaConteos()
}
