const PRIORIDAD_CATEGORIA = {
  furia: ['Hamburguesas', 'Pollo', 'Salsas', 'Subrecetas', 'Acompañamientos', 'Bebidas', 'Extras', 'Combos'],
  tita:  ['Panadería Clásica', 'Dulces & Pastelería', 'Laminados Salados', 'Especialidades Regionales',
          'Bebidas base café', 'Bebidas base matcha', 'Bebidas base taro', 'Bebida chocolate',
          'Bebidas frescas', 'Tés y tisanas', 'Subrecetas']
}

function indicePrioridad(tenant, categoria) {
  const orden = PRIORIDAD_CATEGORIA[tenant] || []
  const idx = orden.indexOf(categoria)
  return idx === -1 ? 999 : idx
}

async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id    = await getTenantId()
    const tenantActual = (window._tenantConfig?.nombre || '').toLowerCase()
    const fuentesDef    = FUENTES_POR_TENANT[tenantActual] || []
    const rol           = window._rol || 'operador'

    const { data: recetas, error: errR } = await window._db
      .from('catalogo_recetas')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .neq('tipo_receta', 'config')
      .neq('categoria', 'Extras')
      .order('nombre_platillo')

    if (errR) throw errR

    window._recetas          = recetas || []
    window._recTenantActual  = tenantActual
    window._recPuedeEditar   = ['admin', 'editor', 'cocina'].includes(rol)

    window._recNivel         = 'categoria'
    window._recFuenteSel     = ''
    window._recCategoriaSel  = null
    window._recRecetaSel     = null

    content.innerHTML = `
      <div class="vista-header">
        <h2>📖 Recetas</h2>
        ${fuentesDef.length ? `
        <div class="export-bar">
          ${fuentesDef.length > 1 ? `
          <select id="export-fuente" class="filtro-select">
            ${fuentesDef.map(f => `<option value="${f.fuente}">${f.etiqueta}</option>`).join('')}
          </select>` : ''}
          <button id="btn-export-pdf" class="btn-primary">Exportar PDF</button>
        </div>` : ''}
      </div>
      <div id="rec-nivel-wrap"></div>
    `

    if (fuentesDef.length) {
      document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const fuente = fuentesDef.length > 1
          ? document.getElementById('export-fuente').value
          : fuentesDef[0].fuente
        exportarRecetasPDF(fuente)
      })
    }

    renderRecetasNivel()

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

function _recFiltroFuente() {
  const fuentesDef = FUENTES_POR_TENANT[window._recTenantActual] || []
  return fuentesDef.length > 1 ? (window._recFuenteSel || '') : ''
}

function _recRecetasFiltradas() {
  const fuente = _recFiltroFuente()
  return (window._recetas || []).filter(r => !fuente || r.fuente === fuente)
}

function renderRecetasNivel() {
  const wrap = document.getElementById('rec-nivel-wrap')
  if (!wrap) return
  if (window._recNivel === 'platillo') return renderRecPlatillos(wrap)
  if (window._recNivel === 'detalle')  return renderRecDetalleNivel(wrap)
  renderRecCategorias(wrap)
}

function renderRecCategorias(wrap) {
  const fuentesDef = FUENTES_POR_TENANT[window._recTenantActual] || []
  const recetasVisibles = _recRecetasFiltradas()

  const porCategoria = {}
  recetasVisibles.forEach(r => {
    const c = r.categoria || 'Sin categoría'
    if (!porCategoria[c]) porCategoria[c] = []
    porCategoria[c].push(r)
  })
  const categorias = Object.keys(porCategoria).sort((a, b) =>
    indicePrioridad(window._recTenantActual, a) - indicePrioridad(window._recTenantActual, b)
  )

  wrap.innerHTML = `
    ${fuentesDef.length > 1 ? `
    <div class="filtros-bar" style="margin-bottom:16px">
      <select id="rec-f-fuente" class="filtro-select">
        <option value="">Todas las fuentes</option>
        ${fuentesDef.map(f => `<option value="${f.fuente}"${f.fuente === window._recFuenteSel ? ' selected' : ''}>${f.etiqueta}</option>`).join('')}
      </select>
    </div>` : ''}
    ${categorias.length ? `
    <div class="rec-tiles-grid">
      ${categorias.map(c => `
        <button class="rec-tile" onclick="recIrPlatillos('${c.replace(/'/g,"\\'")}')">
          <div class="rec-tile-titulo">${c}</div>
          <div class="rec-tile-sub">${porCategoria[c].length} platillo${porCategoria[c].length === 1 ? '' : 's'}</div>
        </button>`).join('')}
    </div>` : `<p style="color:var(--color-text-muted);font-size:13px">No hay recetas para mostrar.</p>`}
  `

  const fFuente = document.getElementById('rec-f-fuente')
  if (fFuente) fFuente.addEventListener('change', () => {
    window._recFuenteSel = fFuente.value
    renderRecCategorias(wrap)
  })
}

