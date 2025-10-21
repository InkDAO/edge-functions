import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getFileByCid } from '../utils/pinata.ts'
import { decodeQuickNodeWebhookAssetData, getPinataConfig, decodeAlchemyWebhookAssetData, validateAlchemySignature, getAlchemySigningKey, validateQuickNodeSignature, getQuickNodeSecurityToken, corsOptions } from '../utils/shared.ts'

const app = new Hono()

app.use('*', cors(corsOptions))

/**
 * Webhook to update the file status to onchain
 * Secured with Alchemy signature validation
 * @see https://www.alchemy.com/docs/reference/notify-api-quickstart
 */
app.post('/webhook/alchemy/publish', async (c) => {  
    try {
      // Get the signature from header
      const signature = c.req.header('X-Alchemy-Signature')
      if (!signature) {
        console.error('❌ Missing X-Alchemy-Signature header')
        return c.json({
          success: false,
          error: 'Missing signature header'
        }, { status: 401 })
      }
  
      // Get raw body text for signature validation
      const rawBody = await c.req.text()
      
      // Validate signature
      const signingKey = getAlchemySigningKey()
      const isValid = await validateAlchemySignature(rawBody, signature, signingKey)
      
      if (!isValid) {
        console.error('❌ Invalid Alchemy webhook signature')
        return c.json({
          success: false,
          error: 'Invalid signature'
        }, { status: 401 })
      }
  
      // Parse the validated body
      const body = JSON.parse(rawBody)
      
      const assetData = decodeAlchemyWebhookAssetData(body)
      if (!assetData) {
        return c.json({
          success: false,
          error: 'No asset data found'
        }, { status: 400 })
      }
      console.log('✅ Authenticated webhook from Alchemy')
      console.log('🔔 New Blockchain Event Received from Alchemy', assetData.assetCid, assetData.author)
      
      const file = await getFileByCid(assetData.assetCid, assetData.author.toLowerCase())
      if (!file) {
        // File is null - likely already marked as "onchain" by another webhook
        // This is not an error, the intended outcome has already been achieved
        console.log('ℹ️ File already processed by another webhook')
        return c.json({
          success: true,
          message: "File already marked as onchain",
          assetCid: assetData.assetCid || null,
          timestamp: new Date().toISOString()
        }, { status: 200 })
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
      console.error('Error processing webhook:', error)
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 400 })
    }
})
  
/**
 * Webhook to update the file status to onchain
 * Secured with QuickNode Streams signature validation
 * @see https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages
 */
app.post('/webhook/quicknode/publish', async (c) => {  
    try {
      // Get the required headers for signature validation
      const nonce = c.req.header('X-QN-Nonce')
      const timestamp = c.req.header('X-QN-Timestamp')
      const signature = c.req.header('X-QN-Signature')
      
      if (!nonce || !timestamp || !signature) {
        console.error('❌ Missing required QuickNode headers')
        return c.json({
          success: false,
          error: 'Missing required headers (X-QN-Nonce, X-QN-Timestamp, X-QN-Signature)'
        }, { status: 401 })
      }
  
      // Get raw body text for signature validation
      const rawBody = await c.req.text()
      
      // Validate signature using QuickNode's method: HMAC-SHA256(nonce + timestamp + payload)
      const securityToken = getQuickNodeSecurityToken()
      const isValid = await validateQuickNodeSignature(rawBody, nonce, timestamp, signature, securityToken)
      
      if (!isValid) {
        console.error('❌ Invalid QuickNode webhook signature')
        return c.json({
          success: false,
          error: 'Invalid signature'
        }, { status: 401 })
      }
  
      // Parse the validated body
      const body = JSON.parse(rawBody)
      
      const assetData = decodeQuickNodeWebhookAssetData(body)
      if (!assetData) {
        return c.json({
          success: false,
          error: 'No asset data found'
        }, { status: 400 })
      }
      console.log('✅ Authenticated webhook from QuickNode')
      console.log('🔔 New Blockchain Event Received from QuickNode', assetData.assetCid, assetData.author)
      
      const file = await getFileByCid(assetData.assetCid, assetData.author.toLowerCase())
      if (!file) {
        // File is null - likely already marked as "onchain" by another webhook
        // This is not an error, the intended outcome has already been achieved
        console.log('ℹ️ File already processed by another webhook')
        return c.json({
          success: true,
          message: "File already marked as onchain",
          assetCid: assetData.assetCid || null,
          timestamp: new Date().toISOString()
        }, { status: 200 })
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
      console.error('Error processing webhook:', error)
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 400 })
    }
})
  
export default app.fetch

export const config = {
  path: ["/webhook/alchemy/publish", "/webhook/quicknode/publish"]
}