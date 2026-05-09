async function getTenantId() {
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  return user.user_metadata?.tenant_id || null
}

async function validarTenant(tenant_id) {
  if (!tenant_id) throw new Error('tenant_id requerido')
  const { data: { user } } = await window._db.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  const userTenant = user.user_metadata?.tenant_id
  if (userTenant !== tenant_id) throw new Error('Acceso denegado')
  return true
}

async function getTenantConfig() {
  if (window._tenantConfig) return window._tenantConfig
  try {
    const tenant_id = await getTenantId()
    if (!tenant_id) throw new Error('sin tenant_id')
    const { data, error } = await window._db
      .from('tenants')
      .select('nombre, tagline, color_primario')
      .eq('tenant_id', tenant_id)
      .single()
    if (error || !data) throw error || new Error('sin datos')
    window._tenantConfig = data
    return data
  } catch {
    return { nombre: 'Tita', tagline: 'panadería argentina', color_primario: '#2B1A0F' }
  }
}
