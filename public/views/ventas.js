async function vistaVentas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando ventas...</p>`
  const tenant_id = await getTenantId()
  await renderVentas(content, tenant_id)
}

async function renderVentas(container, tenantId) {
  const { data: ventas, error } = await window._db
    .from('ventas')
    .select('id, folio, created_at, total, subtotal, estado, tipo_entrega, cliente_nombre, metodo_pago, propina, descuento_porcentaje, monto_efectivo, monto_tarjeta, pagos_detalle')
    .eq('tenant_id', tenantId)
    .is('id_cierre', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) { container.innerHTML = `<p>Error: ${error.message}</p>`; return }

  const ids = (ventas || []).map(v => v.id)
  const itemsPorVenta = {}
  let todosItems = []
  const promoPrecioPorItem = {}
  const { data: preciosPromo } = await window._db
    .from('precios_venta')
    .select('id_item, precio')
    .eq('tenant_id', tenantId)
    .eq('lista', 'promo_inauguracion')
  ;(preciosPromo || []).forEach(p => { promoPrecioPorItem[p.id_item] = Number(p.precio) })
  if (ids.length > 0) {
    const { data: items } = await window._db
      .from('venta_items')
      .select('id_venta, nombre, cantidad, importe, modificadores, id_item, precio_unitario')
      .eq('tenant_id', tenantId)
      .in('id_venta', ids)
    todosItems = items || []
    todosItems.forEach(it => {
      if (!itemsPorVenta[it.id_venta]) itemsPorVenta[it.id_venta] = []
      itemsPorVenta[it.id_venta].push(it)
    })
  }

  const estadoBadge = {
    cerrada:   'background:rgba(76,153,80,0.12);color:#3A8C3E',
    cancelada: 'background:rgba(184,92,42,0.1);color:#B85C2A',
    pendiente: 'background:rgba(200,137,42,0.15);color:#c8892a'
  }

  const estadoColor = {
    cerrada:   '#3A8C3E',
    cancelada: '#B85C2A',
    pendiente: '#c8892a'
  }

  const entregaEmoji = {
    barra:  '🍽️',
    llevar: '🛵'
  }

  function fmtFecha(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm} ${hh}:${mi}`
  }

  const SUPA_URL = window._db.supabaseUrl
  const SUPA_KEY = window._db.supabaseKey

  async function supaDelete(table, filters) {
    const params = new URLSearchParams(filters)
    const res = await fetch(
      `${SUPA_URL}/rest/v1/${table}?${params}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
  }

  window._supaDelete = supaDelete

  const mostrarCierre   = ['superadmin','admin','gerente'].includes(window._rol)
  const mostrarEliminar = window._rol === 'superadmin'

  const listaVentas = ventas || []

  // — Métricas del día (siempre se calculan, aunque sea en cero) —
  const propinaDia = listaVentas.reduce((s, v) => s + Number(v.propina || 0), 0)
  const descuentoDia = listaVentas.reduce((s, v) => {
    const sub = Number(v.subtotal) || 0
    const pct = Number(v.descuento_porcentaje) || 0
    return s + (pct > 0 ? Math.round(sub * pct) / 100 : 0)
  }, 0)
  const totalDia = listaVentas.reduce((s, v) => s + Number(v.total || 0), 0) - propinaDia
  const ticketProm = listaVentas.length ? totalDia / listaVentas.length : 0

  let html = `
    <div class="vista-header">
      <h2>🧾 Ventas</h2>
      ${mostrarCierre ? `<button class="btn-accion" style="background:var(--color-accent);color:#fff;border:none" onclick="mostrarCierreCaja('${tenantId}')">Cierre de caja</button>` : ''}
    </div>
    <div id="ventas-cabecero-metricas">
    <div class="card-surface" style="padding:20px;margin-bottom:18px">
      <div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Total del día</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1.1;color:var(--color-primary)">$${formatNum(totalDia)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Ticket promedio</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1.1;color:var(--color-text)">$${formatNum(ticketProm)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">💰 Propina</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1.1;color:var(--color-text)">$${formatNum(propinaDia)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">🏷️ Descuentos</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;line-height:1.1;color:#3A8C3E">$${formatNum(descuentoDia)}</div>
        </div>
      </div>
    </div>
    </div>
  `

  if (!listaVentas.length) {
    html += `<p style="color:var(--color-text-muted)">No hay ventas registradas.</p>`
    container.innerHTML = html
    // — Realtime — (también cuando el día empieza en ceros, para reaccionar a la primera venta)
    if (window._ventasChannel) window._db.removeChannel(window._ventasChannel)
    try {
      const channel = window._db
        .channel('ventas-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'ventas',
          filter: `tenant_id=eq.${tenantId}`
        }, () => {
          renderVentas(container, tenantId)
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            window._db.removeChannel(channel)
            window._ventasChannel = null
          }
        })
      window._ventasChannel = channel
    } catch (_) {}
    return
  }

  // — Lista acordeón —
  let listaHtml = ''
  listaVentas.forEach(v => {
    const badge    = estadoBadge[v.estado] || ''
    const items    = itemsPorVenta[v.id] || []
    const folio    = v.folio || v.id
    const folioEsc = folio.toString().replace(/'/g, "\\'")

    const itemsHtml = items.map(it => {
      let modsText = ''
      if (it.modificadores) {
        const m = it.modificadores
        const parts = []
        const sin = (m.ingredientes || []).filter(i => !i.on).map(i => i.nombre)
        if (sin.length) parts.push('Sin: ' + sin.join(', '))
        const extras = (m.extras || []).filter(e => (e.qty || 0) > 0).map(e => e.nombre)
        if (extras.length) parts.push(extras.join(', '))
        const salsas = (m.salsas || []).map(s => s.nombre)
        if (salsas.length) parts.push(salsas.join(', '))
        if (m.nota) parts.push('📝 ' + m.nota)
        if (parts.length) modsText = `<div style="font-size:11px;color:var(--color-text-muted);margin-left:12px">${parts.join(' · ')}</div>`
      }
      const esPromo = it.id_item in promoPrecioPorItem && Number(it.precio_unitario) === promoPrecioPorItem[it.id_item]
      const promoBadge = esPromo ? `<span style="background:rgba(200,137,42,0.15);color:#c8892a;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;margin-left:6px">PROMO</span>` : ''
      return `<div style="padding:3px 0;font-size:13px">${it.nombre}${promoBadge} ×${it.cantidad} — <strong>$${it.importe}</strong>${modsText}</div>`
    }).join('')

    const propina   = Number(v.propina) || 0
    const descuento = Number(v.descuento_porcentaje) || 0

    const complemento = (propina || descuento) ? `
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border);font-size:12px;color:var(--color-text-muted);display:flex;gap:16px;flex-wrap:wrap">
        ${propina   ? `<span>Propina <strong style="color:var(--color-text)">$${formatNum(propina)}</strong></span>` : ''}
        ${descuento ? `<span>Descuento <strong style="color:#3A8C3E">-${descuento}%</strong></span>` : ''}
      </div>` : ''

    const panelHtml = `
      <div id="panel-${v.id}" style="display:none;border-top:1px solid var(--color-border);padding-top:10px;margin-top:10px">
        <div>
          ${itemsHtml || '<span style="font-size:12px;color:var(--color-text-muted)">Sin ítems</span>'}
        </div>
        ${complemento}
        ${mostrarEliminar ? `
        <div style="margin-top:12px;text-align:right">
          <button class="btn-accion" style="background:rgba(184,92,42,0.1);color:#B85C2A;border:1px solid rgba(184,92,42,0.2);font-size:12px;padding:4px 12px"
            onclick="eliminarVenta('${v.id}','${folioEsc}','${tenantId}')">🗑 Eliminar</button>
        </div>` : ''}
      </div>
    `

    listaHtml += `
      <div id="venta-${v.id}" style="border-bottom:1px solid var(--color-border);border-left:4px solid ${estadoColor[v.estado] || '#9B7B6A'};padding:12px 0 12px 12px;cursor:pointer"
        onclick="(function(el){
          const panel = el.querySelector('[id^=panel-]');
          const chevron = el.querySelector('.venta-chevron');
          const open = panel.style.display !== 'none';
          document.querySelectorAll('[id^=panel-]').forEach(p => { p.style.display='none'; });
          document.querySelectorAll('.venta-chevron').forEach(c => { c.textContent='▼'; });
          if (!open) { panel.style.display=''; chevron.textContent='▲'; }
        })(this)">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong style="font-size:14px;min-width:80px">${folio}</strong>
          <span style="font-size:12px;color:var(--color-text-muted)">${fmtFecha(v.created_at)}</span>
          <span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;${badge}">${v.estado}</span>
          <span style="margin-left:auto;font-size:16px;font-weight:700;color:var(--color-primary)">$${formatNum(Number(v.total) - (Number(v.propina) || 0))}</span>
          <span class="venta-chevron" style="font-size:11px;color:var(--color-text-muted);min-width:12px">▼</span>
        </div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">
          ${entregaEmoji[v.tipo_entrega] || ''} ${v.tipo_entrega || '—'} · ${v.metodo_pago === 'delivery'
            ? `<span style="background:rgba(200,137,42,0.15);color:#c8892a;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600">${formatMetodoPago(v.metodo_pago, v.pagos_detalle)}</span>`
            : (v.metodo_pago || '—')}
        </div>
        ${panelHtml}
      </div>
    `
  })

  html += `<div class="card-surface" style="padding:8px 16px"><div id="lista-ventas-wrap">${listaHtml}</div></div>`
  container.innerHTML = html

  // — Realtime —
  if (window._ventasChannel) window._db.removeChannel(window._ventasChannel)
  try {
    const channel = window._db
      .channel('ventas-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ventas',
        filter: `tenant_id=eq.${tenantId}`
      }, () => {
        renderVentas(container, tenantId)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          window._db.removeChannel(channel)
          window._ventasChannel = null
        }
      })
    window._ventasChannel = channel
  } catch (_) {}
}

function calcularDesglosePorMetodo(ventasDia) {
  const porMetodo = {}
  const addMetodo = (m, monto, esTicketCompleto) => {
    if (!porMetodo[m]) porMetodo[m] = { suma: 0, count: 0 }
    porMetodo[m].suma += monto
    if (esTicketCompleto) porMetodo[m].count++
  }
  ventasDia.forEach(v => {
    const m = (v.metodo_pago || '').toLowerCase()
    if (m === 'delivery') {
      const tipo = Array.isArray(v.pagos_detalle) && v.pagos_detalle[0] ? v.pagos_detalle[0].tipo : 'otro'
      addMetodo('delivery_' + tipo, Number(v.total), true)
    } else if (m === 'mixto' || m === 'dividido' || (Number(v.monto_efectivo) > 0 && Number(v.monto_tarjeta) > 0)) {
      if (Number(v.monto_efectivo) > 0) addMetodo('efectivo', Number(v.monto_efectivo), false)
      if (Number(v.monto_tarjeta) > 0) {
        const detalle = Array.isArray(v.pagos_detalle) ? v.pagos_detalle : []
        const entradaTarjeta = detalle.find(d => d.tipo === 'debito' || d.tipo === 'credito')
        const tipoTarjeta = entradaTarjeta ? entradaTarjeta.tipo : 'tarjeta'
        addMetodo(tipoTarjeta, Number(v.monto_tarjeta), false)
        porMetodo[tipoTarjeta].count++
      }
      if (Number(v.monto_efectivo) > 0) porMetodo['efectivo'].count++
    } else {
      addMetodo(v.metodo_pago || 'Sin método', Number(v.total), true)
    }
  })
  return porMetodo
}

function metodoDisplay(v) {
  if (v.metodo_pago === 'delivery') return formatMetodoPago(v.metodo_pago, v.pagos_detalle)
  return (Number(v.monto_efectivo) > 0 && Number(v.monto_tarjeta) > 0)
    ? `Efectivo $${formatNum(v.monto_efectivo)} + Tarjeta $${formatNum(v.monto_tarjeta)}`
    : (v.metodo_pago || '—')
}
function rangoDiaMexico(fecha) {
  return {
    inicio: new Date(`${fecha}T00:00:00-06:00`).toISOString(),
    fin:    new Date(`${fecha}T23:59:59-06:00`).toISOString()
  }
}

async function mostrarCierreCaja(tenantId) {
  const panel = document.getElementById('cierre-panel')
  const listaWrap = document.getElementById('lista-ventas-wrap')
  if (panel) {
    panel.remove()
    if (listaWrap) listaWrap.style.display = ''
    const cabeceroMetricas = document.getElementById('ventas-cabecero-metricas')
    if (cabeceroMetricas) cabeceroMetricas.style.display = ''
    return
  }

  const container = document.getElementById('content')
  const header = container.querySelector('.vista-header')
  const panelDiv = document.createElement('div')
  panelDiv.id = 'cierre-panel'
  panelDiv.className = 'card-surface'
  panelDiv.style.padding = '24px'
  panelDiv.style.marginBottom = '18px'
  panelDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <strong style="font-size:15px">Cierre de caja</strong>
      <span id="cierre-fecha-titulo" style="font-size:14px;color:var(--color-text-muted)"></span>
      <button class="btn-accion" id="cierre-cerrar-btn" style="display:none;background:var(--color-primary);color:#fff;border:none;margin-left:auto"
        onclick="confirmarCierreDia(window._cierreFecha, '${tenantId}')">Cerrar día</button>
    </div>
    <div id="cierre-resultado"></div>
  `
  if (header && header.nextSibling) {
    container.insertBefore(panelDiv, header.nextSibling)
  } else {
    container.appendChild(panelDiv)
  }

  if (listaWrap) listaWrap.style.display = 'none'
  const cabeceroMetricas = document.getElementById('ventas-cabecero-metricas')
  if (cabeceroMetricas) cabeceroMetricas.style.display = 'none'

  const resultado = document.getElementById('cierre-resultado')
  resultado.innerHTML = `<p style="color:var(--color-text-muted)">Buscando ventas pendientes de cierre...</p>`

  // La fecha ya no se elige a mano: se detecta sola (el día más antiguo con ventas
  // cerradas sin cierre). Esto evita cerrar un día equivocado por accidente.
  const { data: pendiente, error: errP } = await window._db
    .from('ventas')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('estado', 'cerrada')
    .is('id_cierre', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (errP) { resultado.innerHTML = `<p style="color:var(--color-highlight)">Error: ${errP.message}</p>`; return }
  if (!pendiente || !pendiente.length) {
    resultado.innerHTML = `<p style="color:var(--color-text-muted)">No hay ventas cerradas pendientes de cierre.</p>`
    return
  }

  // Fecha local (México, UTC-6) del primer pendiente
  const fechaLocalMs = new Date(pendiente[0].created_at).getTime() - 6 * 3600 * 1000
  const fecha = new Date(fechaLocalMs).toISOString().split('T')[0]
  window._cierreFecha = fecha

  const tituloEl = document.getElementById('cierre-fecha-titulo')
  if (tituloEl) tituloEl.textContent = `Cerrando: ${fecha.slice(8,10)}/${fecha.slice(5,7)}/${fecha.slice(0,4)}`

  const { data: ventasDia, error } = await window._db
    .from('ventas')
    .select('id, folio, metodo_pago, total, monto_efectivo, monto_tarjeta, propina, subtotal, descuento_porcentaje, estado, created_at, pagos_detalle')
    .eq('tenant_id', tenantId)
    .eq('estado', 'cerrada')
    .is('id_cierre', null)
    .gte('created_at', rangoDiaMexico(fecha).inicio)
    .lt('created_at', rangoDiaMexico(fecha).fin)
    .order('created_at')

  if (error) { resultado.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`; return }
  if (!ventasDia || !ventasDia.length) {
    resultado.innerHTML = `<p style="color:var(--color-text-muted)">Sin ventas cerradas pendientes para ${fecha}.</p>`
    return
  }

  window._cierreVentas = ventasDia

  // Items por venta, para el detalle expandible (mismo patrón visual que Cierres)
  const ids = ventasDia.map(v => v.id)
  const itemsPorVenta = {}
  if (ids.length > 0) {
    const { data: items } = await window._db
      .from('venta_items')
      .select('id_venta, nombre, cantidad, importe, modificadores')
      .eq('tenant_id', tenantId)
      .in('id_venta', ids)
    ;(items || []).forEach(it => {
      if (!itemsPorVenta[it.id_venta]) itemsPorVenta[it.id_venta] = []
      itemsPorVenta[it.id_venta].push(it)
    })
  }

  function fmtItemsVenta(items, venta) {
    const lineas = items.map(it => {
      let modsText = ''
      if (it.modificadores) {
        const m = it.modificadores
        const parts = []
        const sin = (m.ingredientes || []).filter(i => !i.on).map(i => i.nombre)
        if (sin.length) parts.push('Sin: ' + sin.join(', '))
        const extras = (m.extras || []).filter(e => (e.qty || 0) > 0).map(e => e.nombre)
        if (extras.length) parts.push(extras.join(', '))
        const salsas = (m.salsas || []).map(s => s.nombre)
        if (salsas.length) parts.push(salsas.join(', '))
        if (m.nota) parts.push('📝 ' + m.nota)
        if (parts.length) modsText = `<div style="font-size:11px;color:var(--color-text-muted);margin-left:12px">${parts.join(' · ')}</div>`
      }
      return `<div style="padding:3px 0;font-size:13px">${it.nombre} ×${it.cantidad} — <strong>$${it.importe}</strong>${modsText}</div>`
    }).join('')

    let descFooter = ''
    if (venta && venta.descuento_porcentaje > 0) {
      const sub       = Number(venta.subtotal) || 0
      const pct       = Number(venta.descuento_porcentaje)
      const descMonto = Math.round(sub * pct) / 100
      descFooter = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--color-border)">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--color-text-muted)">
            <span>Subtotal</span><span>$${formatNum(sub)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#3A8C3E;font-weight:600">
            <span>Descuento (${pct}%)</span><span>-$${formatNum(descMonto)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;margin-top:4px">
            <span>Total</span><span>$${formatNum(venta.total)}</span>
          </div>
        </div>`
    }
    return lineas + descFooter
  }

  const totalGeneral   = ventasDia.reduce((s, v) => s + Number(v.total), 0)
  const propinaTotal   = ventasDia.reduce((s, v) => s + (Number(v.propina) || 0), 0)
  const ventaNetaTotal = totalGeneral - propinaTotal

  const ventasConDesc  = ventasDia.filter(v => v.descuento_porcentaje > 0)
  const montoDescTotal = ventasConDesc.reduce((s, v) => s + Math.round((Number(v.subtotal) || 0) * (Number(v.descuento_porcentaje) || 0)) / 100, 0)

  // Filas fijas: Efectivo, Débito, Crédito, Delivery Rappi/Uber/Didi — siempre visibles aunque estén en cero.
  const desglose = calcularDesgloseCompletoPorMetodo(ventasDia)
  const filasCanonicas = ['efectivo', 'debito', 'credito', 'delivery_rappi', 'delivery_uber', 'delivery_didi']
  const extras = Object.keys(desglose).filter(k => !filasCanonicas.includes(k))
  const filasFinal = [...filasCanonicas, ...extras]

  const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  const html = `
    <div style="overflow-x:auto;margin-bottom:20px">
      <table class="tabla">
        <thead>
          <tr>
            <th>Método de pago</th>
            <th style="text-align:right">Cant. tk</th>
            <th style="text-align:right">VT</th>
            <th style="text-align:right">Desc</th>
            <th style="text-align:right">Prop</th>
            <th style="text-align:right">Tot</th>
          </tr>
        </thead>
        <tbody>
          ${filasFinal.map(m => {
            const d = desglose[m] || { count: 0, vt: 0, desc: 0, prop: 0, tot: 0 }
            return `
              <tr>
                <td>${formatMetodoKey(m)}</td>
                <td style="text-align:right">${d.count}</td>
                <td style="text-align:right">$${formatNum(d.vt)}</td>
                <td style="text-align:right;${d.desc > 0 ? 'color:#3A8C3E;font-weight:600' : ''}">${d.desc > 0 ? '-$' + formatNum(d.desc) : '—'}</td>
                <td style="text-align:right">${d.prop > 0 ? '$' + formatNum(d.prop) : '—'}</td>
                <td style="text-align:right;font-weight:600">$${formatNum(d.tot)}</td>
              </tr>`
          }).join('')}
          <tr style="border-top:2px solid var(--color-primary)">
            <td style="padding-top:12px"><strong style="font-size:15px;color:var(--color-primary)">TOTAL</strong></td>
            <td style="text-align:right;padding-top:12px"><strong>${ventasDia.length}</strong></td>
            <td style="text-align:right;padding-top:12px"><strong>$${formatNum(ventaNetaTotal)}</strong></td>
            <td style="text-align:right;padding-top:12px"><strong style="color:#3A8C3E">${montoDescTotal > 0 ? '-$' + formatNum(montoDescTotal) : '—'}</strong></td>
            <td style="text-align:right;padding-top:12px"><strong>${propinaTotal > 0 ? '$' + formatNum(propinaTotal) : '—'}</strong></td>
            <td style="text-align:right;padding-top:12px"><strong style="font-size:16px;color:var(--color-primary)">$${formatNum(totalGeneral)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p style="text-align:right;font-size:13px;color:var(--color-text-muted);margin:0 0 14px">
      Ticket promedio: <strong style="color:var(--color-text)">$${formatNum(ventasDia.length ? ventaNetaTotal / ventasDia.length : 0)}</strong>
    </p>

    <div style="overflow-x:auto">
      <table class="tabla">
        <thead>
          <tr>
            <th style="width:20px"></th>
            <th>Folio</th>
            <th>Método</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Descuento</th>
            <th style="text-align:right">Propina</th>
            <th>Hora</th>
          </tr>
        </thead>
        <tbody>
          ${ventasDia.map(v => {
            const items     = itemsPorVenta[v.id] || []
            const hasItems  = items.length > 0
            const pct       = Number(v.descuento_porcentaje) || 0
            const sub       = Number(v.subtotal) || 0
            const descMonto = pct > 0 ? Math.round(sub * pct) / 100 : 0
            const descCell  = pct > 0
              ? `<span style="color:#3A8C3E;font-weight:600">-$${formatNum(descMonto)}</span><br>
                 <span style="font-size:11px;color:var(--color-text-muted)">${pct}%</span>`
              : '—'
            return `
            <tr style="cursor:${hasItems ? 'pointer' : 'default'}"
              onclick="${hasItems ? `toggleItemsCierre('vtitems-${v.id}')` : ''}">
              <td style="color:var(--color-text-muted);font-size:12px">${hasItems ? '▶' : ''}</td>
              <td>${v.folio || '—'}</td>
              <td>${metodoDisplay(v)}</td>
              <td style="text-align:right;font-weight:600">$${formatNum(v.total)}</td>
              <td style="text-align:right">${descCell}</td>
              <td style="text-align:right">${v.propina ? '$' + formatNum(v.propina) : '—'}</td>
              <td style="color:var(--color-text-muted)">${fmtHora(v.created_at)}</td>
            </tr>
            ${hasItems
              ? `<tr id="vtitems-${v.id}" style="display:none">
                   <td colspan="7" style="padding:8px 12px 12px 32px;background:var(--color-secondary)">
                     ${fmtItemsVenta(items, v)}
                   </td>
                 </tr>`
              : ''}`
          }).join('')}
        </tbody>
      </table>
    </div>
  `
  resultado.innerHTML = html

  if (['superadmin','admin','gerente'].includes(window._rol)) {
    document.getElementById('cierre-cerrar-btn').style.display = ''
  }
}

