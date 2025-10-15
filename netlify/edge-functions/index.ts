import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getFileByCid } from '../utils/pinata.ts'
import { corsOptions, decodeQuickNodeWebhookAssetData, getPinataConfig, decodeAlchemyWebhookAssetData } from '../utils/shared.ts'

const app = new Hono()

// Add CORS middleware
app.use('*', cors(corsOptions))

app.get('/', (c) => {
  return c.json({
    message: "Welcome to the API, secured by digital signature",
  }, { status: 200 })
})

/**
 * Webhook to update the file status to onchain
 * no jwt token is required for this request.
 * return the asset data
 */
app.post('/alchemy/webhook', async (c) => {  
  try {
    const body = await c.req.json()
    
    const assetData = decodeAlchemyWebhookAssetData(body)
    if (!assetData) {
      return c.json({
        success: false,
        error: 'No asset data found'
      }, { status: 400 })
    }
    console.log('\n🔔 New Blockchain Event Received from Alchemy', assetData.assetCid, assetData.author)
    
    const file = await getFileByCid(assetData.assetCid, assetData.author.toLowerCase())
    if (!file) {
      return c.json({
        success: false,
        error: 'No file found'
      }, { status: 404 })
    }

    const { pinata } = getPinataConfig()
    await pinata.files.private.update({id: file.id,
      keyvalues: {
        status: "onchain",
      }
    })
    
    return c.json({
      success: true,
      message: "Webhook received successfully",
      assetCid: assetData.assetCid || null,
      timestamp: new Date().toISOString()
    }, { status: 200 })
  } catch (error) {
    console.error('Error parsing webhook:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 400 })
  }
})

app.post('/quicknode/webhook', async (c) => {  
  try {
    const body = await c.req.json()
    
    const assetData = decodeQuickNodeWebhookAssetData(body)
    if (!assetData) {
      return c.json({
        success: false,
        error: 'No asset data found'
      }, { status: 400 })
    }
    console.log('\n🔔 New Blockchain Event Received from QuickNode', assetData.assetCid, assetData.author)
    
    const file = await getFileByCid(assetData.assetCid, assetData.author.toLowerCase())
    if (!file) {
      return c.json({
        success: false,
        error: 'No file found'
      }, { status: 404 })
    }

    const { pinata } = getPinataConfig()
    await pinata.files.private.update({id: file.id,
      keyvalues: {
        status: "onchain",
      }
    })
    
    return c.json({
      success: true,
      message: "Webhook received successfully",
      assetCid: assetData.assetCid || null,
      timestamp: new Date().toISOString()
    }, { status: 200 })
  } catch (error) {
    console.error('Error parsing webhook:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 400 })
  }
})

export default app.fetch