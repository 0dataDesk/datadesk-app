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

  const { tenant, endpoint, p256dh, auth_key } = req.body || {}

  if (!tenant || !endpoint || !p256dh || !auth_key) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { tenant_id: tenant, auth_user_id: user.id, endpoint, p256dh, auth_key },
      { onConflict: 'endpoint' }
    )

  if (error) {
    return res.status(200).json({ error: 'no_se_pudo_suscribir', detalle: error.message })
  }

  return res.status(200).json({ ok: true })
}