async function confirmarCierreDia(fecha, tenantId) {
  if (!window.confirm(`¿Cerrar el día ${fecha}? Las ventas de hoy se archivarán y la vista de Ventas quedará vacía para el siguiente día. Esta acción cambia el estatus de las ventas, no las elimina.`)) return

  const ventasDia = window._cierreVentas || []
  if (!ventasDia.length) return

  const totalGeneral = ventasDia.reduce((s, v) => s + Number(v.total), 0)
  const porMetodo = calcularDesglosePorMetodo(ventasDia)

  const propina_total = ventasDia.reduce((s, v) => s + (Number(v.propina) || 0), 0)
  const desglose_propina = ventasDia.reduce((acc, v) => {
    const p = Number(v.propina) || 0
    if (!p) return acc
    const metodo = v.metodo_pago || 'otro'
    if (!acc[metodo]) acc[metodo] = { suma: 0, count: 0 }
    acc[metodo].suma  += p
    acc[metodo].count += 1
    return acc
  }, {})

  const { data: cierre, error: errC } = await window._db
    .from('cierres_caja')
    .insert({
      tenant_id: tenantId,
      fecha,
      total_general: totalGeneral,
      num_tickets: ventasDia.length,
      desglose_metodo: porMetodo,
      propina_total,
      desglose_propina,
      cerrado_por: window._email || null
    })
    .select().single()

  if (errC) { alert(`Error al crear cierre: ${errC.message}`); return }

  const { error: errU } = await window._db
    .from('ventas')
    .update({ id_cierre: cierre.id })
    .eq('tenant_id', tenantId)
    .eq('estado', 'cerrada')
    .is('id_cierre', null)
    .gte('created_at', rangoDiaMexico(fecha).inicio)
    .lt('created_at', rangoDiaMexico(fecha).fin)

  if (errU) { alert(`Error al archivar ventas: ${errU.message}`); return }

  alert('Día cerrado correctamente.')
  document.getElementById('cierre-panel')?.remove()
  await vistaVentas()
}

