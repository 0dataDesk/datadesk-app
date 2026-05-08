async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando recetas...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol = window._rol || 'operador'
    const puedeEditar = rol === 'editor' || rol === 'admin'
    const esAdmin = rol === 'admin'

    const [
      { data: recetas, error: errR },
      { data: unidades, error: errU },
      { data: categorias, error: errC }
    ] = await Promise.all([
      window._db.from('catalogo_recetas').select('*').eq('tenant_id', tenant_id).order('nombre'),
      window._db.from('catalogo_unidades').select('*').order('nombre'),
      window._db.from('catalogo_categorias').select('*').order('nombre')
    ])

    if (errR) throw errR

    window._recetas    = recetas    || []
    window._unidades   = unidades   || []
    window._categorias = categorias || []
    window._recetaSeleccionada = null

    const cats = [...new Set(window._recetas.map(r => r.categoria).filter(Boolean))].sort()

    content.innerHTML = `
      <div class="vista-header">
        <h2>Revisión de Recetas</h2>
        <div class="filtros">
          <input type="text" id="filtro-nombre" placeholder="Buscar receta..." />
          <select id="filtro-status-r">
            <option value="">Todos los status</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="archivado">Archivado</option>
          </select>
          <select id="filtro-cat">
            <option value="">Todas las categorías</option>
            ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="recetas-layout" id="recetas-layout">
        <div class="recetas-lista-panel">
          <select id="receta-select-mobile" class="receta-mobile-select">
            <option value="">Selecciona una receta...</option>
          </select>
          <div class="tabla-wrapper receta-desktop-table">
            <table class="tabla">
              <thead><tr><th>Receta</th><th>Categoría</th><th>Status</th></tr></thead>
              <tbody id="tbody-recetas"></tbody>
            </table>
          </div>
        </div>

        <div class="detalle-receta" id="detalle-receta">
          <p style="color:var(--color-text-muted);font-size:13px">Selecciona una receta para ver el detalle.</p>
        </div>
      </div>
    `

    const renderLista = () => {
      const buscar  = document.getElementById('filtro-nombre').value.toLowerCase()
      const statusF = document.getElementById('filtro-status-r').value
      const catF    = document.getElementById('filtro-cat').value

      const filtradas = window._recetas.filter(r =>
        (!buscar  || r.nombre.toLowerCase().includes(buscar)) &&
        (!statusF || (r.status || 'pendiente') === statusF) &&
        (!catF    || r.categoria === catF)
      )

      // Desktop table
      const tbody = document.getElementById('tbody-recetas')
      if (tbody) {
        tbody.innerHTML = filtradas.map(r => `
          <tr class="fila-receta${window._recetaSeleccionada?.id_receta === r.id_receta ? ' selected' : ''}"
              data-id="${r.id_receta}">
            <td>${r.nombre}</td>
            <td>${r.categoria || ''}</td>
            <td><span class="badge-status ${r.status || 'pendiente'}">${r.status || 'pendiente'}</span></td>
          </tr>
        `).join('')

        tbody.querySelectorAll('.fila-receta').forEach(tr => {
          tr.addEventListener('click', () => {
            const id = parseInt(tr.dataset.id)
            const receta = window._recetas.find(r => r.id_receta === id)
            if (receta) seleccionarReceta(receta, puedeEditar, esAdmin)
          })
        })
      }

      // Mobile select
      const sel = document.getElementById('receta-select-mobile')
      if (sel) {
        const prev = sel.value
        sel.innerHTML = `<option value="">Selecciona una receta...</option>` +
          filtradas.map(r =>
            `<option value="${r.id_receta}"${window._recetaSeleccionada?.id_receta === r.id_receta ? ' selected' : ''}>${r.nombre} · ${r.status || 'pendiente'}</option>`
          ).join('')
        if (prev) sel.value = prev
      }
    }

    document.getElementById('filtro-nombre').addEventListener('input', renderLista)
    document.getElementById('filtro-status-r').addEventListener('change', renderLista)
    document.getElementById('filtro-cat').addEventListener('change', renderLista)

    document.getElementById('receta-select-mobile').addEventListener('change', e => {
      const id = parseInt(e.target.value)
      if (!id) return
      const receta = window._recetas.find(r => r.id_receta === id)
      if (receta) seleccionarReceta(receta, puedeEditar, esAdmin)
    })

    // Responsive: toggle mobile vs desktop list
    const ajustarLayout = () => {
      const mobile = window.innerWidth < 700
      const mEl = document.getElementById('receta-select-mobile')
      const dEl = document.querySelector('.receta-desktop-table')
      if (mEl) mEl.style.display = mobile ? 'block' : 'none'
      if (dEl) dEl.style.display = mobile ? 'none'  : 'block'
    }
    window.addEventListener('resize', ajustarLayout)
    ajustarLayout()

    renderLista()

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

