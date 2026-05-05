import { listarProductos } from '../../src/productos.js'
import { getTenantId } from '../../src/tenant.js'

export async function vistaProductos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p>Cargando productos...</p>`

  try {
    const tenant_id = await getTenantId()
    const productos = await listarProductos(tenant_id)

    content.innerHTML = `
      <div class="vista-header">
        <h2>Maestro de Productos</h2>
        <div class="filtros">
          <input type="text" id="filtro-buscar" placeholder="Buscar producto..." />
          <select id="filtro-grupo">
            <option value="">Todos los grupos</option>
            ${[...new Set(productos.map(p => p.grupo).filter(Boolean))]
              .map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
          <select id="filtro-tipo">
            <option value="">Todos los tipos</option>
            <option value="Insumo">Insumo</option>
            <option value="Elaborado">Elaborado</option>
          </select>
        </div>
      </div>
      <div class="tabla-wrapper">
        <table class="tabla" id="tabla-productos">
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Grupo</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th>Perecedero</th>
            </tr>
          </thead>
          <tbody>
            ${productos.map(p => `
              <tr>
                <td>${p.id_producto}</td>
                <td>${p.producto}</td>
                <td>${p.tipo || ''}</td>
                <td>${p.grupo || ''}</td>
                <td>${p.categoria || ''}</td>
                <td>${p.unidad_medida || ''}</td>
                <td>${p.perecedero ? 'Sí' : 'No'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `

    // Filtro en tiempo real
    document.getElementById('filtro-buscar').addEventListener('input', filtrar)
    document.getElementById('filtro-grupo').addEventListener('change', filtrar)
    document.getElementById('filtro-tipo').addEventListener('change', filtrar)

    function filtrar() {
      const buscar = document.getElementById('filtro-buscar').value.toLowerCase()
      const grupo = document.getElementById('filtro-grupo').value
      const tipo = document.getElementById('filtro-tipo').value
      const filas = document.querySelectorAll('#tabla-productos tbody tr')
      filas.forEach(fila => {
        const celdas = fila.querySelectorAll('td')
        const nombre = celdas[1].textContent.toLowerCase()
        const tipoFila = celdas[2].textContent
        const grupoFila = celdas[3].textContent
        const visible =
          (!buscar || nombre.includes(buscar)) &&
          (!grupo || grupoFila === grupo) &&
          (!tipo || tipoFila === tipo)
        fila.style.display = visible ? '' : 'none'
      })
    }

  } catch (err) {
    content.innerHTML = `<p>Error al cargar productos: ${err.message}</p>`
  }
}
