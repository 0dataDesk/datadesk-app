async function vistaInventario() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventario...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: fechasRaw, error: errF } = await window._db
      .from('inventario_conteos')
      .select('fecha_conteo')
      .eq('tenant_id', tenant_id)
      .order('fecha_conteo', { ascending: false })

    if (errF) throw errF

    const fechas = [...new Set((fechasRaw || []).map(f => f.fecha_conteo))]

    if (fechas.length === 0) {
      content.innerHTML = `
        <div class="vista-header"><h2>Inventario</h2></div>
        <p style="color:var(--color-text-muted)">No hay conteos registrados.</p>
      `
      return
    }

    content.innerHTML = `
      <div class="vista-header"><h2>Inventario</h2></div>
      <div class="filtros-bar">
        <input type="text" id="inv-search" placeholder="Buscar insumo..." class="filtro-search" />
        <select id="inv-fecha" class="filtro-select">
          ${fechas.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>
      <div id="inv-wrap"></div>
    `

    let filasActuales = []

    const renderInventario = () => {
      const wrap = document.getElementById('inv-wrap')
      const texto = document.getElementById('inv-search')?.value.toLowerCase() || ''

      const filtradas = filasActuales.filter(f =>
        !texto || f.producto?.toLowerCase().includes(texto)
      )

      if (!filtradas.length) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">No hay insumos para mostrar.</p>`
        return
      }

      const porGrupo = {}
      filtradas.forEach(f => {
        const g = f.grupo || 'General'
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(f)
      })

      const grupos = Object.keys(porGrupo).sort()
      let html = ''

      grupos.forEach((grupo, idx) => {
        const bodyId = `inv-body-${grupo.replace(/\s+/g, '-')}`
        const secId  = `inv-sec-${grupo.replace(/\s+/g, '-')}`

        html += `
          <div class="precios-seccion" id="${secId}">
            <div class="precios-seccion-header" onclick="toggleSeccion('${bodyId}')">
              <span>${grupo} <span class="precios-seccion-count">${porGrupo[grupo].length}</span></span>
              <span class="precios-seccion-chevron" id="chev-${bodyId}">${idx === 0 ? '▾' : '▸'}</span>
            </div>
            <div class="precios-seccion-body" id="${bodyId}" style="display:${idx === 0 ? 'block' : 'none'}">
              <table class="tabla">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Cantidad</th>
                    <th>Unidad</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  ${porGrupo[grupo].map(f => `
                    <tr>
                      <td>${f.producto}</td>
                      <td>${f.cantidad ?? '—'}</td>
                      <td>${f.unidad || '—'}</td>
                      <td>${f.notas || ''}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
      })

      wrap.innerHTML = html
    }

    const cargarConteo = async (fecha) => {
      const [{ data: conteo, error: errC }, { data: productos, error: errP }] = await Promise.all([
        window._db
          .from('inventario_conteos')
          .select('id_producto, cantidad, unidad, notas')
          .eq('tenant_id', tenant_id)
          .eq('fecha_conteo', fecha),
        window._db
          .from('productos')
          .select('id_producto, producto, grupo')
          .eq('tenant_id', tenant_id)
          .eq('activo', true)
      ])

      if (errC) throw errC
      if (errP) throw errP

      const conteoPorId = {}
      ;(conteo || []).forEach(c => { conteoPorId[c.id_producto] = c })

      filasActuales = (productos || [])
        .filter(p => conteoPorId[p.id_producto])
        .map(p => ({ ...p, ...conteoPorId[p.id_producto] }))

      renderInventario()
    }

    document.getElementById('inv-fecha').addEventListener('change', async (e) => {
      await cargarConteo(e.target.value)
    })

    document.getElementById('inv-search').addEventListener('input', renderInventario)

    await cargarConteo(fechas[0])

  } catch (err) {
    document.getElementById('content').innerHTML = `<p>Error al cargar inventario: ${err.message}</p>`
  }
}
