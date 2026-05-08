async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol        = window._rol || 'operador'
    const puedeEditar = rol === 'editor' || rol === 'admin'
    const esAdmin     = rol === 'admin'

    const [
      { data: recetas,  error: errR },
      { data: unidades, error: errU }
    ] = await Promise.all([
      window._db.from('catalogo_recetas').select('*').eq('tenant_id', tenant_id).order('nombre_platillo'),
      window._db.from('catalogo_unidades').select('*').order('nombre')
    ])

    if (errR) throw errR

    window._recetas  = recetas  || []
    window._unidades = unidades || []

    // Valores únicos para los tres filtros
    const fuentes  = [...new Set(window._recetas.map(r => r.fuente).filter(Boolean))].sort()
    const cats0    = [...new Set(window._recetas.map(r => r.categoria).filter(Boolean))].sort()
    const plats0   = [...window._recetas].sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

    content.innerHTML = `
      <div class="vista-header">
        <h2>Revisión de Recetas</h2>
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
            ${plats0.map(r => `<option value="${r.id_receta}">${r.nombre_platillo}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="receta-detalle-wrap"></div>
    `

    const fFuente   = document.getElementById('f-fuente')
    const fCategoria = document.getElementById('f-categoria')
    const fPlatillo  = document.getElementById('f-platillo')

    // Recalcula categorias y platillos según selección actual
    const actualizarFiltros = (resetPlatillo = true) => {
      const fuente    = fFuente.value
      const categoria = fCategoria.value

      // Categorías disponibles según fuente
      const catsDisp = [...new Set(
        window._recetas
          .filter(r => !fuente || r.fuente === fuente)
          .map(r => r.categoria).filter(Boolean)
      )].sort()

      const catActual = fCategoria.value
      fCategoria.innerHTML =
        `<option value="">Todas las categorías</option>` +
        catsDisp.map(c => `<option value="${c}"${c === catActual ? ' selected' : ''}>${c}</option>`).join('')

      // Platillos disponibles según fuente + categoría
      const platsDisp = window._recetas
        .filter(r =>
          (!fuente    || r.fuente    === fuente) &&
          (!categoria || r.categoria === categoria)
        )
        .sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

      fPlatillo.innerHTML =
        `<option value="">Selecciona un platillo...</option>` +
        platsDisp.map(r => `<option value="${r.id_receta}">${r.nombre_platillo}</option>`).join('')

      if (resetPlatillo) document.getElementById('receta-detalle-wrap').innerHTML = ''
    }

    // ── Fuente cambia → recalcula categorías y platillos ─────────────────
    fFuente.addEventListener('change', () => actualizarFiltros())

    // ── Categoría cambia → recalcula platillos ───────────────────────────
    fCategoria.addEventListener('change', () => actualizarFiltros())

    // ── Platillo → carga receta ──────────────────────────────────────────
    fPlatillo.addEventListener('change', () => {
      const id = parseInt(fPlatillo.value)
      document.getElementById('receta-detalle-wrap').innerHTML = ''
      if (!id) return
      const receta = window._recetas.find(r => r.id_receta === id)
      if (receta) cargarDetalleReceta(receta, puedeEditar, esAdmin)
    })

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

// ── Detalle de receta ────────────────────────────────────────────────────────
async function cargarDetalleReceta(receta, puedeEditar, esAdmin) {
  const wrap = document.getElementById('receta-detalle-wrap')
  wrap.innerHTML = `<p style="color:var(--color-text-muted);margin-top:24px">Cargando receta...</p>`

  try {
    const [
      { data: ingredientes, error: errI },
      { data: pasos,        error: errP }
    ] = await Promise.all([
      window._db.from('receta_ingredientes')
        .select('*')
        .eq('id_receta', receta.id_receta)
        .order('id'),
      window._db.from('receta_procedimientos')
        .select('*')
        .eq('id_receta', receta.id_receta)
        .order('paso_num')
    ])

    if (errI) throw errI
    if (errP) throw errP

    const ings  = (ingredientes || []).filter(i => i.activo !== false)
    const steps = (pasos        || []).filter(p => p.activo !== false)

    const uOpts = (window._unidades || [])
      .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}">${v}</option>` })
      .join('')

    // ── Ingredientes ────────────────────────────────────────────────────
    const htmlIngredientes = puedeEditar
      ? `<div class="tabla-wrapper">
          <table class="tabla tabla-editable">
            <thead>
              <tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Nota</th><th></th></tr>
            </thead>
            <tbody>
              ${ings.map(i => `
                <tr data-ing-id="${i.id}">
                  <td>${i.producto || ''}</td>
                  <td><input class="edit-input edit-num" type="number" step="any"
                        value="${i.cantidad != null ? i.cantidad : ''}"
                        data-field="cantidad" /></td>
                  <td><select class="edit-select" data-field="unidad">
                        <option value="${i.unidad || ''}">${i.unidad || '—'}</option>
                        ${uOpts}
                      </select></td>
                  <td><input class="edit-input edit-wide" type="text"
                        value="${(i.notas_ingrediente || '').replace(/"/g, '&quot;')}"
                        data-field="notas_ingrediente" placeholder="Nota..." /></td>
                  <td><button class="btn-accion btn-inactivar"
                        data-table="receta_ingredientes" data-id="${i.id}"
                        title="Inactivar ingrediente">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn-accion btn-guardar-sec" id="btn-guardar-ing" style="margin-top:10px">
          Guardar ingredientes
        </button>`
      : `<div class="tabla-wrapper">
          <table class="tabla">
            <thead>
              <tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Nota</th></tr>
            </thead>
            <tbody>
              ${ings.map(i => `<tr>
                <td>${i.producto || ''}</td>
                <td>${i.cantidad != null ? i.cantidad : ''}</td>
                <td>${i.unidad || ''}</td>
                <td>${i.notas_ingrediente || ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`

    // ── Procedimiento ───────────────────────────────────────────────────
    const htmlPasos = puedeEditar
      ? `<ol class="procedimiento procedimiento-editable">
          ${steps.map(p => `
            <li data-paso-id="${p.id}">
              <div class="paso-editable-row">
                <textarea class="edit-textarea edit-paso" data-field="proceso"
                          rows="2">${limpiarPaso(p.proceso)}</textarea>
                <button class="btn-accion btn-inactivar"
                        data-table="receta_procedimientos" data-id="${p.id}"
                        title="Inactivar paso">✕</button>
              </div>
            </li>
          `).join('')}
        </ol>
        <button class="btn-accion btn-guardar-sec" id="btn-guardar-pas" style="margin-top:10px">
          Guardar pasos
        </button>`
      : `<ol class="procedimiento">
          ${steps.map(p => `<li>${limpiarPaso(p.proceso)}</li>`).join('')}
        </ol>`

    // ── Render ──────────────────────────────────────────────────────────
    wrap.innerHTML = `
      <div class="receta-detalle-card">

        <div class="detalle-header">
          <div>
            <h3>${receta.nombre_platillo}</h3>
            <p class="detalle-categoria">${receta.categoria || ''}</p>
          </div>
          <div class="detalle-acciones">
            <span class="badge-status ${receta.status || 'pendiente'}">${receta.status || 'pendiente'}</span>
            ${esAdmin ? `
              <div class="acciones-receta" style="margin-top:8px">
                <button class="btn-accion btn-aprobar" id="btn-aprobar">Aprobar</button>
                <button class="btn-accion btn-archivar" id="btn-archivar">Archivar</button>
              </div>` : ''}
          </div>
        </div>

        <h4>Ingredientes</h4>
        <div id="section-ingredientes">${htmlIngredientes}</div>

        <h4>Procedimiento</h4>
        <div id="section-pasos">${htmlPasos}</div>

        <h4>Solicitudes y comentarios</h4>
        <p class="solicitudes-hint">
          Usa este espacio para pedir cambios a la receta: agregar o eliminar ingredientes,
          modificar pasos, correcciones, etc.
        </p>
        ${puedeEditar
          ? `<textarea id="notas-revision" class="edit-textarea" rows="4"
                placeholder="Ej: Agregar 50g de mantequilla al paso 2. Eliminar la cebolla. Aumentar temperatura a 180°C..."
              >${receta.notas_revision || ''}</textarea>
             <button class="btn-accion btn-guardar-sec" id="btn-guardar-notas" style="margin-top:10px">
               Guardar solicitud
             </button>`
          : `<div class="solicitudes-texto">${receta.notas_revision || '<em style="color:var(--color-text-muted)">Sin solicitudes registradas.</em>'}</div>`
        }

      </div>
    `

    // ── Eventos ──────────────────────────────────────────────────────────

    // Admin: aprobar / archivar
    if (esAdmin) {
      document.getElementById('btn-aprobar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'aprobado', puedeEditar, esAdmin))
      document.getElementById('btn-archivar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'archivado', puedeEditar, esAdmin))
    }

    // Guardar ingredientes
    document.getElementById('btn-guardar-ing')?.addEventListener('click', async () => {
      const rows = wrap.querySelectorAll('#section-ingredientes tr[data-ing-id]')
      let ok = true
      for (const row of rows) {
        const id      = row.dataset.ingId
        const cantRaw = row.querySelector('[data-field="cantidad"]')?.value
        const cantidad = cantRaw !== '' && cantRaw != null ? parseFloat(cantRaw) : null
        const unidad   = row.querySelector('[data-field="unidad"]')?.value || null
        const notas    = row.querySelector('[data-field="notas_ingrediente"]')?.value || null
        const { error } = await window._db.from('receta_ingredientes')
          .update({ cantidad, unidad, notas_ingrediente: notas })
          .eq('id', id)
        if (error) { ok = false; console.error(error) }
      }
      mostrarToast(ok ? 'Ingredientes guardados' : 'Error al guardar algunos ingredientes')
    })

    // Guardar pasos
    document.getElementById('btn-guardar-pas')?.addEventListener('click', async () => {
      const items = wrap.querySelectorAll('#section-pasos li[data-paso-id]')
      let ok = true
      for (const li of items) {
        const id   = li.dataset.pasoId
        const desc = li.querySelector('[data-field="proceso"]')?.value || ''
        const { error } = await window._db.from('receta_procedimientos')
          .update({ proceso: desc })
          .eq('id', id)
        if (error) { ok = false; console.error(error) }
      }
      mostrarToast(ok ? 'Pasos guardados' : 'Error al guardar algunos pasos')
    })

    // Guardar solicitud / notas
    document.getElementById('btn-guardar-notas')?.addEventListener('click', async () => {
      const notas = document.getElementById('notas-revision')?.value || ''
      const { error } = await window._db.from('catalogo_recetas')
        .update({ notas_revision: notas })
        .eq('id_receta', receta.id_receta)
      if (!error) {
        receta.notas_revision = notas
        mostrarToast('Solicitud guardada')
      } else {
        mostrarToast('Error al guardar')
        console.error(error)
      }
    })

    // Inactivar ingrediente / paso
    wrap.querySelectorAll('.btn-inactivar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tabla = btn.dataset.table
        const id    = btn.dataset.id
        const { error } = await window._db.from(tabla).update({ activo: false }).eq('id', id)
        if (!error) {
          const parent = btn.closest('tr') || btn.closest('li')
          if (parent) { parent.style.opacity = '0.3'; parent.style.pointerEvents = 'none' }
          btn.disabled = true
          mostrarToast('Elemento inactivado')
        } else {
          mostrarToast('Error al inactivar')
          console.error(error)
        }
      })
    })

  } catch (err) {
    wrap.innerHTML = `<p style="margin-top:24px">Error: ${err.message}</p>`
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function limpiarPaso(texto) {
  if (!texto) return ''
  return texto.replace(/^Paso\s+\d+\s*[—\-:]\s*/i, '').trim()
}

async function cambiarStatusReceta(receta, nuevoStatus, puedeEditar, esAdmin) {
  const { error } = await window._db.from('catalogo_recetas')
    .update({ status: nuevoStatus })
    .eq('id_receta', receta.id_receta)
  if (error) { mostrarToast('Error: ' + error.message); return }

  receta.status = nuevoStatus
  const r = window._recetas?.find(r => r.id_receta === receta.id_receta)
  if (r) r.status = nuevoStatus

  mostrarToast(`Receta ${nuevoStatus}`)
  // Re-render detail to update badge
  cargarDetalleReceta(receta, puedeEditar, esAdmin)
}

function mostrarToast(msg) {
  let toast = document.getElementById('_toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = '_toast'
    toast.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px',
      'background:#10B981', 'color:#fff',
      'padding:10px 20px', 'border-radius:8px',
      'font-size:13px', 'font-weight:600',
      'z-index:9999', 'opacity:0',
      'transition:opacity 0.3s'
    ].join(';')
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.style.opacity = '1'
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { toast.style.opacity = '0' }, 2500)
}
