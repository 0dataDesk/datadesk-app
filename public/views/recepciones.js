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
            <th>Folio</th>
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
              <td>${r.folio || '—'}</td>
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

  const _fuentesAutorizadas = { furia: ['menu_charly'], tita: ['carga_eugenio', 'barra_nacho'] }
  const _fuentes = _fuentesAutorizadas[tenant_id] || []

  const [
    { data: proveedores, error: errProv },
    { data: productos, error: errProd }
  ] = await Promise.all([
    window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
    window._db.from('productos').select('id_producto, producto, unidad_medida, grupo').eq('tenant_id', tenant_id).eq('activo', true).eq('tipo', 'Insumo').in('fuente', _fuentes).order('producto')
  ])

  if (errProd) { alert(`Error al cargar insumos: ${errProd.message}`); return }
  if (errProv) { alert(`Error al cargar proveedores: ${errProv.message}`); return }

  window._productos_rec = productos || []
  window._tenant_id_rec = tenant_id

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
          <label class="filtro-label">Folio</label>
          <input type="text" id="rec-folio" class="filtro-select" placeholder="Núm. factura o remisión">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Subir archivo</label>
          <input type="file" id="rec-archivo" class="filtro-select" accept="image/*,.pdf"
            style="padding:4px;font-size:12px">
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
              <th style="width:80px">Piezas</th>
              <th style="width:130px">Contenido/pieza</th>
              <th style="width:100px">Cantidad total</th>
              <th style="width:110px">Costo/pieza</th>
              <th style="width:100px">Total</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="rec-items-body">
          </tbody>
        </table>
        <button class="btn-accion" style="margin-top:8px;font-size:12px;border:1px solid var(--color-border)"
          onclick="agregarFilaRecepcion()">+ Agregar insumo</button>
      </div>

      <div id="rec-totales-wrap" style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:13px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">Subtotal</span>
          <span id="rec-subtotal-disp" style="font-weight:600;min-width:90px;text-align:right">$0.00</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">IEPS</span>
          <span style="color:var(--color-text-muted)">$</span>
          <input type="number" id="rec-ieps-monto" class="edit-input edit-num" min="0" step="any"
            placeholder="0.00" style="width:90px;text-align:right">
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--color-text-muted);width:100px;text-align:right">IVA</span>
          <span style="color:var(--color-text-muted)">$</span>
          <input type="number" id="rec-iva-monto" class="edit-input edit-num" min="0" step="any"
            placeholder="0.00" style="width:90px;text-align:right">
        </div>
        <div style="border-top:1.5px solid var(--color-border);padding-top:8px;display:flex;align-items:center;gap:12px">
          <span style="font-weight:700;width:100px;text-align:right">Total</span>
          <span id="rec-total-final-disp" style="font-weight:700;font-size:15px;color:var(--color-primary);min-width:90px;text-align:right">$0.00</span>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="guardarRecepcion()">Guardar recepción</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('form-recepcion-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `

  window._recItemCount = 0
  agregarFilaRecepcion()

  document.getElementById('rec-ieps-monto').addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById('rec-iva-monto').addEventListener('input', _actualizarTotalRecepcion)
}

function _actualizarTotalRecepcion() {
  const filas = document.querySelectorAll('[id^="rec-item-"]')
  let total = 0
  filas.forEach(fila => {
    const idx      = fila.id.replace('rec-item-', '')
    const piezas   = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value) || 0
    const contenido = parseFloat(document.getElementById(`rec-contenido-${idx}`)?.value)
    const cantidad  = (piezas > 0 && !isNaN(contenido) && contenido > 0) ? piezas * contenido : piezas
    const costo     = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value) || 0
    const item_total = piezas * costo

    total += item_total

    const cantEl = document.getElementById(`rec-cant-${idx}`)
    if (cantEl) cantEl.value = cantidad > 0 ? cantidad : ''

    const td = document.getElementById(`rec-total-item-${idx}`)
    if (td) td.textContent = `$${item_total.toFixed(2)}`
  })
  const fmt = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const subtotalEl = document.getElementById('rec-subtotal-disp')
  if (subtotalEl) subtotalEl.textContent = fmt(total)

  const iepsMonto  = parseFloat(document.getElementById('rec-ieps-monto')?.value) || 0
  const ivaMonto   = parseFloat(document.getElementById('rec-iva-monto')?.value)  || 0
  const totalFinal = total + iepsMonto + ivaMonto

  const totalFinalEl = document.getElementById('rec-total-final-disp')
  if (totalFinalEl) totalFinalEl.textContent = fmt(totalFinal)
}