function renderRecPlatillos(wrap) {
  const categoria = window._recCategoriaSel
  const recetas = _recRecetasFiltradas()
    .filter(r => (r.categoria || 'Sin categoría') === categoria)
    .sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="recIrCategorias()">← Categorías</button>
    <h3 style="margin:8px 0 12px">${categoria}</h3>
    ${recetas.length ? `
    <div class="rec-tiles-grid">
      ${recetas.map(r => `
        <button class="rec-tile" onclick="recIrDetalle('${r.id_receta}')">
          <div class="rec-tile-titulo">${r.nombre_platillo}</div>
        </button>`).join('')}
    </div>` : `<p style="color:var(--color-text-muted);font-size:13px">Sin platillos en esta categoría.</p>`}
  `
}

function renderRecDetalleNivel(wrap) {
  const receta = (window._recetas || []).find(r => String(r.id_receta) === String(window._recRecetaSel))
  wrap.innerHTML = `
    <button class="rec-volver-btn" onclick="recIrPlatillos('${(window._recCategoriaSel || '').replace(/'/g,"\\'")}')">← ${window._recCategoriaSel || 'Volver'}</button>
    <div id="receta-detalle-wrap"></div>
  `
  if (receta) cargarDetalleReceta(receta)
}

window.recIrCategorias = function() {
  window._recNivel = 'categoria'
  window._recCategoriaSel = null
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrPlatillos = function(categoria) {
  window._recNivel = 'platillo'
  window._recCategoriaSel = categoria
  window._recRecetaSel = null
  renderRecetasNivel()
}

window.recIrDetalle = function(idReceta) {
  window._recNivel = 'detalle'
  window._recRecetaSel = idReceta
  renderRecetasNivel()
}

async function cargarDetalleReceta(receta) {
  const wrap = document.getElementById('receta-detalle-wrap')
  wrap.innerHTML = `<p style="color:var(--color-text-muted);margin-top:24px">Cargando receta...</p>`

  try {
    const tenant_id = await getTenantId()

    const [
      { data: ingredientes, error: errI },
      { data: pasos,        error: errP },
      { data: productos,    error: errPr }
    ] = await Promise.all([
      window._db.from('receta_ingredientes')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id_receta', receta.id_receta)
        .neq('activo', false)
        .order('orden', { ascending: true, nullsFirst: false }),
      window._db.from('receta_procedimientos')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id_receta', receta.id_receta)
        .neq('activo', false)
        .order('paso_num'),
      window._db.from('productos')
        .select('id_producto, unidad_medida')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (errI) throw errI
    if (errP) throw errP

    const ingSinCantidad = (ingredientes || []).filter(i => i.cantidad === null || i.cantidad === '' || i.cantidad === undefined)
    const hayCantidadFaltante = ingSinCantidad.length > 0

    // Índice de unidad por id_producto
    const unidadPorProducto = {}
    ;(productos || []).forEach(p => { unidadPorProducto[p.id_producto] = p.unidad_medida })

    // ── Ingredientes (unidad desde catálogo) ─────────────────────────────
    const htmlIngredientes = `
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            ${(ingredientes || []).map(i => `
              <tr>
                <td>${i.producto || ''}</td>
                <td>${i.cantidad != null ? i.cantidad : ''}</td>
                <td style="color:var(--color-text-muted)">${unidadPorProducto[i.id_producto] || ''}</td>
                <td style="color:var(--color-text-muted);font-size:12px">${i.notas_ingrediente || ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`

    // ── Procedimiento agrupado por sección ───────────────────────────────
    const steps = pasos || []
    let htmlPasos = ''

    if (steps.length > 0) {
      const secciones = []
      let seccionActual = null

      steps.forEach(p => {
        const sec = p.seccion || 'Procedimiento'
        if (sec !== seccionActual) {
          secciones.push({ nombre: sec, pasos: [] })
          seccionActual = sec
        }
        secciones[secciones.length - 1].pasos.push(p)
      })

      const mostrarEncabezados = secciones.length > 1

      htmlPasos = secciones.map(sec => `
        ${mostrarEncabezados ? `<h5 class="seccion-procedimiento">${sec.nombre}</h5>` : ''}
        <ol class="procedimiento" ${mostrarEncabezados ? 'style="margin-bottom:20px"' : ''}>
          ${sec.pasos.map(p => `<li>${limpiarPaso(p.proceso)}</li>`).join('')}
        </ol>
      `).join('')
    }

    // ── Notas adicionales ────────────────────────────────────────────────
    const htmlNotas = receta.notas_revision
      ? `<div class="solicitudes-texto">${receta.notas_revision}</div>`
      : `<p style="color:var(--color-text-muted);font-size:13px">Sin notas adicionales.</p>`

    // ── Reventa: sabores disponibles (solo RBE-004 Refresco) ─────────────
    const esReventa = receta.tipo_receta === 'reventa'

    let htmlSabores = ''
    if (esReventa) {
      const filtrosPorReceta = {
        'RBE-004': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true).eq('grupo', 'Bebidas').eq('fuente', 'menu_charly')
          .not('id_producto', 'in', '(BEB-001,BEB-025,BEB-026,BEB-031,BEB-037)')
          .order('producto'),
        'RBE-005': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true)
          .in('id_producto', ['BEB-031']),
        'RBE-006': () => window._db.from('productos').select('producto')
          .eq('tenant_id', tenant_id).eq('activo', true)
          .in('id_producto', ['BEB-026'])
      }

      const titulo = {
        'RBE-004': 'Sabores disponibles',
        'RBE-005': 'Marca',
        'RBE-006': 'Marca'
      }

      const fetcher = filtrosPorReceta[receta.id_receta]
      if (fetcher) {
        const { data: opciones } = await fetcher()
        htmlSabores = `
          <h4>${titulo[receta.id_receta] || 'Opciones disponibles'}</h4>
          <ul class="procedimiento">
            ${(opciones || []).map(s => `<li>${s.producto}</li>`).join('')}
          </ul>
        `
      }
    }

    // ── Foto ──────────────────────────────────────────────────────────────
    let fotoUrl = null
    if (receta.foto_url) {
      const { data } = window._db.storage.from('recetas').getPublicUrl(receta.foto_url)
      fotoUrl = data?.publicUrl || null
    }

    const htmlFoto = `
      <div class="receta-foto-wrap">
        ${fotoUrl
          ? `<img src="${fotoUrl}" class="receta-foto" alt="${receta.nombre_platillo}">`
          : (window._recPuedeEditar ? `<div class="receta-foto-placeholder">Sin foto todavía</div>` : '')}
        ${window._recPuedeEditar ? `
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
            <input type="file" accept="image/*" id="receta-foto-input-${receta.id_receta}" style="display:none" onchange="subirFotoReceta('${receta.id_receta}', this)">
            <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('receta-foto-input-${receta.id_receta}').click()">
              ${fotoUrl ? 'Cambiar foto' : '📷 Subir foto'}
            </button>
            <span id="receta-foto-msg-${receta.id_receta}" style="font-size:12px;color:#3A8C3E"></span>
          </div>` : ''}
      </div>`

    wrap.innerHTML = `
      <div class="receta-detalle-card">
        <div class="detalle-header">
          <div>
            <h3>${receta.nombre_platillo}</h3>
            <p class="detalle-categoria">${receta.categoria || ''}</p>
          </div>
        </div>

        ${htmlFoto}

        ${!esReventa ? `
          ${hayCantidadFaltante ? `
          <div class="banner-aviso">
            ⚠ Esta receta tiene ${ingSinCantidad.length} ingrediente${ingSinCantidad.length > 1 ? 's' : ''} sin cantidad capturada.
          </div>` : ''}

          <div class="receta-detalle-grid">
            <div>
              <h4>Ingredientes</h4>
              ${htmlIngredientes}
            </div>
            <div>
              <h4>Procedimiento</h4>
              ${htmlPasos}
              <h4>Notas adicionales</h4>
              ${htmlNotas}
            </div>
          </div>
        ` : `
          ${htmlSabores}
          <h4>Notas adicionales</h4>
          ${htmlNotas}
        `}
      </div>
    `

  } catch (err) {
    wrap.innerHTML = `<p style="margin-top:24px;color:var(--color-highlight)">Error al cargar receta: ${err.message}</p>`
  }
}

