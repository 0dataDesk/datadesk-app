async function vistaVentas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando ventas...</p>`
  const tenant_id = await getTenantId()
  await renderVentas(content, tenant_id)
}

async function renderVentas(container, tenantId) {
  const { data: ventas, error } = await window._db
    .from('ventas')
    .select('id, folio, created_at, total, estado, tipo_entrega, cliente_nombre, metodo_pago')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) { container.innerHTML = `<p>Error: ${error.message}</p>`; return }

  const ids = (ventas || []).map(v => v.id)
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

  let html = `
    <div class="vista-header">
      <h2>Ventas</h2>
      <button class="btn-accion btn-aprobar" onclick="vistaVentas()">↺ Recargar</button>
    </div>
  `

  if (!ventas || ventas.length === 0) {
    html += `<p style="color:var(--color-text-muted)">No hay ventas registradas.</p>`
    container.innerHTML = html
    return
  }

  ventas.forEach(v => {
    const badge    = estadoBadge[v.estado] || ''
    const items    = itemsPorVenta[v.id] || []
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

    html += `
      <div class="receta-card" id="venta-${v.id}" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="font-size:15px">${v.folio || v.id}</strong>
            <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px">${fmtFecha(v.created_at)}</span>
            <span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-left:8px;${badge}">${v.estado}</span>
          </div>
          <button class="btn-accion" style="background:rgba(184,92,42,0.1);color:#B85C2A;border:1px solid rgba(184,92,42,0.2);font-size:12px;padding:4px 12px"
            onclick="eliminarVenta('${v.id}','${(v.folio || v.id).replace(/'/g,"\\'")}','${tenantId}')">🗑 Eliminar</button>
        </div>
        <div style="font-size:13px;color:var(--color-text-muted);margin-top:6px">
          ${v.tipo_entrega || '—'} · ${v.cliente_nombre || '—'} · ${v.metodo_pago || '—'}
        </div>
        <div style="margin-top:10px;border-top:1px solid var(--color-border);padding-top:8px">
          ${itemsHtml || '<span style="font-size:12px;color:var(--color-text-muted)">Sin ítems</span>'}
        </div>
        <div style="text-align:right;margin-top:8px;font-size:18px;font-weight:700;color:var(--color-primary)">
          $${v.total}
        </div>
      </div>
    `
  })

  container.innerHTML = html
}

async function eliminarVenta(id, folio, tenantId) {
  if (!window.confirm(`¿Eliminar orden ${folio}? Esta acción no se puede deshacer.`)) return

  const { error: e1 } = await window._db
    .from('ordenes_cocina')
    .delete()
    .eq('id_venta', id)
    .eq('tenant_id', tenantId)
  if (e1) { alert('Error al eliminar orden de cocina: ' + e1.message); return }

  const { error: e2 } = await window._db
    .from('venta_items')
    .delete()
    .eq('id_venta', id)
    .eq('tenant_id', tenantId)
  if (e2) { alert('Error al eliminar ítems: ' + e2.message); return }

  const { error: e3 } = await window._db
    .from('ventas')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (e3) { alert('Error al eliminar venta: ' + e3.message); return }

  const card = document.getElementById('venta-' + id)
  if (card) card.remove()
}