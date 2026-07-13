// ── Vista: Gastos / CXP ──────────────────────────────────────────────────────
// Portado de origin/dev (public/views/gastos.js) — se usó solo como referencia
// de lógica de negocio. Adaptado a convenciones vigentes de main:
//  - formatNum/formatInt (utils.js) en vez de .toFixed(2).
//  - fecha_vencimiento se calcula aquí a partir de fecha_recibo + dias_credito:
//    en dev el INSERT nunca la fijaba (columna quedaba NULL siempre), lo que
//    habría dejado el resumen de CXP (vencido/en plazo) sin funcionar jamás.
//  - Al registrar un pago, si se eligió una cuenta de salida, se crea además
//    el movimiento de egreso correspondiente en movimientos_cuenta (columna
//    id_gasto ya existe para este enlace) — en dev el pago no se reflejaba
//    en Tesorería, dejando el saldo por cuenta desconectado de los pagos reales.
//  - centros_costo y cuentas pueden estar vacías (catálogos nuevos, sin
//    datos todavía): ambos selects son opcionales por esquema, así que un
//    catálogo vacío simplemente deja el select sin opciones, sin romper nada.

async function vistaGastos() {
  const content = document.getElementById('content')
  content.innerHTML = `<p style="color:var(--color-text-muted)">Cargando gastos...</p>`

  try {
    await window._db.auth.refreshSession()
    const tenant_id = await getTenantId()

    const [
      { data: gastos, error: errG },
      { data: proveedores },
      { data: centros },
      { data: cuentas }
    ] = await Promise.all([
      window._db.from('gastos').select('*').eq('tenant_id', tenant_id).order('created_at', { ascending: false }),
      window._db.from('proveedores').select('id_proveedor, nombre').eq('tenant_id', tenant_id).eq('activo', true).order('nombre'),
      window._db.from('centros_costo').select('id, nombre').eq('tenant_id', tenant_id).eq('activo', true),
      window._db.from('cuentas').select('id, nombre').eq('tenant_id', tenant_id).eq('activo', true)
    ])

    if (errG) throw errG

    const nombreProv = {}
    ;(proveedores || []).forEach(p => { nombreProv[p.id_proveedor] = p.nombre })

    const nombreCentro = {}
    ;(centros || []).forEach(c => { nombreCentro[c.id] = c.nombre })

    window._gastosData        = gastos || []
    window._gastosTenant      = tenant_id
    window._gastosProveedores = proveedores || []
    window._gastosCentros     = centros || []
    window._gastosCuentas     = cuentas || []
    window._nombreProvGastos  = nombreProv
    window._nombreCentroGastos = nombreCentro

    const badgeEstatus = {
      PENDIENTE: 'background:rgba(184,92,42,0.12);color:#B85C2A;border:1px solid rgba(184,92,42,0.3)',
      APROBADO:  'background:rgba(200,137,42,0.12);color:#c8892a;border:1px solid rgba(200,137,42,0.3)',
      PAGADO:    'background:rgba(76,153,80,0.12);color:#3A8C3E;border:1px solid rgba(76,153,80,0.3)'
    }
    window._gastosBadges = badgeEstatus

    content.innerHTML = `
      <div class="vista-header">
        <h2>Gastos / CXP</h2>
        <button class="btn-accion btn-aprobar" onclick="mostrarFormGasto()">+ Nuevo gasto</button>
      </div>

      <div id="form-gasto-wrap"></div>

      <div class="filtros-bar">
        <select id="filtro-gasto-estatus" class="filtro-select" onchange="filtrarGastos()">
          <option value="">Todos los estatus</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="APROBADO">Aprobado</option>
          <option value="PAGADO">Pagado</option>
        </select>
        <select id="filtro-gasto-prov" class="filtro-select" onchange="filtrarGastos()">
          <option value="">Todos los proveedores</option>
          ${(proveedores || []).map(p => `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')}
        </select>
        <input type="date" id="filtro-gasto-vence" class="filtro-select" style="max-width:180px"
          title="Filtrar por fecha de corte CXP" onchange="filtrarGastos()">
      </div>

      <div id="resumen-cxp"></div>
      <div id="gastos-lista"></div>
    `

    renderGastos(window._gastosData)

  } catch (err) {
    content.innerHTML = `<p style="color:var(--color-highlight)">Error: ${err.message}</p>`
  }
}

function filtrarGastos() {
  const estatus = document.getElementById('filtro-gasto-estatus')?.value || ''
  const prov    = document.getElementById('filtro-gasto-prov')?.value || ''
  const corte   = document.getElementById('filtro-gasto-vence')?.value || ''

  const filtrados = (window._gastosData || []).filter(g =>
    (!estatus || g.estatus === estatus) &&
    (!prov    || g.id_proveedor === prov)
  )
  renderGastos(filtrados)
  if (corte) renderResumenCXP(corte)
  else document.getElementById('resumen-cxp').innerHTML = ''
}

function renderGastos(lista) {
  const wrap = document.getElementById('gastos-lista')
  if (!lista.length) {
    wrap.innerHTML = `<p style="color:var(--color-text-muted);font-size:13px;margin-top:16px">No hay gastos registrados.</p>`
    return
  }

  const hoy = new Date().toISOString().split('T')[0]

  wrap.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha recibo</th>
            <th>Proveedor</th>
            <th>Factura</th>
            <th>Importe</th>
            <th>Vencimiento</th>
            <th>Frecuencia</th>
            <th>Centro costo</th>
            <th>Estatus</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(g => {
            const vencido = g.fecha_vencimiento && g.estatus !== 'PAGADO' && g.fecha_vencimiento < hoy
            return `
            <tr>
              <td>${g.fecha_recibo || g.fecha_carga}</td>
              <td>${window._nombreProvGastos[g.id_proveedor] || g.id_proveedor || '—'}</td>
              <td style="font-size:12px">${g.num_factura || '—'}</td>
              <td style="font-weight:600">$${formatNum(g.importe_factura)}</td>
              <td style="${vencido ? 'color:#B85C2A;font-weight:600' : ''}">${g.fecha_vencimiento || '—'}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${g.frecuencia || '—'}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${window._nombreCentroGastos[g.id_centro_costo] || '—'}</td>
              <td>
                <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;${window._gastosBadges[g.estatus] || ''}">
                  ${g.estatus || '—'}
                </span>
              </td>
              <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end">
                ${g.estatus === 'PENDIENTE'
                  ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="aprobarGasto('${g.id}')">Aprobar</button>`
                  : ''}
                ${g.estatus === 'APROBADO'
                  ? `<button class="btn-accion btn-aprobar" style="font-size:11px;padding:4px 10px"
                      onclick="mostrarFormPago('${g.id}')">Pagar</button>`
                  : ''}
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderResumenCXP(fechaCorte) {
  const wrap = document.getElementById('resumen-cxp')
  const pendientes = (window._gastosData || []).filter(g => g.estatus !== 'PAGADO')

  const vencidos = pendientes.filter(g => g.fecha_vencimiento && g.fecha_vencimiento <= fechaCorte)
  const enPlazo  = pendientes.filter(g => !g.fecha_vencimiento || g.fecha_vencimiento > fechaCorte)

  const totalVencido = vencidos.reduce((s, g) => s + (Number(g.importe_factura) || 0), 0)
  const totalPlazo   = enPlazo.reduce((s, g) => s + (Number(g.importe_factura) || 0), 0)

  wrap.innerHTML = `
    <div class="dashboard-grid" style="margin-bottom:16px">
      <div class="dashboard-card" style="border-top:3px solid #B85C2A">
        <div class="card-valor" style="color:#B85C2A">$${formatNum(totalVencido)}</div>
        <div class="card-label">Vencido al ${fechaCorte}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">${vencidos.length} facturas</div>
      </div>
      <div class="dashboard-card" style="border-top:3px solid var(--color-accent)">
        <div class="card-valor">${enPlazo.length > 0 ? '$' + formatNum(totalPlazo) : '—'}</div>
        <div class="card-label">En plazo</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">${enPlazo.length} facturas</div>
      </div>
    </div>
  `
}

async function mostrarFormGasto() {
  const hoy  = new Date().toISOString().split('T')[0]
  const wrap = document.getElementById('form-gasto-wrap')

  const provOpts = (window._gastosProveedores || []).map(p =>
    `<option value="${p.id_proveedor}">${p.nombre}</option>`).join('')
  const centroOpts = (window._gastosCentros || []).map(c =>
    `<option value="${c.id}">${c.nombre}</option>`).join('')

  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:20px">Nuevo gasto</h3>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha de recibo</label>
          <input type="date" id="g-fecha-recibo" class="filtro-select" value="${hoy}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Proveedor</label>
          <select id="g-proveedor" class="filtro-select">
            <option value="">— Seleccionar —</option>
            ${provOpts}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Núm. Remisión</label>
          <input type="text" id="g-remision" class="filtro-select" placeholder="Opcional">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Núm. Factura</label>
          <input type="text" id="g-factura" class="filtro-select" placeholder="Requerido">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Importe factura</label>
          <input type="number" id="g-importe" class="filtro-select" min="0" step="any" placeholder="$0.00">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Días de crédito</label>
          <input type="number" id="g-dias-credito" class="filtro-select" min="0" value="0">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Frecuencia</label>
          <select id="g-frecuencia" class="filtro-select">
            <option value="UNICA">Única</option>
            <option value="SEMANAL">Semanal</option>
            <option value="QUINCENAL">Quincenal</option>
            <option value="MENSUAL">Mensual</option>
            <option value="ANUAL">Anual</option>
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Centro de costo</label>
          <select id="g-centro" class="filtro-select">
            <option value="">— Seleccionar —</option>
            ${centroOpts}
          </select>
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">¿Tiene fiscal?</label>
          <select id="g-fiscal" class="filtro-select">
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </div>
        <div class="filtro-cascada-item" style="flex:2">
          <label class="filtro-label">Notas</label>
          <input type="text" id="g-notas" class="filtro-select" placeholder="Observaciones opcionales">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="guardarGasto()">Guardar gasto</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('form-gasto-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
}

// fecha_recibo + dias_credito → fecha_vencimiento (fecha_recibo llega como YYYY-MM-DD)
function _gastosFechaVencimiento(fecha_recibo, dias_credito) {
  if (!fecha_recibo) return null
  const d = new Date(fecha_recibo + 'T12:00:00')
  d.setDate(d.getDate() + (Number(dias_credito) || 0))
  return d.toISOString().split('T')[0]
}

async function guardarGasto() {
  const tenant_id    = window._gastosTenant || await getTenantId()
  const fecha_recibo = document.getElementById('g-fecha-recibo')?.value
  const id_proveedor = document.getElementById('g-proveedor')?.value || null
  const num_remision = document.getElementById('g-remision')?.value?.trim() || null
  const num_factura  = document.getElementById('g-factura')?.value?.trim()
  const importe      = parseFloat(document.getElementById('g-importe')?.value) || 0
  const dias_credito = parseInt(document.getElementById('g-dias-credito')?.value) || 0
  const frecuencia   = document.getElementById('g-frecuencia')?.value
  const id_centro    = document.getElementById('g-centro')?.value || null
  const tiene_fiscal = document.getElementById('g-fiscal')?.value === 'true'
  const notas        = document.getElementById('g-notas')?.value?.trim() || null

  if (!fecha_recibo || !num_factura || importe <= 0) {
    alert('Fecha de recibo, número de factura e importe son obligatorios')
    return
  }

  const { error } = await window._db.from('gastos').insert({
    tenant_id,
    fecha_carga: new Date().toISOString().split('T')[0],
    fecha_recibo,
    id_proveedor,
    num_remision,
    num_factura,
    importe_factura: importe,
    dias_credito,
    fecha_vencimiento: _gastosFechaVencimiento(fecha_recibo, dias_credito),
    frecuencia,
    id_centro_costo: id_centro || null,
    tiene_fiscal,
    notas,
    estatus: 'PENDIENTE',
    created_by: window._email || null
  })

  if (error) { alert(`Error: ${error.message}`); return }

  document.getElementById('form-gasto-wrap').innerHTML = ''
  await vistaGastos()
}

async function aprobarGasto(id) {
  const hoy = new Date().toISOString().split('T')[0]
  if (!confirm('¿Aprobar este gasto?')) return
  const { error } = await window._db.from('gastos')
    .update({ estatus: 'APROBADO', fecha_aprobacion: hoy, aprobado_por: window._email || null })
    .eq('id', id)
  if (error) { alert(`Error: ${error.message}`); return }
  await vistaGastos()
}

async function mostrarFormPago(id) {
  const gasto = (window._gastosData || []).find(g => g.id === id)
  if (!gasto) return

  const cuentaOpts = (window._gastosCuentas || []).map(c =>
    `<option value="${c.id}">${c.nombre}</option>`).join('')

  const wrap = document.getElementById('form-gasto-wrap')
  wrap.innerHTML = `
    <div class="receta-detalle-card" style="margin-bottom:24px">
      <h3 style="margin-bottom:12px">Registrar pago</h3>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:20px">
        Factura ${gasto.num_factura} · $${formatNum(gasto.importe_factura)}
      </p>
      <div class="filtros-cascada">
        <div class="filtro-cascada-item">
          <label class="filtro-label">Fecha de pago</label>
          <input type="date" id="pago-fecha" class="filtro-select" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Forma de pago</label>
          <input type="text" id="pago-forma" class="filtro-select" placeholder="Transferencia, efectivo...">
        </div>
        <div class="filtro-cascada-item">
          <label class="filtro-label">Cuenta de salida</label>
          <select id="pago-cuenta" class="filtro-select">
            <option value="">— Seleccionar —</option>
            ${cuentaOpts}
          </select>
        </div>
      </div>
      ${!(window._gastosCuentas || []).length ? `<p style="font-size:11px;color:var(--color-text-muted);margin-top:8px">No hay cuentas registradas — el pago se marcará como PAGADO sin descontarse de ninguna cuenta en Tesorería.</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn-accion btn-aprobar" onclick="registrarPago('${id}')">Confirmar pago</button>
        <button class="btn-accion" style="border:1px solid var(--color-border)"
          onclick="document.getElementById('form-gasto-wrap').innerHTML=''">Cancelar</button>
      </div>
    </div>
  `
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function registrarPago(id) {
  const tenant_id  = window._gastosTenant || await getTenantId()
  const gasto      = (window._gastosData || []).find(g => g.id === id)
  const fecha_pago = document.getElementById('pago-fecha')?.value
  const forma_pago = document.getElementById('pago-forma')?.value?.trim() || null
  const id_cuenta  = document.getElementById('pago-cuenta')?.value || null

  if (!fecha_pago) { alert('La fecha de pago es obligatoria'); return }

  const { error } = await window._db.from('gastos')
    .update({ estatus: 'PAGADO', fecha_pago, forma_pago, id_cuenta_salida: id_cuenta || null })
    .eq('id', id)

  if (error) { alert(`Error: ${error.message}`); return }

  // Si se eligió cuenta de salida, reflejar el pago como egreso en Tesorería
  // (movimientos_cuenta.id_cuenta es NOT NULL, así que solo se crea si hay cuenta).
  if (id_cuenta && gasto) {
    const { error: errMov } = await window._db.from('movimientos_cuenta').insert({
      tenant_id,
      id_cuenta,
      fecha: fecha_pago,
      tipo: 'EGRESO',
      concepto: `Pago factura ${gasto.num_factura || ''}`.trim(),
      importe: Number(gasto.importe_factura) || 0,
      referencia: forma_pago,
      id_gasto: id,
      activo: true,
      created_by: window._email || null
    })
    if (errMov) { alert(`El gasto se marcó como pagado, pero no se pudo registrar el movimiento en Tesorería: ${errMov.message}`) }
  }

  document.getElementById('form-gasto-wrap').innerHTML = ''
  await vistaGastos()
}
