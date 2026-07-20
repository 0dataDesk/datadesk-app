export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY })
}
