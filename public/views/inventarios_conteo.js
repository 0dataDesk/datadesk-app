// ── Vista: Inventarios Físicos (conteos) ─────────────────────────────────────
async function vistaInventariosConteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventarios...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: inventarios, error } = await window._db
      .from('inventarios')
      .select('id, fecha, clasificacion, area, estado, creado_por, created_at')
      .eq('tenant_id', tenant_id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    // Contar items por inventario
    const ids = (inventarios || []).map(i => i.id)
    let itemsCounts = {}
    if (ids.length > 0) {
      const { data: counts } = await window._db
        .from('inventario_items')
        .select('id_inventario')
        .in('id_inventario', ids)
      ;(counts || []).forEach(r => {
        itemsCounts[r.id_inventario] = (itemsCounts[r.id_inventario] || 0) + 1
      })
    }

    const estadoBadge = {
      borrador: 'background:rgba(200,137,42,0.15);color:#c8892a',
      completo: 'background:rgba(76,153,80,0.12);color:#3A8C3E'
    }

    content.innerHTML = `
      <div class="vista-header">
        <h2>Inventarios Físicos</h2>
      </div>
      <div id="inv-conteo-detalle"></div>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Clasificación</th>
              <th>Área</th>
              <th>Estado</th>
              <th>Creado por</th>
              <th style="text-align:right">Items</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${!(inventarios && inventarios.length)
              ? `<tr><td colspan="7" style="color:var(--color-text-muted);text-align:center;padding:24px">Sin inventarios registrados aún.</td></tr>`
              : (inventarios || []).map(inv => `
                <tr style="cursor:pointer" onclick="verDetalleInventario('${inv.id}')">
                  <td>${inv.fecha}</td>
                  <td>${inv.clasificacion || 'todos'}</td>
                  <td style="color:var(--color-text-muted)">${inv.area || '—'}</td>
                  <td>
                    <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${estadoBadge[inv.estado]||''}">
                      ${inv.estado || 'borrador'}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--color-text-muted)">${inv.creado_por || '—'}</td>
                  <td style="text-align:right;font-weight:600">${itemsCounts[inv.id] || 0}</td>
                  <td style="text-align:right">
                    <button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="event.stopPropagation();verDetalleInventario('${inv.id}')">Ver análisis</button>
                  </td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function verDetalleInventario(idInventario) {
  const tenant_id = await getTenantId()
  const wrap = document.getElementById('inv-conteo-detalle')
  if (wrap) wrap.innerHTML = `<p style="color:var(--color-text-muted)">Calculando diferencias...</p>`

  try {
    // Cargar inventario + items contados
    const [
      { data: inv },
      { data: items },
      { data: productos }
    ] = await Promise.all([
      window._db.from('inventarios').select('*').eq('id', idInventario).single(),
      window._db.from('inventario_items').select('*').eq('id_inventario', idInventario),
      window._db.from('productos').select('id_producto, producto, unidad_medida, clasificacion_abc').eq('tenant_id', tenant_id).eq('activo', true)
    ])

    if (!inv) { if (wrap) wrap.innerHTML = ''; return }

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    // Inventario anterior más reciente (para calcular teórico)
    const { data: invAnterior } = await window._db
      .from('inventarios')
      .select('id, fecha')
      .eq('tenant_id', tenant_id)
      .eq('estado', 'completo')
      .lt('fecha', inv.fecha)
      .order('fecha', { ascending: false })
      .limit(1)

    const fechaBase = invAnterior?.[0]?.fecha || '2000-01-01'
    const idInvAnterior = invAnterior?.[0]?.id

    // Items del inventario anterior
    const prevItems = {}
    if (idInvAnterior) {
      const { data: prevRows } = await window._db
        .from('inventario_items')
        .select('id_producto, cantidad_contada')
        .eq('id_inventario', idInvAnterior)
      ;(prevRows || []).forEach(r => { prevItems[r.id_producto] = Number(r.cantidad_contada) })
    }

    // Recepciones desde fecha base hasta fecha inventario
    const recepcionesAcum = {}
    const { data: recItems } = await window._db
      .from('recepcion_items')
      .select('id_producto, cantidad_recibida, recepciones!inner(fecha, tenant_id)')
      .eq('recepciones.tenant_id', tenant_id)
      .gte('recepciones.fecha', fechaBase)
      .lte('recepciones.fecha', inv.fecha)
    ;(recItems || []).forEach(r => {
      recepcionesAcum[r.id_producto] = (recepcionesAcum[r.id_producto] || 0) + Number(r.cantidad_recibida)
    })

    // Consumo teórico desde fecha base hasta fecha inventario
    const consumoAcum = {}
    const { data: consumos } = await window._db
      .from('consumo_teorico')
      .select('id_producto, cantidad_consumida')
      .eq('tenant_id', tenant_id)
      .gte('fecha_venta', fechaBase)
      .lte('fecha_venta', inv.fecha)
    ;(consumos || []).forEach(c => {
      consumoAcum[c.id_producto] = (consumoAcum[c.id_producto] || 0) + Number(c.cantidad_consumida)
    })

    // Incidencias desde fecha base hasta fecha inventario
    const incidenciasAcum = {}
    const { data: incidencias } = await window._db
      .from('incidencias')
      .select('id_producto, cantidad')
      .eq('tenant_id', tenant_id)
      .gte('fecha', fechaBase)
      .lte('fecha', inv.fecha)
    ;(incidencias || []).forEach(i => {
      if (i.id_producto && i.cantidad) {
        incidenciasAcum[i.id_producto] = (incidenciasAcum[i.id_producto] || 0) + Number(i.cantidad)
      }
    })

    // Calcular diferencias por item contado
    const filas = (items || []).map(item => {
      const prod = prodMap[item.id_producto] || {}
      const contado  = Number(item.cantidad_contada)
      const anterior = prevItems[item.id_producto] || 0
      const recep    = recepcionesAcum[item.id_producto] || 0
      const consumo  = consumoAcum[item.id_producto] || 0
      const incid    = incidenciasAcum[item.id_producto] || 0
      const teorico  = anterior + recep - consumo - incid
      const diff     = contado - teorico
      const pct      = teorico !== 0 ? Math.abs(diff / teorico * 100) : null

      let color = ''
      if (pct !== null) {
        color = pct <= 5 ? '#3A8C3E' : pct <= 10 ? '#c8892a' : '#B85C2A'
      }

      return {
        nombre: prod.producto || item.id_producto,
        unidad: prod.unidad_medida || '',
        contado,
        teorico: teorico.toFixed(2),
        diff: diff.toFixed(2),
        pct: pct !== null ? pct.toFixed(1) : null,
        color
      }
    })

    // Ordenar: mayor desviación primero
    filas.sort((a, b) => (parseFloat(b.pct)||0) - (parseFloat(a.pct)||0))

    if (wrap) wrap.innerHTML = `
      <div class="receta-detalle-card" style="margin-bottom:24px">
        <div class="detalle-header">
          <div>
            <h3>Inventario — ${inv.fecha}</h3>
            <p class="detalle-categoria">${inv.clasificacion || 'todos'} · ${inv.area || 'sin área'} · ${inv.estado}</p>
          </div>
          <button class="btn-accion" style="border:1px solid var(--color-border)"
            onclick="document.getElementById('inv-conteo-detalle').innerHTML=''">Cerrar</button>
        </div>

        <table class="tabla" style="margin-top:16px">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Unidad</th>
              <th style="text-align:right">Contado</th>
              <th style="text-align:right">Teórico esperado</th>
              <th style="text-align:right">Diferencia</th>
              <th style="text-align:right">%</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(f => `
              <tr>
                <td>${f.nombre}</td>
                <td style="color:var(--color-text-muted)">${f.unidad}</td>
                <td style="text-align:right;font-weight:600">${f.contado}</td>
                <td style="text-align:right;color:var(--color-text-muted)">${f.teorico}</td>
                <td style="text-align:right;font-weight:600;color:${f.color||'var(--color-text)'}">${f.diff}</td>
                <td style="text-align:right;font-weight:600;color:${f.color||'var(--color-text)'}">${f.pct !== null ? f.pct + '%' : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <p style="font-size:11px;color:var(--color-text-muted);margin-top:12px">
          Teórico = inventario anterior (${fechaBase}) + recepciones − consumo teórico − incidencias hasta ${inv.fecha}
        </p>
      </div>
    `
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    if (wrap) wrap.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
