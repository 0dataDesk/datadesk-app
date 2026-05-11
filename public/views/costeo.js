async function vistaCosteo() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando costeo...</p>`

  try {
    const tenant_id = await getTenantId()
    const hoy = new Date().toISOString().split('T')[0]

    // 1. Catálogo de recetas activas
    const { data: recetas, error: errR } = await window._db
      .from('catalogo_recetas')
      .select('id_receta, nombre_platillo, categoria, status')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre_platillo')

    if (errR) throw errR

    // 2. Todos los precios vigentes con precio_por_unidad_base
    const { data: todosPrecios, error: errP } = await window._db
      .from('precios_proveedores')
      .select('id_producto, id_proveedor, precio_por_unidad_base, unidad_base')
      .eq('tenant_id', tenant_id)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .not('precio_por_unidad_base', 'is', null)

    if (errP) throw errP

    // 3. Nombres de proveedores
    const { data: proveedores } = await window._db
      .from('proveedores')
      .select('id_proveedor, nombre')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)

    const nombreProv = {}
    ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

    // Índice completo: id_producto → array de opciones de precio
    const preciosPorProducto = {}
    ;(todosPrecios || []).forEach(p => {
      if (!preciosPorProducto[p.id_producto]) preciosPorProducto[p.id_producto] = []
      preciosPorProducto[p.id_producto].push(p)
    })

    // Precio mínimo por producto (para el cálculo del total)
    const precioMejor = {}
    Object.keys(preciosPorProducto).forEach(id => {
      precioMejor[id] = preciosPorProducto[id].reduce((a, b) =>
        a.precio_por_unidad_base < b.precio_por_unidad_base ? a : b
      )
    })

    // 4. Render inicial — filtros en cascada
    const todasLasRecetas = recetas || []
    const categorias = [...new Set(todasLasRecetas.map(r => r.categoria).filter(Boolean))].sort()

    content.innerHTML = `
      <div class="vista-header"><h2>Costeo de Recetas</h2></div>
      <div class="filtros-bar">
        <select id="costeo-cat-select" class="filtro-select" style="max-width:220px">
          <option value="">— Todas las categorías —</option>
          ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="costeo-receta-select" class="filtro-select" style="max-width:400px">
          <option value="">— Seleccionar receta —</option>
        </select>
      </div>
      <div id="costeo-resultado"></div>
    `

    const catSelect    = document.getElementById('costeo-cat-select')
    const recetaSelect = document.getElementById('costeo-receta-select')

    const poblarRecetas = (catFiltro) => {
      recetaSelect.innerHTML = '<option value="">— Seleccionar receta —</option>'
      const filtradas = catFiltro
        ? todasLasRecetas.filter(r => r.categoria === catFiltro)
        : todasLasRecetas
      filtradas.forEach(r => {
        recetaSelect.insertAdjacentHTML('beforeend', `<option value="${r.id_receta}">${r.nombre_platillo}</option>`)
      })
      document.getElementById('costeo-resultado').innerHTML = ''
    }

    catSelect.addEventListener('change', e => poblarRecetas(e.target.value))
    poblarRecetas('') // inicial: todas

    // 5. Al seleccionar receta → calcular costeo
    recetaSelect.addEventListener('change', async (e) => {
      const id_receta = e.target.value
      const resultado = document.getElementById('costeo-resultado')
      if (!id_receta) { resultado.innerHTML = ''; return }

      resultado.innerHTML = `<p style="color:var(--color-text-muted)">Calculando...</p>`

      try {
        const { data: ingredientes, error: errI } = await window._db
          .from('receta_ingredientes')
          .select('id, id_producto, producto, cantidad, unidad, notas_ingrediente')
          .eq('tenant_id', tenant_id)
          .eq('id_receta', id_receta)
          .eq('activo', true)
          .order('id')

        if (errI) throw errI

        let costoTotal = 0
        let tieneIncompletos = false

        const filas = (ingredientes || []).map(ing => {
          const cantidad   = parseFloat(ing.cantidad) || null
          const mejor      = precioMejor[ing.id_producto]
          const ppu        = mejor?.precio_por_unidad_base ?? null
          const unidadBase = mejor?.unidad_base ?? null

          let costoIng  = null
          let flagUnidad = false

          if (cantidad !== null && ppu !== null) {
            const unidadIng = (ing.unidad || '').toLowerCase().trim()
            const unidadPr  = (unidadBase || '').toLowerCase().trim()
            if (unidadIng === unidadPr) {
              costoIng = cantidad * ppu
              costoTotal += costoIng
            } else {
              flagUnidad = true
              tieneIncompletos = true
            }
          } else {
            tieneIncompletos = true
          }

          return { ...ing, cantidad, ppu, unidadBase, costoIng, flagUnidad }
        })

        let html = `
          <div class="costeo-card">
            <table class="precio-tabla">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th colspan="2">Costo</th>
                </tr>
              </thead>
              <tbody>
        `

        filas.forEach(f => {
          const opcionesProv = preciosPorProducto[f.id_producto] || []

          // Fila principal del ingrediente
          html += `
            <tr${f.costoIng === null ? ' class="fila-precio-revisar"' : ''}>
              <td data-label="Ingrediente">${f.producto || ''}</td>
              <td data-label="Cantidad">${f.cantidad ?? '—'}</td>
              <td data-label="Unidad">${f.unidad || '—'}</td>
              <td data-label="Costo" class="precio-monto" colspan="2">
                ${f.costoIng !== null ? `$${f.costoIng.toFixed(2)}` : '—'}
                ${f.flagUnidad ? `<span class="flag-unidad" title="Unidad incompatible con el precio — revisar">⚠️</span>` : ''}
                ${f.ppu === null ? `<span class="flag-unidad">sin precio</span>` : ''}
              </td>
            </tr>
          `

          // Sub-fila comparativo de proveedores
          if (opcionesProv.length > 0) {
            const minPpu = Math.min(...opcionesProv.map(p => p.precio_por_unidad_base))
            const chips  = opcionesProv
              .sort((a, b) => a.precio_por_unidad_base - b.precio_por_unidad_base)
              .map(p => {
                const esMin = p.precio_por_unidad_base === minPpu
                return `<span class="costeo-prov-chip${esMin ? ' costeo-prov-min' : ''}">
                  ${nombreProv[p.id_proveedor] || p.id_proveedor}
                  <strong>$${p.precio_por_unidad_base.toFixed(4)}/${p.unidad_base}</strong>
                  ${esMin ? '✓' : ''}
                </span>`
              }).join('')

            html += `
              <tr class="costeo-prov-row">
                <td colspan="5" class="costeo-prov-cell">
                  <div class="costeo-prov-chips">${chips}</div>
                </td>
              </tr>
            `
          }
        })

        html += `
              </tbody>
            </table>
            <div class="costeo-total">
              <span>Costo total de la receta</span>
              <strong>$${costoTotal.toFixed(2)} MXN</strong>
            </div>
            ${tieneIncompletos ? `<p class="costeo-aviso">⚠️ Algunos ingredientes no tienen precio registrado o tienen unidades incompatibles — el costo total es parcial.</p>` : ''}
          </div>
        `

        resultado.innerHTML = html

      } catch (err) {
        resultado.innerHTML = `<p>Error al calcular costeo: ${err.message}</p>`
      }
    })

  } catch (err) {
    content.innerHTML = `<p>Error al cargar costeo: ${err.message}</p>`
  }
}
