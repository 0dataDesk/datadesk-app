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