function _recGlobalDrop() {
  let drop = document.getElementById('rec-global-drop')
  if (!drop) {
    drop = document.createElement('div')
    drop.id = 'rec-global-drop'
    drop.style.cssText = [
      'display:none', 'position:fixed', 'z-index:9999',
      'background:var(--color-surface,#fff)', 'border:1px solid var(--color-border)',
      'border-radius:6px', 'max-height:220px', 'overflow-y:auto',
      'box-shadow:0 4px 16px rgba(0,0,0,0.18)', 'min-width:200px'
    ].join(';')
    document.body.appendChild(drop)
  }
  return drop
}

function agregarFilaRecepcion() {
  const i = window._recItemCount++
  const body = document.getElementById('rec-items-body')
  const tr = document.createElement('tr')
  tr.id = `rec-item-${i}`
  tr.innerHTML = `
    <td>
      <input type="text" class="edit-select" id="rec-buscar-${i}" placeholder="Buscar insumo..."
        style="width:100%" autocomplete="off">
      <input type="hidden" id="rec-prod-${i}">
    </td>
    <td>
      <input type="number" class="edit-input edit-num" id="rec-piezas-${i}" min="0" step="any"
        value="1" style="width:64px">
    </td>
    <td style="white-space:nowrap">
      <input type="number" class="edit-input edit-num" id="rec-contenido-${i}" min="0" step="any"
        placeholder="—" style="width:70px">
      <span id="rec-unidad-${i}" style="font-size:11px;color:var(--color-text-muted);margin-left:4px"></span>
    </td>
    <td>
      <input type="text" class="edit-input" id="rec-cant-${i}" readonly
        style="width:80px;text-align:right;background:rgba(0,0,0,0.03);color:var(--color-text-muted)" placeholder="—">
    </td>
    <td>
      <input type="number" class="edit-input edit-num" id="rec-costo-${i}" min="0" step="any" placeholder="$0.00">
    </td>
    <td id="rec-total-item-${i}" style="text-align:right;font-size:13px;color:var(--color-text-muted)">$0.00</td>
    <td>
      ${i > 0 ? `<button class="btn-fila btn-inactivar-ing" style="font-size:16px"
        onclick="this.closest('tr').remove();_actualizarTotalRecepcion()">×</button>` : ''}
    </td>
  `
  body.appendChild(tr)

  const inputEl = document.getElementById(`rec-buscar-${i}`)
  inputEl.addEventListener('input',  () => _filtrarInsumo(i))
  inputEl.addEventListener('focus',  () => _filtrarInsumo(i))
  inputEl.addEventListener('blur',   () => _cerrarDropdown(i))
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') _cerrarDropdown(i) })

  document.getElementById(`rec-piezas-${i}`).addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById(`rec-contenido-${i}`).addEventListener('input', _actualizarTotalRecepcion)
  document.getElementById(`rec-costo-${i}`).addEventListener('input', _actualizarTotalRecepcion)
}

function _filtrarInsumo(idx) {
  const inputEl = document.getElementById(`rec-buscar-${idx}`)
  const query   = (inputEl?.value || '').toLowerCase().trim()
  const drop    = _recGlobalDrop()

  window._recDropActivo = idx

  if (query.length < 2) { drop.style.display = 'none'; return }

  const resultados = (window._productos_rec || []).filter(p =>
    p.producto.toLowerCase().includes(query)
  ).slice(0, 20)

  drop.innerHTML = ''

  if (!resultados.length) {
    const noRes = document.createElement('div')
    noRes.style.cssText = 'padding:10px 14px;color:var(--color-text-muted);font-size:13px'
    noRes.textContent = 'Sin resultados'
    drop.appendChild(noRes)
  } else {
    resultados.forEach(p => {
      const item = document.createElement('div')
      item.style.cssText = 'padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border,#eee)'
      item.innerHTML = `<span style="font-weight:600">${p.producto}</span><span style="color:var(--color-text-muted);font-size:11px;margin-left:8px">${p.unidad_medida || ''}${p.grupo ? ' · ' + p.grupo : ''}</span>`
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(0,0,0,0.04)' })
      item.addEventListener('mouseleave', () => { item.style.background = '' })
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        _seleccionarInsumo(idx, p.id_producto, p.producto, p.unidad_medida)
      })
      drop.appendChild(item)
    })
  }

  const rect = inputEl.getBoundingClientRect()
  drop.style.left  = rect.left + 'px'
  drop.style.top   = (rect.bottom + 2) + 'px'
  drop.style.width = rect.width + 'px'
  drop.style.display = 'block'
}

