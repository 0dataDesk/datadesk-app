async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: recetas, error: errR } = await window._db
      .from('catalogo_recetas')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('nombre_platillo')

    if (errR) throw errR

    window._recetas = recetas || []

    const fuentes = [...new Set(window._recetas.map(r => r.fuente).filter(Boolean))].sort()
    const cats0   = [...new Set(window._recetas.map(r => r.categoria).filter(Boolean))].sort()

    content.innerHTML = `
      <div class="vista-header">
        <h2>Recetas</h2>
      </div>

      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fuente</label>
          <select id="f-fuente" class="filtro-select">
            <option value="">Todas las fuentes</option>
            ${fuentes.map(f => `<option value="${f}">${f}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Categoría</label>
          <select id="f-categoria" class="filtro-select">
            <option value="">Todas las categorías</option>
            ${cats0.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Platillo</label>
          <select id="f-platillo" class="filtro-select">
            <option value="">Selecciona un platillo...</option>
            ${window._recetas.map(r => `<option value="${r.id_receta}">${r.nombre_platillo}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="receta-detalle-wrap"></div>
    `

    const fFuente    = document.getElementById('f-fuente')
    const fCategoria = document.getElementById('f-categoria')
    const fPlatillo  = document.getElementById('f-platillo')

    const actualizarFiltros = () => {
      const fuente    = fFuente.value
      const categoria = fCategoria.value

      const catsDisp = [...new Set(
        window._recetas
          .filter(r => !fuente || r.fuente === fuente)
          .map(r => r.categoria).filter(Boolean)
      )].sort()

      fCategoria.innerHTML =
        `<option value="">Todas las categorías</option>` +
        catsDisp.map(c => `<option value="${c}"${c === categoria ? ' selected' : ''}>${c}</option>`).join('')

      const platsDisp = window._recetas
        .filter(r =>
          (!fuente    || r.fuente    === fuente) &&
          (!categoria || r.categoria === categoria)
        )
        .sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

      fPlatillo.innerHTML =
        `<option value="">Selecciona un platillo...</option>` +
        platsDisp.map(r => `<option value="${r.id_receta}">${r.nombre_platillo}</option>`).join('')

      document.getElementById('receta-detalle-wrap').innerHTML = ''
    }

    fFuente.addEventListener('change', actualizarFiltros)
    fCategoria.addEventListener('change', actualizarFiltros)

    fPlatillo.addEventListener('change', () => {
      const val = fPlatillo.value
      document.getElementById('receta-detalle-wrap').innerHTML = ''
      if (!val) return
      const receta = window._recetas.find(r => String(r.id_receta) === String(val))
      if (receta) cargarDetalleReceta(receta)
    })

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
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
        .eq('id_receta', receta.id_receta)
        .eq('activo', true)
        .order('orden', { ascending: true, nullsFirst: false }),
      window._db.from('receta_procedimientos')
        .select('*')
        .eq('id_receta', receta.id_receta)
        .eq('activo', true)
        .order('paso_num'),
      window._db.from('productos')
        .select('id_producto, unidad_medida')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
    ])

    if (errI) throw errI
    if (errP) throw errP

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

    wrap.innerHTML = `
      <div class="receta-detalle-card">
        <div class="detalle-header">
          <div>
            <h3>${receta.nombre_platillo}</h3>
            <p class="detalle-categoria">${receta.categoria || ''}</p>
          </div>
          <span class="badge-status ${receta.status || 'pendiente'}">${receta.status || 'pendiente'}</span>
        </div>

        <h4>Ingredientes</h4>
        ${htmlIngredientes}

        <h4>Procedimiento</h4>
        ${htmlPasos}

        <h4>Notas adicionales</h4>
        ${htmlNotas}
      </div>
    `

  } catch (err) {
    wrap.innerHTML = `<p style="margin-top:24px;color:var(--color-highlight)">Error al cargar receta: ${err.message}</p>`
  }
}

function limpiarPaso(texto) {
  if (!texto) return ''
  return texto.replace(/^Paso\s+\d+\s*[—\-:]\s*/i, '').trim()
}
