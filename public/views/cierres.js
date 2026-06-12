async function vistaCierres() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando cierres...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: cierres, error } = await window._db
      .from('cierres_caja')
      .select('id, fecha, total_general, num_tickets, desglose_metodo, cerrado_por, created_at')
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
              <th>Cerrado por</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${cierres.map(c => `
              <tr>
                <td>${c.fecha}</td>
                <td style="text-align:right">${c.num_tickets}</td>
                <td style="text-align:right;font-weight:600">$${Number(c.total_general).toFixed(2)}</td>
                <td style="color:var(--color-text-muted)">${c.cerrado_por || '—'}</td>
                <td style="text-align:right">
                  <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                    onclick="verDetalleCierre('${c.id}','${c.fecha}')">Ver</button>
                </td>
              </tr>`).join('')}
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
    .select('folio, metodo_pago, total, created_at')
    .eq('tenant_id', tenant_id)
    .eq('id_cierre', id_cierre)
    .order('created_at')

  if (error) { wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${error.message}</p>`; return }

  const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const desglose = cierre?.desglose_metodo || {}

  window._cierreDetalleActual = { fecha, cierre, ventas: ventas || [] }

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
        <thead><tr><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th>Hora</th></tr></thead>
        <tbody>
          ${(ventas || []).map(v => `
            <tr><td>${v.folio || '—'}</td><td>${v.metodo_pago || '—'}</td><td style="text-align:right">$${Number(v.total).toFixed(2)}</td><td style="color:var(--color-text-muted)">${fmtHora(v.created_at)}</td></tr>`).join('')}
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
    <thead><tr><th>Folio</th><th>Método</th><th style="text-align:right">Total</th><th>Hora</th></tr></thead>
    <tbody>${(ventas||[]).map(v => `<tr><td>${v.folio||'—'}</td><td>${v.metodo_pago||'—'}</td><td style="text-align:right">$${Number(v.total).toFixed(2)}</td><td>${fmtHora(v.created_at)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}
