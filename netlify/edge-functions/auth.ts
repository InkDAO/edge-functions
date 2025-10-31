import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { generateJWT, corsOptions } from '../utils/shared.ts'
import { verifyMessage } from 'ethers'

const app = new Hono()

app.use('*', cors(corsOptions))

app.post('/auth/login', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature

  const isAuthenticated = await authenticateSignature(salt as string, signature as string, address as string)
  
  if (!isAuthenticated) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }

  const token = await generateJWT(address as string)
  
  return c.json({ 
    token,
    address: address.toLowerCase(),
    expiresIn: '2h'
  }, { status: 200 })
})

async function authenticateSignature(
  salt: string,
  signature: string,
  address: string
): Promise<boolean> {
  if (!salt || !address || !signature) {
    return false
  }
  
  // Extract the "Issued At" timestamp from SIWE message
  const issuedAtMatch = salt.match(/Issued At: (.+)/)
  if (!issuedAtMatch) {
    console.error('[auth] No "Issued At" field found in SIWE message')
    return false
  }
  
  const issuedAtStr = issuedAtMatch[1]
  const issuedAtTimestamp = new Date(issuedAtStr).getTime() / 1000
  const currentTimestamp = Date.now() / 1000
  const timeDiff = currentTimestamp - issuedAtTimestamp
  
  // Check if message is older than 60 seconds
  if (timeDiff > 60) {
    return false
  }
  
  try {
    const recoveredAddr = verifyMessage(salt, signature);
    return recoveredAddr.toLowerCase() === address.toLowerCase()
  } catch (err) {
    console.error('Signature verification error:', err)
    return false
  }
}

export default app.fetch

export const config = {
  path: "/auth/*"
}