async function eliminarVenta(id, folio, tenantId) {
  if (!window.confirm(`¿Eliminar orden ${folio}? Esta acción no se puede deshacer.`)) return

  const SUPA_URL = window._db.supabaseUrl
  const SUPA_KEY = window._db.supabaseKey

  async function supaDelete(table, filters) {
    const params = new URLSearchParams(filters)
    const res = await fetch(
      `${SUPA_URL}/rest/v1/${table}?${params}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
  }

  try {
    const { data: ordenes } = await window._db
      .from('ordenes_cocina')
      .select('id')
      .eq('id_venta', id)
      .eq('tenant_id', tenantId)

    const idsOrdenes = (ordenes || []).map(o => o.id)
    if (idsOrdenes.length > 0) {
      await supaDelete('orden_items_estado', {
        id_orden_cocina: 'in.(' + idsOrdenes.join(',') + ')',
        tenant_id: 'eq.' + tenantId
      })
    }

    await supaDelete('ordenes_cocina', { id_venta: 'eq.' + id, tenant_id: 'eq.' + tenantId })
    await supaDelete('venta_items',    { id_venta: 'eq.' + id, tenant_id: 'eq.' + tenantId })
    await supaDelete('ventas',         { id:       'eq.' + id, tenant_id: 'eq.' + tenantId })
    const card = document.getElementById('venta-' + id)
    if (card) card.remove()
  } catch(err) {
    alert('Error al eliminar: ' + err.message)
  }
}
