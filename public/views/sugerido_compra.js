// ── Vista: Sugerido de Compra ─────────────────────────────────────────────────
async function vistaSugeridoCompra() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Calculando sugerido de compra...</p>`

  try {
    const tenant_id = await getTenantId()

    // Último inventario completo por cada producto
    const { data: ultimoInv } = await window._db
      .from('inventarios')
      .select('id, fecha')
      .eq('tenant_id', tenant_id)
      .eq('estado', 'completo')
      .order('fecha', { ascending: false })
      .limit(1)

    const fechaBase = ultimoInv?.[0]?.fecha || '2000-01-01'
    const idInvBase = ultimoInv?.[0]?.id

    // Items del inventario base
    const stockBase = {}
    if (idInvBase) {
      const { data: baseItems } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', idInvBase)
      ;(baseItems || []).forEach(r => { stockBase[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Recepciones desde fechaBase hasta hoy
    const recepAcum = {}
    const { data: recItems } = await window._db
      .from('recepcion_items')
      .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
      .eq('recepciones.tenant_id', tenant_id)
      .gte('recepciones.fecha', fechaBase)
    ;(recItems || []).forEach(r => {
      recepAcum[r.id_producto] = (recepAcum[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    // Consumo teórico desde fechaBase hasta hoy
    const consumoAcum = {}
    const { data: consumos } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida, fecha_venta')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', fechaBase)
    ;(consumos || []).forEach(c => {
      consumoAcum[c.id_producto] = (consumoAcum[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    // Consumo últimos 7 días para promedio diario
    const hace7 = new Date(); hace7.setDate(hace7.getDate() - 7)
    const hace7str = hace7.toISOString().split('T')[0]
    const consumo7d = {}
    ;(consumos || []).forEach(c => {
      if (c.fecha_venta >= hace7str) {
        consumo7d[c.id_producto] = (consumo7d[c.id_producto] || 0) + Number(c.cantidad_consumida)
      }
    })

    // Incidencias desde fechaBase
    const incidAcum = {}
    const { data: incidencias } = await window._db
      .from('incidencias')
      .select('id_producto, cantidad')
      .eq('tenant_id', tenant_id)
      .gte('fecha', fechaBase)
    ;(incidencias || []).forEach(i => {
      if (i.id_producto && i.cantidad) {
        incidAcum[i.id_producto] = (incidAcum[i.id_producto] || 0) + Number(i.cantidad)
      }
    })

    // Productos con datos de inventario
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, clasificacion_abc, stock_maximo, stock_alerta_porcentaje, dias_cobertura, id_proveedor_preferencial, ultimo_costo')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .not('stock_maximo', 'is', null)

    // Proveedores con dias_entrega
    const { data: proveedores } = await window._db
      .from('proveedores')
      .select('id_proveedor, nombre, dias_entrega')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
    const provMap = {}
    ;(proveedores || []).forEach(p => { provMap[p.id_proveedor] = p })

    // Calcular stock actual y sugerido por producto
    const porProveedor = {}

    ;(productos || []).forEach(p => {
      const base       = stockBase[p.id_producto] || 0
      const recep      = recepAcum[p.id_producto] || 0
      const consumo    = consumoAcum[p.id_producto] || 0
      const incid      = incidAcum[p.id_producto] || 0
      const stockActual = Math.max(0, base + recep - consumo - incid)

      const c7d        = consumo7d[p.id_producto] || 0
      const promDiario = c7d / 7
      const dias       = p.dias_cobertura || 3
      const stockMax   = Number(p.stock_maximo)
      const alertaPct  = Number(p.stock_alerta_porcentaje || 30)
      const pctActual  = stockMax > 0 ? (stockActual / stockMax * 100) : 0
      const enAlerta   = pctActual <= alertaPct

      const cantSugerida = Math.max(0, (promDiario * dias) - stockActual)

      const provKey = p.id_proveedor_preferencial || '__sin_proveedor__'
      if (!porProveedor[provKey]) porProveedor[provKey] = []
      porProveedor[provKey].push({
        ...p, stockActual, pctActual, cantSugerida, enAlerta,
        costoTotal: cantSugerida * (p.ultimo_costo || 0)
      })
    })

    // Ordenar proveedores: primero los con alertas
    const claves = Object.keys(porProveedor).sort((a, b) => {
      const aAlert = porProveedor[a].some(x => x.enAlerta)
      const bAlert = porProveedor[b].some(x => x.enAlerta)
      if (aAlert && !bAlert) return -1
      if (!aAlert && bAlert) return 1
      return 0
    })

    if (!claves.length) {
      content.innerHTML = `
        <div class="vista-header"><h2>Sugerido de Compra</h2></div>
        <p style="color:var(--color-text-muted)">No hay insumos con stock máximo configurado. Configura stock máximo en la sección "Control de Inventario" de cada insumo.</p>
      `
      return
    }

    let html = `
      <div class="vista-header">
        <h2>Sugerido de Compra</h2>
        <small style="color:var(--color-text-muted);font-size:12px">Base: inventario del ${fechaBase} · Consumo promedio últimos 7 días</small>
      </div>
      <div id="sugerido-pedido-wrap"></div>
    `

    claves.forEach(provKey => {
      const items = porProveedor[provKey]
      const prov  = provMap[provKey]
      const nombre = prov?.nombre || (provKey === '__sin_proveedor__' ? 'Sin proveedor' : provKey)
      const diasEntrega = prov?.dias_entrega || ''
      const totalCosto = items.reduce((s, i) => s + i.costoTotal, 0)

      html += `
        <div class="precios-seccion" style="margin-bottom:20px">
          <div class="precios-seccion-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px">
            <div>
              <span style="font-weight:700">${nombre}</span>
              ${diasEntrega ? `<span style="font-size:11px;color:var(--color-text-muted);margin-left:8px">🗓 ${diasEntrega}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:12px;color:var(--color-text-muted)">Total estimado: <strong>$${formatNum(totalCosto)}</strong></span>
              ${provKey !== '__sin_proveedor__'
                ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 12px"
                    onclick="generarPedidoSugerido('${provKey}','${nombre.replace(/'/g,"\\'")}')">Generar pedido</button>`
                : ''}
            </div>
          </div>
          <div class="precios-seccion-body" style="display:block">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th style="text-align:right">Stock actual</th>
                  <th style="text-align:right">Stock máximo</th>
                  <th style="text-align:right">% actual</th>
                  <th style="text-align:right">Cant. sugerida</th>
                  <th style="text-align:right">Costo unit.</th>
                  <th style="text-align:right">Costo total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => {
                  const pctStr = formatNum(item.pctActual, 0) + '%'
                  const pctColor = item.enAlerta ? '#B85C2A' : item.pctActual <= 60 ? '#c8892a' : '#3A8C3E'
                  const rowBg = item.enAlerta ? 'background:rgba(184,92,42,0.06)' : ''
                  return `
                    <tr style="${rowBg}">
                      <td>${item.producto}</td>
                      <td style="text-align:right">${formatNum(item.stockActual)} ${item.unidad_medida||''}</td>
                      <td style="text-align:right;color:var(--color-text-muted)">${item.stock_maximo} ${item.unidad_medida||''}</td>
                      <td style="text-align:right;font-weight:700;color:${pctColor}">${pctStr}${item.enAlerta?' 🔴':''}</td>
                      <td style="text-align:right;font-weight:600">${formatNum(item.cantSugerida)} ${item.unidad_medida||''}</td>
                      <td style="text-align:right;color:var(--color-text-muted)">${item.ultimo_costo ? '$'+formatNum(item.ultimo_costo) : '—'}</td>
                      <td style="text-align:right;font-weight:600">$${formatNum(item.costoTotal)}</td>
                    </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
    })

    content.innerHTML = html

    window._sugeridoPorProveedor = porProveedor

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

window.generarPedidoSugerido = async function(idProveedor, nombreProv) {
  const tenant_id = await getTenantId()
  const items = (window._sugeridoPorProveedor || {})[idProveedor] || []

  const itemsConCantidad = items.filter(i => i.cantSugerida > 0)
  if (!itemsConCantidad.length) {
    alert('No hay insumos con cantidad sugerida para este proveedor.')
    return
  }

  const wrap = document.getElementById('sugerido-pedido-wrap')
  if (!wrap) return

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:4px">Pedido para ${nombreProv}</h3>
      <p style="color:var(--color-text-muted);font-size:13px;margin-bottom:16px">Ajusta las cantidades antes de confirmar.</p>

      <table class="tabla" id="ped-sug-tabla">
        <thead>
          <tr>
            <th>Insumo</th>
            <th style="text-align:right">Cantidad sugerida</th>
            <th style="text-align:right;width:140px">Cantidad a pedir</th>
            <th style="text-align:right">Costo unit.</th>
            <th style="text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsConCantidad.map((item, idx) => `
            <tr>
              <td>${item.producto}</td>
              <td style="text-align:right;color:var(--color-text-muted)">${formatNum(item.cantSugerida)} ${item.unidad_medida||''}</td>
              <td style="text-align:right">
                <input type="number" class="edit-input edit-num" style="text-align:right"
                  id="ped-sug-qty-${idx}" value="${item.cantSugerida.toFixed(2)}" min="0" step="any"
                  data-costo="${item.ultimo_costo||0}"
                  oninput="actualizarSubtotalSugerido()">
              </td>
              <td style="text-align:right">${item.ultimo_costo ? '$'+formatNum(item.ultimo_costo) : '—'}</td>
              <td style="text-align:right;font-weight:600" id="ped-sug-sub-${idx}">$${formatNum(item.costoTotal)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"></td>
            <td style="text-align:right;font-weight:600;border-top:2px solid var(--color-border)">TOTAL</td>
            <td style="text-align:right;font-weight:700;color:var(--color-primary);border-top:2px solid var(--color-border)" id="ped-sug-total">
              $${formatNum(itemsConCantidad.reduce((s,i)=>s+i.costoTotal,0))}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:16px;display:flex;gap:10px;align-items:center">
        <button class="btn-accion btn-aprobar"
          onclick="confirmarPedidoSugerido('${idProveedor}',${JSON.stringify(itemsConCantidad.map((i,idx)=>({idx,id_producto:i.id_producto,producto:i.producto,ultimo_costo:i.ultimo_costo||null}))).replace(/"/g,'&quot;')})">
          Confirmar pedido
        </button>
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('sugerido-pedido-wrap').innerHTML=''">Cancelar</button>
        <span id="ped-sug-msg" style="font-size:13px;color:#3A8C3E"></span>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })

  window._sugeridoItemsRef = itemsConCantidad
}