function _seleccionarInsumo(idx, id_producto, nombre, unidad) {
  const input    = document.getElementById(`rec-buscar-${idx}`)
  const hidden   = document.getElementById(`rec-prod-${idx}`)
  const drop     = document.getElementById('rec-global-drop')
  const unidadEl = document.getElementById(`rec-unidad-${idx}`)
  if (input)    input.value  = nombre
  if (hidden)   hidden.value = id_producto
  if (drop)     drop.style.display = 'none'
  if (unidadEl) unidadEl.textContent = unidad || ''
}

function _cerrarDropdown(idx) {
  setTimeout(() => {
    const drop = document.getElementById('rec-global-drop')
    if (drop && window._recDropActivo === idx) drop.style.display = 'none'
  }, 200)
}

async function guardarRecepcion() {
  const tenant_id    = await getTenantId()
  const fecha        = document.getElementById('rec-fecha')?.value
  const id_proveedor = document.getElementById('rec-proveedor')?.value
  const folio        = document.getElementById('rec-folio')?.value?.trim() || null
  const archivoInput = document.getElementById('rec-archivo')

  if (!fecha || !id_proveedor) {
    alert('Fecha y proveedor son obligatorios')
    return
  }

  const filas = document.querySelectorAll('[id^="rec-item-"]')
  const items = []

  for (const fila of filas) {
    const idx        = fila.id.replace('rec-item-', '')
    const id_producto = document.getElementById(`rec-prod-${idx}`)?.value
    const piezas     = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value)
    const contenido  = parseFloat(document.getElementById(`rec-contenido-${idx}`)?.value)
    const costo      = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value)
    if (!id_producto || isNaN(piezas) || piezas <= 0) continue
    const cantidad_recibida = (!isNaN(contenido) && contenido > 0) ? piezas * contenido : piezas
    items.push({ id_producto, cantidad_recibida, costo_unitario: isNaN(costo) ? 0 : costo })
  }

  if (!items.length) { alert('Agrega al menos un insumo'); return }

  let updated_by = null
  try {
    const { data: { user } } = await window._db.auth.getUser()
    updated_by = user?.email || null
  } catch (e) { console.error('getUser:', e) }
  const updated_at = new Date().toISOString()

  // Subir archivo si se seleccionó
  let archivo_url = null
  const archivoFile = archivoInput?.files?.[0]
  if (archivoFile) {
    const ext = archivoFile.name.split('.').pop()
    const folioPath = folio ? folio.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'sin_folio'
    const storagePath = `${tenant_id}/${fecha}/${folioPath}.${ext}`
    const { data: uploadData, error: uploadErr } = await window._db.storage
      .from('recepciones')
      .upload(storagePath, archivoFile, { upsert: true })
    if (uploadErr) {
      alert(`Error al subir archivo: ${uploadErr.message}`)
      return
    }
    const { data: urlData } = window._db.storage.from('recepciones').getPublicUrl(storagePath)
    archivo_url = urlData?.publicUrl || null
    // Si el bucket no es público, usar signed URL en el detalle
    if (!archivo_url) {
      const { data: signed } = await window._db.storage.from('recepciones').createSignedUrl(storagePath, 60 * 60 * 24)
      archivo_url = signed?.signedUrl || null
    }
  }

  // Calcular subtotal = suma(piezas × costo/pieza) para guardar en BD
  let _subtotalFinal = 0
  document.querySelectorAll('[id^="rec-item-"]').forEach(fila => {
    const idx    = fila.id.replace('rec-item-', '')
    const piezas = parseFloat(document.getElementById(`rec-piezas-${idx}`)?.value) || 0
    const costo  = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value)  || 0
    _subtotalFinal += piezas * costo
  })
  const _iepsMonto  = parseFloat(document.getElementById('rec-ieps-monto')?.value) || null
  const _ivaMonto   = parseFloat(document.getElementById('rec-iva-monto')?.value)  || null
  const _totalFinal = _subtotalFinal + (_iepsMonto || 0) + (_ivaMonto || 0)

  const { data: recepcion, error: errR } = await window._db
    .from('recepciones')
    .insert({
      tenant_id, fecha, id_proveedor,
      num_remision: folio,
      estatus: 'SIN_FACTURA',
      archivo_url,
      subtotal:            _subtotalFinal || null,
      ieps_porcentaje:     null,
      ieps_monto:          _iepsMonto,
      iva_porcentaje:      null,
      iva_monto:           _ivaMonto,
      total_con_impuestos: _totalFinal || null,
      created_by: window._email || null,
      updated_by,
      updated_at
    })
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

  // Resolver URL del archivo si existe
  let archivoHtml = ''
  if (rec.archivo_url) {
    const esImagen = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(rec.archivo_url)
    archivoHtml = `
      <div style="margin-top:16px;padding:12px;border:1px solid var(--color-border);border-radius:8px">
        <span style="font-size:12px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:1px">
          Documento adjunto
        </span>
        <div style="margin-top:8px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
          ${esImagen ? `<img src="${rec.archivo_url}" alt="Documento" style="max-height:200px;border-radius:6px;border:1px solid var(--color-border)">` : ''}
          <a href="${rec.archivo_url}" target="_blank" rel="noopener"
            class="btn-accion btn-aprobar" style="font-size:12px;padding:6px 14px;text-decoration:none">
            Ver documento
          </a>
        </div>
      </div>`
  }

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <div class="detalle-header">
        <div>
          <h3>Recepción — ${rec.folio || rec.num_remision || rec.id.slice(0,8)}</h3>
          <p class="detalle-categoria">${provNombre} · ${rec.fecha}</p>
        </div>
        <span class="badge-status" style="${window._badgeEstatus[rec.estatus] || ''}">
          ${window._iconoEstatus[rec.estatus] || ''} ${rec.estatus?.replace('_',' ')}
        </span>
      </div>

      ${archivoHtml}

      <table class="tabla" style="margin-top:16px">
        <thead>
          <tr>
            <th>Insumo</th>
            <th style="text-align:right">Cant. recibida</th>
            <th style="text-align:right">Cant. solicitada</th>
            <th style="text-align:right">Costo unit.</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Desv. precio</th>
          </tr>
        </thead>
        <tbody>
          ${(items || []).map(i => {
            const total = Number(i.cantidad_recibida) * Number(i.costo_unitario || 0)
            const desv  = i.desviacion_porcentaje ?? i.variacion_pct ?? null
            let rowStyle = ''
            let desvHtml = '—'
            if (desv !== null) {
              if (desv > 5) {
                rowStyle = 'background:rgba(184,92,42,0.08)'
                desvHtml = `<span style="color:#B85C2A;font-weight:700">▲ ${desv}%</span>`
              } else if (desv >= 1) {
                rowStyle = 'background:rgba(200,137,42,0.08)'
                desvHtml = `<span style="color:#c8892a;font-weight:600">▲ ${desv}%</span>`
              } else {
                desvHtml = `<span style="color:var(--color-text-muted)">${desv}%</span>`
              }
            }
            return `
              <tr style="${rowStyle}">
                <td>${prodMap[i.id_producto]?.producto || i.id_producto}</td>
                <td style="text-align:right">${i.cantidad_recibida} ${prodMap[i.id_producto]?.unidad_medida || ''}</td>
                <td style="text-align:right;color:var(--color-text-muted)">${i.cantidad_solicitada || '—'}</td>
                <td style="text-align:right">$${Number(i.costo_unitario || 0).toFixed(2)}</td>
                <td style="text-align:right;font-weight:600">$${total.toFixed(2)}</td>
                <td style="text-align:right">${desvHtml}</td>
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
