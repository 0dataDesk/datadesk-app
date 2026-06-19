async function vistaRecepciones() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando recepciones...</p>`

  try {
    const tenant_id = await getTenantId()

    const [
      { data: recepciones, error: errR },
      { data: proveedores, error: errP }
    ] = await Promise.all([
      window._db.from('recepciones')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      window._db.from('proveedores')
        .select('id_proveedor, nombre')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
        .order('nombre')
    ])

    if (errR) throw errR
    if (errP) throw errP

    const nombreProv = {}
    ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

    const badgeEstatus = {
      SIN_FACTURA: 'background:rgba(184,92,42,0.12);color:#B85C2A;border:1px solid rgba(184,92,42,0.3)',
      CON_FACTURA: 'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      PAGADO:      'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }

    const iconoEstatus = { SIN_FACTURA: '✕', CON_FACTURA: '!', PAGADO: '✓' }

    content.innerHTML = `
      <div class="vista-header">
        <h2>Recepciones</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormRecepcion()">+ Nueva recepción</button>
      </div>

      <div id="form-recepcion-wrap"></div>

      <div class="filtros-bar">
        <select id="filtro-rec-estatus" class="filtro-select" onchange="filtrarRecepciones()">
          <option value="">Todos los estatus</option>
          <option value="SIN_FACTURA">Sin factura</option>
          <option value="CON_FACTURA">Con factura</option>
          <option value="PAGADO">Pagado</option>
        </select>
        <select id="filtro-rec-prov" class="filtro-select" onchange="filtrarRecepciones()">
          <option value="">Todos los proveedores</option>
          ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')}
        </select>
      </div>

      <div id="recepciones-lista"></div>
    `

    window._recepciones = recepciones || []
    window._nombreProv  = nombreProv
    window._badgeEstatus = badgeEstatus
    window._iconoEstatus = iconoEstatus

    window.filtrarRecepciones = function() {
      const estatus = document.getElementById('filtro-rec-estatus')?.value || ''
      const prov    = document.getElementById('filtro-rec-prov')?.value || ''
      const filtradas = window._recepciones.filter(r =>
        (!estatus || r.estatus === estatus) &&
        (!prov    || r.id_proveedor === prov)
      )
      renderListaRecepciones(filtradas)
    }

    renderListaRecepciones(window._recepciones)

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function renderListaRecepciones(lista) {
  const wrap = document.getElementById('recepciones-lista')
  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay recepciones registradas.</p>`
    return
  }

  wrap.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>Remisión</th>
            <th>Factura</th>
            <th>Área</th>
            <th>Estatus</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(r => `
            <tr style="cursor:pointer" onclick="verDetalleRecepcion('${r.id}')">
              <td>${r.fecha || '—'}</td>
              <td>${r.id_proveedor ? (window._nombreProv[r.id_proveedor] || r.id_proveedor) : 'Inventario Inicial'}</td>
              <td>${r.num_remision || '—'}</td>
              <td>${r.num_factura || '—'}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${r.area_almacenamiento || '—'}</td>
              <td>
                <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${window._badgeEstatus[r.estatus] || ''}">
                  ${window._iconoEstatus[r.estatus] || ''} ${r.estatus?.replace('_', ' ') || '—'}
                </span>
              </td>
              <td style="text-align:right">
                ${r.estatus === 'SIN_FACTURA'
                  ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="event.stopPropagation();registrarFactura('${r.id}')">Registrar factura</button>`
                  : r.estatus === 'CON_FACTURA'
                  ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="event.stopPropagation();marcarPagado('${r.id}')">Marcar pagado</button>`
                  : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

async function mostrarFormRecepcion() {
  const tenant_id = await getTenantId()
  const hoy = new Date().toISOString().split('T')[0]

  const [
    { data: proveedores },
    { data: productos }
  ] = await Promise.all([
    window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
    window._db.from('productos').select('id_producto, producto, unidad_medida, unidad_compra').eq('tenant_id', tenant_id).eq('activo', true).order('producto')
  ])

  const wrap = document.getElementById('form-recepcion-wrap')
  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nueva recepción</h3>

      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha</label>
          <input type="date" id="rec-fecha" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Proveedor</label>
          <select id="rec-proveedor" class="filtro-select">
            <option value="">— Seleccionar —</option>
            ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Núm. Remisión</label>
          <input type="text" id="rec-remision" class="filtro-select" placeholder="Ej. REM-001">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Área de almacenamiento</label>
          <input type="text" id="rec-area" class="filtro-select" placeholder="Ej. Cámara, Despensa">
        </div>
      </div>

      <h4 style="margin:20px 0 12px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">
        Insumos recibidos
      </h4>

      <div id="rec-items-wrap">
        <table class="tabla" id="rec-items-tabla">
          <thead>
            <tr>
              <th>Insumo</th>
              <th style="width:120px">Cantidad</th>
              <th style="width:120px">Costo unitario</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="rec-items-body">
            <tr id="rec-item-0">
              <td>
                <select class="edit-select" id="rec-prod-0" style="width:100%">
                  <option value="">— Seleccionar insumo —</option>
                  ${(productos || []).map(p => `<option value="${p.id_producto}" data-unidad="${p.unidad_compra || p.unidad_medida || ''}">${p.producto}</option>`).join('')}
                </select>
              </td>
              <td><input type="number" class="edit-input edit-num" id="rec-cant-0" min="0" step="any" placeholder="0"></td>
              <td><input type="number" class="edit-input edit-num" id="rec-costo-0" min="0" step="any" placeholder="$0.00"></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <button class="btn-accion" style="margin-top:8px;font-size:12px;border:1px solid var(--color-border)"
          onclick="agregarFilaRecepcion(${JSON.stringify(productos || []).replace(/"/g, '&quot;')})">+ Agregar insumo</button>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="guardarRecepcion()">Guardar recepción</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('form-recepcion-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `

  window._recItemCount = 1
  window._productos_rec = productos || []
}

