async function getTenantId() {
  console.log('[getTenantId] _tenantActivo:', window._tenantActivo)
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesion activa')

  // 1. Multitenant: tenant seleccionado explícitamente
  if (window._tenantActivo) return window._tenantActivo

  // 2. Single tenant: leer del JWT
  const tenantId = user.user_metadata?.tenant_id
  if (tenantId) return tenantId

  // 3. Si tiene array tenants pero no seleccionó → error descriptivo
  const tenants = user.user_metadata?.tenants
  if (tenants?.length) throw new Error('Selecciona un negocio primero')

  throw new Error('No hay tenant asignado')
}

async function getTenants() {
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) return []
  return user.user_metadata?.tenants || null
}

async function validarTenant(tenant_id) {
  if (!tenant_id) throw new Error('tenant_id requerido')
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesion activa')
  const tenants = user.user_metadata?.tenants
  const userTenant = user.user_metadata?.tenant_id
  if (tenants) {
    if (!tenants.includes(tenant_id)) throw new Error('Acceso denegado')
  } else {
    if (userTenant !== tenant_id) throw new Error('Acceso denegado')
  }
  return true
}

async function getTenantConfig(tenant_id_conocido = null) {
  if (window._tenantConfig && !tenant_id_conocido) return window._tenantConfig
  let tenant_id = tenant_id_conocido || window._tenantActivo
  if (!tenant_id) {
    try { tenant_id = await getTenantId() } catch {
      const params = new URLSearchParams(window.location.search)
      tenant_id = params.get('tenant')
    }
  }
  if (!tenant_id) return { nombre: 'dataDesk', tagline: '', color_primario: '#1e3a5f' }
  const { data, error } = await window._db.from('tenants')
    .select('nombre, tagline, color_primario')
    .eq('tenant_id', tenant_id).single()
  if (error || !data) return { nombre: 'dataDesk', tagline: '', color_primario: '#1e3a5f' }
  window._tenantConfig = data
  return data
}