async function seleccionarReceta(receta, puedeEditar, esAdmin) {
  window._recetaSeleccionada = receta

  // Highlight row
  document.querySelectorAll('.fila-receta').forEach(tr => tr.classList.remove('selected'))
  document.querySelector(`.fila-receta[data-id="${receta.id_receta}"]`)?.classList.add('selected')

  const detalle = document.getElementById('detalle-receta')
  detalle.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">Cargando...</p>`

  try {
    const [
      { data: ingredientes, error: errI },
      { data: pasos,        error: errP }
    ] = await Promise.all([
      window._db.from('receta_ingredientes')
        .select('*, productos(producto)')
        .eq('id_receta', receta.id_receta)
        .order('id'),
      window._db.from('receta_procedimientos')
        .select('*')
        .eq('id_receta', receta.id_receta)
        .order('orden')
    ])

    if (errI) throw errI
    if (errP) throw errP

    const ings  = (ingredientes || []).filter(i => i.activo !== false)
    const steps = (pasos        || []).filter(p => p.activo !== false)

    // Build unidades options
    const uOpts = (window._unidades || [])
      .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}">${v}</option>` })
      .join('')

    // Build categorias options
    const cOpts = (window._categorias || [])
      .map(c => {
        const v = c.nombre || c.categoria || c.id
        return `<option value="${v}"${receta.categoria === v ? ' selected' : ''}>${v}</option>`
      }).join('')

    // Ingredients HTML
    const htmlIngredientes = puedeEditar
      ? `<div class="tabla-wrapper">
          <table class="tabla tabla-editable">
            <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              ${ings.map(i => `
                <tr data-ing-id="${i.id}">
                  <td>${i.productos?.producto || i.id_producto || ''}</td>
                  <td><input class="edit-input" type="number" step="any" value="${i.cantidad != null ? i.cantidad : ''}" data-field="cantidad" /></td>
                  <td><select class="edit-select" data-field="unidad">
                    <option value="${i.unidad || ''}">${i.unidad || '—'}</option>
                    ${uOpts}
                  </select></td>
                  <td><input class="edit-input edit-wide" type="text" value="${(i.notas_ingrediente || '').replace(/"/g, '&quot;')}" data-field="notas_ingrediente" placeholder="Notas..." /></td>
                  <td><button class="btn-accion btn-inactivar" data-table="receta_ingredientes" data-id="${i.id}">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn-accion btn-guardar-sec" id="btn-guardar-ing" style="margin-top:8px">Guardar ingredientes</button>`
      : `<div class="tabla-wrapper">
          <table class="tabla">
            <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Notas</th></tr></thead>
            <tbody>
              ${ings.map(i => `<tr>
                <td>${i.productos?.producto || i.id_producto || ''}</td>
                <td>${i.cantidad != null ? i.cantidad : ''}</td>
                <td>${i.unidad || ''}</td>
                <td>${i.notas_ingrediente || ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`

    // Procedure HTML
    const htmlPasos = puedeEditar
      ? `<ol class="procedimiento procedimiento-editable">
          ${steps.map(p => `
            <li data-paso-id="${p.id}">
              <div class="paso-editable-row">
                <textarea class="edit-textarea edit-paso" data-field="descripcion" rows="2">${limpiarPaso(p.descripcion)}</textarea>
                <button class="btn-accion btn-inactivar" data-table="receta_procedimientos" data-id="${p.id}">✕</button>
              </div>
            </li>
          `).join('')}
        </ol>
        <button class="btn-accion btn-guardar-sec" id="btn-guardar-pas" style="margin-top:8px">Guardar pasos</button>`
      : `<ol class="procedimiento">
          ${steps.map(p => `<li>${limpiarPaso(p.descripcion)}</li>`).join('')}
        </ol>`

    // Notas de revision HTML
    const htmlNotas = puedeEditar
      ? `<textarea id="notas-revision" class="edit-textarea" rows="3" placeholder="Escribe notas de revisión...">${receta.notas_revision || ''}</textarea>
         <button class="btn-accion btn-guardar-sec" id="btn-guardar-notas" style="margin-top:8px">Guardar notas</button>`
      : `<p style="font-size:13px;color:var(--color-text-muted)">${receta.notas_revision || '—'}</p>`

    detalle.innerHTML = `
      <div class="detalle-header">
        <div>
          <h3>${receta.nombre}</h3>
          ${puedeEditar
            ? `<div class="edit-cat-row">
                <label>Categoría:</label>
                <select class="edit-select" id="edit-categoria">
                  <option value="">Sin categoría</option>
                  ${cOpts}
                </select>
               </div>`
            : `<p class="detalle-categoria">${receta.categoria || ''}</p>`}
        </div>
        <div class="detalle-acciones">
          <span class="badge-status ${receta.status || 'pendiente'}">${receta.status || 'pendiente'}</span>
          ${esAdmin ? `<div class="acciones-receta" style="margin-top:8px">
            <button class="btn-accion btn-aprobar" id="btn-aprobar">Aprobar</button>
            <button class="btn-accion btn-archivar" id="btn-archivar">Archivar</button>
          </div>` : ''}
        </div>
      </div>

      <h4>Ingredientes</h4>
      <div id="section-ingredientes">${htmlIngredientes}</div>

      <h4>Procedimiento</h4>
      <div id="section-pasos">${htmlPasos}</div>

      <h4>Notas de revisión</h4>
      <div id="section-notas">${htmlNotas}</div>
    `

    // Admin: approve / archive
    if (esAdmin) {
      document.getElementById('btn-aprobar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'aprobado', puedeEditar, esAdmin))
      document.getElementById('btn-archivar')?.addEventListener('click', () =>
        cambiarStatusReceta(receta, 'archivado', puedeEditar, esAdmin))
    }

    // Save ingredients
    document.getElementById('btn-guardar-ing')?.addEventListener('click', async () => {
      const rows = detalle.querySelectorAll('#section-ingredientes tr[data-ing-id]')
      let ok = true
      for (const row of rows) {
        const id     = row.dataset.ingId
        const cantRaw = row.querySelector('[data-field="cantidad"]')?.value
        const cantidad = cantRaw !== '' && cantRaw != null ? parseFloat(cantRaw) : null
        const unidad  = row.querySelector('[data-field="unidad"]')?.value || null
        const notas   = row.querySelector('[data-field="notas_ingrediente"]')?.value || null
        const { error } = await window._db.from('receta_ingredientes')
          .update({ cantidad, unidad, notas_ingrediente: notas })
          .eq('id', id)
        if (error) { ok = false; console.error(error) }
      }
      mostrarToast(ok ? 'Ingredientes guardados' : 'Error al guardar algunos ingredientes')
    })

    // Save pasos
    document.getElementById('btn-guardar-pas')?.addEventListener('click', async () => {
      const items = detalle.querySelectorAll('#section-pasos li[data-paso-id]')
      let ok = true
      for (const li of items) {
        const id   = li.dataset.pasoId
        const desc = li.querySelector('[data-field="descripcion"]')?.value || ''
        const { error } = await window._db.from('receta_procedimientos')
          .update({ descripcion: desc })
          .eq('id', id)
        if (error) { ok = false; console.error(error) }
      }
      mostrarToast(ok ? 'Pasos guardados' : 'Error al guardar algunos pasos')
    })

    // Save notas
    document.getElementById('btn-guardar-notas')?.addEventListener('click', async () => {
      const notas = document.getElementById('notas-revision')?.value || ''
      const { error } = await window._db.from('catalogo_recetas')
        .update({ notas_revision: notas })
        .eq('id_receta', receta.id_receta)
      if (!error) {
        receta.notas_revision = notas
        mostrarToast('Notas guardadas')
      } else {
        mostrarToast('Error al guardar notas')
        console.error(error)
      }
    })

    // Save categoria
    document.getElementById('edit-categoria')?.addEventListener('change', async e => {
      const cat = e.target.value || null
      const { error } = await window._db.from('catalogo_recetas')
        .update({ categoria: cat })
        .eq('id_receta', receta.id_receta)
      if (!error) {
        receta.categoria = cat
        const r = window._recetas.find(r => r.id_receta === receta.id_receta)
        if (r) r.categoria = cat
        mostrarToast('Categoría guardada')
      }
    })

    // Inactivar buttons
    detalle.querySelectorAll('.btn-inactivar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tabla = btn.dataset.table
        const id    = btn.dataset.id
        const { error } = await window._db.from(tabla).update({ activo: false }).eq('id', id)
        if (!error) {
          const parent = btn.closest('tr') || btn.closest('li')
          if (parent) { parent.style.opacity = '0.35'; parent.style.pointerEvents = 'none' }
          btn.disabled = true
          mostrarToast('Elemento inactivado')
        }
      })
    })

  } catch (err) {
    detalle.innerHTML = `<p>Error: ${err.message}</p>`
  }
}

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
  const r = window._recetas.find(r => r.id_receta === receta.id_receta)
  if (r) r.status = nuevoStatus

  // Refresh list
  document.getElementById('filtro-nombre')?.dispatchEvent(new Event('input'))

  // Re-render detail with updated status
  seleccionarReceta(receta, puedeEditar, esAdmin)
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
