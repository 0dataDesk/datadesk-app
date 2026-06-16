async function vistaInventario() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando inventario...</p>`

  try {
    const tenant_id = await getTenantId()

    content.innerHTML = `
      <div class="vista-header"><h2>Inventario</h2></div>
      <div class="filtros-bar">
        <input type="text" id="inv-search" placeholder="Buscar insumo..." class="filtro-search" />
        ${['superadmin','admin','gerente'].includes(window._rol) ? `<button class="btn-accion btn-aprobar" onclick="exportarInventarioExcel()">Exportar Excel</button>` : ''}
        ${['superadmin','admin','gerente'].includes(window._rol) ? `<button class="btn-accion" style="border:1px solid var(--color-border)" onclick="exportarInventarioPDF()">Exportar PDF</button>` : ''}
      </div>
      <div id="inv-resultado"><p style="color:var(--color-text-muted)">Cargando...</p></div>
    `

    const [{ data: conteo, error: errC }, { data: productos, error: errP }] = await Promise.all([
      window._db.from('inventario_conteos').select('id_producto, cantidad, unidad, notas, fecha_conteo').eq('tenant_id', tenant_id),
      window._db.from('productos').select('id_producto, producto, grupo').eq('tenant_id', tenant_id).eq('activo', true)
    ])

    if (errC) throw errC
    if (errP) throw errP

    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.id_producto] = p })

    const porProducto = {}
    ;(conteo || []).forEach(c => {
      const existente = porProducto[c.id_producto]
      if (!existente || c.fecha_conteo > existente.fecha_conteo) {
        porProducto[c.id_producto] = c
      }
    })

    window._invConteo = Object.values(porProducto).map(c => ({
      ...c,
      producto: prodMap[c.id_producto]?.producto || c.id_producto,
      grupo: prodMap[c.id_producto]?.grupo || 'Sin grupo'
    }))

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

    document.getElementById('inv-search').addEventListener('input', renderInventario)
    renderInventario()

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function exportarInventarioPDF() {
  const fecha = new Date().toISOString().split('T')[0]
  const conteo = window._invConteo || []

  const porGrupo = {}
  conteo.forEach(c => {
    const g = c.grupo || 'Sin grupo'
    if (!porGrupo[g]) porGrupo[g] = []
    porGrupo[g].push(c)
  })
  const grupos = Object.keys(porGrupo).sort()

  const seccionesHtml = grupos.map(g => {
    const filas = porGrupo[g]
      .slice()
      .sort((a, b) => a.producto.localeCompare(b.producto))
      .map(c => `<tr><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5">${c.producto}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;text-align:right;font-weight:600">${c.cantidad}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;color:#9B7B6A">${c.unidad}</td><td style="padding:6px 12px;border-bottom:1px solid #E8DDD5;font-size:11px;color:#9B7B6A">${c.notas || ''}</td></tr>`).join('')
    return `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9B7B6A;margin:20px 0 6px">${g}</h3>
<table style="width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px">
<thead><tr><th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Insumo</th><th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Cantidad</th><th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Unidad</th><th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#9B7B6A;border-bottom:2px solid #E8DDD5">Notas</th></tr></thead>
<tbody>${filas}</tbody></table>`
  }).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Inventario ${fecha}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #2B1A0F; margin: 0; padding: 40px; background: #FAF7F2; }
  .header { border-bottom: 3px solid #C8892A; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 22px; margin: 0; }
  .header small { color: #9B7B6A; font-size: 12px; }
  .footer { margin-top: 30px; font-size: 11px; color: #9B7B6A; text-align: center; border-top: 1px solid #E8DDD5; padding-top: 12px; }
</style></head><body>
  <div class="header">
    <div><h1>Inventario — Furia</h1><small>Conteo: ${fecha}</small></div>
    <div style="font-size:11px;color:#9B7B6A">${conteo.length} insumos</div>
  </div>
  ${seccionesHtml}
  <div class="footer">Documento generado por dataDesk · ${new Date().toLocaleDateString('es-MX')}</div>
</body></html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.close()
  ventana.focus()
  setTimeout(() => ventana.print(), 500)
}

function exportarInventarioExcel() {
  const fecha = new Date().toISOString().split('T')[0]
  const filas = (window._invConteo || []).map(c => ({
    Grupo: c.grupo,
    Insumo: c.producto,
    Cantidad: c.cantidad,
    Unidad: c.unidad,
    Notas: c.notas || ''
  }))
  filas.sort((a, b) => a.Grupo.localeCompare(b.Grupo) || a.Insumo.localeCompare(b.Insumo))

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, `inventario_furia_${fecha}.xlsx`)
}
