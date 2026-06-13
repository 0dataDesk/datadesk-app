// ============ PANTALLA 1: LISTADO DE CORRIDAS ============
async function vistaMRP() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando corridas...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: corridas, error } = await window._db
      .from('corridas_mrp')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('fecha_corrida', { ascending: false })

    if (error) throw error
    window._mrp_corridas = corridas || []

    const badge = {
      BORRADOR: 'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      CONFIRMADO: 'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    window._mrp_badge = badge

    content.innerHTML = `
      <div class="vista-header">
        <h2>Sugerido de Compras</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormCorrida()">+ Nueva corrida</button>
      </div>
      <div id="form-mrp-wrap"></div>
      <div id="mrp-lista"></div>
    `

    renderListaCorridas(window._mrp_corridas)
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function renderListaCorridas(lista) {
  const wrap = document.getElementById('mrp-lista')
  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay corridas registradas.</p>`
    return
  }
  wrap.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead><tr><th>Fecha corrida</th><th>Periodo</th><th>Estatus</th><th></th></tr></thead>
        <tbody>
          ${lista.map(c => `
            <tr style="cursor:pointer" onclick="verDetalleCorrida('${c.id}')">
              <td>${c.fecha_corrida}</td>
              <td>${c.periodo_inicio} → ${c.periodo_fin}</td>
              <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${window._mrp_badge[c.estatus] || ''}">${c.estatus}</span></td>
              <td style="text-align:right">
                <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();verDetalleCorrida('${c.id}')">Ver</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

async function mostrarFormCorrida() {
  const hoy = new Date().toISOString().split('T')[0]
  const en7dias = new Date(Date.now() + 7*86400000).toISOString().split('T')[0]
  document.getElementById('form-mrp-wrap').innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nueva corrida MRP</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Periodo inicio</label>
          <input type="date" id="mrp-inicio" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Periodo fin</label>
          <input type="date" id="mrp-fin" class="filtro-select" value="${en7dias}">
        </div>
      </div>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:12px">
        Se cargarán todos los insumos activos. El consumo y sugerido se calculan a partir de existencias —
        si no hay suficiente historial, los valores iniciarán en cero y podrás ajustarlos manualmente.
      </p>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="crearCorrida()">Crear corrida</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-mrp-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
}

async function crearCorrida() {
  const tenant_id = await getTenantId()
  const periodo_inicio = document.getElementById('mrp-inicio')?.value
  const periodo_fin    = document.getElementById('mrp-fin')?.value
  if (!periodo_inicio || !periodo_fin) { alert('Ambas fechas son obligatorias'); return }

  const { data: corrida, error: errC } = await window._db.from('corridas_mrp')
    .insert({ tenant_id, fecha_corrida: new Date().toISOString().split('T')[0], periodo_inicio, periodo_fin, estatus: 'BORRADOR', created_by: window._email || null })
    .select().single()

  if (errC) { alert(`Error: ${errC.message}`); return }

  // Cargar productos activos + existencias + precio de referencia
  const [{ data: productos }, { data: existencias }, { data: precios }] = await Promise.all([
    window._db.from('productos').select('id_producto, activo').eq('tenant_id', tenant_id).eq('activo', true),
    window._db.from('existencias').select('id_producto, stock_actual').eq('tenant_id', tenant_id),
    window._db.from('precios_proveedores').select('id_producto, precio_por_unidad_base').eq('tenant_id', tenant_id).not('precio_por_unidad_base', 'is', null)
  ])

  const stockMap = {}
  ;(existencias || []).forEach(e => { stockMap[e.id_producto] = Number(e.stock_actual) })

  const precioMap = {}
  ;(precios || []).forEach(p => {
    if (!precioMap[p.id_producto] || p.precio_por_unidad_base < precioMap[p.id_producto]) {
      precioMap[p.id_producto] = p.precio_por_unidad_base
    }
  })

  const rows = (productos || []).map(p => ({
    id_corrida: corrida.id,
    id_producto: p.id_producto,
    inventario_inicial: stockMap[p.id_producto] || 0,
    inventario_final: stockMap[p.id_producto] || 0,
    ingresos_periodo: 0,
    cantidad_sugerida: 0,
    cobertura_pct: 5,
    costo_referencia: precioMap[p.id_producto] || 0,
    cantidad_dia_1: 0, cantidad_dia_2: 0, cantidad_dia_3: 0
  }))

  if (rows.length) {
    const { error: errI } = await window._db.from('mrp_items').insert(rows)
    if (errI) { alert(`Error al generar items: ${errI.message}`); return }
  }

  document.getElementById('form-mrp-wrap').innerHTML = ''
  await vistaMRP()
  await verDetalleCorrida(corrida.id)
}

// ============ PANTALLA 2: DETALLE DE CORRIDA ============
async function verDetalleCorrida(id) {
  const tenant_id = await getTenantId()
  const corrida = window._mrp_corridas.find(c => c.id === id) || (await window._db.from('corridas_mrp').select('*').eq('id', id).single()).data

  const [{ data: items }, { data: productos }, { data: proveedores }] = await Promise.all([
    window._db.from('mrp_items').select('*').eq('id_corrida', id),
    window._db.from('productos').select('id_producto, producto, unidad_medida, id_proveedor, grupo').eq('tenant_id', tenant_id),
    window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true)
  ])

  const prodMap = {}
  ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

  const nombreProv = {}
  ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

  const soloLectura = corrida.estatus === 'CONFIRMADO'
  window._mrp_corrida_actual = corrida
  window._mrp_items_actual = items || []

  const porGrupo = {}
  ;(items || []).forEach(it => {
    const p = prodMap[it.id_producto] || {}
    const g = p.grupo || 'General'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push({ ...it, _producto: p })
  })

  const wrap = document.getElementById('form-mrp-wrap')
  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Corrida MRP — ${corrida.fecha_corrida}</h3>
          <p class="detalle-categoria">${corrida.periodo_inicio} → ${corrida.periodo_fin}</p>
        </div>
        <span class="badge-status" style="${window._mrp_badge[corrida.estatus]}">${corrida.estatus}</span>
      </div>

      ${Object.keys(porGrupo).sort().map(grupo => `
        <h4 style="margin:20px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">${grupo}</h4>
        <div class="tabla-wrapper">
          <table class="tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th style="text-align:right;width:90px">Inv. inicial</th>
                <th style="text-align:right;width:90px">Ingresos</th>
                <th style="text-align:right;width:90px">Inv. final</th>
                <th style="text-align:right;width:90px">Consumo</th>
                <th style="text-align:right;width:90px">Sugerido</th>
                <th style="text-align:right;width:70px">Día 1</th>
                <th style="text-align:right;width:70px">Día 2</th>
                <th style="text-align:right;width:70px">Día 3</th>
              </tr>
            </thead>
            <tbody>
              ${porGrupo[grupo].map(it => `
                <tr data-item="${it.id}">
                  <td>${it._producto.producto || it.id_producto}<div style="font-size:11px;color:var(--color-text-muted)">${it._producto.unidad_medida || ''} · ${nombreProv[it._producto.id_proveedor] || ''}</div></td>
                  <td style="text-align:right">
                    ${soloLectura ? it.inventario_inicial : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-ii-${it.id}" value="${it.inventario_inicial}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? it.ingresos_periodo : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-ip-${it.id}" value="${it.ingresos_periodo}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? it.inventario_final : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-if-${it.id}" value="${it.inventario_final}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right;font-weight:600" id="mrp-consumo-${it.id}">${it.consumo_semanal ?? 0}</td>
                  <td style="text-align:right">
                    ${soloLectura ? it.cantidad_sugerida : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-sug-${it.id}" value="${it.cantidad_sugerida || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? it.cantidad_dia_1 : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d1-${it.id}" value="${it.cantidad_dia_1 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? it.cantidad_dia_2 : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d2-${it.id}" value="${it.cantidad_dia_2 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? it.cantidad_dia_3 : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d3-${it.id}" value="${it.cantidad_dia_3 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}

      <div style="display:flex;gap:10px;margin-top:20px">
        ${!soloLectura ? `
          <button class="btn-accion btn-aprobar" onclick="confirmarCorrida('${id}')">Confirmar corrida</button>
          <button class="btn-accion btn-aprobar" onclick="generarOrdenesDesdeCorrida('${id}')">Generar órdenes de compra</button>
        ` : `<button class="btn-accion btn-aprobar" onclick="generarOrdenesDesdeCorrida('${id}')">Generar órdenes de compra</button>`}
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('form-mrp-wrap').innerHTML=''">Cerrar vista</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function actualizarMrpItem(id) {
  const ii  = parseFloat(document.getElementById(`mrp-ii-${id}`)?.value) || 0
  const ip  = parseFloat(document.getElementById(`mrp-ip-${id}`)?.value) || 0
  const iff = parseFloat(document.getElementById(`mrp-if-${id}`)?.value) || 0
  const sug = parseFloat(document.getElementById(`mrp-sug-${id}`)?.value) || 0
  const d1  = parseFloat(document.getElementById(`mrp-d1-${id}`)?.value) || 0
  const d2  = parseFloat(document.getElementById(`mrp-d2-${id}`)?.value) || 0
  const d3  = parseFloat(document.getElementById(`mrp-d3-${id}`)?.value) || 0

  const { data, error } = await window._db.from('mrp_items')
    .update({ inventario_inicial: ii, ingresos_periodo: ip, inventario_final: iff, cantidad_sugerida: sug, cantidad_dia_1: d1, cantidad_dia_2: d2, cantidad_dia_3: d3 })
    .eq('id', id).select().single()

  if (error) { alert(`Error: ${error.message}`); return }
  document.getElementById(`mrp-consumo-${id}`).textContent = data.consumo_semanal ?? 0

  const idx = window._mrp_items_actual.findIndex(i => i.id === id)
  if (idx >= 0) window._mrp_items_actual[idx] = data
}

async function confirmarCorrida(id) {
  if (!confirm('¿Confirmar esta corrida? Ya no podrás editar los valores.')) return
  const { error } = await window._db.from('corridas_mrp').update({ estatus: 'CONFIRMADO' }).eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaMRP()
  await verDetalleCorrida(id)
}

// ============ PANTALLA 3: GENERAR ÓRDENES DE COMPRA ============
async function generarOrdenesDesdeCorrida(id) {
  const tenant_id = await getTenantId()
  const items = window._mrp_items_actual.filter(it => (it.cantidad_sugerida || 0) > 0)

  if (!items.length) { alert('No hay cantidades sugeridas mayores a cero para generar órdenes.'); return }

  const { data: productos } = await window._db.from('productos').select('id_producto, id_proveedor').eq('tenant_id', tenant_id)
  const provPorProducto = {}
  ;(productos || []).forEach(p => { provPorProducto[p.id_producto] = p.id_proveedor })

  // Agrupar items por proveedor
  const porProveedor = {}
  items.forEach(it => {
    const prov = provPorProducto[it.id_producto] || 'SIN_PROVEEDOR'
    if (!porProveedor[prov]) porProveedor[prov] = []
    porProveedor[prov].push(it)
  })

  let creadas = 0
  for (const [id_proveedor, itemsProv] of Object.entries(porProveedor)) {
    if (id_proveedor === 'SIN_PROVEEDOR') continue

    const { data: oc, error: errOC } = await window._db.from('ordenes_compra')
      .insert({ tenant_id, fecha_emision: new Date().toISOString().split('T')[0], id_proveedor, estatus: 'BORRADOR', id_corrida_mrp: id, created_by: window._email || null })
      .select().single()

    if (errOC) { alert(`Error generando OC para ${id_proveedor}: ${errOC.message}`); continue }

    const rows = itemsProv.map(it => ({
      id_orden_compra: oc.id,
      id_producto: it.id_producto,
      cantidad_solicitada: it.cantidad_sugerida,
      costo_unitario_referencia: it.costo_referencia || 0
    }))

    const { error: errItems } = await window._db.from('orden_compra_items').insert(rows)
    if (errItems) { alert(`Error generando items de OC para ${id_proveedor}: ${errItems.message}`); continue }

    creadas++
  }

  alert(`${creadas} orden(es) de compra generadas. Los insumos sin proveedor asignado fueron omitidos.`)
}
