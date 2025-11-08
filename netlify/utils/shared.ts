import { ethers } from 'ethers'
import { sign, verify } from 'hono/jwt'
import { PinataSDK } from 'pinata'
import { marketplace_abi } from '../abis/marketPlace.ts'

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

// @ts-ignore - Deno specific import
const crypto = globalThis.crypto

// Create interface for decoding blockchain events
const iface = new ethers.Interface(marketplace_abi)

export const getJwtSecret = () => {
  return Deno.env.get('SECRET_KEY') as string
}

export const getMarketplaceAddress = () => {
  return Deno.env.get('MARKETPLACE_ADDRESS') as string
}

export const getPinataConfig = () => {
  const pinataJwt = Deno.env.get('PINATA_JWT')
  const gatewayUrl = Deno.env.get('GATEWAY_URL')
  
  if (!pinataJwt || !gatewayUrl) {
    throw new Error('Missing Pinata environment variables')
  }

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })
  
  return { pinata }
}

export const getAlchemySigningKey = () => {
  const signingKey = Deno.env.get('ALCHEMY_SIGNING_KEY')
  if (!signingKey) {
    throw new Error('Missing ALCHEMY_SIGNING_KEY environment variable')
  }
  return signingKey
}

export const getQuickNodeSecurityToken = () => {
  const securityToken = Deno.env.get('QUICKNODE_SECURITY_TOKEN')
  if (!securityToken) {
    throw new Error('Missing QUICKNODE_SECURITY_TOKEN environment variable')
  }
  return securityToken
}

/**
 * Validates Alchemy webhook signature using HMAC SHA256
 * @param body - Raw request body as string
 * @param signature - The X-Alchemy-Signature header value
 * @param signingKey - Your Alchemy webhook signing key
 * @returns true if signature is valid, false otherwise
 */
export async function validateAlchemySignature(
  body: string,
  signature: string,
  signingKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(signingKey)
    const bodyData = encoder.encode(body)
    
    // Import the key for HMAC
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    // Generate the HMAC signature
    const signature_buffer = await crypto.subtle.sign('HMAC', key, bodyData)
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(signature_buffer))
    const digest = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return signature === digest
  } catch (error) {
    console.error('Error validating Alchemy signature:', error)
    return false
  }
}

/**
 * Validates QuickNode Streams webhook signature using HMAC SHA256
 * Per QuickNode docs: signature = HMAC-SHA256(nonce + timestamp + payload, securityToken)
 * @param body - Raw request body as string
 * @param nonce - The X-QN-Nonce header value
 * @param timestamp - The X-QN-Timestamp header value
 * @param signature - The X-QN-Signature header value
 * @param securityToken - Your QuickNode Stream security token
 * @returns true if signature is valid, false otherwise
 * @see https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages
 */
export async function validateQuickNodeSignature(
  body: string,
  nonce: string,
  timestamp: string,
  signature: string,
  securityToken: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    
    // Combine nonce + timestamp + payload as per QuickNode documentation
    const signatureData = nonce + timestamp + body
    const keyData = encoder.encode(securityToken)
    const messageData = encoder.encode(signatureData)
    
    // Import the key for HMAC
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    // Generate the HMAC signature
    const signature_buffer = await crypto.subtle.sign('HMAC', key, messageData)
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(signature_buffer))
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return signature === computedSignature
  } catch (error) {
    console.error('Error validating QuickNode signature:', error)
    return false
  }
}

export async function verifyJWT(token: string): Promise<{ address: string } | null> {
  try {
    const payload = await verify(token, getJwtSecret())
    if (payload && typeof payload === 'object' && 'address' in payload) {
      return { address: payload.address as string }
    }
    return null
  } catch (err) {
    console.error('JWT verification error:', err)
    return null
  }
}

export async function generateJWT(address: string): Promise<string> {
  const payload = {
    address: address.toLowerCase(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60) // 2 hours
  }
  return await sign(payload, getJwtSecret())
}

/**
 * Decodes blockchain webhook data and extracts asset information (Alchemy format)
 * @param webhookBody - The webhook body from the blockchain event
 * @returns Decoded asset data including assetCid, or null if not an AssetAdded event
 */
export function decodeAlchemyWebhookAssetData(webhookBody: any) {
  try {
    if (!webhookBody?.event?.data?.block?.logs || webhookBody.event.data.block.logs.length === 0) {
      return null
    }

    const log = webhookBody.event.data.block.logs[0]
    
    const decodedEvent = iface.parseLog({
      topics: log.topics,
      data: log.data
    })
    
    if (!decodedEvent || decodedEvent.name !== 'PostCreated') {
      return null
    }

    return {
      postCid: decodedEvent.args.postCid,
      postId: decodedEvent.args.tokenId,
      author: decodedEvent.args.author
    }
  } catch (error) {
    console.error('Error decoding webhook data:', error)
    return null
  }
}

/**
 * Decodes QuickNode webhook data and extracts asset information
 * @param webhookBody - The webhook body from QuickNode
 * @returns Decoded asset data including postCid, or null if not an PostCreated event
 */
export function decodeQuickNodeWebhookAssetData(webhookBody: any) {
  try {
    if (!webhookBody?.matchingReceipts || webhookBody.matchingReceipts.length === 0) {
      console.error('No matching receipts found in webhook body')
      return null
    }

    const receipt = webhookBody.matchingReceipts[0]
    if (!receipt?.logs || receipt.logs.length === 0) {
      console.error('No logs found in receipt')
      return null
    }

    // Try to find the AssetAdded event in the logs
    for (const log of receipt.logs) {
      try {
        const decodedEvent = iface.parseLog({
          topics: log.topics,
          data: log.data
        })
        
        if (decodedEvent && decodedEvent.name === 'PostCreated') {
          return {
            postCid: decodedEvent.args.postCid,
            postId: decodedEvent.args.tokenId,
            author: decodedEvent.args.author
          }
        }
      } catch (err) {
        // Skip logs that don't match our ABI
        continue
      }
    }

    console.error('No PostCreated event found in logs')
    return null
  } catch (error) {
    console.error('Error decoding QuickNode webhook data:', error)
    return null
  }
}



export const corsOptions = {
  origin: ['http://localhost:8080', 'https://inkdao.tech', 'https://staging.inkdao.tech'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
  allowMethods: ['GET', 'POST'],
  exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  credentials: true,
}