window.actualizarSubtotalSugerido = function() {
  let total = 0
  ;(window._sugeridoItemsRef || []).forEach((item, idx) => {
    const qty = parseFloat(document.getElementById(`ped-sug-qty-${idx}`)?.value) || 0
    const sub = qty * (item.ultimo_costo || 0)
    const subEl = document.getElementById(`ped-sug-sub-${idx}`)
    if (subEl) subEl.textContent = '$' + formatNum(sub)
    total += sub
  })
  const totalEl = document.getElementById('ped-sug-total')
  if (totalEl) totalEl.textContent = '$' + formatNum(total)
}

window.confirmarPedidoSugerido = async function(idProveedor, itemsRef) {
  const tenant_id = await getTenantId()
  const hoy = new Date().toISOString().split('T')[0]

  // Generar id_pedido
  const { data: ultimo } = await window._db
    .from('pedidos')
    .select('id_pedido')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (ultimo && ultimo.length > 0) {
    const match = (ultimo[0].id_pedido || '').match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const id_pedido = `PED-${tenant_id.toUpperCase()}-${String(nextNum).padStart(3,'0')}`

  let email = null
  try { const { data: { user } } = await window._db.auth.getUser(); email = user?.email } catch(e) {}

  const { error: errP } = await window._db.from('pedidos').insert({
    id_pedido, tenant_id, id_proveedor: idProveedor,
    fecha_pedido: hoy, status: 'borrador', estado: 'pendiente',
    notas: 'Generado desde sugerido de compra',
    created_by: email, creado_por: email
  })
  if (errP) { alert('Error al crear pedido: ' + errP.message); return }

  const rows = (window._sugeridoItemsRef || []).map((item, idx) => {
    const qty = parseFloat(document.getElementById(`ped-sug-qty-${idx}`)?.value) || 0
    return {
      id_pedido, tenant_id,
      id_producto: item.id_producto,
      cantidad: qty,
      costo_unitario: item.ultimo_costo || null
    }
  }).filter(r => r.cantidad > 0)

  const { error: errI } = await window._db.from('pedido_items').insert(rows)
  if (errI) { alert('Error al guardar items: ' + errI.message); return }

  const msg = document.getElementById('ped-sug-msg')
  if (msg) msg.textContent = `✓ Pedido ${id_pedido} guardado`

  setTimeout(() => {
    document.getElementById('sugerido-pedido-wrap').innerHTML = ''
  }, 2000)
}
