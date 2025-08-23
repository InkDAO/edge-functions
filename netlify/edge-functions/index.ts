import { Hono } from 'hono'
import { PinataSDK } from 'pinata'
import { cors } from 'hono/cors'

const app = new Hono()

// Add CORS middleware
app.use('*', cors({
  origin: ['http://localhost:8080', 'https://decentralizedx.tech'], // Add your allowed origins
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
  allowMethods: ['GET'],
  exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  credentials: true,
}))

app.get('/', (c) => {
  return c.text('Hello World')
})

app.get('/presigned_url', async (c) => {
  // In Netlify Edge Functions, use Deno.env.get() to access environment variables
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    return c.json({ error: 'Missing environment variables' }, { status: 500 })
  }
  
  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  try {
    const url = await pinata.upload.public.createSignedURL({
      expires: 60 // Last for 60 seconds
    })

    return c.json({ url }, { status: 200 })
  } catch (error) {
    console.error('Pinata error:', error)
    return c.json({ error: 'Failed to generate presigned URL' }, { status: 500 })
  }
})

export default app.fetch