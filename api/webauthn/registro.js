import { createClient } from '@supabase/supabase-js'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'

const RP_ID = 'datadesk-app.vercel.app'
const ORIGIN = 'https://datadesk-app.vercel.app'
const CHALLENGE_TTL_MS = 2 * 60 * 1000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function publicKeyToText(credentialPublicKey) {
  return Buffer.from(credentialPublicKey).toString('base64url')
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'method_not_allowed' })
}

async function handleGet(req, res) {
  const { tenant, id_empleado } = req.query

  if (!tenant || !id_empleado) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: empleado, error: empError } = await supabase
    .from('empleados')
    .select('id, nombre')
    .eq('id', id_empleado)
    .eq('tenant_id', tenant)
    .eq('activo', true)
    .maybeSingle()

  if (empError || !empleado) {
    return res.status(200).json({ error: 'empleado_no_encontrado' })
  }

  const options = await generateRegistrationOptions({
    rpName: 'dataDesk',
    rpID: RP_ID,
    userID: new TextEncoder().encode(empleado.id),
    userName: empleado.nombre,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform'
    }
  })

  const { data: challengeRow, error: challengeError } = await supabase
    .from('webauthn_challenges')
    .insert({
      tenant_id: tenant,
      id_empleado: empleado.id,
      challenge: options.challenge,
      purpose: 'registro'
    })
    .select('id')
    .single()

  if (challengeError || !challengeRow) {
    console.error('webauthn/registro GET insert challenge failed:', challengeError)
    return res.status(500).json({ error: 'no_se_pudo_iniciar_registro' })
  }

  return res.status(200).json({ challenge_id: challengeRow.id, options })
}

async function handlePost(req, res) {
  const { tenant, id_empleado, challenge_id, attestationResponse } = req.body || {}

  if (!tenant || !id_empleado || !challenge_id || !attestationResponse) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: challengeRow, error: challengeError } = await supabase
    .from('webauthn_challenges')
    .select('id, challenge, used, created_at, purpose, id_empleado')
    .eq('id', challenge_id)
    .eq('tenant_id', tenant)
    .maybeSingle()

  const challengeValido =
    challengeRow &&
    !challengeRow.used &&
    challengeRow.purpose === 'registro' &&
    challengeRow.id_empleado === id_empleado &&
    Date.now() - new Date(challengeRow.created_at).getTime() <= CHALLENGE_TTL_MS

  if (challengeError || !challengeValido) {
    return res.status(200).json({ error: 'challenge_invalido_o_expirado' })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID
    })
  } catch (err) {
    verification = null
  }

  if (!verification || !verification.verified || !verification.registrationInfo) {
    return res.status(200).json({ error: 'verificacion_fallida' })
  }

  await supabase
    .from('webauthn_challenges')
    .update({ used: true })
    .eq('id', challenge_id)

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

  const { error: insertError } = await supabase
    .from('credenciales_webauthn')
    .insert({
      tenant_id: tenant,
      id_empleado,
      credential_id: credentialID,
      public_key: publicKeyToText(credentialPublicKey),
      sign_count: counter,
      transports: attestationResponse.response?.transports
        ? attestationResponse.response.transports.join(',')
        : null
    })

  if (insertError) {
    return res.status(200).json({ error: 'no_se_pudo_guardar_credencial' })
  }

  const { data: empleado } = await supabase
    .from('empleados')
    .select('nombre')
    .eq('id', id_empleado)
    .eq('tenant_id', tenant)
    .maybeSingle()

  return res.status(200).json({ ok: true, nombre: empleado?.nombre || '' })
}
