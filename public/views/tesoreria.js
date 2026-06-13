async function vistaTesoreria() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando tesorería...</p>`

  try {
    const tenant_id = await getTenantId()

    const [{ data: saldos, error: errS }, { data: proyeccion, error: errP }, { data: movimientos, error: errM }, { data: cuentas }] = await Promise.all([
      window._db.from('v_saldo_cuentas').select('*').eq('tenant_id', tenant_id),
      window._db.from('v_proyeccion_pagos').select('*').eq('tenant_id', tenant_id).order('fecha_vencimiento'),
      window._db.from('movimientos_cuenta').select('*').eq('tenant_id', tenant_id).eq('activo', true).order('fecha', { ascending: false }).limit(50),
      window._db.from('cuentas').select('id, nombre').eq('tenant_id', tenant_id).eq('activo', true)
    ])

    if (errS) throw errS
    if (errP) throw errP
    if (errM) throw errM

    window._tesoreria_saldos = saldos || []
    window._tesoreria_proyeccion = proyeccion || []
    window._tesoreria_movimientos = movimientos || []
    window._tesoreria_cuentas = cuentas || []

    const hoy = new Date().toISOString().split('T')[0]
    const vencidos = (proyeccion || []).filter(p => p.fecha_vencimiento < hoy && p.estatus !== 'PAGADO')
    const enPlazo  = (proyeccion || []).filter(p => p.fecha_vencimiento >= hoy && p.estatus !== 'PAGADO')

    const totalVencido = vencidos.reduce((s,p) => s + Number(p.importe_factura || 0), 0)
    const totalEnPlazo = enPlazo.reduce((s,p) => s + Number(p.importe_factura || 0), 0)
    const totalSaldo = (saldos || []).reduce((s,c) => s + Number(c.saldo_actual || 0), 0)

    const nombreCuenta = {}
    ;(cuentas || []).forEach(c => { nombreCuenta[c.id] = c.nombre })

    content.innerHTML = `
      <div class="vista-header">
        <h2>Tesorería</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormMovimiento()">+ Nuevo movimiento</button>
      </div>

      <div class="dashboard-grid" style="margin-top:16px">
        <div class="dashboard-card">
          <div class="card-valor">$${totalSaldo.toFixed(2)}</div>
          <div class="card-label">Saldo total en cuentas</div>
        </div>
        <div class="dashboard-card archivado">
          <div class="card-valor">$${totalVencido.toFixed(2)}</div>
          <div class="card-label">Vencido (${vencidos.length})</div>
        </div>
        <div class="dashboard-card pendiente">
          <div class="card-valor">$${totalEnPlazo.toFixed(2)}</div>
          <div class="card-label">En plazo (${enPlazo.length})</div>
        </div>
      </div>

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Saldo por cuenta</h4>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Cuenta</th><th>Tipo</th><th style="text-align:right">Saldo inicial</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Egresos</th><th style="text-align:right">Saldo actual</th></tr></thead>
          <tbody>
            ${(saldos || []).map(c => `
              <tr>
                <td>${c.nombre}</td>
                <td>${c.tipo}</td>
                <td style="text-align:right">$${Number(c.saldo_inicial).toFixed(2)}</td>
                <td style="text-align:right;color:#3A8C3E">$${Number(c.total_ingresos).toFixed(2)}</td>
                <td style="text-align:right;color:#B85C2A">$${Number(c.total_egresos).toFixed(2)}</td>
                <td style="text-align:right;font-weight:600">$${Number(c.saldo_actual).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Proyección de pagos pendientes</h4>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Vencimiento</th><th>Proveedor</th><th>Factura</th><th>Clasificación</th><th style="text-align:right">Importe</th><th>Estatus</th></tr></thead>
          <tbody>
            ${(proyeccion || []).filter(p => p.estatus !== 'PAGADO').map(p => {
              const vencido = p.fecha_vencimiento < hoy
              return `
              <tr>
                <td style="${vencido ? 'color:#B85C2A;font-weight:600' : ''}">${p.fecha_vencimiento}${vencido ? ' ⚠' : ''}</td>
                <td>${p.id_proveedor || '—'}</td>
                <td>${p.num_factura || '—'}</td>
                <td>${p.clasificacion_pago || '—'}</td>
                <td style="text-align:right">$${Number(p.importe_factura).toFixed(2)}</td>
                <td>${p.estatus}</td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
        ${!(proyeccion || []).filter(p => p.estatus !== 'PAGADO').length ? '<p style="font-size:12px;color:var(--color-text-muted);padding:12px">Sin pagos pendientes.</p>' : ''}
      </div>

      <h4 style="margin:24px 0 10px;font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:1px">Movimientos recientes</h4>
      <div id="movimientos-form-wrap"></div>
      <div class="tabla-wrapper">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead>
          <tbody>
            ${(movimientos || []).map(m => `
              <tr>
                <td>${m.fecha}</td>
                <td>${nombreCuenta[m.id_cuenta] || '—'}</td>
                <td style="color:${m.tipo === 'INGRESO' ? '#3A8C3E' : '#B85C2A'}">${m.tipo}</td>
                <td>${m.concepto}${m.referencia ? ` <span style="color:var(--color-text-muted);font-size:11px">(${m.referencia})</span>` : ''}</td>
                <td style="text-align:right;color:${m.tipo === 'INGRESO' ? '#3A8C3E' : '#B85C2A'}">${m.tipo === 'INGRESO' ? '+' : '-'}$${Number(m.importe).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${!(movimientos || []).length ? '<p style="font-size:12px;color:var(--color-text-muted);padding:12px">Sin movimientos registrados.</p>' : ''}
      </div>
    `
  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

async function mostrarFormMovimiento() {
  const hoy = new Date().toISOString().split('T')[0]
  const cuentas = window._tesoreria_cuentas || []

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
  const tenant_id = await getTenantId()
  const fecha    = document.getElementById('mv-fecha')?.value
  const id_cuenta = document.getElementById('mv-cuenta')?.value
  const tipo     = document.getElementById('mv-tipo')?.value
  const importe  = parseFloat(document.getElementById('mv-importe')?.value)
  const concepto = document.getElementById('mv-concepto')?.value?.trim()

  if (!fecha || !id_cuenta || !importe || !concepto) { alert('Todos los campos son obligatorios'); return }

  const { error } = await window._db.from('movimientos_cuenta')
    .insert({ tenant_id, id_cuenta, fecha, tipo, importe, concepto, activo: true, created_by: window._email || null })

  if (error) { alert(`Error: ${error.message}`); return }
  document.getElementById('movimientos-form-wrap').innerHTML = ''
  await vistaTesoreria()
}