function agregarFilaRecepcion(productos) {
  const i = window._recItemCount++
  const opts = (productos || window._productos_rec || [])
    .map(p => `<option value="${p.id_producto}" data-unidad="${p.unidad_compra || p.unidad_medida || ''}">${p.producto}</option>`)
    .join('')

  const body = document.getElementById('rec-items-body')
  const tr = document.createElement('tr')
  tr.id = `rec-item-${i}`
  tr.innerHTML = `
    <td>
      <select class="edit-select" id="rec-prod-${i}" style="width:100%">
        <option value="">— Seleccionar insumo —</option>
        ${opts}
      </select>
    </td>
    <td><input type="number" class="edit-input edit-num" id="rec-cant-${i}" min="0" step="any" placeholder="0"></td>
    <td><input type="number" class="edit-input edit-num" id="rec-costo-${i}" min="0" step="any" placeholder="$0.00"></td>
    <td>
      <button class="btn-fila btn-inactivar-ing" onclick="this.closest('tr').remove()" style="font-size:16px">×</button>
    </td>
  `
  body.appendChild(tr)
}

async function guardarRecepcion() {
  const tenant_id    = await getTenantId()
  const fecha        = document.getElementById('rec-fecha')?.value
  const id_proveedor = document.getElementById('rec-proveedor')?.value
  const num_remision = document.getElementById('rec-remision')?.value?.trim() || null
  const area         = document.getElementById('rec-area')?.value?.trim() || null

  if (!fecha || !id_proveedor) {
    alert('Fecha y proveedor son obligatorios')
    return
  }

  const filas = document.querySelectorAll('[id^="rec-item-"]')
  const items = []

  for (const fila of filas) {
    const idx         = fila.id.replace('rec-item-', '')
    const id_producto = document.getElementById(`rec-prod-${idx}`)?.value
    const cantidad    = parseFloat(document.getElementById(`rec-cant-${idx}`)?.value)
    const costo       = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value)
    if (!id_producto || isNaN(cantidad) || cantidad <= 0) continue
    items.push({ id_producto, cantidad_recibida: cantidad, costo_unitario: isNaN(costo) ? 0 : costo })
  }

  if (!items.length) { alert('Agrega al menos un insumo'); return }

  let updated_by = null
  try {
    const { data: { user } } = await window._db.auth.getUser()
    updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  const updated_at = new Date().toISOString()

  const { data: recepcion, error: errR } = await window._db
    .from('recepciones')
    .insert({ tenant_id, fecha, id_proveedor, num_remision, area_almacenamiento: area, estatus: 'SIN_FACTURA', created_by: window._email || null, updated_by, updated_at })
    .select().single()

  if (errR) { alert(`Error: ${errR.message}`); return }

  const rows = items.map(it => ({ ...it, id_recepcion: recepcion.id, updated_by, updated_at }))
  const { error: errI } = await window._db.from('recepcion_items').insert(rows)
  if (errI) { alert(`Error al guardar items: ${errI.message}`); return }

  document.getElementById('form-recepcion-wrap').innerHTML = ''
  await vistaRecepciones()
}

