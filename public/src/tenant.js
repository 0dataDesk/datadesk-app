async function getTenantId() {
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesion activa')
  return user.user_metadata?.tenant_id || null
}

async function validarTenant(tenant_id) {
  if (!tenant_id) throw new Error('tenant_id requerido')
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesion activa')
  const userTenant = user.user_metadata?.tenant_id
  if (userTenant !== tenant_id) throw new Error('Acceso denegado')
  return true
}

async function getTenantConfig() {
  if (window._tenantConfig) return window._tenantConfig

  // 1. Intentar obtener tenant_id de la sesion activa
  let tenant_id = null
  try {
    tenant_id = await getTenantId()
  } catch {
    // Sin sesion -- leer de la URL
    const params = new URLSearchParams(window.location.search)
    tenant_id = params.get('tenant')
  }

  if (!tenant_id) {
    return { nombre: 'dataDesk', tagline: '', color_primario: '#1e3a5f' }
  }

  const { data, error } = await window._db
    .from('tenants')
    .select('nombre, tagline, color_primario')
    .eq('tenant_id', tenant_id)
    .single()

  if (error || !data) {
    return { nombre: 'dataDesk', tagline: '', color_primario: '#1e3a5f' }
  }

  window._tenantConfig = data
  return data
}
