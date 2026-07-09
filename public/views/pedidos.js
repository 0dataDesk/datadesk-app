async function vistaPedidos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando pedidos...</p>`

  const tenant_id = await getTenantId()

  const { data: pedidos, error } = await window._db
    .from('pedidos')
    .select('id_pedido, id_proveedor, fecha_pedido, fecha_entrega_esperada, status, notas')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })

  if (error) { content.innerHTML = `<p>Error: ${error.message}</p>`; return }

  const { data: proveedores } = await window._db
    .from('proveedores')
    .select('id_proveedor, nombre')
    .eq('tenant_id', tenant_id)
    .eq('activo', true)

  const nombreProv = {}
  ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

  const badgeStatus = {
    borrador:  'background:rgba(155,123,106,0.15);color:#9B7B6A',
    enviado:   'background:rgba(200,137,42,0.15);color:#c8892a',
    recibido:  'background:rgba(76,153,80,0.12);color:#3A8C3E',
    cancelado: 'background:rgba(184,92,42,0.1);color:#B85C2A'
  }

  let html = `
    <div class="vista-header">
      <h2>Pedidos</h2>
      <button class="btn-accion btn-aprobar" onclick="vistaNuevoPedido()">+ Nuevo pedido</button>
    </div>
  `

  if (!pedidos || pedidos.length === 0) {
    html += `<p style="color:var(--color-text-muted)">No hay pedidos registrados. Crea el primero.</p>`
    content.innerHTML = html
    return
  }

  html += `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Proveedor</th>
            <th>Fecha</th>
            <th>Entrega esperada</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
  `

  pedidos.forEach(p => {
    const badge = badgeStatus[p.status] || ''
    html += `
      <tr style="cursor:pointer" onclick="vistaPedidoDetalle('${p.id_pedido}')">
        <td><strong>${p.id_pedido}</strong></td>
        <td>${nombreProv[p.id_proveedor] || p.id_proveedor}</td>
        <td>${p.fecha_pedido || '—'}</td>
        <td>${p.fecha_entrega_esperada || '—'}</td>
        <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${badge}">${p.status}</span></td>
        <td style="text-align:right">
          <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
            onclick="event.stopPropagation(); vistaPedidoDetalle('${p.id_pedido}')">Ver</button>
        </td>
      </tr>
    `
  })

  html += `</tbody></table></div>`
  content.innerHTML = html
}

async function vistaNuevoPedido() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Preparando formulario...</p>`
  const tenant_id = await getTenantId()
  const hoy = new Date().toISOString().split('T')[0]

  const { data: proveedores } = await window._db
    .from('proveedores')
    .select('id_proveedor, nombre')
    .eq('tenant_id', tenant_id)
    .eq('activo', true)
    .order('nombre')

  const { data: todosPrecios } = await window._db
    .from('precios_proveedores')
    .select('id_proveedor, id_producto, codigo_proveedor, nombre_proveedor_producto, precio, unidad_precio, cantidad_unidad, unidad_base')
    .eq('tenant_id', tenant_id)
    .lte('fecha_inicio', hoy)
    .gte('fecha_fin', hoy)

  const { data: todosProd } = await window._db
    .from('productos')
    .select('id_producto, grupo')
    .eq('tenant_id', tenant_id)
    .eq('activo', true)

  const grupoPorProducto = {}
  ;(todosProd || []).forEach(p => { grupoPorProducto[p.id_producto] = p.grupo || 'General' })

  const preciosPorProv = {}
  ;(todosPrecios || []).forEach(p => {
    if (!preciosPorProv[p.id_proveedor]) preciosPorProv[p.id_proveedor] = []
    preciosPorProv[p.id_proveedor].push({ ...p, grupo: grupoPorProducto[p.id_producto] || 'General' })
  })

  // Generar siguiente id_pedido
  const { data: ultimo } = await window._db
    .from('pedidos')
    .select('id_pedido')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (ultimo && ultimo.length > 0) {
    const match = ultimo[0].id_pedido.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const tenantSlug = tenant_id.toUpperCase()
  const id_pedido = `PED-${tenantSlug}-${String(nextNum).padStart(3, '0')}`

  content.innerHTML = `
    <div class="vista-header">
      <h2>Nuevo Pedido — ${id_pedido}</h2>
      <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="vistaPedidos()">← Volver</button>
    </div>

    <div class="filtros-bar" style="margin-bottom:20px">
      <div>
        <label class="filtro-label">Proveedor</label>
        <select id="nuevo-ped-prov" class="filtro-select" onchange="renderItemsPedido(window._preciosPorProv)">
          <option value="">— Seleccionar —</option>
          ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="filtro-label">Entrega esperada</label>
        <input type="date" id="nuevo-ped-entrega" class="filtro-select" value="">
      </div>
      <div style="flex:1">
        <label class="filtro-label">Notas</label>
        <input type="text" id="nuevo-ped-notas" class="filtro-search" placeholder="Observaciones opcionales">
      </div>
    </div>

    <div id="items-pedido-container"></div>

    <div id="nuevo-ped-acciones" style="display:none;margin-top:20px;gap:10px">
      <button class="btn-accion btn-aprobar" onclick="guardarPedido('${id_pedido}','borrador')">Guardar borrador</button>
      <button class="btn-accion" style="background:var(--color-primary);color:#fff;border:none"
        onclick="guardarPedido('${id_pedido}','enviado')">Guardar y marcar como enviado</button>
    </div>
  `

  window._preciosPorProv = preciosPorProv
}

