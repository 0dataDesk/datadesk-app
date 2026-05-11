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

    // 3. Proveedores activos ordenados por nombre (definen el orden de columnas)
    const { data: proveedores } = await window._db
      .from('proveedores')
      .select('id_proveedor, nombre')
      .eq('tenant_id', tenant_id)
      .eq('activo', true)
      .order('nombre')

    const listaProv = proveedores || []
    const nombreProv = {}
    listaProv.forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

    // Índice: id_producto__id_proveedor → precio más barato
    const indicePrecio = {}
    ;(todosPrecios || []).forEach(p => {
      const key = `${p.id_producto}__${p.id_proveedor}`
      if (!indicePrecio[key] || p.precio_por_unidad_base < indicePrecio[key].precio_por_unidad_base) {
        indicePrecio[key] = p
      }
    })

    // 4. Render inicial — cascada categoría → receta
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
    poblarRecetas('')

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

        const filas = (ingredientes || []).map(ing => ({
          ...ing,
          cantidad: parseFloat(ing.cantidad) || null
        }))

        // Header dinámico según proveedores
        const headerProvs = listaProv
          .map(p => `<th class="costeo-col-prov">${p.nombre}</th>`)
          .join('')

        let html = `
          <div class="costeo-card">
            <div class="costeo-tabla-wrap">
            <table class="precio-tabla costeo-tabla">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th class="costeo-col-num">Cantidad</th>
                  <th class="costeo-col-num">Unidad</th>
                  ${headerProvs}
                  <th class="costeo-col-mejor">Mejor $</th>
                </tr>
              </thead>
              <tbody>
        `

        filas.forEach(f => {
          const unidadIng = (f.unidad || '').toLowerCase().trim()
          let mejorCosto = null
          let mejorProv  = null

          // Primera pasada: encontrar el mejor proveedor
          listaProv.forEach(p => {
            const key   = `${f.id_producto}__${p.id_proveedor}`
            const entry = indicePrecio[key]
            if (!entry) return
            const unidadPr = (entry.unidad_base || '').toLowerCase().trim()
            if (unidadIng !== unidadPr) return
            if (f.cantidad === null) return
            const costo = f.cantidad * entry.precio_por_unidad_base
            if (mejorCosto === null || costo < mejorCosto) {
              mejorCosto = costo
              mejorProv  = p.id_proveedor
            }
          })

          // Segunda pasada: render de celdas con highlight del mínimo
          const celdasProv = listaProv.map(p => {
            const key   = `${f.id_producto}__${p.id_proveedor}`
            const entry = indicePrecio[key]
            if (!entry) return `<td class="costeo-col-prov costeo-sin-precio" data-label="${p.nombre}">—</td>`
            const unidadPr = (entry.unidad_base || '').toLowerCase().trim()
            if (unidadIng !== unidadPr) return `<td class="costeo-col-prov costeo-sin-precio" data-label="${p.nombre}">⚠️</td>`
            if (f.cantidad === null) return `<td class="costeo-col-prov costeo-sin-precio" data-label="${p.nombre}">—</td>`
            const costo = f.cantidad * entry.precio_por_unidad_base
            const esMin = p.id_proveedor === mejorProv
            return `<td class="costeo-col-prov${esMin ? ' costeo-col-min' : ''}" data-label="${p.nombre}">$${costo.toFixed(2)}</td>`
          }).join('')

          if (mejorCosto !== null) costoTotal += mejorCosto
          else tieneIncompletos = true

          const mejorDisplay  = mejorCosto !== null ? `$${mejorCosto.toFixed(2)}` : '—'
          const claseIncompleta = mejorCosto === null ? ' class="fila-precio-revisar"' : ''

          html += `
            <tr${claseIncompleta}>
              <td data-label="Ingrediente">${f.producto || ''}</td>
              <td class="costeo-col-num" data-label="Cantidad">${f.cantidad ?? '—'}</td>
              <td class="costeo-col-num" data-label="Unidad">${f.unidad || '—'}</td>
              ${celdasProv}
              <td class="costeo-col-mejor" data-label="Mejor $">
                ${mejorDisplay}${mejorCosto !== null ? '<span class="costeo-check">✓</span>' : ''}
              </td>
            </tr>
          `
        })

        html += `
              </tbody>
            </table>
            </div>
            <div class="costeo-total">
              <span>Costo total (mejor precio por ingrediente)</span>
              <strong>$${costoTotal.toFixed(2)} MXN</strong>
            </div>
            ${tieneIncompletos ? `<p class="costeo-aviso">⚠️ Algunos ingredientes no tienen precio en ningún proveedor o tienen unidades incompatibles — el total es parcial.</p>` : ''}
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
