import { Hono } from 'hono'
import { PinataSDK } from 'pinata'
import { cors } from 'hono/cors'

// Declare Deno types for Netlify Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

const app = new Hono()

// Add CORS middleware
app.use('*', cors({
  origin: ['http://localhost:8080', 'https://decentralizedx.tech', 'https://staging.decentralizedx.tech'], // Add your allowed origins
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
  allowMethods: ['GET'],
  exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  credentials: true,
}))

app.get('/', (c) => {
  return c.text('Hello World')
})

app.post('/create/:group_name', async (c) => {
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    return c.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const groupResponse = await pinata.groups.public
    .list()
    .name(c.req.param('group_name'))
    .limit(1)

  if (groupResponse.groups.length > 0) {
    return c.json({ group: groupResponse.groups[0] }, { status: 200 })
  } else {
    const group = await pinata.groups.public.create({
      name: c.req.param('group_name'),
    })
    return c.json({ group }, { status: 200 })
  }
})

app.get('/presigned_url/:group_id', async (c) => {
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
      expires: 60, // Last for 60 seconds
      groupId: c.req.param('group_id')
    })

    return c.json({ url }, { status: 200 })
  } catch (error) {
    console.error('Pinata error:', error)
    return c.json({ error: 'Failed to generate presigned URL' }, { status: 500 })
  }
})

app.get('/groupByName/:group_name', async (c) => {
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    return c.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })
  
  const groups = await pinata.groups.public
    .list()
    .name(c.req.param('group_name'))
    .limit(1)

  return c.json(groups, { status: 200 })
})

app.get('/fileByCid/:cid', async (c) => {
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    return c.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const files = await pinata.files.public.list().cid(c.req.param('cid'))

  return c.json(files, { status: 200 })
})

app.get('/filesByTags', async (c) => {
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    return c.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  // Get query parameters
  const tags = c.req.query('tags') // Comma-separated list of tags
  
  if (!tags) {
    return c.json({ error: 'Tags parameter is required. Use comma-separated values (e.g., ?tags=tag1,tag2,tag3)' }, { status: 400 })
  }

  const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
  if (tagArray.length === 0) {
    return c.json({ error: 'At least one valid tag is required' }, { status: 400 })
  }

  const keyvalues = tagArray.reduce((acc, tag) => {
    acc[tag] = tag;
    return acc;
  }, {} as Record<string, string>);
  
  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  try {
    const files = await pinata.files.public.list().keyvalues(keyvalues)

    return c.json({ 
      files: files.files || [],
      count: files.files.length || 0,
      tags: tagArray
    }, { status: 200 })
  } catch (error) {
    console.error('Error filtering files by multiple tags:', error)
    return c.json({ error: 'Failed to filter files by tags' }, { status: 500 })
  }
})

export default app.fetch