function renderItemsPedido(preciosPorProv) {
  const provId    = document.getElementById('nuevo-ped-prov')?.value
  const container = document.getElementById('items-pedido-container')
  const acciones  = document.getElementById('nuevo-ped-acciones')

  if (!provId || !preciosPorProv[provId]) {
    container.innerHTML = ''
    if (acciones) acciones.style.display = 'none'
    return
  }

  const items = preciosPorProv[provId]
  if (acciones) acciones.style.display = 'flex'

  // Agrupar por grupo
  const porGrupo = {}
  items.forEach(item => {
    const g = item.grupo || 'General'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(item)
  })

  const grupos = Object.keys(porGrupo).sort()
  let globalIdx = 0

  let html = `
    <div class="precios-nav" style="margin-bottom:12px">
      ${grupos.map(g => `
        <button class="precios-nav-pill"
          onclick="document.getElementById('ped-sec-${g.replace(/\s+/g,'-')}').scrollIntoView({behavior:'smooth',block:'start'})">
          ${g} (${porGrupo[g].length})
        </button>`).join('')}
    </div>
  `

  grupos.forEach((grupo, gIdx) => {
    const secId  = `ped-sec-${grupo.replace(/\s+/g, '-')}`
    const bodyId = `ped-body-${grupo.replace(/\s+/g, '-')}`

    html += `
      <div class="precios-seccion" id="${secId}">
        <div class="precios-seccion-header" onclick="toggleSeccion('${bodyId}')">
          <span>${grupo} <span class="precios-seccion-count">${porGrupo[grupo].length} insumos</span></span>
          <span class="precios-seccion-chevron" id="chev-${bodyId}">${gIdx === 0 ? '▾' : '▸'}</span>
        </div>
        <div class="precios-seccion-body" id="${bodyId}" style="display:${gIdx === 0 ? 'block' : 'none'}">
          <table class="tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Código</th>
                <th>Presentación</th>
                <th style="text-align:right">Precio</th>
                <th style="text-align:right;width:110px">Cantidad</th>
                <th style="text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
    `

    porGrupo[grupo].forEach(item => {
      const i = globalIdx++
      const presentacion = item.cantidad_unidad
        ? `${item.unidad_precio} × ${formatInt(item.cantidad_unidad)} ${item.unidad_base}`
        : item.unidad_precio
      const precio = item.precio != null ? `$${formatNum(item.precio)}` : '—'

      html += `
        <tr>
          <td>${item.nombre_proveedor_producto}</td>
          <td style="font-size:11px;color:var(--color-text-muted)">${item.codigo_proveedor || '—'}</td>
          <td style="font-size:12px;color:var(--color-text-muted)">${presentacion}</td>
          <td style="text-align:right">${precio}</td>
          <td>
            <input type="number" min="0" step="1" value="0"
              class="edit-input edit-num" style="text-align:right"
              id="qty-${i}"
              oninput="actualizarSubtotal(${i}, ${item.precio || 0})">
          </td>
          <td style="text-align:right;font-weight:600" id="sub-${i}">$0.00</td>
        </tr>
      `
    })

    html += `</tbody></table></div></div>`
  })

  html += `
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:16px;padding:16px 0;font-size:15px">
      <span style="font-weight:600">TOTAL ESTIMADO</span>
      <span style="font-weight:700;font-size:20px;color:var(--color-primary)" id="total-pedido">$0.00</span>
    </div>
  `

  container.innerHTML = html
  window._itemsProvActual = items
}

function actualizarSubtotal(idx, precio) {
  const qty = parseFloat(document.getElementById(`qty-${idx}`)?.value) || 0
  const sub = qty * precio
  const subEl = document.getElementById(`sub-${idx}`)
  if (subEl) subEl.textContent = `$${formatNum(sub)}`

  let total = 0
  document.querySelectorAll('[id^="sub-"]').forEach(el => {
    total += parseFloat(el.textContent.replace(/[$,]/g, '')) || 0
  })
  const totalEl = document.getElementById('total-pedido')
  if (totalEl) totalEl.textContent = `$${formatNum(total)}`
}

async function guardarPedido(id_pedido, status) {
  const tenant_id    = await getTenantId()
  const id_proveedor = document.getElementById('nuevo-ped-prov')?.value
  const fecha_entrega = document.getElementById('nuevo-ped-entrega')?.value || null
  const notas        = document.getElementById('nuevo-ped-notas')?.value || null

  if (!id_proveedor) { alert('Selecciona un proveedor'); return }

  const items = window._itemsProvActual || []
  const itemsConCantidad = items
    .map((item, i) => ({ item, qty: parseFloat(document.getElementById(`qty-${i}`)?.value) || 0 }))
    .filter(x => x.qty > 0)

  if (itemsConCantidad.length === 0) { alert('Agrega al menos un insumo con cantidad'); return }

  const { error: errP } = await window._db.from('pedidos').insert({
    id_pedido, tenant_id, id_proveedor,
    fecha_pedido: new Date().toISOString().split('T')[0],
    fecha_entrega_esperada: fecha_entrega,
    status, notas,
    created_by: window._email || null
  })

  if (errP) { alert(`Error al guardar: ${errP.message}`); return }

  const rows = itemsConCantidad.map(({ item, qty }) => ({
    tenant_id,
    id_pedido,
    id_producto: item.id_producto,
    codigo_proveedor: item.codigo_proveedor || null,
    nombre_proveedor_producto: item.nombre_proveedor_producto,
    cantidad_pedida: qty,
    unidad_pedida: item.unidad_precio,
    precio_cotizado: item.precio || null
  }))

  const { error: errI } = await window._db.from('pedido_items').insert(rows)
  if (errI) { alert(`Error al guardar items: ${errI.message}`); return }

  if (status === 'enviado') exportarPedidoPDF(id_pedido)

  await vistaPedidos()
}
