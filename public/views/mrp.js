// ── Vista: MRP (cálculo de necesidad + generación de pedidos de compra) ─────
// Portado de origin/dev (public/views/mrp.js) — se usó solo como referencia de
// lógica de negocio. Adaptado a convenciones vigentes de main y a una
// decisión de arquitectura confirmada explícitamente por el usuario:
//  - dev generaba las órdenes en tablas propias (ordenes_compra/orden_compra_items),
//    que ya NO existen en producción. La generación de pedidos ahora escribe
//    directamente en pedidos/pedido_items (la misma tabla que usa la vista
//    "Pedidos" manual), reutilizando su flujo de recepción/reconciliación tal
//    cual ya existe (pedido_detalle.js) — no se duplica esa lógica aquí.
//    pedidos.id_corrida_mrp marca qué pedidos nacieron de una corrida automática.
//  - existencias usa la columna "existencia" en main (dev usaba "stock_actual",
//    que no existe en este esquema).
//  - consumo_semanal en mrp_items no es una columna generada ni hay trigger que
//    la calcule (verificado en el esquema) — se calcula aquí en cliente como
//    inventario_inicial + ingresos_periodo − inventario_final antes de guardar,
//    para que la columna de referencia en pantalla sea real y no quede en null.
//  - formatInt/formatNum (utils.js) para toda cantidad mostrada.

// ============ PANTALLA 1: LISTADO DE CORRIDAS ============
async function vistaMRP() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando corridas...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()
    window._mrpTenant = tenant_id

    const { data: corridas, error } = await window._db
      .from('corridas_mrp')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('fecha_corrida', { ascending: false })

    if (error) throw error
    window._mrp_corridas = corridas || []

    const badge = {
      BORRADOR:   'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      CONFIRMADO: 'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    window._mrp_badge = badge

    content.innerHTML = `
      <div class="vista-header">
        <h2>MRP</h2>
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
  const hoy    = new Date().toISOString().split('T')[0]
  const en7dias = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
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
  const tenant_id = window._mrpTenant || await getTenantId()
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
    window._db.from('existencias').select('id_producto, existencia').eq('tenant_id', tenant_id).eq('activo', true),
    window._db.from('precios_proveedores').select('id_producto, precio_por_unidad_base').eq('tenant_id', tenant_id).not('precio_por_unidad_base', 'is', null)
  ])

  const stockMap = {}
  ;(existencias || []).forEach(e => { stockMap[e.id_producto] = Number(e.existencia) || 0 })

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
    consumo_semanal: 0,
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
  const tenant_id = window._mrpTenant || await getTenantId()
  const corridaCache = (window._mrp_corridas || []).find(c => c.id === id)
  const corrida = corridaCache || (await window._db.from('corridas_mrp').select('*').eq('id', id).eq('tenant_id', tenant_id).single()).data

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
  window._mrp_items_actual   = items || []
  window._mrp_prod_map       = prodMap

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
                    ${soloLectura ? formatInt(it.inventario_inicial) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-ii-${it.id}" value="${it.inventario_inicial}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.ingresos_periodo) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-ip-${it.id}" value="${it.ingresos_periodo}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.inventario_final) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-if-${it.id}" value="${it.inventario_final}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right;font-weight:600" id="mrp-consumo-${it.id}">${formatInt(it.consumo_semanal ?? 0)}</td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.cantidad_sugerida) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-sug-${it.id}" value="${it.cantidad_sugerida || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.cantidad_dia_1) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d1-${it.id}" value="${it.cantidad_dia_1 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.cantidad_dia_2) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d2-${it.id}" value="${it.cantidad_dia_2 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
                  </td>
                  <td style="text-align:right">
                    ${soloLectura ? formatInt(it.cantidad_dia_3) : `<input type="number" class="edit-input edit-num" style="text-align:right" id="mrp-d3-${it.id}" value="${it.cantidad_dia_3 || 0}" min="0" step="any" onchange="actualizarMrpItem('${it.id}')">`}
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
          <button class="btn-accion btn-aprobar" onclick="generarOrdenesDesdeCorrida('${id}')">Generar pedidos de compra</button>
        ` : `<button class="btn-accion btn-aprobar" onclick="generarOrdenesDesdeCorrida('${id}')">Generar pedidos de compra</button>`}
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

  // No hay columna generada ni trigger para consumo_semanal en este esquema —
  // se calcula aquí: lo que entró menos lo que quedó es lo que se consumió.
  const consumo_semanal = Math.max(0, ii + ip - iff)

  const { data, error } = await window._db.from('mrp_items')
    .update({ inventario_inicial: ii, ingresos_periodo: ip, inventario_final: iff, consumo_semanal, cantidad_sugerida: sug, cantidad_dia_1: d1, cantidad_dia_2: d2, cantidad_dia_3: d3 })
    .eq('id', id).select().single()

  if (error) { alert(`Error: ${error.message}`); return }
  const consumoEl = document.getElementById(`mrp-consumo-${id}`)
  if (consumoEl) consumoEl.textContent = formatInt(data.consumo_semanal ?? 0)

  const idx = (window._mrp_items_actual || []).findIndex(i => i.id === id)
  if (idx >= 0) window._mrp_items_actual[idx] = data
}

