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

  const { tenant, id_empleado, email, password } = req.body || {}

  if (!tenant || !id_empleado || !email || !password) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: empleado, error: empError } = await supabase
    .from('empleados')
    .select('id, auth_user_id')
    .eq('id', id_empleado)
    .eq('tenant_id', tenant)
    .eq('activo', true)
    .maybeSingle()

  if (empError || !empleado) {
    return res.status(200).json({ error: 'empleado_no_encontrado' })
  }

  if (empleado.auth_user_id) {
    return res.status(200).json({ error: 'ya_tiene_cuenta' })
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { rol: 'empleado', tenant_id: tenant }
  })

  if (error) {
    return res.status(200).json({ error: 'no_se_pudo_crear_cuenta', detalle: error.message })
  }

  const { error: updateError } = await supabase
    .from('empleados')
    .update({ auth_user_id: data.user.id })
    .eq('id', id_empleado)
    .eq('tenant_id', tenant)

  if (updateError) {
    return res.status(200).json({ error: 'no_se_pudo_vincular', detalle: updateError.message })
  }

  return res.status(200).json({ ok: true, auth_user_id: data.user.id, email })
}
