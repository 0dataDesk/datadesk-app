async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando recetas...</p>`
  try {
    const tenant_id = await getTenantId()
    const recetas = await listarTodasRecetas(tenant_id)
    renderVistaRecetas(recetas)
  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

async function listarTodasRecetas(tenant_id) {
  const { data, error } = await window._db
    .from('catalogo_recetas')
    .select('*')
    .eq('tenant_id', tenant_id)
  if (error) throw error
  return data || []
}

function renderVistaRecetas(recetas, buscarInicial = '') {
  const content = document.getElementById('content')

  const fuentes      = [...new Set(recetas.map(r => r.fuente).filter(Boolean))].sort()
  const todasCats    = [...new Set(recetas.map(r => r.categoria).filter(Boolean))].sort()

  content.innerHTML = `
    <div class="vista-header">
      <h2>Recetas</h2>
      <div class="filtros">
        <select id="filtro-fuente">
          <option value="">Todas las fuentes</option>
          ${fuentes.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
        <select id="filtro-categoria">
          <option value="">Todas las categorías</option>
          ${todasCats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <input type="text" id="filtro-buscar" placeholder="Buscar platillo..." value="${buscarInicial}" />
      </div>
    </div>
    <div class="recetas-layout">
      <div class="lista-recetas">
        <table class="tabla" id="tabla-recetas">
          <thead>
            <tr>
              <th>ID</th>
              <th>Platillo</th>
              <th>Categoría</th>
              <th>Fuente</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="tbody-recetas"></tbody>
        </table>
      </div>
      <div class="detalle-receta" id="detalle-receta">
        <p style="color:var(--color-text-muted);font-size:13px">Selecciona una receta para ver el detalle.</p>
      </div>
    </div>
  `

  const aplicarFiltros = () => {
    const fuente    = document.getElementById('filtro-fuente').value
    const categoria = document.getElementById('filtro-categoria').value
    const buscar    = document.getElementById('filtro-buscar').value.toLowerCase()

    // Filtro encadenado: actualizar categorías según fuente seleccionada
    const catsFiltradas = fuente
      ? [...new Set(recetas.filter(r => r.fuente === fuente).map(r => r.categoria).filter(Boolean))].sort()
      : todasCats

    const catSelect  = document.getElementById('filtro-categoria')
    const catActual  = catSelect.value
    catSelect.innerHTML = `<option value="">Todas las categorías</option>` +
      catsFiltradas.map(c => `<option value="${c}"${c === catActual ? ' selected' : ''}>${c}</option>`).join('')

    const filtradas = recetas.filter(r =>
      (!fuente    || r.fuente    === fuente) &&
      (!categoria || r.categoria === categoria) &&
      (!buscar    || r.nombre_platillo.toLowerCase().includes(buscar))
    )

    document.getElementById('tbody-recetas').innerHTML = filtradas.map(r => `
      <tr class="fila-receta" data-id="${r.id_receta}">
        <td>${r.id_receta}</td>
        <td>${r.nombre_platillo}</td>
        <td>${r.categoria || ''}</td>
        <td>${r.fuente    || ''}</td>
        <td><span class="badge-status ${r.status || 'pendiente'}">${r.status || 'pendiente'}</span></td>
      </tr>
    `).join('')

    document.querySelectorAll('.fila-receta').forEach(fila => {
      fila.addEventListener('click', async () => {
        document.querySelectorAll('.fila-receta').forEach(f => f.classList.remove('selected'))
        fila.classList.add('selected')
        await mostrarDetalleReceta(fila.dataset.id, recetas)
      })
    })
  }

  document.getElementById('filtro-fuente').addEventListener('change', aplicarFiltros)
  document.getElementById('filtro-categoria').addEventListener('change', aplicarFiltros)
  document.getElementById('filtro-buscar').addEventListener('input', aplicarFiltros)

  aplicarFiltros()
}

async function mostrarDetalleReceta(id_receta, todasRecetas) {
  const detalle = document.getElementById('detalle-receta')
  detalle.innerHTML = `<p style="color:var(--color-text-muted)">Cargando detalle...</p>`

  try {
    const [receta, ingredientes, procedimientos] = await Promise.all([
      buscarReceta(id_receta),
      listarIngredientes(id_receta),
      listarProcedimientos(id_receta)
    ])

    const nombreCorto = receta.nombre_platillo.toLowerCase().slice(0, 8)
    const duplicados  = todasRecetas.filter(r =>
      String(r.id_receta) !== String(id_receta) &&
      r.nombre_platillo.toLowerCase().includes(nombreCorto)
    )

    detalle.innerHTML = `
      <div class="detalle-header">
        <div>
          <h3>${receta.nombre_platillo}</h3>
          <p class="detalle-categoria">${receta.categoria || ''} · <span class="badge-status ${receta.status || 'pendiente'}">${receta.status || 'pendiente'}</span></p>
          ${duplicados.length ? `<p class="duplicado-alerta">⚠ ${duplicados.length} posible${duplicados.length > 1 ? 's' : ''} duplicado${duplicados.length > 1 ? 's' : ''}</p>` : ''}
        </div>
        <div class="acciones-receta">
          <button class="btn-accion btn-aprobar"  data-id="${receta.id_receta}">✓ Aprobar</button>
          <button class="btn-accion btn-archivar" data-id="${receta.id_receta}">✕ Archivar</button>
          ${duplicados.length ? `<button class="btn-accion btn-duplicados">🔍 Duplicados</button>` : ''}
        </div>
      </div>

      <h4>Ingredientes</h4>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Notas</th></tr></thead>
          <tbody>
            ${ingredientes.length
              ? ingredientes.map(i => `
                  <tr>
                    <td>${i.producto           || ''}</td>
                    <td>${i.cantidad           || ''}</td>
                    <td>${i.unidad             || ''}</td>
                    <td>${i.notas_ingrediente  || ''}</td>
                  </tr>`).join('')
              : '<tr><td colspan="4" style="color:var(--color-text-muted)">Sin ingredientes registrados</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <h4>Procedimiento</h4>
      <ol class="procedimiento">
        ${procedimientos.length
          ? procedimientos.map(p => `<li><strong>Paso ${p.paso_num}</strong> — ${p.proceso}</li>`).join('')
          : '<li style="color:var(--color-text-muted)">Sin procedimiento registrado</li>'
        }
      </ol>
    `

    const accion = async (btn, nuevoStatus, labelOriginal) => {
      btn.disabled = true
      btn.textContent = 'Guardando...'
      try {
        await cambiarStatusReceta(receta.id_receta, nuevoStatus)
        const tenant_id = await getTenantId()
        const actualizadas = await listarTodasRecetas(tenant_id)
        renderVistaRecetas(actualizadas)
        const fila = document.querySelector(`.fila-receta[data-id="${receta.id_receta}"]`)
        if (fila) fila.click()
      } catch (err) {
        alert('Error: ' + err.message)
        btn.disabled = false
        btn.textContent = labelOriginal
      }
    }

    detalle.querySelector('.btn-aprobar').addEventListener('click', e =>
      accion(e.target, 'aprobado', '✓ Aprobar'))

    detalle.querySelector('.btn-archivar').addEventListener('click', e =>
      accion(e.target, 'archivado', '✕ Archivar'))

    const btnDup = detalle.querySelector('.btn-duplicados')
    if (btnDup) {
      btnDup.addEventListener('click', () => {
        document.getElementById('filtro-buscar').value = nombreCorto
        document.getElementById('filtro-buscar').dispatchEvent(new Event('input'))
      })
    }

  } catch (err) {
    detalle.innerHTML = `<p>Error: ${err.message}</p>`
  }
}

async function cambiarStatusReceta(id_receta, status) {
  const { error } = await window._db
    .from('catalogo_recetas')
    .update({ status })
    .eq('id_receta', id_receta)
  if (error) throw error
}
