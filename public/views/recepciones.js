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

  const [
    { data: proveedores, error: errProv },
    { data: productos, error: errProd }
  ] = await Promise.all([
    window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
    window._db.from('productos').select('id_producto, producto, unidad_medida, grupo').eq('tenant_id', tenant_id).eq('activo', true).order('producto')
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
              <th style="width:110px">Cantidad</th>
              <th style="width:130px">Costo unitario</th>
              <th style="width:110px">Total</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="rec-items-body">
          </tbody>
        </table>
        <button class="btn-accion" style="margin-top:8px;font-size:12px;border:1px solid var(--color-border)"
          onclick="agregarFilaRecepcion()">+ Agregar insumo</button>
      </div>

      <div id="rec-total-wrap" style="text-align:right;margin-top:12px;font-size:14px;font-weight:600;color:var(--color-primary)">
        Total recepción: $0.00
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
}

function _actualizarTotalRecepcion() {
  const filas = document.querySelectorAll('[id^="rec-item-"]')
  let total = 0
  filas.forEach(fila => {
    const idx   = fila.id.replace('rec-item-', '')
    const cant  = parseFloat(document.getElementById(`rec-cant-${idx}`)?.value) || 0
    const costo = parseFloat(document.getElementById(`rec-costo-${idx}`)?.value) || 0
    const item_total = cant * costo
    total += item_total
    const td = document.getElementById(`rec-total-item-${idx}`)
    if (td) td.textContent = `$${item_total.toFixed(2)}`
  })
  const wrap = document.getElementById('rec-total-wrap')
  if (wrap) wrap.textContent = `Total recepción: $${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function agregarFilaRecepcion() {
  const i = window._recItemCount++
  const body = document.getElementById('rec-items-body')
  const tr = document.createElement('tr')
  tr.id = `rec-item-${i}`
  tr.innerHTML = `
    <td style="position:relative">
      <input type="text" class="edit-select" id="rec-buscar-${i}" placeholder="Buscar insumo..."
        style="width:100%" autocomplete="off"
        oninput="_filtrarInsumo(${i})"
        onfocus="_filtrarInsumo(${i})"
        onblur="_cerrarDropdown(${i})">
      <input type="hidden" id="rec-prod-${i}">
      <div id="rec-drop-${i}" style="
        display:none;position:absolute;z-index:200;left:0;right:0;
        background:var(--color-surface,#fff);border:1px solid var(--color-border);
        border-radius:6px;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);
        top:calc(100% + 2px)">
      </div>
    </td>
    <td><input type="number" class="edit-input edit-num" id="rec-cant-${i}" min="0" step="any" placeholder="0"
      oninput="_actualizarTotalRecepcion()"></td>
    <td><input type="number" class="edit-input edit-num" id="rec-costo-${i}" min="0" step="any" placeholder="$0.00"
      oninput="_actualizarTotalRecepcion()"></td>
    <td id="rec-total-item-${i}" style="text-align:right;font-size:13px;color:var(--color-text-muted)">$0.00</td>
    <td>
      ${i > 0 ? `<button class="btn-fila btn-inactivar-ing" style="font-size:16px"
        onclick="this.closest('tr').remove();_actualizarTotalRecepcion()">×</button>` : ''}
    </td>
  `
  body.appendChild(tr)
}

function _filtrarInsumo(idx) {
  const query = (document.getElementById(`rec-buscar-${idx}`)?.value || '').toLowerCase().trim()
  const drop  = document.getElementById(`rec-drop-${idx}`)
  if (!drop) return

  if (query.length < 2) { drop.style.display = 'none'; return }

  const resultados = (window._productos_rec || []).filter(p =>
    p.producto.toLowerCase().includes(query)
  ).slice(0, 20)

  if (!resultados.length) {
    drop.innerHTML = `<div style="padding:10px 14px;color:var(--color-text-muted);font-size:13px">Sin resultados</div>`
  } else {
    drop.innerHTML = resultados.map(p => `
      <div data-id="${p.id_producto}" data-nombre="${p.producto.replace(/"/g,'&quot;')}"
        style="padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--color-border,#eee)"
        onmousedown="_seleccionarInsumo(${idx}, '${p.id_producto}', ${JSON.stringify(p.producto).replace(/\//g,'\\/')})">
        <span style="font-weight:600">${p.producto}</span>
        <span style="color:var(--color-text-muted);font-size:11px;margin-left:8px">${p.unidad_medida || ''}${p.grupo ? ' · ' + p.grupo : ''}</span>
      </div>
    `).join('')
  }
  drop.style.display = 'block'
}

function _seleccionarInsumo(idx, id_producto, nombre) {
  const input  = document.getElementById(`rec-buscar-${idx}`)
  const hidden = document.getElementById(`rec-prod-${idx}`)
  const drop   = document.getElementById(`rec-drop-${idx}`)
  if (input)  input.value  = nombre
  if (hidden) hidden.value = id_producto
  if (drop)   drop.style.display = 'none'
}

function _cerrarDropdown(idx) {
  setTimeout(() => {
    const drop = document.getElementById(`rec-drop-${idx}`)
    if (drop) drop.style.display = 'none'
  }, 150)
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

  const { data: recepcion, error: errR } = await window._db
    .from('recepciones')
    .insert({
      tenant_id, fecha, id_proveedor, folio,
      num_remision: folio, // compatibilidad con campo existente
      estatus: 'SIN_FACTURA',
      archivo_url,
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
