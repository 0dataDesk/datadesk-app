async function vistaInventario() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventario...</p>`

  try {
    const tenant_id = await getTenantId()

    const { data: rawFechas, error: errF } = await window._db
      .from('inventario_conteos')
      .select('fecha_conteo')
      .eq('tenant_id', tenant_id)
      .order('fecha_conteo', { ascending: false })

    if (errF) throw errF

    const fechas = [...new Set((rawFechas || []).map(r => r.fecha_conteo))]

    if (!fechas.length) {
      content.innerHTML = `<div class="vista-header"><h2>Inventario</h2></div><p style="color:var(--color-text-muted)">No hay conteos registrados.</p>`
      return
    }

    content.innerHTML = `
      <div class="vista-header"><h2>Inventario</h2></div>
      <div class="filtros-bar">
        <select id="inv-fecha" class="filtro-select">
          ${fechas.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
        <input type="text" id="inv-search" placeholder="Buscar insumo..." class="filtro-search" />
      </div>
      <div id="inv-resultado"></div>
    `

    const cargarConteo = async (fecha) => {
      const resultado = document.getElementById('inv-resultado')
      resultado.innerHTML = `<p style="color:var(--color-text-muted)">Cargando...</p>`

      const [{ data: conteo, error: errC }, { data: productos, error: errP }] = await Promise.all([
        window._db.from('inventario_conteos').select('id_producto, cantidad, unidad, notas').eq('tenant_id', tenant_id).eq('fecha_conteo', fecha),
        window._db.from('productos').select('id_producto, producto, grupo').eq('tenant_id', tenant_id).eq('activo', true)
      ])

      if (errC) throw errC
      if (errP) throw errP

      const prodMap = {}
      ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

      window._invConteo = (conteo || []).map(c => ({
        ...c,
        producto: prodMap[c.id_producto]?.producto || c.id_producto,
        grupo: prodMap[c.id_producto]?.grupo || 'Sin grupo'
      }))

      renderInventario()
    }

    window.renderInventario = function() {
      const resultado = document.getElementById('inv-resultado')
      const texto = document.getElementById('inv-search')?.value.toLowerCase() || ''

      const filtrados = window._invConteo.filter(c =>
        !texto || c.producto.toLowerCase().includes(texto)
      )

      if (!filtrados.length) {
        resultado.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px">Sin resultados.</p>`
        return
      }

      const porGrupo = {}
      filtrados.forEach(c => {
        const g = c.grupo
        if (!porGrupo[g]) porGrupo[g] = []
        porGrupo[g].push(c)
      })

      const grupos = Object.keys(porGrupo).sort()

      let html = `
        <div class="precios-nav">
          ${grupos.map(g => `
            <button class="precios-nav-pill"
              onclick="document.getElementById('inv-sec-${g.replace(/\s+/g,'-')}').scrollIntoView({behavior:'smooth',block:'start'})">
              ${g} (${porGrupo[g].length})
            </button>`).join('')}
        </div>
      `

      grupos.forEach((grupo, idx) => {
        const secId  = `inv-sec-${grupo.replace(/\s+/g,'-')}`
        const bodyId = `inv-body-${grupo.replace(/\s+/g,'-')}`
        html += `
          <div class="precios-seccion" id="${secId}">
            <div class="precios-seccion-header" onclick="toggleSeccion('${bodyId}')">
              <span>${grupo} <span class="precios-seccion-count">${porGrupo[grupo].length} insumos</span></span>
              <span class="precios-seccion-chevron" id="chev-${bodyId}">${idx === 0 ? '▾' : '▸'}</span>
            </div>
            <div class="precios-seccion-body" id="${bodyId}" style="display:${idx === 0 ? 'block' : 'none'}">
              <table class="tabla">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th style="text-align:right">Cantidad</th>
                    <th>Unidad</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  ${porGrupo[grupo].map(c => `
                    <tr>
                      <td>${c.producto}</td>
                      <td style="text-align:right;font-weight:600">${c.cantidad}</td>
                      <td style="color:var(--color-text-muted)">${c.unidad}</td>
                      <td style="color:var(--color-text-muted);font-size:12px">${c.notas || ''}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
      })

      resultado.innerHTML = html
    }

    document.getElementById('inv-fecha').addEventListener('change', e => cargarConteo(e.target.value))
    document.getElementById('inv-search').addEventListener('input', renderInventario)

    await cargarConteo(fechas[0])

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}