window.subirFotoReceta = async function(idReceta, inputEl) {
  const file = inputEl.files && inputEl.files[0]
  if (!file) return
  const msg = document.getElementById(`receta-foto-msg-${idReceta}`)
  if (msg) { msg.style.color = 'var(--color-text-muted)'; msg.textContent = 'Subiendo...' }

  try {
    const tenant_id = await getTenantId()
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${tenant_id}/${idReceta}.${ext}`

    const { error: upErr } = await window._db.storage.from('recetas').upload(path, file, { upsert: true })
    if (upErr) throw upErr

    const { error: dbErr } = await window._db.from('catalogo_recetas')
      .update({ foto_url: path, updated_at: new Date().toISOString() })
      .eq('id_receta', idReceta)
      .eq('tenant_id', tenant_id)
    if (dbErr) throw dbErr

    const receta = (window._recetas || []).find(r => r.id_receta === idReceta)
    if (receta) receta.foto_url = path

    if (msg) { msg.style.color = '#3A8C3E'; msg.textContent = '✓ Guardado' }
    if (receta) cargarDetalleReceta(receta)
  } catch (err) {
    if (msg) { msg.style.color = '#B85C2A'; msg.textContent = 'Error: ' + err.message }
  }
}

function limpiarPaso(texto) {
  if (!texto) return ''
  return texto.replace(/^Paso\s+\d+\s*[—\-:]\s*/i, '').trim()
}

async function exportarRecetasPDF(fuente) {
  const tenant_id    = await getTenantId()
  const tenantNombre = window._tenantConfig?.nombre || tenant_id
  const tenantActual = (window._tenantConfig?.nombre || '').toLowerCase()
  const etiqueta     = (FUENTES_POR_TENANT[tenantActual] || []).find(f => f.fuente === fuente)?.etiqueta || fuente

  let recetas = (window._recetas || [])
    .filter(r => r.activo !== false && r.fuente === fuente && r.tenant_id === tenant_id)

  if (!recetas.length) { alert('No hay recetas para exportar con esta fuente.'); return }

  const ids = recetas.map(r => r.id_receta)

  const [
    { data: todosIngredientes },
    { data: todosPasos },
    { data: todosProductos }
  ] = await Promise.all([
    window._db.from('receta_ingredientes').select('*').in('id_receta', ids).eq('activo', true).order('orden', { ascending: true, nullsFirst: false }),
    window._db.from('receta_procedimientos').select('*').in('id_receta', ids).neq('activo', false).order('paso_num'),
    window._db.from('productos').select('id_producto, unidad_medida').eq('tenant_id', tenant_id).eq('activo', true)
  ])

  const unidadPorProducto = {}
  ;(todosProductos || []).forEach(p => { unidadPorProducto[p.id_producto] = p.unidad_medida })

  const ingPorReceta = {}
  ;(todosIngredientes || []).forEach(i => {
    if (!ingPorReceta[i.id_receta]) ingPorReceta[i.id_receta] = []
    ingPorReceta[i.id_receta].push(i)
  })

  const pasosPorReceta = {}
  ;(todosPasos || []).forEach(p => {
    if (!pasosPorReceta[p.id_receta]) pasosPorReceta[p.id_receta] = []
    pasosPorReceta[p.id_receta].push(p)
  })

  recetas = recetas.filter(r => {
    const tieneIngs  = (ingPorReceta[r.id_receta]   || []).length > 0
    const tienePasos = (pasosPorReceta[r.id_receta] || []).length > 0
    return tieneIngs && tienePasos
  })

  recetas.sort((a, b) => {
    const pa = indicePrioridad(tenantActual, a.categoria || '')
    const pb = indicePrioridad(tenantActual, b.categoria || '')
    if (pa !== pb) return pa - pb
    return (a.nombre_platillo || '').localeCompare(b.nombre_platillo || '')
  })

  if (!recetas.length) { alert('No hay recetas con ingredientes y pasos para exportar.'); return }

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

  const htmlBloqueReceta = (receta) => {
    const ings = ingPorReceta[receta.id_receta] || []
    const pasos = pasosPorReceta[receta.id_receta] || []

    const htmlIng = `
      <p class="pdf-seccion-titulo">Ingredientes</p>
      <table class="pdf-table">
        <thead><tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th><th>Nota</th></tr></thead>
        <tbody>
          ${ings.map(i => `<tr>
            <td>${i.producto || ''}</td>
            <td>${i.cantidad != null ? i.cantidad : '—'}</td>
            <td>${unidadPorProducto[i.id_producto] || ''}</td>
            <td>${i.notas_ingrediente || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>`

    let htmlProc = '<p class="pdf-seccion-titulo">Procedimiento</p>'
    if (pasos.length > 0) {
      const secciones = []
      let seccionActual = null
      pasos.forEach(p => {
        const sec = p.seccion || null
        if (sec !== seccionActual) {
          secciones.push({ nombre: sec, pasos: [] })
          seccionActual = sec
        }
        secciones[secciones.length - 1].pasos.push(p)
      })

      const mostrarSecciones = secciones.length > 1 || (secciones.length === 1 && secciones[0].nombre)

      if (mostrarSecciones) {
        htmlProc += secciones.map(sec => `
          ${sec.nombre ? `<p class="pdf-subseccion">${sec.nombre}</p>` : ''}
          <ol class="pdf-ol">
            ${sec.pasos.map(p => `<li class="pdf-paso">${limpiarPaso(p.proceso)}</li>`).join('')}
          </ol>`).join('')
      } else {
        htmlProc += `<ol class="pdf-ol">
          ${pasos.map(p => `<li class="pdf-paso">${limpiarPaso(p.proceso)}</li>`).join('')}
        </ol>`
      }
    }

    const metaParts = [receta.categoria, etiqueta]
    if (receta.peso_pieza_g) metaParts.push(`Peso pieza: ${receta.peso_pieza_g}g`)
    const meta = metaParts.filter(Boolean).join(' · ')

    const htmlNotas = receta.notas_revision
      ? `<div class="pdf-notas"><strong>Notas adicionales:</strong><br>${receta.notas_revision}</div>`
      : ''

    return `
      <div class="pdf-receta">
        <p class="pdf-receta-titulo">${receta.nombre_platillo}</p>
        <p class="pdf-receta-meta">${meta}</p>
        ${htmlIng}
        ${htmlProc}
        ${htmlNotas}
      </div>`
  }

  const htmlPortada = `
    <div class="pdf-receta">
      <div class="pdf-header">
        <p class="pdf-title">Catálogo de Recetas — ${etiqueta}</p>
        <p class="pdf-subtitle">${fecha} · ${recetas.length} recetas</p>
      </div>
    </div>`

  const htmlIndice = `
    <div class="pdf-receta">
      <p class="pdf-grupo-titulo">Índice</p>
      <table class="pdf-table">
        <thead><tr><th>Receta</th><th>Categoría</th></tr></thead>
        <tbody>
          ${recetas.map(r => `<tr><td>${r.nombre_platillo}</td><td>${r.categoria || ''}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Catálogo de Recetas — ${etiqueta}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #2B1A0F; margin: 0; }
  .pdf-header { border-bottom: 2px solid #C8892A; padding-bottom: 12px; margin-bottom: 18px; }
  .pdf-title { font-size: 22px; font-weight: bold; color: #2B1A0F; margin: 0; }
  .pdf-subtitle { font-size: 10px; color: #9B7B6A; margin-top: 4px; }
  .pdf-grupo-titulo { font-size: 13px; font-weight: bold; color: #C8892A; margin-top: 18px; margin-bottom: 6px; }
  .pdf-receta { page-break-after: always; }
  .pdf-receta:last-child { page-break-after: auto; }
  .pdf-receta-titulo { font-size: 18px; font-weight: bold; color: #2B1A0F; margin: 0; }
  .pdf-receta-meta { font-size: 9px; color: #9B7B6A; margin-top: 4px; margin-bottom: 14px; }
  .pdf-seccion-titulo { font-size: 11px; font-weight: bold; color: #C8892A; margin-top: 14px; margin-bottom: 4px; }
  .pdf-subseccion { font-size: 10px; font-weight: bold; color: #C8892A; margin-top: 10px; margin-bottom: 4px; }
  .pdf-ol { font-size: 10px; margin: 0 0 8px 0; padding-left: 20px; line-height: 1.4; }
  .pdf-paso { margin: 3px 0; line-height: 1.4; }
  .pdf-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .pdf-table th { background: #FAF7F2; color: #9B7B6A; text-align: left; padding: 5px 8px; border: 0.5px solid #E8DDD5; font-weight: bold; font-size: 9px; }
  .pdf-table td { padding: 4px 8px; border: 0.5px solid #E8DDD5; vertical-align: top; }
  .pdf-notas { background: #FAF7F2; border: 0.5px solid #E8DDD5; padding: 8px 10px; font-style: italic; font-size: 9px; color: #9B7B6A; margin-top: 14px; line-height: 1.4; }
  .pdf-footer { position: fixed; bottom: 1cm; left: 0; right: 0; font-size: 8px; color: #9B7B6A; display: flex; justify-content: space-between; }
  @page { size: letter; margin: 2cm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8px; color: #9B7B6A; } }
</style>
</head>
<body>
${htmlPortada}
${htmlIndice}
${recetas.map(r => htmlBloqueReceta(r)).join('')}
<div class="pdf-footer">
  <span>dataDesk · ${tenantNombre}</span>
</div>
</body>
</html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
}