async function confirmarCorrida(id) {
  if (!confirm('¿Confirmar esta corrida? Ya no podrás editar los valores.')) return
  const { error } = await window._db.from('corridas_mrp').update({ estatus: 'CONFIRMADO' }).eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaMRP()
  await verDetalleCorrida(id)
}

// ============ PANTALLA 3: GENERAR PEDIDOS DE COMPRA (pedidos/pedido_items) ============
// Antes escribía en ordenes_compra/orden_compra_items (dev) — esas tablas ya no
// existen. Ahora genera pedidos reales en la misma tabla que usa "Pedidos"
// manual, marcados con id_corrida_mrp, para reutilizar tal cual su flujo de
// recepción/reconciliación existente (pedido_detalle.js).
async function generarOrdenesDesdeCorrida(id) {
  const tenant_id = window._mrpTenant || await getTenantId()
  const items = (window._mrp_items_actual || []).filter(it => (it.cantidad_sugerida || 0) > 0)

  if (!items.length) { alert('No hay cantidades sugeridas mayores a cero para generar pedidos.'); return }

  const hoy = new Date().toISOString().split('T')[0]
  const prodMap = window._mrp_prod_map || {}

  const [{ data: productos }, { data: preciosProv }, { data: ultimo }] = await Promise.all([
    window._db.from('productos').select('id_producto, id_proveedor').eq('tenant_id', tenant_id),
    window._db.from('precios_proveedores').select('id_proveedor, id_producto, codigo_proveedor, nombre_proveedor_producto, unidad_precio')
      .eq('tenant_id', tenant_id).lte('fecha_inicio', hoy).gte('fecha_fin', hoy),
    window._db.from('pedidos').select('id_pedido').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(1)
  ])

  const provPorProducto = {}
  ;(productos || []).forEach(p => { provPorProducto[p.id_producto] = p.id_proveedor })

  const catalogoProv = {}
  ;(preciosProv || []).forEach(p => { catalogoProv[p.id_proveedor + '|' + p.id_producto] = p })

  let nextNum = 1
  if (ultimo && ultimo.length > 0) {
    const match = ultimo[0].id_pedido.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const tenantSlug = tenant_id.toUpperCase()

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

    const id_pedido = `PED-${tenantSlug}-${String(nextNum).padStart(3, '0')}`
    nextNum++

    const { error: errP } = await window._db.from('pedidos').insert({
      id_pedido, tenant_id, id_proveedor,
      fecha_pedido: hoy,
      fecha_entrega_esperada: null,
      status: 'borrador',
      notas: 'Generado automáticamente desde corrida MRP',
      created_by: window._email || null,
      id_corrida_mrp: id
    })

    if (errP) { alert(`Error generando pedido para ${id_proveedor}: ${errP.message}`); continue }

    const rows = itemsProv.map(it => {
      const catalogo = catalogoProv[id_proveedor + '|' + it.id_producto]
      const prod = prodMap[it.id_producto] || {}
      return {
        tenant_id,
        id_pedido,
        id_producto: it.id_producto,
        codigo_proveedor: catalogo?.codigo_proveedor || null,
        nombre_proveedor_producto: catalogo?.nombre_proveedor_producto || prod.producto || it.id_producto,
        cantidad_pedida: it.cantidad_sugerida,
        unidad_pedida: catalogo?.unidad_precio || prod.unidad_medida || null,
        precio_cotizado: it.costo_referencia || null
      }
    })

    const { error: errItems } = await window._db.from('pedido_items').insert(rows)
    if (errItems) { alert(`Error generando items del pedido para ${id_proveedor}: ${errItems.message}`); continue }

    creadas++
  }

  alert(`${creadas} pedido(s) de compra generados en borrador. Los insumos sin proveedor asignado fueron omitidos.`)
}
