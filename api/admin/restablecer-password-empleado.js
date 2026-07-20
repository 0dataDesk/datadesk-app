import { createClient } from '@supabase/supabase-js'

const ROLES_AUTORIZADOS = ['superadmin', 'admin', 'owner', 'gerente']

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'no_autorizado' })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user || !ROLES_AUTORIZADOS.includes(user.user_metadata?.rol)) {
    return res.status(401).json({ error: 'no_autorizado' })
  }

  const { tenant, id_empleado, password } = req.body || {}

  if (!tenant || !id_empleado || !password) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: empleado, error: empError } = await supabase
    .from('empleados')
    .select('id, auth_user_id')
    .eq('id', id_empleado)
    .eq('tenant_id', tenant)
    .maybeSingle()

  if (empError || !empleado || !empleado.auth_user_id) {
    return res.status(200).json({ error: 'sin_cuenta' })
  }

  const { error } = await supabase.auth.admin.updateUserById(empleado.auth_user_id, { password })

  if (error) {
    return res.status(200).json({ error: 'no_se_pudo_restablecer', detalle: error.message })
  }

  return res.status(200).json({ ok: true })
}
