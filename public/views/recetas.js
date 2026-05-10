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
      window._db.from('catalogo_unidades').select('*').eq('tenant_id', tenant_id).order('nombre')
    ])

    if (errR) throw errR

    window._recetas  = recetas  || []
    window._unidades = unidades || []

    const fuentes = [...new Set(window._recetas.map(r => r.fuente).filter(Boolean))].sort()
    const cats0   = [...new Set(window._recetas.map(r => r.categoria).filter(Boolean))].sort()
    const plats0  = [...window._recetas].sort((a, b) => a.nombre_platillo.localeCompare(b.nombre_platillo))

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

    const fFuente    = document.getElementById('f-fuente')
    const fCategoria = document.getElementById('f-categoria')
    const fPlatillo  = document.getElementById('f-platillo')

    const actualizarFiltros = (resetPlatillo = true) => {
      const fuente    = fFuente.value
      const categoria = fCategoria.value

      const catsDisp = [...new Set(
        window._recetas
          .filter(r => !fuente || r.fuente === fuente)
          .map(r => r.categoria).filter(Boolean)
      )].sort()

      const catActual = fCategoria.value
      fCategoria.innerHTML =
        `<option value="">Todas las categorías</option>` +
        catsDisp.map(c => `<option value="${c}"${c === catActual ? ' selected' : ''}>${c}</option>`).join('')

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

    fFuente.addEventListener('change', () => actualizarFiltros())
    fCategoria.addEventListener('change', () => actualizarFiltros())

    fPlatillo.addEventListener('change', () => {
      const val = fPlatillo.value
      document.getElementById('receta-detalle-wrap').innerHTML = ''
      if (!val) return
      const receta = window._recetas.find(r => String(r.id_receta) === String(val))
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

    // Activos primero, inactivos al final
    const sortActivo = (arr) => [
      ...arr.filter(x => x.activo !== false),
      ...arr.filter(x => x.activo === false)
    ]

    const ings  = sortActivo(ingredientes || [])
    const steps = sortActivo(pasos        || [])

    const uOptsFor = (valorActual) =>
      (window._unidades || [])
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')

    // ── Ingredientes ────────────────────────────────────────────────────
    const htmlIngredientes = puedeEditar
      ? `<div class="tabla-wrapper">
          <table class="tabla tabla-editable ingredientes-tabla">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Nota</th>
                <th class="col-acciones"></th>
              </tr>
            </thead>
            <tbody>
              ${ings.map(i => {
                const inactivo = i.activo === false
                return `
                <tr data-ing-id="${i.id}" class="${inactivo ? 'fila-inactiva' : ''}">
                  <td>${i.producto || ''}</td>
                  <td><input class="edit-input edit-num" type="text"
                        value="${i.cantidad != null ? i.cantidad : ''}"
                        data-field="cantidad" ${inactivo ? 'disabled' : ''} /></td>
                  <td><select class="edit-select" data-field="unidad" ${inactivo ? 'disabled' : ''}>
                        <option value="">— unidad —</option>
                        ${uOptsFor(i.unidad || '')}
                      </select></td>
                  <td><input class="edit-input edit-wide" type="text"
                        value="${(i.notas_ingrediente || '').replace(/"/g, '&quot;')}"
                        data-field="notas_ingrediente" placeholder="Nota..." ${inactivo ? 'disabled' : ''} /></td>
                  <td class="acciones-fila">
                    ${inactivo
                      ? `<button class="btn-fila btn-restaurar" data-ing-id="${i.id}" title="Restaurar">↺</button>`
                      : `<button class="btn-fila btn-guardar-ing" data-ing-id="${i.id}" title="Guardar">✓</button>
                         <button class="btn-fila btn-inactivar-ing" data-ing-id="${i.id}" title="Inactivar">✕</button>`
                    }
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>`
      : `<div class="tabla-wrapper">
          <table class="tabla">
            <thead>
              <tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Nota</th></tr>
            </thead>
            <tbody>
              ${ings.filter(i => i.activo !== false).map(i => `<tr>
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
          ${steps.map(p => {
            const inactivo = p.activo === false
            return `
            <li data-paso-id="${p.id}" class="${inactivo ? 'fila-inactiva' : ''}">
              <div class="paso-editable-row">
                <textarea class="edit-textarea edit-paso" data-field="proceso"
                          rows="2" ${inactivo ? 'disabled' : ''}>${limpiarPaso(p.proceso)}</textarea>
                <div class="acciones-paso">
                  ${inactivo
                    ? `<button class="btn-fila btn-restaurar" data-paso-id="${p.id}" title="Restaurar">↺</button>`
                    : `<button class="btn-fila btn-guardar-paso" data-paso-id="${p.id}" title="Guardar">✓</button>
                       <button class="btn-fila btn-inactivar-paso" data-paso-id="${p.id}" title="Inactivar">✕</button>`
                  }
                </div>
              </div>
            </li>`
          }).join('')}
        </ol>`
      : `<ol class="procedimiento">
          ${steps.filter(p => p.activo !== false).map(p => `<li>${limpiarPaso(p.proceso)}</li>`).join('')}
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

    if (esAdmin) {
      document.getElementById('btn-aprobar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'aprobado', puedeEditar, esAdmin))
      document.getElementById('btn-archivar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'archivado', puedeEditar, esAdmin))
    }

    // Guardar ingrediente por fila
    wrap.querySelectorAll('.btn-guardar-ing').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id  = btn.dataset.ingId
        const row = btn.closest('tr')
        const cantidad = row.querySelector('[data-field="cantidad"]')?.value?.trim() || null
        const unidad   = row.querySelector('[data-field="unidad"]')?.value || null
        const notas    = row.querySelector('[data-field="notas_ingrediente"]')?.value || null
        btn.textContent = '…'; btn.disabled = true
        const { error } = await window._db.from('receta_ingredientes')
          .update({ cantidad, unidad, notas_ingrediente: notas })
          .eq('id', id)
        if (!error) {
          btn.textContent = '✓'; btn.classList.add('guardado')
          setTimeout(() => { btn.textContent = '✓'; btn.disabled = false; btn.classList.remove('guardado') }, 1500)
        } else {
          btn.textContent = '✕'; btn.disabled = false
          mostrarToast('Error al guardar ingrediente')
        }
      })
    })

    // Inactivar ingrediente por fila
    wrap.querySelectorAll('.btn-inactivar-ing').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.ingId
        const { error } = await window._db.from('receta_ingredientes')
          .update({ activo: false }).eq('id', id)
        if (!error) cargarDetalleReceta(receta, puedeEditar, esAdmin)
        else mostrarToast('Error al inactivar ingrediente')
      })
    })

    // Restaurar ingrediente
    wrap.querySelectorAll('.btn-restaurar[data-ing-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.ingId
        const { error } = await window._db.from('receta_ingredientes')
          .update({ activo: true }).eq('id', id)
        if (!error) cargarDetalleReceta(receta, puedeEditar, esAdmin)
        else mostrarToast('Error al restaurar ingrediente')
      })
    })

    // Guardar paso por fila
    wrap.querySelectorAll('.btn-guardar-paso').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.pasoId
        const li   = btn.closest('li')
        const desc = li.querySelector('[data-field="proceso"]')?.value || ''
        btn.textContent = '…'; btn.disabled = true
        const { error } = await window._db.from('receta_procedimientos')
          .update({ proceso: desc }).eq('id', id)
        if (!error) {
          btn.textContent = '✓'; btn.classList.add('guardado')
          setTimeout(() => { btn.textContent = '✓'; btn.disabled = false; btn.classList.remove('guardado') }, 1500)
        } else {
          btn.textContent = '✕'; btn.disabled = false
          mostrarToast('Error al guardar paso')
        }
      })
    })

    // Inactivar paso
    wrap.querySelectorAll('.btn-inactivar-paso').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pasoId
        const { error } = await window._db.from('receta_procedimientos')
          .update({ activo: false }).eq('id', id)
        if (!error) cargarDetalleReceta(receta, puedeEditar, esAdmin)
        else mostrarToast('Error al inactivar paso')
      })
    })

    // Restaurar paso
    wrap.querySelectorAll('.btn-restaurar[data-paso-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pasoId
        const { error } = await window._db.from('receta_procedimientos')
          .update({ activo: true }).eq('id', id)
        if (!error) cargarDetalleReceta(receta, puedeEditar, esAdmin)
        else mostrarToast('Error al restaurar paso')
      })
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

  } catch (err) {
    wrap.innerHTML = `<p style="margin-top:24px;color:var(--color-highlight)">Error al cargar receta: ${err.message}</p>`
    console.error(err)
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
