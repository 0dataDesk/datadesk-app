import { supabase } from './lib/supabase.js'

export async function getTenantId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  return user.user_metadata?.tenant_id || null
}

export async function validarTenant(tenant_id) {
  if (!tenant_id) throw new Error('tenant_id requerido')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa')
  const userTenant = user.user_metadata?.tenant_id
  if (userTenant !== tenant_id) throw new Error('Acceso denegado')
  return true
}
