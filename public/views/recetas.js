import { listarRecetas, buscarReceta, listarIngredientes, listarProcedimientos } from '../../src/recetas.js'
import { getTenantId } from '../../src/tenant.js'

export async function vistaRecetas() {
  const content = document.getElementById('content')
  content.innerHTML = `<p>Cargando recetas...</p>`

  try {
    const tenant_id = await getTenantId()
    const recetas = await listarRecetas(tenant_id)

    content.innerHTML = `
      <div class="vista-header">
        <h2>Recetas</h2>
        <div class="filtros">
          <input type="text" id="filtro-buscar" placeholder="Buscar receta..." />
          <select id="filtro-categoria">
            <option value="">Todas las categorías</option>
            ${[...new Set(recetas.map(r => r.categoria).filter(Boolean))]
              .map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
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
              </tr>
            </thead>
            <tbody>
              ${recetas.map(r => `
                <tr class="fila-receta" data-id="${r.id_receta}">
                  <td>${r.id_receta}</td>
                  <td>${r.nombre_platillo}</td>
                  <td>${r.categoria || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="detalle-receta" id="detalle-receta">
          <p>Selecciona una receta para ver el detalle.</p>
        </div>
      </div>
    `

    // Filtro en tiempo real
    document.getElementById('filtro-buscar').addEventListener('input', filtrar)
    document.getElementById('filtro-categoria').addEventListener('change', filtrar)

    function filtrar() {
      const buscar = document.getElementById('filtro-buscar').value.toLowerCase()
      const categoria = document.getElementById('filtro-categoria').value
      document.querySelectorAll('.fila-receta').forEach(fila => {
        const nombre = fila.querySelectorAll('td')[1].textContent.toLowerCase()
        const cat = fila.querySelectorAll('td')[2].textContent
        const visible = (!buscar || nombre.includes(buscar)) && (!categoria || cat === categoria)
        fila.style.display = visible ? '' : 'none'
      })
    }

    // Seleccionar receta
    document.querySelectorAll('.fila-receta').forEach(fila => {
      fila.addEventListener('click', async () => {
        const id_receta = fila.dataset.id
        await mostrarDetalle(id_receta)
      })
    })

  } catch (err) {
    content.innerHTML = `<p>Error al cargar recetas: ${err.message}</p>`
  }
}

async function mostrarDetalle(id_receta) {
  const detalle = document.getElementById('detalle-receta')
  detalle.innerHTML = `<p>Cargando detalle...</p>`

  try {
    const [receta, ingredientes, procedimientos] = await Promise.all([
      buscarReceta(id_receta),
      listarIngredientes(id_receta),
      listarProcedimientos(id_receta)
    ])

    detalle.innerHTML = `
      <h3>${receta.nombre_platillo}</h3>
      <p class="detalle-categoria">${receta.categoria || ''}</p>

      <h4>Ingredientes</h4>
      <table class="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Unidad</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${ingredientes.map(i => `
            <tr>
              <td>${i.producto || ''}</td>
              <td>${i.cantidad || ''}</td>
              <td>${i.unidad || ''}</td>
              <td>${i.notas_ingrediente || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h4>Procedimiento</h4>
      <ol class="procedimiento">
        ${procedimientos.map(p => `
          <li><strong>Paso ${p.paso_num}</strong> — ${p.proceso}</li>
        `).join('')}
      </ol>
    `
  } catch (err) {
    detalle.innerHTML = `<p>Error al cargar detalle: ${err.message}</p>`
  }
}
