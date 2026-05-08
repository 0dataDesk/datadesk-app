async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol       = window._rol || 'operador'
    const puedeEditar = rol === 'editor' || rol === 'admin'

    const [
      { data: productos, error: errP },
      { data: unidades,  error: errU }
    ] = await Promise.all([
      window._db.from('productos').select('*').eq('tenant_id', tenant_id).order('producto'),
      window._db.from('catalogo_unidades').select('*').order('nombre')
    ])

    if (errP) throw errP

    window._productos = productos || []
    window._unidades  = unidades  || []

    const fuentes = [...new Set(window._productos.map(p => p.fuente).filter(Boolean))].sort()

    const uOptsFor = (valorActual) =>
      (window._unidades)
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')

    content.innerHTML = `
      <div class="vista-header">
        <h2>Revisión de Insumos</h2>
      </div>

      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fuente</label>
          <select id="f-fuente" class="filtro-select">
            <option value="">Todas las fuentes</option>
            ${fuentes.map(f => `<option value="${f}">${f}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="insumos-lista-wrap"></div>
    `

    const renderLista = () => {
      const fuente = document.getElementById('f-fuente').value
      const wrap   = document.getElementById('insumos-lista-wrap')

      const filtrados = window._productos.filter(p => !fuente || p.fuente === fuente)

      if (!filtrados.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }

      if (!puedeEditar) {
        wrap.innerHTML = `
          <div class="tabla-wrapper">
            <table class="tabla">
              <thead>
                <tr><th>Insumo</th><th>Unidad</th><th>Grupo</th><th>Categoría</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${filtrados.map(p => `<tr>
                  <td>${p.producto}</td>
                  <td>${p.unidad_medida || ''}</td>
                  <td>${p.grupo || ''}</td>
                  <td>${p.categoria || ''}</td>
                  <td><span class="badge-status ${p.status || 'pendiente'}">${p.status || 'pendiente'}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        return
      }

      wrap.innerHTML = `
        <div class="tabla-wrapper">
          <table class="tabla tabla-editable">
            <thead>
              <tr><th>Insumo</th><th>Unidad</th><th>Grupo</th><th>Categoría</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${filtrados.map(p => `
                <tr data-prod-id="${p.id_producto}">
                  <td><input class="edit-input" type="text"
                        value="${p.producto.replace(/"/g, '&quot;')}"
                        data-field="producto" /></td>
                  <td><select class="edit-select" data-field="unidad_medida">
                        <option value="">— unidad —</option>
                        ${uOptsFor(p.unidad_medida || '')}
                      </select></td>
                  <td>${p.grupo || ''}</td>
                  <td>${p.categoria || ''}</td>
                  <td><span class="badge-status ${p.status || 'pendiente'}">${p.status || 'pendiente'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn-accion btn-guardar-sec" id="btn-guardar-insumos" style="margin-top:12px">
          Guardar cambios
        </button>
      `

      document.getElementById('btn-guardar-insumos').addEventListener('click', async () => {
        const rows = wrap.querySelectorAll('tr[data-prod-id]')
        let ok = true
        for (const row of rows) {
          const id          = row.dataset.prodId
          const producto    = row.querySelector('[data-field="producto"]')?.value || ''
          const unidad_medida = row.querySelector('[data-field="unidad_medida"]')?.value || null
          const { error } = await window._db.from('productos')
            .update({ producto, unidad_medida })
            .eq('id_producto', id)
          if (error) { ok = false; console.error(error) }
          else {
            // Actualizar en memoria
            const p = window._productos.find(p => String(p.id_producto) === String(id))
            if (p) { p.producto = producto; p.unidad_medida = unidad_medida }
          }
        }
        mostrarToast(ok ? 'Insumos guardados' : 'Error al guardar algunos insumos')
      })
    }

    document.getElementById('f-fuente').addEventListener('change', renderLista)
    renderLista()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
