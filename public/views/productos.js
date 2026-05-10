async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

  try {
    const tenant_id = await getTenantId()
    const rol        = window._rol || 'operador'
    const puedeEditar = rol === 'editor' || rol === 'admin'
    const modo       = window._tenantConfig?.insumos_modo || 'revision'

    const [
      { data: productos, error: errP },
      { data: unidades,  error: errU }
    ] = await Promise.all([
      window._db.from('productos').select('*').eq('tenant_id', tenant_id).order('producto'),
      window._db.from('catalogo_unidades').select('*').order('nombre')
    ])

    if (errP) throw errP
    if (errU) console.warn('catalogo_unidades:', errU.message)

    window._productos = productos || []
    window._unidades  = unidades  || []

    // ── Modo consulta (Furia) ─────────────────────────────────────────────
    if (modo === 'consulta') {
      const cats = [...new Set(window._productos.map(p => p.categoria).filter(Boolean))].sort()

      content.innerHTML = `
        <div class="vista-header">
          <h2>Insumos</h2>
        </div>

        <div class="filtros-cascada">
          <div class="filtro-cascada-item">
            <label class="filtro-label">Categoría</label>
            <select id="f-categoria" class="filtro-select">
              <option value="">Todas las categorías</option>
              ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div id="insumos-grid-wrap"></div>
      `

      const renderGrid = () => {
        const cat  = document.getElementById('f-categoria').value
        const wrap = document.getElementById('insumos-grid-wrap')
        const filtrados = window._productos.filter(p => !cat || p.categoria === cat)

        if (!filtrados.length) {
          wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
          return
        }

        wrap.innerHTML = `
          <div class="insumos-grid">
            ${filtrados.map(p => `
              <div class="insumo-card">
                <div class="insumo-card-nombre">${p.producto}</div>
                <div class="insumo-card-meta">
                  ${p.unidad_medida ? `<span class="insumo-card-unidad">${p.unidad_medida}</span>` : ''}
                  ${p.categoria     ? `<span class="insumo-card-badge">${p.categoria}</span>`      : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `
      }

      document.getElementById('f-categoria').addEventListener('change', renderGrid)
      renderGrid()
      return
    }

    // ── Modo revisión (Tita) ──────────────────────────────────────────────
    const fuentes    = [...new Set(window._productos.map(p => p.fuente).filter(Boolean))].sort()
    const hayUnidades = window._unidades.length > 0

    const uOptsFor = (valorActual) => {
      if (!hayUnidades) return `<option value="${valorActual}">${valorActual || '—'}</option>`
      return window._unidades
        .map(u => { const v = u.nombre || u.unidad || u.id; return `<option value="${v}"${v === valorActual ? ' selected' : ''}>${v}</option>` })
        .join('')
    }

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

      wrap.innerHTML = `
        <div class="tabla-wrapper">
          <table class="tabla insumos-tabla">
            <thead>
              <tr>
                <th>Insumo</th>
                <th class="col-unidad">Unidad</th>
                ${puedeEditar ? '<th class="col-guardar"></th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${filtrados.map(p => `
                <tr data-prod-id="${p.id_producto}">
                  <td>${puedeEditar
                    ? `<input class="edit-input insumo-nombre-input" type="text"
                            value="${p.producto.replace(/"/g, '&quot;')}"
                            data-field="producto" />`
                    : p.producto}
                  </td>
                  <td>${puedeEditar
                    ? (hayUnidades
                        ? `<select class="edit-select insumo-unidad-select" data-field="unidad_medida">
                             <option value="">—</option>
                             ${uOptsFor(p.unidad_medida || '')}
                           </select>`
                        : `<input class="edit-input insumo-unidad-input" type="text"
                                value="${(p.unidad_medida || '').replace(/"/g, '&quot;')}"
                                data-field="unidad_medida" placeholder="unidad" />`)
                    : (p.unidad_medida || '')}
                  </td>
                  ${puedeEditar ? `<td><button class="btn-guardar-fila" data-id="${p.id_producto}" title="Guardar">✓</button></td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`

      if (!puedeEditar) return

      wrap.querySelectorAll('.btn-guardar-fila').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id  = btn.dataset.id
          const row = btn.closest('tr')
          const producto      = row.querySelector('[data-field="producto"]')?.value || ''
          const unidad_medida = row.querySelector('[data-field="unidad_medida"]')?.value || null

          btn.textContent = '…'
          btn.disabled = true

          const { error } = await window._db.from('productos')
            .update({ producto, unidad_medida })
            .eq('id_producto', id)

          if (!error) {
            const p = window._productos.find(p => String(p.id_producto) === String(id))
            if (p) { p.producto = producto; p.unidad_medida = unidad_medida }
            btn.textContent = '✓'
            btn.classList.add('guardado')
            setTimeout(() => { btn.textContent = '✓'; btn.disabled = false; btn.classList.remove('guardado') }, 1500)
          } else {
            btn.textContent = '✕'
            btn.disabled = false
            console.error(error)
            mostrarToast('Error al guardar')
          }
        })
      })
    }

    document.getElementById('f-fuente').addEventListener('change', renderLista)
    renderLista()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
