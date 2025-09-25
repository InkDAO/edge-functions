import { Hono } from 'hono'
import { PinataSDK } from 'pinata'
import { cors } from 'hono/cors'
import { getPinataConfig, corsOptions, authenticateSignature } from '../utils/shared.ts'

const app = new Hono()

// Add CORS middleware
app.use('*', cors(corsOptions))

app.get('/presigned_url', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature

  const isAuthenticated = await authenticateSignature(salt as string, signature as string, address as string)
  
  if (!isAuthenticated) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }
  
  const { pinataJwt, gatewayUrl } = getPinataConfig()
  
  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  try {

    const url = await pinata.upload.public.createSignedURL({
      expires: 60, // Last for 60 seconds
      name: 'thumbnail.png',
    })

    return c.json({ url }, { status: 200 })
  } catch (error) {
    console.error('Pinata error:', error)
    return c.json({ error: 'Failed to generate presigned URL' }, { status: 500 })
  }
})

app.get('/groupByName/:group_name', async (c) => {
  try {
    const { pinataJwt, gatewayUrl } = getPinataConfig()

    const pinata = new PinataSDK({
      pinataJwt: pinataJwt,
      pinataGateway: gatewayUrl
    })
    
    const groups = await pinata.groups.public
      .list()
      .name(c.req.param('group_name'))
      .limit(1)

    return c.json(groups, { status: 200 })
  } catch (error) {
    console.error('Pinata error:', error)
    return c.json({ error: 'Failed to get group by name' }, { status: 500 })
  }
})

export default app.fetch

export const config = {
  path: ["/presigned_url/*", "/groupByName/*"]
}