async function registrarFactura(id) {
  const num = prompt('Número de factura:')
  if (!num) return
  let updated_by = null
  try {
    const { data: { user } } = await window._db.auth.getUser()
    updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  const { error } = await window._db
    .from('recepciones')
    .update({ estatus: 'CON_FACTURA', num_factura: num.trim(), updated_by, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaRecepciones()
}

async function marcarPagado(id) {
  if (!confirm('¿Confirmar como pagado?')) return
  let updated_by = null
  try {
    const { data: { user } } = await window._db.auth.getUser()
    updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  const { error } = await window._db
    .from('recepciones')
    .update({ estatus: 'PAGADO', updated_by, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaRecepciones()
}

async function verDetalleRecepcion(id) {
  const tenant_id = await getTenantId()

  const [
    { data: rec },
    { data: items },
    { data: productos }
  ] = await Promise.all([
    window._db.from('recepciones').select('*').eq('id', id).single(),
    window._db.from('recepcion_items').select('*').eq('id_recepcion', id),
    window._db.from('productos').select('id_producto, producto, unidad_medida').eq('tenant_id', tenant_id).eq('activo', true)
  ])

  if (!rec) return

  const prodMap = {}
  ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

  const wrap = document.getElementById('form-recepcion-wrap')
  const totalMonto = (items || []).reduce((s, i) => s + (Number(i.cantidad_recibida) * Number(i.costo_unitario || 0)), 0)
  const provNombre = rec.id_proveedor
    ? (window._nombreProv[rec.id_proveedor] || rec.id_proveedor)
    : 'Inventario Inicial'

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Recepción — ${rec.num_remision || rec.id.slice(0,8)}</h3>
          <p class="detalle-categoria">${provNombre} · ${rec.fecha}</p>
        </div>
        <span class="badge-status" style="${window._badgeEstatus[rec.estatus] || ''}">
          ${window._iconoEstatus[rec.estatus] || ''} ${rec.estatus?.replace('_',' ')}
        </span>
      </div>

      <table class="tabla" style="margin-top:16px">
        <thead>
          <tr>
            <th>Insumo</th>
            <th style="text-align:right">Cant. recibida</th>
            <th style="text-align:right">Cant. solicitada</th>
            <th style="text-align:right">Costo unit.</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Variación</th>
          </tr>
        </thead>
        <tbody>
          ${(items || []).map(i => {
            const total    = Number(i.cantidad_recibida) * Number(i.costo_unitario || 0)
            const variacion = i.variacion_pct ?? null
            const varColor = variacion === null ? '' : variacion > 5 ? 'color:#B85C2A;font-weight:600' : variacion < -5 ? 'color:#3A8C3E;font-weight:600' : 'color:var(--color-text-muted)'
            return `
              <tr>
                <td>${prodMap[i.id_producto]?.producto || i.id_producto}</td>
                <td style="text-align:right">${i.cantidad_recibida} ${prodMap[i.id_producto]?.unidad_medida || ''}</td>
                <td style="text-align:right;color:var(--color-text-muted)">${i.cantidad_solicitada || '—'}</td>
                <td style="text-align:right">$${Number(i.costo_unitario || 0).toFixed(2)}</td>
                <td style="text-align:right;font-weight:600">$${total.toFixed(2)}</td>
                <td style="text-align:right;${varColor}">${variacion !== null ? variacion + '%' : '—'}</td>
              </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"></td>
            <td style="text-align:right;font-weight:600;border-top:2px solid var(--color-border);padding-top:10px">TOTAL</td>
            <td style="text-align:right;font-weight:700;color:var(--color-primary);border-top:2px solid var(--color-border);padding-top:10px">
              $${totalMonto.toFixed(2)}
            </td>
            <td style="border-top:2px solid var(--color-border)"></td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:16px">
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('form-recepcion-wrap').innerHTML=''">Cerrar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
