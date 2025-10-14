import { verifyMessage } from 'ethers'
import { sign, verify } from 'hono/jwt'
import { PinataSDK } from 'pinata'

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

export const getJwtSecret = () => {
  return Deno.env.get('SECRET_KEY') as string
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

export async function authenticateSignature(
  salt: string,
  signature: string,
  address: string
): Promise<boolean> {
  if (!salt || !address || !signature) {
    return false
  }

  if (Date.now() / 1000 - parseInt(salt) > 10) {
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

export const corsOptions = {
  origin: ['http://localhost:8080', 'https://decentralizedx.tech', 'https://v2.decentralizedx.tech', 'https://v3.decentralizedx.tech'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers'],
  allowMethods: ['GET', 'POST'],
  exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  credentials: true,
}
