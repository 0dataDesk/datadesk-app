// ── Vista: Tesorería ─────────────────────────────────────────────────────────
// Portado de origin/dev (public/views/tesoreria.js) — se usó solo como referencia
// de lógica de negocio. Adaptado a convenciones vigentes de main:
//  - formatNum/formatInt (utils.js) en vez de .toFixed(2).
//  - Las vistas v_saldo_cuentas / v_proyeccion_pagos de dev no existen en
//    producción (solo se crearon las tablas base) — el saldo por cuenta y la
//    proyección de pagos se calculan aquí en cliente, igual que cierres.js
//    calcula su desglose por método de pago en vez de depender de una vista.
//  - movimientos_cuenta se pagina de 1000 en 1000 (mismo patrón que consumo.js)
//    porque el saldo necesita TODOS los movimientos, no solo los últimos 50.

async function vistaTesoreria() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando tesorería...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()

    const PAGE_SIZE = 1000
    const movimientosTodos = []
    let errorPag = null
    for (let desde = 0; ; desde += PAGE_SIZE) {
      const hasta = desde + PAGE_SIZE - 1
      const { data: pagina, error: errPagina } = await window._db
        .from('movimientos_cuenta')
        .select('id, id_cuenta, fecha, tipo, concepto, importe, referencia, id_gasto, created_at')
        .eq('tenant_id', tenant_id)
        .eq('activo', true)
        .order('fecha', { ascending: false })
        .range(desde, hasta)
      if (errPagina) { errorPag = errPagina; break }
      movimientosTodos.push(...(pagina || []))
      if (!pagina || pagina.length < PAGE_SIZE) break
    }
    if (errorPag) throw errorPag

    const [{ data: cuentas, error: errC }, { data: gastosPend, error: errG }, { data: proveedores }, { data: centros }] = await Promise.all([
      window._db.from('cuentas').select('id, nombre, tipo, saldo_inicial').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
      window._db.from('gastos').select('id, id_proveedor, num_factura, importe_factura, fecha_vencimiento, estatus, id_centro_costo').eq('tenant_id', tenant_id).neq('estatus', 'PAGADO').order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
      window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id),
      window._db.from('centros_costo').select('id, nombre').eq('tenant_id', tenant_id)
    ])
    if (errC) throw errC
    if (errG) throw errG

    window._tesoreriaTenant  = tenant_id
    window._tesoreriaCuentas = cuentas || []

    // Saldo por cuenta, calculado en cliente a partir de saldo_inicial + movimientos.
    const movPorCuenta = {}
    movimientosTodos.forEach(m => {
      if (!movPorCuenta[m.id_cuenta]) movPorCuenta[m.id_cuenta] = { ingresos: 0, egresos: 0 }
      const imp = Number(m.importe) || 0
      if (m.tipo === 'INGRESO') movPorCuenta[m.id_cuenta].ingresos += imp
      else movPorCuenta[m.id_cuenta].egresos += imp
    })
    const saldos = (cuentas || []).map(c => {
      const mov = movPorCuenta[c.id] || { ingresos: 0, egresos: 0 }
      const saldoInicial = Number(c.saldo_inicial) || 0
      return {
        id: c.id, nombre: c.nombre, tipo: c.tipo,
        saldo_inicial: saldoInicial,
        total_ingresos: mov.ingresos,
        total_egresos: mov.egresos,
        saldo_actual: saldoInicial + mov.ingresos - mov.egresos
      }
    })

    const nombreProv = {}
    ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })
    const nombreCentro = {}
    ;(centros || []).forEach(c => { nombreCentro[c.id] = c.nombre })
    const nombreCuenta = {}
    ;(cuentas || []).forEach(c => { nombreCuenta[c.id] = c.nombre })

    const hoy = new Date().toISOString().split('T')[0]
    const proyeccion   = gastosPend || []
    const vencidos     = proyeccion.filter(g => g.fecha_vencimiento && g.fecha_vencimiento < hoy)
    const enPlazo      = proyeccion.filter(g => !g.fecha_vencimiento || g.fecha_vencimiento >= hoy)
    const totalVencido = vencidos.reduce((s, g) => s + (Number(g.importe_factura) || 0), 0)
    const totalEnPlazo = enPlazo.reduce((s, g) => s + (Number(g.importe_factura) || 0), 0)
    const totalSaldo   = saldos.reduce((s, c) => s + c.saldo_actual, 0)

    const movimientosRecientes = movimientosTodos.slice(0, 50)

    content.innerHTML = `
      <div class="vista-header">
        <h2>Tesorería</h2>
        ${saldos.length ? `<button class="btn-accion btn-aprobar" onclick="mostrarFormMovimiento()">+ Nuevo movimiento</button>` : ''}
      </div>

      <div class="dashboard-grid" style="margin-top:16px">
        <div class="dashboard-card">
          <div class="card-valor">$${formatNum(totalSaldo)}</div>
          <div class="card-label">Saldo total en cuentas</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">$${formatNum(totalVencido)}</div>
          <div class="card-label">Vencido (${vencidos.length})</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">$${formatNum(totalEnPlazo)}</div>
          <div class="card-label">En plazo (${enPlazo.length})</div>
        </div>
      </div>

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Saldo por cuenta</h4>
      ${saldos.length ? `
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Cuenta</th><th>Tipo</th><th style="text-align:right">Saldo inicial</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Egresos</th><th style="text-align:right">Saldo actual</th></tr></thead>
          <tbody>
            ${saldos.map(c => `
              <tr>
                <td>${c.nombre}</td>
                <td>${c.tipo}</td>
                <td style="text-align:right">$${formatNum(c.saldo_inicial)}</td>
                <td style="text-align:right;color:#3A8C3E">$${formatNum(c.total_ingresos)}</td>
                <td style="text-align:right;color:#B85C2A">$${formatNum(c.total_egresos)}</td>
                <td style="text-align:right;font-weight:600">$${formatNum(c.saldo_actual)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `<p style="font-size:13px;color:var(--color-text-muted)">No hay cuentas registradas todavía. Da de alta al menos una cuenta (tabla <code>cuentas</code>) para poder capturar movimientos.</p>`}

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Proyección de pagos pendientes</h4>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Vencimiento</th><th>Proveedor</th><th>Factura</th><th>Centro de costo</th><th style="text-align:right">Importe</th><th>Estatus</th></tr></thead>
          <tbody>
            ${proyeccion.map(g => {
              const vencido = g.fecha_vencimiento && g.fecha_vencimiento < hoy
              return `
              <tr>
                <td style="${vencido ? 'color:#B85C2A;font-weight:600' : ''}">${g.fecha_vencimiento || 'Sin vencimiento'}${vencido ? ' ⚠' : ''}</td>
                <td>${nombreProv[g.id_proveedor] || g.id_proveedor || '—'}</td>
                <td>${g.num_factura || '—'}</td>
                <td>${nombreCentro[g.id_centro_costo] || '—'}</td>
                <td style="text-align:right">$${formatNum(g.importe_factura)}</td>
                <td>${g.estatus}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
        ${!proyeccion.length ? '<p style="font-size:12px;color:var(--color-text-muted);padding:12px">Sin pagos pendientes.</p>' : ''}
      </div>

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Movimientos recientes</h4>
      <div id="movimientos-form-wrap"></div>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead>
          <tbody>
            ${movimientosRecientes.map(m => `
              <tr>
                <td>${m.fecha}</td>
                <td>${nombreCuenta[m.id_cuenta] || '—'}</td>
                <td style="color:${m.tipo === 'INGRESO' ? '#3A8C3E' : '#B85C2A'}">${m.tipo}</td>
                <td>${m.concepto}${m.referencia ? ` <span style="color:var(--color-text-muted);font-size:11px">(${m.referencia})</span>` : ''}${m.id_gasto ? ` <span style="color:var(--color-text-muted);font-size:11px">· pago de gasto</span>` : ''}</td>
                <td style="text-align:right;color:${m.tipo === 'INGRESO' ? '#3A8C3E' : '#B85C2A'}">${m.tipo === 'INGRESO' ? '+' : '-'}$${formatNum(m.importe)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${!movimientosRecientes.length ? '<p style="font-size:12px;color:var(--color-text-muted);padding:12px">Sin movimientos registrados.</p>' : ''}
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function mostrarFormMovimiento() {
  const hoy     = new Date().toISOString().split('T')[0]
  const cuentas = window._tesoreriaCuentas || []
  if (!cuentas.length) return

  document.getElementById('movimientos-form-wrap').innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nuevo movimiento</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha</label>
          <input type="date" id="mv-fecha" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Cuenta</label>
          <select id="mv-cuenta" class="filtro-select">
            ${cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Tipo</label>
          <select id="mv-tipo" class="filtro-select">
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Importe</label>
          <input type="number" id="mv-importe" class="filtro-select" min="0" step="any" placeholder="0.00">
        </div>
      </div>
      <div class="filtro-cascada-item" style="margin-top:12px">
        <label class="filtro-label">Concepto</label>
        <input type="text" id="mv-concepto" class="filtro-select" style="width:100%" placeholder="Descripción del movimiento">
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="crearMovimiento()">Guardar</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)" onclick="document.getElementById('movimientos-form-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
}

async function crearMovimiento() {
  const tenant_id = window._tesoreriaTenant || await getTenantId()
  const fecha     = document.getElementById('mv-fecha')?.value
  const id_cuenta = document.getElementById('mv-cuenta')?.value
  const tipo      = document.getElementById('mv-tipo')?.value
  const importe   = parseFloat(document.getElementById('mv-importe')?.value)
  const concepto  = document.getElementById('mv-concepto')?.value?.trim()

  if (!fecha || !id_cuenta || !importe || importe <= 0 || !concepto) { alert('Todos los campos son obligatorios'); return }

  const { error } = await window._db.from('movimientos_cuenta')
    .insert({ tenant_id, id_cuenta, fecha, tipo, importe, concepto, activo: true, created_by: window._email || null })

  if (error) { alert(`Error: ${error.message}`); return }
  document.getElementById('movimientos-form-wrap').innerHTML = ''
  await vistaTesoreria()
}
