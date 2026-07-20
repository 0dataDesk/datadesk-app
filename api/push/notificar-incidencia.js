import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

webpush.setVapidDetails(
  'mailto:0.datadesk@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { tenant, incidencia_id } = req.body || {}

  if (!tenant || !incidencia_id) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('tenant_id', tenant)

  if (error) {
    return res.status(200).json({ ok: true, enviados: 0 })
  }

  let enviados = 0
  for (const sub of (subs || [])) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title: 'Checador', body: 'Un empleado necesita autorización para continuar.' })
      )
      enviados++
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }

  return res.status(200).json({ ok: true, enviados })
}
