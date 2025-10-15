import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authenticateSignature, generateJWT, corsOptions } from '../utils/shared.ts'

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

export default app.fetch

export const config = {
  path: "/auth/*"
}
