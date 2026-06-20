async function vistaCierres() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando cierres...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()

    const { data: cierres, error } = await window._db
      .from('cierres_caja')
      .select('id, fecha, total_general, num_tickets, desglose_metodo, propina_total, cerrado_por, created_at')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })

    if (error) throw error

    if (!cierres || !cierres.length) {
      content.innerHTML = `<div class="vista-header"><h2>Cierres</h2></div><p style="color:var(--color-text-muted)">No hay cierres registrados.</p>`
      return
    }

    content.innerHTML = `
      <div class="vista-header"><h2>Cierres</h2></div>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th style="text-align:right">Tickets</th>
              <th style="text-align:right">Total</th>
              <th style="text-align:right">Propina</th>
              <th style="text-align:right">Venta neta</th>
              <th>Cerrado por</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${cierres.map(c => {
              const prop = Number(c.propina_total) || 0
              const neta = Number(c.total_general) - prop
              const tprom = c.num_tickets ? neta / c.num_tickets : 0
              return `
              <tr>
                <td>${c.fecha}</td>
                <td style="text-align:right">${c.num_tickets}</td>
                <td style="text-align:right;font-weight:600">$${Number(c.total_general).toFixed(2)}</td>
                <td style="text-align:right">${prop ? '$' + prop.toFixed(2) : '—'}</td>
                <td style="text-align:right">$${neta.toFixed(2)}<br><span style="font-size:11px;color:var(--color-text-muted)">~$${tprom.toFixed(2)}/ticket</span></td>
                <td style="color:var(--color-text-muted)">${c.cerrado_por || '—'}</td>
                <td style="text-align:right">
                  <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                    onclick="verDetalleCierre('${c.id}','${c.fecha}')">Ver</button>
                </td>
              </tr>`}).join('')}
          </tbody>
        </table>
      </div>
      <div id="cierre-detalle-wrap"></div>
    `

    window._cierresData = cierres

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function verDetalleCierre(id_cierre, fecha) {
  const wrap = document.getElementById('cierre-detalle-wrap')
  wrap.innerHTML = `<p style="color:var(--color-text-muted);margin-top:16px">Cargando detalle...</p>`

  const tenant_id = await getTenantId()
  const cierre = (window._cierresData || []).find(c => c.id === id_cierre)

  const { data: ventas, error } = await window._db
    .from('ventas')
    .select('id, folio, metodo_pago, total, propina, created_at')
    .eq('tenant_id', tenant_id)
    .eq('id_cierre', id_cierre)
    .order('created_at')

  if (error) { wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`; return }

  const ids = (ventas || []).map(v => v.id)
  const itemsPorVenta = {}
  if (ids.length > 0) {
    const { data: items } = await window._db
      .from('venta_items')
      .select('id_venta, nombre, cantidad, importe, modificadores')
      .eq('tenant_id', tenant_id)
      .in('id_venta', ids)
    ;(items || []).forEach(it => {
      if (!itemsPorVenta[it.id_venta]) itemsPorVenta[it.id_venta] = []
      itemsPorVenta[it.id_venta].push(it)
    })
  }

  function fmtItemsCierre(items) {
    return items.map(it => {
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
  }

  const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const desglose = cierre?.desglose_metodo || {}

  window._cierreDetalleActual = { fecha, cierre, ventas: ventas || [] }
  window._cierreItemsPorVenta = itemsPorVenta
  window._fmtItemsCierre = fmtItemsCierre

  wrap.innerHTML = `
    <div class="receta-card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <h3 style="margin:0">Cierre — ${fecha}</h3>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="exportarCierrePDF()">Exportar PDF</button>
      </div>
      <table class="tabla" style="margin-bottom:14px">
        <thead><tr><th>Método de pago</th><th style="text-align:right">Tickets</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${Object.entries(desglose).map(([m, d]) => `
            <tr><td>${m}</td><td style="text-align:right">${d.count}</td><td style="text-align:right;font-weight:600">$${Number(d.suma).toFixed(2)}</td></tr>`).join('')}
          <tr class="costeo-total">
            <td><strong>TOTAL</strong></td>
            <td style="text-align:right"><strong>${cierre?.num_tickets || 0} tickets</strong></td>
            <td style="text-align:right"><strong>$${Number(cierre?.total_general || 0).toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      <table class="tabla">
        <thead><tr><th></th><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th style="text-align:right">Propina</th><th>Hora</th></tr></thead>
        <tbody>
          ${(ventas || []).map(v => {
            const items = itemsPorVenta[v.id] || []
            const hasItems = items.length > 0
            return `
            <tr style="cursor:${hasItems ? 'pointer' : 'default'}" onclick="${hasItems ? `toggleItemsCierre('items-${v.id}')` : ''}">
              <td style="color:var(--color-text-muted);font-size:12px;width:20px">${hasItems ? '▶' : ''}</td>
              <td>${v.folio || '—'}</td>
              <td>${v.metodo_pago || '—'}</td>
              <td style="text-align:right">$${Number(v.total).toFixed(2)}</td>
              <td style="text-align:right">${v.propina ? '$' + Number(v.propina).toFixed(2) : '—'}</td>
              <td style="color:var(--color-text-muted)">${fmtHora(v.created_at)}</td>
            </tr>
            ${hasItems ? `<tr id="items-${v.id}" style="display:none"><td colspan="6" style="padding:8px 12px 12px 32px;background:var(--color-bg-alt,rgba(0,0,0,0.03))">${fmtItemsCierre(items)}</td></tr>` : ''}`
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function exportarCierrePDF() {
  const { fecha, cierre, ventas } = window._cierreDetalleActual || {}
  if (!cierre) return
  const desglose = cierre.desglose_metodo || {}
  const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cierre ${fecha}</title>
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
    <div><h1>Cierre de caja — Furia</h1><small>Fecha: ${fecha}</small></div>
    <div style="font-size:11px;color:#9B7B6A">${cierre.num_tickets} tickets</div>
  </div>
  <table>
    <thead><tr><th>Método de pago</th><th style="text-align:right">Tickets</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      ${Object.entries(desglose).map(([m, d]) => `<tr><td>${m}</td><td style="text-align:right">${d.count}</td><td style="text-align:right">$${Number(d.suma).toFixed(2)}</td></tr>`).join('')}
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${cierre.num_tickets}</td><td style="text-align:right;color:#C8892A">$${Number(cierre.total_general).toFixed(2)}</td></tr>
    </tbody>
  </table>
  <table>
    <thead><tr><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th style="text-align:right">Propina</th><th>Hora</th></tr></thead>
    <tbody>${(ventas||[]).map(v => `<tr><td>${v.folio||'—'}</td><td>${v.metodo_pago||'—'}</td><td style="text-align:right">$${Number(v.total).toFixed(2)}</td><td style="text-align:right">${v.propina ? '$' + Number(v.propina).toFixed(2) : '—'}</td><td>${fmtHora(v.created_at)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function toggleItemsCierre(rowId) {
  const row = document.getElementById(rowId)
  if (!row) return
  const visible = row.style.display !== 'none'
  row.style.display = visible ? 'none' : 'table-row'
  const trigger = row.previousElementSibling
  if (trigger) {
    const arrow = trigger.querySelector('td:first-child')
    if (arrow) arrow.textContent = visible ? '▶' : '▼'
  }
}
