const SUG_GRUPO_META = {
  'Carnes y Proteínas': { orden: 1, emoji: '🥩', color: '#B85C2A' },
  'Lácteos y Quesos':   { orden: 2, emoji: '🧀', color: '#6A9BB5' },
  'Verduras y Frescos': { orden: 3, emoji: '🥬', color: '#4A7A3A' },
  'Despensa':           { orden: 4, emoji: '🥫', color: '#C8892A' },
  'Subrecetas':         { orden: 5, emoji: '⚗️', color: '#8A5FB0' },
  'Bebidas':            { orden: 6, emoji: '🥤', color: '#3D9BA8' },
  'Desechables':        { orden: 7, emoji: '🗑️', color: '#9B7B6A' }
}
const SUG_META_DEFAULT = { orden: 99, emoji: '📦', color: '#9B7B6A' }

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

    // Consumo teórico desde fechaBase hasta hoy (para el stock actual)
    const consumoAcum = {}
    const { data: consumosDesdeBase } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', fechaBase)
    ;(consumosDesdeBase || []).forEach(c => {
      consumoAcum[c.id_producto] = (consumoAcum[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    // Últimos 7 días para promedio diario — ventana INDEPENDIENTE de fechaBase.
    // (bug corregido: antes esta ventana quedaba atrapada dentro de consumosDesdeBase,
    // así que si el último conteo era reciente, el promedio se calculaba con 1-2 días
    // de datos en vez de 7 reales.)
    const hace7 = new Date(); hace7.setDate(hace7.getDate() - 7)
    const hace7str = hace7.toISOString().split('T')[0]
    const consumo7d = {}
    const { data: consumos7dData } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', hace7str)
    ;(consumos7dData || []).forEach(c => {
      consumo7d[c.id_producto] = (consumo7d[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    // Fecha del último consumo teórico generado (para avisar si está desfasado)
    const { data: ultimoConsumoGenRes } = await window._db
      .from('consumo_teorico')
      .select('fecha_venta')
      .eq('tenant_id', tenant_id)
      .order('fecha_venta', { ascending: false })
      .limit(1)
    const ultimoConsumoGen = ultimoConsumoGenRes?.[0]?.fecha_venta || null
    const hoyStr = new Date().toISOString().split('T')[0]
    const consumoDesfasado = ultimoConsumoGen && ultimoConsumoGen < fechaBase

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

    // Productos con datos de inventario — solo Insumo (las subrecetas se producen, no se compran)
    const { data: productos } = await window._db
      .from('productos')
      .select('id_producto, producto, unidad_medida, clasificacion_abc, grupo, stock_maximo, stock_alerta_porcentaje, dias_cobertura, id_proveedor_preferencial, ultimo_costo')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .eq('tipo', 'Insumo')
      .not('stock_maximo', 'is', null)

    // Proveedores con dias_entrega
    const { data: proveedores } = await window._db
      .from('proveedores')
      .select('id_proveedor, nombre, nombre_corto, dias_entrega')
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
        <div class="vista-header"><h2>🛒 Sugerido de Compra</h2></div>
        <p style="color:var(--color-text-muted)">No hay insumos con stock máximo configurado. Configura stock máximo en la sección "Control de Inventario" de cada insumo.</p>
      `
      return
    }

    // ── Cabecero ────────────────────────────────────────────────────────────
    const todosItems   = Object.values(porProveedor).flat()
    const totalSugerido = todosItems.reduce((s, i) => s + i.costoTotal, 0)
    const enAlertaCount  = todosItems.filter(i => i.enAlerta).length
    const provsConAlerta = claves.filter(k => porProveedor[k].some(x => x.enAlerta)).length

    const nombreDe = (key) => {
      const prov = provMap[key]
      return prov?.nombre_corto || prov?.nombre || (key === '__sin_proveedor__' ? 'Sin proveedor' : key)
    }
    const porProvTotales = claves
      .map(k => ({ key: k, total: porProveedor[k].reduce((s, i) => s + i.costoTotal, 0) }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)

    const cabeceroHtml = `
      <div class="card-surface" style="padding:20px;margin-bottom:18px">
        <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
          <div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Sugerido total</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:42px;line-height:1;color:var(--color-primary)">$${formatNum(totalSugerido)}</div>
          </div>
          <table style="border-collapse:collapse;background:var(--color-secondary);border-radius:8px;overflow:hidden">
            <tbody>
              <tr>
                <td style="padding:8px 16px 2px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted);white-space:nowrap">🔴 Insumos en alerta</td>
                <td style="padding:8px 16px 2px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--color-text-muted);white-space:nowrap">📋 Proveedores</td>
              </tr>
              <tr>
                <td style="padding:0 16px 8px;font-family:'Bebas Neue',sans-serif;font-size:24px;color:#B85C2A">${enAlertaCount}</td>
                <td style="padding:0 16px 8px;font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--color-text)">${provsConAlerta}/${claves.length}</td>
              </tr>
            </tbody>
          </table>
          ${porProvTotales.length ? `
          <div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted)">Mayor gasto sugerido</div>
            <div style="font-size:14px;margin-top:6px;line-height:1.3">
              <strong>${nombreDe(porProvTotales[0].key)}</strong><br>
              <span style="color:var(--color-text-muted);font-size:12px">$${formatNum(porProvTotales[0].total)}</span>
            </div>
          </div>` : ''}
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--color-text-muted)">
          Base: inventario del ${fechaBase} · Consumo promedio últimos 7 días
          ${consumoDesfasado ? `<br><span style="color:#B85C2A;font-weight:600">⚠ El consumo teórico no se ha generado desde ${ultimoConsumoGen} — las cantidades sugeridas pueden verse bajas o en cero hasta generarlo (vista Consumo).</span>` : ''}
        </div>
      </div>
    `

    let html = `
      <style>
        .sug-grupo.open .sug-grupo-body { display:block !important }
        .sug-grupo-header:hover { opacity:.85 }
        .sug-tabla-compacta { font-size:12px }
        .sug-tabla-compacta th { white-space:normal; line-height:1.2; font-size:10.5px; vertical-align:bottom; padding:6px 8px; }
        .sug-tabla-compacta td { padding:6px 8px; }
      </style>
      <div class="vista-header">
        <h2>🛒 Sugerido de Compra</h2>
      </div>
      ${cabeceroHtml}
      <div id="sugerido-pedido-wrap"></div>
    `

    claves.forEach(provKey => {
      const items = porProveedor[provKey]
      const nombre = nombreDe(provKey)
      const diasEntrega = provMap[provKey]?.dias_entrega || ''
      const totalCosto = items.reduce((s, i) => s + i.costoTotal, 0)
      const provId = `sug-prov-${provKey.replace(/[^a-zA-Z0-9]/g,'_')}`
      const abiertoDefault = provKey === claves[0]

      // Agrupar items por grupo
      const porGrupo = {}
      items.forEach(item => {
        const g = item.grupo || 'Sin grupo'
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(item)
      })
      // Orden de grupos por SUG_GRUPO_META, desconocidos al final
      const grupoKeys = Object.keys(porGrupo).sort((a, b) => {
        const ma = SUG_GRUPO_META[a] || SUG_META_DEFAULT
        const mb = SUG_GRUPO_META[b] || SUG_META_DEFAULT
        return ma.orden - mb.orden
      })

      const subAcordeonesHtml = grupoKeys.map(g => {
        const gItems = porGrupo[g]
        const meta = SUG_GRUPO_META[g] || SUG_META_DEFAULT
        const gId = `${provId}-g-${g.replace(/[^a-zA-Z0-9]/g,'_')}`
        const gAlertCount = gItems.filter(x => x.enAlerta).length
        const gAbierto = gAlertCount > 0

        return `
          <div class="sug-grupo" data-abierto="${gAbierto}"
            style="border:1px solid var(--color-border);border-left:4px solid ${meta.color};border-radius:8px;margin-bottom:8px;overflow:hidden">
            <div class="sug-grupo-header"
              style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;background:var(--color-surface);user-select:none"
              onclick="this.parentElement.classList.toggle('open')">
              <span style="font-size:13px;font-weight:600">${meta.emoji} ${g}</span>
              <span style="display:flex;gap:6px;align-items:center">
                ${gAlertCount ? `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(184,92,42,0.15);color:#B85C2A">🔴 ${gAlertCount}</span>` : ''}
                <span style="font-size:11px;color:var(--color-text-muted)">${gItems.length} insumo${gItems.length!==1?'s':''}</span>
              </span>
            </div>
            <div class="sug-grupo-body" style="display:none">
              <div style="overflow-x:auto">
                <table class="tabla sug-tabla-compacta" style="margin:0;border-radius:0;border-top:1px solid var(--color-border);table-layout:fixed;width:100%">
                  <thead>
                    <tr>
                      <th style="text-align:left;width:150px">Insumo</th>
                      <th style="text-align:right;width:72px">Stock actual</th>
                      <th style="text-align:right;width:72px">Stock máximo</th>
                      <th style="text-align:right;width:56px">% actual</th>
                      <th style="text-align:right;width:72px">Cant. sugerida</th>
                      <th style="text-align:right;width:64px">Costo unit.</th>
                      <th style="text-align:right;width:72px">Costo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${gItems.map(item => {
                      const pctStr = formatNum(item.pctActual, 0) + '%'
                      const pctColor = item.enAlerta ? '#B85C2A' : item.pctActual <= 60 ? '#c8892a' : '#3A8C3E'
                      const rowBg = item.enAlerta ? 'background:rgba(184,92,42,0.07)' : ''
                      return `
                        <tr style="${rowBg}">
                          <td>${item.producto}</td>
                          <td style="text-align:right">${formatInt(item.stockActual)} ${item.unidad_medida||''}</td>
                          <td style="text-align:right;color:var(--color-text-muted)">${formatInt(item.stock_maximo)} ${item.unidad_medida||''}</td>
                          <td style="text-align:right;font-weight:700;color:${pctColor}">${pctStr}</td>
                          <td style="text-align:right;font-weight:600">${formatInt(item.cantSugerida)} ${item.unidad_medida||''}</td>
                          <td style="text-align:right;color:var(--color-text-muted)">${item.ultimo_costo ? '$'+formatNum(item.ultimo_costo) : '—'}</td>
                          <td style="text-align:right;font-weight:600">$${formatNum(item.costoTotal)}</td>
                        </tr>`
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>`
      }).join('')

      html += `
        <div class="card-surface" style="padding:16px 20px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none"
            onclick="(function(el){const b=document.getElementById('${provId}');const open=b.style.display!=='none';b.style.display=open?'none':'block';el.querySelector('.sug-chev').textContent=open?'▶':'▼'})(this)">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="sug-chev" style="font-size:11px;color:var(--color-text-muted)">${abiertoDefault?'▼':'▶'}</span>
              <span style="font-weight:700">${nombre}</span>
              ${diasEntrega ? `<span style="font-size:11px;color:var(--color-text-muted)">🗓 ${diasEntrega}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:12px;color:var(--color-text-muted)">Total estimado: <strong style="color:var(--color-text)">$${formatNum(totalCosto)}</strong></span>
              ${provKey !== '__sin_proveedor__'
                ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 12px"
                    onclick="event.stopPropagation();generarPedidoSugerido('${provKey}','${nombre.replace(/'/g,"\\'")}')">Generar pedido</button>`
                : ''}
            </div>
          </div>
          <div id="${provId}" style="display:${abiertoDefault?'block':'none'};margin-top:14px">
            ${subAcordeonesHtml}
          </div>
        </div>
      `
    })

    content.innerHTML = html

    // Abrir por defecto los grupos con alertas (después de insertar el HTML)
    document.querySelectorAll('.sug-grupo[data-abierto="true"]').forEach(el => el.classList.add('open'))

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
    <div class="card-surface" style="padding:24px;margin-bottom:24px">
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
              <td style="text-align:right;color:var(--color-text-muted)">${formatInt(item.cantSugerida)} ${item.unidad_medida||''}</td>
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
