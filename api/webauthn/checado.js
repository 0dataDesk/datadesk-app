import { createClient } from '@supabase/supabase-js'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'

const RP_ID = 'datadesk-app.vercel.app'
const ORIGIN = 'https://datadesk-app.vercel.app'
const CHALLENGE_TTL_MS = 2 * 60 * 1000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function publicKeyFromText(text) {
  return new Uint8Array(Buffer.from(text, 'base64url'))
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'method_not_allowed' })
}

async function handleGet(req, res) {
  const { tenant } = req.query

  if (!tenant) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required'
  })

  const { data: challengeRow, error: challengeError } = await supabase
    .from('webauthn_challenges')
    .insert({
      tenant_id: tenant,
      id_empleado: null,
      challenge: options.challenge,
      purpose: 'checado'
    })
    .select('id')
    .single()

  if (challengeError || !challengeRow) {
    console.error('webauthn/checado GET insert challenge failed:', challengeError)
    return res.status(500).json({ error: 'no_se_pudo_iniciar_checado' })
  }

  return res.status(200).json({ challenge_id: challengeRow.id, options })
}

async function handlePost(req, res) {
  const { tenant, challenge_id, assertionResponse, lat, lng } = req.body || {}

  if (!tenant || !challenge_id || !assertionResponse) {
    return res.status(400).json({ error: 'faltan_parametros' })
  }

  const { data: challengeRow, error: challengeError } = await supabase
    .from('webauthn_challenges')
    .select('id, challenge, used, created_at, purpose')
    .eq('id', challenge_id)
    .eq('tenant_id', tenant)
    .maybeSingle()

  const challengeValido =
    challengeRow &&
    !challengeRow.used &&
    challengeRow.purpose === 'checado' &&
    Date.now() - new Date(challengeRow.created_at).getTime() <= CHALLENGE_TTL_MS

  if (challengeError || !challengeValido) {
    return res.status(200).json({ error: 'challenge_invalido_o_expirado' })
  }

  const { data: credencial, error: credError } = await supabase
    .from('credenciales_webauthn')
    .select('id, id_empleado, credential_id, public_key, sign_count, activo')
    .eq('credential_id', assertionResponse.id)
    .eq('tenant_id', tenant)
    .eq('activo', true)
    .maybeSingle()

  if (credError || !credencial) {
    return res.status(200).json({ error: 'credencial_no_reconocida' })
  }

  const { data: empleado, error: empError } = await supabase
    .from('empleados')
    .select('id')
    .eq('id', credencial.id_empleado)
    .eq('tenant_id', tenant)
    .eq('activo', true)
    .maybeSingle()

  if (empError || !empleado) {
    return res.status(200).json({ error: 'credencial_no_reconocida' })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: credencial.credential_id,
        credentialPublicKey: publicKeyFromText(credencial.public_key),
        counter: Number(credencial.sign_count)
      }
    })
  } catch (err) {
    verification = null
  }

  if (!verification || !verification.verified) {
    return res.status(200).json({ error: 'verificacion_fallida' })
  }

  await supabase
    .from('webauthn_challenges')
    .update({ used: true })
    .eq('id', challenge_id)

  await supabase
    .from('credenciales_webauthn')
    .update({ sign_count: verification.authenticationInfo.newCounter })
    .eq('id', credencial.id)

  const { data: resultado, error: rpcError } = await supabase.rpc('fn_registrar_checado_biometrico', {
    p_tenant_id: tenant,
    p_id_empleado: credencial.id_empleado,
    p_lat: lat,
    p_lng: lng
  })

  if (rpcError) {
    return res.status(500).json({ error: 'no_se_pudo_registrar_checado' })
  }

  return res.status(200).json(resultado)
}
