async function vistaVentas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando ventas...</p>`
  const tenant_id = await getTenantId()
  await renderVentas(content, tenant_id)
}

async function renderVentas(container, tenantId) {
  const { data: ventas, error } = await window._db
    .from('ventas')
    .select('id, folio, created_at, total, subtotal, estado, tipo_entrega, cliente_nombre, metodo_pago, propina, descuento_porcentaje, monto_efectivo, monto_tarjeta')
    .eq('tenant_id', tenantId)
    .is('id_cierre', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) { container.innerHTML = `<p>Error: ${error.message}</p>`; return }

  const ids = (ventas || []).map(v => v.id)
  const itemsPorVenta = {}
  let todosItems = []
  if (ids.length > 0) {
    const { data: items } = await window._db
      .from('venta_items')
      .select('id_venta, nombre, cantidad, importe, modificadores')
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

  let html = `
    <div class="vista-header">
      <h2>🧾 Ventas</h2>
      ${mostrarCierre ? `<button class="btn-accion" onclick="mostrarCierreCaja('${tenantId}')">Cierre de caja</button>` : ''}
    </div>
  `

  if (!ventas || ventas.length === 0) {
    html += `<p style="color:var(--color-text-muted)">No hay ventas registradas.</p>`
    container.innerHTML = html
    return
  }

  // — Métricas del día —
  const propinaDia = (ventas || []).reduce((s, v) => s + Number(v.propina || 0), 0)
  const descuentoDia = (ventas || []).reduce((s, v) => {
    const sub = Number(v.subtotal) || 0
    const pct = Number(v.descuento_porcentaje) || 0
    return s + (pct > 0 ? Math.round(sub * pct) / 100 : 0)
  }, 0)
  const totalDia = (ventas || []).reduce((s, v) => s + Number(v.total || 0), 0) - propinaDia
  const ticketProm = ventas.length ? totalDia / ventas.length : 0

  html += `
    <div class="receta-card" style="margin-bottom:18px">
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
  `

  // — Lista acordeón —
  let listaHtml = ''
  ventas.forEach(v => {
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
      return `<div style="padding:3px 0;font-size:13px">${it.nombre} ×${it.cantidad} — <strong>$${it.importe}</strong>${modsText}</div>`
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
      <div id="venta-${v.id}" style="border-bottom:2px solid var(--color-border);padding:12px 0;cursor:pointer"
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
          <span style="margin-left:auto;font-size:16px;font-weight:700;color:var(--color-primary)">$${v.total}</span>
          <span class="venta-chevron" style="font-size:11px;color:var(--color-text-muted);min-width:12px">▼</span>
        </div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">
          ${v.tipo_entrega || '—'} · ${v.metodo_pago || '—'}
        </div>
        ${panelHtml}
      </div>
    `
  })

  html += `<div id="lista-ventas-wrap">${listaHtml}</div>`
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
    if (m === 'mixto' || m === 'dividido' || (Number(v.monto_efectivo) > 0 && Number(v.monto_tarjeta) > 0)) {
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
    return
  }

  const hoy = new Date().toISOString().split('T')[0]
  const container = document.getElementById('content')
  const header = container.querySelector('.vista-header')
  const panelDiv = document.createElement('div')
  panelDiv.id = 'cierre-panel'
  panelDiv.className = 'receta-card'
  panelDiv.style.marginBottom = '18px'
  panelDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <strong style="font-size:15px">Cierre de caja</strong>
      <input type="date" id="cierre-fecha" value="${hoy}" style="border:1px solid var(--color-border);background:var(--color-bg-card);color:var(--color-text);border-radius:6px;padding:4px 10px">
      <button class="btn-accion btn-aprobar" id="cierre-export-btn" style="display:none"
        onclick="exportarCierreExcel(document.getElementById('cierre-fecha').value, window._cierreVentas)">Exportar Excel</button>
      <button class="btn-accion" id="cierre-pdf-btn" style="display:none;border:1px solid var(--color-border)"
        onclick="exportarVentasPDF()">Exportar PDF</button>
      <button class="btn-accion" id="cierre-cerrar-btn" style="display:none;background:var(--color-primary);color:#fff;border:none"
        onclick="confirmarCierreDia(document.getElementById('cierre-fecha').value, '${tenantId}')">Cerrar día</button>
    </div>
    <div id="cierre-resultado"></div>
  `
  if (header && header.nextSibling) {
    container.insertBefore(panelDiv, header.nextSibling)
  } else {
    container.appendChild(panelDiv)
  }

  if (listaWrap) listaWrap.style.display = 'none'

  const cargarCierre = async (fecha) => {
    const resultado = document.getElementById('cierre-resultado')
    resultado.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`
    document.getElementById('cierre-export-btn').style.display = 'none'
    document.getElementById('cierre-pdf-btn').style.display = 'none'
    document.getElementById('cierre-cerrar-btn').style.display = 'none'

    const { data: ventasDia, error } = await window._db
      .from('ventas')
      .select('folio, metodo_pago, total, monto_efectivo, monto_tarjeta, propina, subtotal, descuento_porcentaje, estado, created_at, pagos_detalle')
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
    window._cierreFecha  = fecha

    const totalGeneral = ventasDia.reduce((s, v) => s + Number(v.total), 0)
    const porMetodo = calcularDesglosePorMetodo(ventasDia)
    window._cierrePorMetodo = porMetodo

    const propinaPorMetodo = ventasDia.reduce((acc, v) => {
      const p = Number(v.propina) || 0
      if (!p) return acc
      const m = v.metodo_pago || 'otro'
      if (!acc[m]) acc[m] = 0
      acc[m] += p
      return acc
    }, {})
    const propinaTotalVista = ventasDia.reduce((s, v) => s + (Number(v.propina) || 0), 0)
    const ventaNetaTotal = totalGeneral - propinaTotalVista
    const ticketPromedio = ventasDia.length ? ventaNetaTotal / ventasDia.length : 0

    const ventasConDesc = ventasDia.filter(v => v.descuento_porcentaje > 0)
    const montoDescontado = ventasConDesc.reduce((s, v) => {
      const sub = Number(v.subtotal) || 0
      const pct = Number(v.descuento_porcentaje) || 0
      return s + Math.round(sub * pct) / 100
    }, 0)
    const subtotalBruto = ventasConDesc.reduce((s, v) => s + (Number(v.subtotal) || 0), 0)

    const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

    const html = `
      <table class="tabla" style="margin-bottom:8px">
        <thead><tr><th>Método de pago</th><th style="text-align:right">Tickets</th><th style="text-align:right">Total</th><th style="text-align:right">Propina</th><th style="text-align:right">Venta neta</th></tr></thead>
        <tbody>
          ${Object.entries(porMetodo).map(([m, d]) => {
            const prop = propinaPorMetodo[m] || 0
            return `<tr>
              <td>${m}</td>
              <td style="text-align:right">${d.count}</td>
              <td style="text-align:right;font-weight:600">$${formatNum(d.suma)}</td>
              <td style="text-align:right">${prop ? '$' + formatNum(prop) : '—'}</td>
              <td style="text-align:right">$${formatNum(d.suma - prop)}</td>
            </tr>`}).join('')}
          ${ventasConDesc.length > 0 ? `
          <tr style="border-top:1px solid var(--color-border);background:rgba(76,153,80,0.06)">
            <td style="padding:10px 16px;color:#3A8C3E;font-weight:600">🏷 Descuentos</td>
            <td style="text-align:right;padding:10px 16px;color:#3A8C3E">${ventasConDesc.length}</td>
            <td style="text-align:right;padding:10px 16px;color:#3A8C3E;font-weight:600">-$${formatNum(montoDescontado)}</td>
            <td style="text-align:right;padding:10px 16px;color:var(--color-text-muted);font-size:12px" colspan="2">s. bruto $${formatNum(subtotalBruto)}</td>
          </tr>` : ''}
          <tr style="border-top:2px solid var(--color-primary);font-size:15px;background:var(--color-bg)">
            <td style="padding:14px 16px"><strong style="font-size:20px;color:var(--color-primary)">TOTAL</strong></td>
            <td style="text-align:right;padding:14px 16px"><strong style="font-size:20px;color:var(--color-primary)">${ventasDia.length} tickets</strong></td>
            <td style="text-align:right;padding:14px 16px"><strong style="font-size:20px;color:var(--color-primary)">$${formatNum(totalGeneral)}</strong></td>
            <td style="text-align:right;padding:14px 16px"><strong style="font-size:20px;color:var(--color-primary)">${propinaTotalVista ? '$' + formatNum(propinaTotalVista) : '—'}</strong></td>
            <td style="text-align:right;padding:14px 16px"><strong style="font-size:20px;color:var(--color-primary)">$${formatNum(ventaNetaTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p style="text-align:right;font-size:13px;color:var(--color-text-muted);margin:0 0 14px">
        Ticket promedio: <strong style="color:var(--color-text)">$${formatNum(ticketPromedio)}</strong>
      </p>
      <table class="tabla">
        <thead><tr><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th style="text-align:right">Propina</th><th>Hora</th></tr></thead>
        <tbody>
          ${ventasDia.map(v => `
            <tr>
              <td>${v.folio || '—'}</td>
              <td>${metodoDisplay(v)}</td>
              <td style="text-align:right">$${formatNum(v.total)}${v.descuento_porcentaje > 0 ? ` <span style="font-size:11px;color:#3A8C3E;font-weight:600">-${v.descuento_porcentaje}%</span>` : ''}</td>
              <td style="text-align:right">${v.propina ? '$' + formatNum(v.propina) : '—'}</td>
              <td style="color:var(--color-text-muted)">${fmtHora(v.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    `
    resultado.innerHTML = html
    document.getElementById('cierre-export-btn').style.display = ''
    document.getElementById('cierre-pdf-btn').style.display = ''
    if (['superadmin','admin','gerente'].includes(window._rol)) {
      document.getElementById('cierre-cerrar-btn').style.display = ''
    }
  }

  document.getElementById('cierre-fecha').addEventListener('change', e => cargarCierre(e.target.value))
  await cargarCierre(hoy)
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

function exportarVentasPDF() {
  const fecha     = window._cierreFecha || '—'
  const ventas    = window._cierreVentas || []
  const porMetodo = window._cierrePorMetodo || {}
  const total     = ventas.reduce((s, v) => s + Number(v.total), 0)
  const fmtHora   = iso => new Date(iso).toLocaleTimeString('es-MX')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ventas ${fecha}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #2B1A0F; margin: 0; padding: 40px; background: #FAF7F2; }
  .header { border-bottom: 3px solid #C8892A; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 22px; margin: 0; }
  .header small { color: #9B7B6A; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #fff; }
  thead th { padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #9B7B6A; border-bottom: 2px solid #E8DDD5; }
  td { padding: 8px 12px; border-bottom: 1px solid #E8DDD5; }
  .total-row td { border-top: 2px solid #C8892A; font-weight: 700; }
  .footer { margin-top: 30px; font-size: 11px; color: #9B7B6A; text-align: center; }
</style></head><body>
  <div class="header">
    <div><h1>Resumen de Ventas — Furia</h1><small>Fecha: ${fecha}</small></div>
    <div style="font-size:11px;color:#9B7B6A">${ventas.length} tickets</div>
  </div>
  <table>
    <thead><tr><th>Método de pago</th><th style="text-align:right">Tickets</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      ${Object.entries(porMetodo).map(([m, d]) => `<tr><td>${m}</td><td style="text-align:right">${d.count}</td><td style="text-align:right">$${formatNum(d.suma)}</td></tr>`).join('')}
      ${(() => {
        const desc = ventas.filter(v => v.descuento_porcentaje > 0)
        if (!desc.length) return ''
        const monto = desc.reduce((s, v) => s + Math.round((Number(v.subtotal)||0) * (Number(v.descuento_porcentaje)||0)) / 100, 0)
        return `<tr style="color:#3A8C3E"><td>🏷 Descuentos</td><td style="text-align:right">${desc.length}</td><td style="text-align:right">-$${formatNum(monto)}</td></tr>`
      })()}
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${ventas.length}</td><td style="text-align:right;color:#C8892A">$${formatNum(total)}</td></tr>
    </tbody>
  </table>
  <table>
    <thead><tr><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th style="text-align:right">Propina</th><th>Hora</th></tr></thead>
    <tbody>${ventas.map(v => `<tr><td>${v.folio||'—'}</td><td>${metodoDisplay(v)}</td><td style="text-align:right">$${formatNum(v.total)}${v.descuento_porcentaje > 0 ? ` <span style="color:#3A8C3E;font-size:10px">-${v.descuento_porcentaje}%</span>` : ''}</td><td style="text-align:right">${v.propina ? '$' + formatNum(v.propina) : '—'}</td><td>${fmtHora(v.created_at)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function exportarCierreExcel(fecha, ventasDia) {
  const filas = ventasDia.map(v => ({
    Folio: v.folio,
    'Método de pago': metodoDisplay(v),
    Total: Number(v.total),
    Hora: new Date(v.created_at).toLocaleTimeString('es-MX')
  }))
  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cierre')
  XLSX.writeFile(wb, `cierre_caja_${window._tenantActivo || 'tenant'}_${fecha}.xlsx`)
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
    await supaDelete('ordenes_cocina', { id_venta: 'eq.' + id, tenant_id: 'eq.' + tenantId })
    await supaDelete('venta_items',    { id_venta: 'eq.' + id, tenant_id: 'eq.' + tenantId })
    await supaDelete('ventas',         { id:       'eq.' + id, tenant_id: 'eq.' + tenantId })
    const card = document.getElementById('venta-' + id)
    if (card) card.remove()
  } catch(err) {
    alert('Error al eliminar: ' + err.message)
  }
}


