async function vistaPedidoDetalle(id_pedido) {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando pedido...</p>`
  const tenant_id = await getTenantId()

  const { data: pedido } = await window._db
    .from('pedidos')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('id_pedido', id_pedido)
    .single()

  const { data: items } = await window._db
    .from('pedido_items')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('id_pedido', id_pedido)
    .order('created_at')

  const { data: proveedores } = await window._db
    .from('proveedores')
    .select('id_proveedor, nombre, telefono, email, contacto, dias_entrega')
    .eq('tenant_id', tenant_id)

  const prov       = proveedores?.find(p => p.id_proveedor === pedido.id_proveedor)
  const nombreProv = prov?.nombre || pedido.id_proveedor

  const puedeRecibir = pedido.status === 'enviado'

  const statusOpciones = ['borrador', 'enviado', 'recibido', 'cancelado']
    .map(s => `<option value="${s}"${pedido.status === s ? ' selected' : ''}>${s}</option>`).join('')

  let totalCotizado = 0
  let totalFinal    = 0

  const filas = (items || []).map(item => {
    const sub = (item.cantidad_pedida || 0) * (item.precio_cotizado || 0)
    totalCotizado += sub
    const subFinal = (item.cantidad_recibida || item.cantidad_pedida || 0) * (item.precio_final || item.precio_cotizado || 0)
    totalFinal += subFinal

    const diff = item.diferencia_precio != null
      ? `<span style="color:${item.diferencia_precio > 0 ? '#B85C2A' : '#3A8C3E'}">${item.diferencia_precio > 0 ? '+' : ''}$${Number(item.diferencia_precio).toFixed(2)}</span>`
      : '—'

    return `
      <tr>
        <td>${item.nombre_proveedor_producto}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${item.codigo_proveedor || '—'}</td>
        <td style="text-align:right">${item.cantidad_pedida} ${item.unidad_pedida}</td>
        <td style="text-align:right">${item.precio_cotizado != null ? '$' + Number(item.precio_cotizado).toFixed(2) : '—'}</td>
        <td style="text-align:right">
          ${puedeRecibir
            ? `<input type="number" value="${item.cantidad_recibida || ''}" min="0" step="0.01"
                class="edit-input edit-num" style="text-align:right"
                onchange="actualizarItem('${item.id}', 'cantidad_recibida', this.value)">`
            : (item.cantidad_recibida || '—')
          }
        </td>
        <td style="text-align:right">
          ${puedeRecibir
            ? `<input type="number" value="${item.precio_final || ''}" min="0" step="0.01"
                class="edit-input edit-num" style="text-align:right"
                onchange="actualizarItem('${item.id}', 'precio_final', this.value)">`
            : (item.precio_final != null ? '$' + Number(item.precio_final).toFixed(2) : '—')
          }
        </td>
        <td style="text-align:right">${diff}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${item.notas || ''}</td>
      </tr>
    `
  }).join('')

  content.innerHTML = `
    <div class="vista-header">
      <h2>${id_pedido}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="filtro-select" style="font-size:12px"
          onchange="cambiarStatusPedido('${id_pedido}', this.value)">${statusOpciones}</select>
        <button class="btn-accion btn-aprobar" onclick="exportarPedidoPDF('${id_pedido}')">Exportar PDF</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="vistaPedidos()">← Volver</button>
      </div>
    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;font-size:13px;color:var(--color-text-muted)">
      <span><strong>Proveedor:</strong> ${nombreProv}</span>
      <span><strong>Fecha:</strong> ${pedido.fecha_pedido}</span>
      <span><strong>Entrega esperada:</strong> ${pedido.fecha_entrega_esperada || '—'}</span>
      ${pedido.notas ? `<span><strong>Notas:</strong> ${pedido.notas}</span>` : ''}
    </div>

    <div class="tabla-wrapper">
      <table class="tabla">
        <thead>
          <tr>
            <th>Insumo</th>
            <th>Código</th>
            <th style="text-align:right">Cant. pedida</th>
            <th style="text-align:right">$ cotizado</th>
            <th style="text-align:right">Cant. recibida</th>
            <th style="text-align:right">$ final</th>
            <th style="text-align:right">Diferencia</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;font-weight:600;padding:12px 16px;border-top:2px solid var(--color-border)">TOTAL</td>
            <td style="text-align:right;font-weight:700;color:var(--color-primary);padding:12px 16px;border-top:2px solid var(--color-border)">
              $${totalCotizado.toFixed(2)}
            </td>
            <td colspan="2" style="text-align:right;font-weight:700;color:var(--color-primary);padding:12px 16px;border-top:2px solid var(--color-border)">
              ${totalFinal > 0 ? '$' + totalFinal.toFixed(2) : '—'}
            </td>
            <td colspan="2" style="padding:12px 16px;border-top:2px solid var(--color-border)"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `
  window._pedidoActualId = id_pedido
}

async function actualizarItem(itemId, campo, valor) {
  const tenant_id = await getTenantId()
  const update = {}
  update[campo] = parseFloat(valor) || null
  await window._db.from('pedido_items').update(update).eq('id', itemId).eq('tenant_id', tenant_id)
}

async function cambiarStatusPedido(id_pedido, nuevoStatus) {
  const tenant_id = await getTenantId()
  await window._db.from('pedidos')
    .update({ status: nuevoStatus, updated_by: window._email || null })
    .eq('id_pedido', id_pedido)
    .eq('tenant_id', tenant_id)
  await vistaPedidoDetalle(id_pedido)
}

async function exportarPedidoPDF(id_pedido) {
  const tenant_id = await getTenantId()

  const [
    { data: pedido },
    { data: items },
    { data: proveedores },
    { data: tenantData }
  ] = await Promise.all([
    window._db.from('pedidos').select('*').eq('tenant_id', tenant_id).eq('id_pedido', id_pedido).single(),
    window._db.from('pedido_items').select('*').eq('tenant_id', tenant_id).eq('id_pedido', id_pedido).order('created_at'),
    window._db.from('proveedores').select('id_proveedor, nombre, telefono, email, contacto').eq('tenant_id', tenant_id),
    window._db.from('tenants').select('nombre, tagline').eq('tenant_id', tenant_id).single()
  ])

  const prov = proveedores?.find(p => p.id_proveedor === pedido.id_proveedor)

  let total = 0
  const filasHtml = (items || []).map(item => {
    const sub = (item.cantidad_pedida || 0) * (item.precio_cotizado || 0)
    total += sub
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.nombre_proveedor_producto}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;font-size:12px">${item.codigo_proveedor || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.cantidad_pedida}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.unidad_pedida}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.precio_cotizado != null ? '$' + Number(item.precio_cotizado).toFixed(2) : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${sub > 0 ? '$' + sub.toFixed(2) : '—'}</td>
      </tr>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pedido ${id_pedido}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #2B1A0F; margin: 0; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #C8892A; padding-bottom: 20px; }
    .brand { font-size: 28px; font-weight: 700; color: #2B1A0F; }
    .brand small { display: block; font-size: 10px; color: #9B7B6A; letter-spacing: 2px; text-transform: uppercase; font-weight: 400; margin-top: 2px; }
    .pedido-id { font-size: 20px; font-weight: 700; color: #C8892A; }
    .pedido-meta { color: #9B7B6A; font-size: 12px; margin-top: 4px; }
    .seccion { display: flex; gap: 40px; margin-bottom: 28px; }
    .seccion-bloque { flex: 1; }
    .seccion-bloque strong { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9B7B6A; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #FAF7F2; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9B7B6A; border-bottom: 2px solid #E8DDD5; }
    thead th:nth-child(n+3) { text-align: right; }
    .total-row td { padding: 12px; border-top: 2px solid #C8892A; font-weight: 700; font-size: 15px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E8DDD5; font-size: 11px; color: #9B7B6A; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${tenantData?.nombre || tenant_id}
      <small>${tenantData?.tagline || ''}</small>
    </div>
    <div style="text-align:right">
      <div class="pedido-id">${id_pedido}</div>
      <div class="pedido-meta">Fecha: ${pedido.fecha_pedido}</div>
      ${pedido.fecha_entrega_esperada ? `<div class="pedido-meta">Entrega esperada: ${pedido.fecha_entrega_esperada}</div>` : ''}
      <div class="pedido-meta">Status: ${pedido.status}</div>
    </div>
  </div>

  <div class="seccion">
    <div class="seccion-bloque">
      <strong>Proveedor</strong>
      <div style="font-size:15px;font-weight:600">${prov?.nombre || pedido.id_proveedor}</div>
      ${prov?.contacto ? `<div>${prov.contacto}</div>` : ''}
      ${prov?.telefono ? `<div>${prov.telefono}</div>` : ''}
      ${prov?.email    ? `<div>${prov.email}</div>`    : ''}
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--color-text-muted)">Días de entrega:</span>
        <span id="prov-dias-entrega-txt" style="font-size:12px;font-weight:600">${prov?.dias_entrega || '—'}</span>
        <button onclick="editarDiasEntrega('${prov?.id_proveedor||pedido.id_proveedor}','${(prov?.dias_entrega||'').replace(/'/g,"\\'")}')"
          style="font-size:11px;padding:2px 8px;border:1px solid var(--color-border);border-radius:6px;background:transparent;cursor:pointer;color:var(--color-text-muted)">
          ✏ Editar
        </button>
      </div>
    </div>
    ${pedido.notas ? `<div class="seccion-bloque"><strong>Notas</strong><div>${pedido.notas}</div></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Insumo</th>
        <th>Código proveedor</th>
        <th>Cantidad</th>
        <th>Unidad</th>
        <th>Precio unit.</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>${filasHtml}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4"></td>
        <td style="text-align:right">TOTAL ESTIMADO</td>
        <td style="text-align:right;color:#C8892A">$${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}
  </div>
</body>
</html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

window.editarDiasEntrega = async function(idProveedor, valorActual) {
  const nuevo = prompt('Días de entrega del proveedor\n(ej: lunes, miércoles, viernes)', valorActual || '')
  if (nuevo === null) return
  const tenant_id = await getTenantId()
  const { error } = await window._db.from('proveedores')
    .update({ dias_entrega: nuevo.trim() || null, updated_at: new Date().toISOString() })
    .eq('id_proveedor', idProveedor)
    .eq('tenant_id', tenant_id)
  if (error) { alert('Error: ' + error.message); return }
  const el = document.getElementById('prov-dias-entrega-txt')
  if (el) el.textContent = nuevo.trim() || '—'
}
