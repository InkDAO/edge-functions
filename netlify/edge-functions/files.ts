import { Hono } from 'hono'
import { PinataSDK } from 'pinata'
import { cors } from 'hono/cors'
import { authenticateSignature, verifyJWT, getPinataConfig, corsOptions } from '../utils/shared.ts'
import dXasset_abi from '../abis/dXasset.ts'
import { ethers } from 'ethers'
import { provider } from '../utils/provider.ts'

const app = new Hono()

app.use('*', cors(corsOptions))

app.get('/fileByCid', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.substring(7)
  const jwtPayload = await verifyJWT(token)
  if (!jwtPayload) {
    return c.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const { pinataJwt, gatewayUrl } = getPinataConfig()

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const { data, contentType } = await pinata.gateways.private.get(
    c.req.query('cid') as string
  )

  return c.json(data, { status: 200 })
})

app.get('/filesByTags', async (c) => {
  const { pinataJwt, gatewayUrl } = getPinataConfig()

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

app.post('/create/group', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature
  const content = body.content || "Initial Empty Json"

  const isAuthenticated = await authenticateSignature(salt as string, signature as string, address as string)
  
  if (!isAuthenticated) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }
  
  const { pinataJwt, gatewayUrl } = getPinataConfig()

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const groupName = `${address.slice(2,41).toLowerCase()}_${salt.slice(-10).toLowerCase()}`
  const group = await pinata.groups.private.create({
    name: groupName,
  })

  try {
    let upload = await pinata.upload.private
    .json({
      content: content,
      lang: "ts"
    })
    .group(group.id)
    .name(groupName)
    .keyvalues({
      owner: address.toLowerCase(),
      status: "pending",
    })

    let updatedUpload = await pinata.files.private.update({id: upload.id,
      keyvalues: {
        status: "pending",
      }
    })

    return c.json({ updatedUpload }, { status: 200 })
  } catch (error) {
    console.error('File upload error:', error)
    return c.json({ error: 'Failed to upload file' }, { status: 500 })
  }
})

app.post('/update/file', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature
  const content = body.content

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
    const cid = c.req.query('cid')
    const files = await pinata.files.private
		.list()
		.cid(cid as string)

    if (files.files.length === 1) {
      if (files.files[0].keyvalues.owner !== address.toLowerCase()) {
        return c.json({ error: 'Unauthorized' }, { status: 401 })
      }

      if (files.files[0].keyvalues.status === "onchain") {
        return c.json({ error: 'File already published on chain' }, { status: 400 })
      }

      if (files.files[0].name === `${address.slice(2,41).toLowerCase()}_${salt.slice(-10).toLowerCase()}`) {
        return c.json({ error: 'File already exists' }, { status: 400 })
      }

      try {
        await pinata.files.private.delete([
          files.files[0].id
        ])
      } catch (error) {
        console.error('File delete error:', error)
        return c.json({ error: 'Failed to delete file' }, { status: 500 })
      }
    }

    try {
      const fileName = `${address.slice(2,41).toLowerCase()}_${salt.slice(-10).toLowerCase()}`
      const upload = await pinata.upload.private
      .json({
        content: content,
        lang: "ts"
      })
      .group(files.files[0].group_id as string)
      .name(fileName)
      .keyvalues({
        owner: address.toLowerCase(),
        status: "pending",
      })

      return c.json({ upload }, { status: 200 })
    } catch (error) {
      console.error('File upload error:', error)
      return c.json({ error: 'Failed to upload file' }, { status: 500 })
    }
  } catch (error) {
    console.error('File update error:', error)
    return c.json({ error: 'Failed to update file' }, { status: 500 })
  }
})

// app.post('/update/file/status', async (c) => {
//   const body = await c.req.json()
//   const salt = body.salt
//   const address = body.address
//   const signature = body.signature
//   const cid = body.cid
//   const status = body.status

//   const isAuthenticated = await authenticateSignature(salt as string, signature as string, address as string)
  
//   if (!isAuthenticated) {
//     return c.json({ error: 'Authentication failed' }, { status: 401 })
//   }

//   const { pinataJwt, gatewayUrl } = getPinataConfig()

//   const pinata = new PinataSDK({
//     pinataJwt: pinataJwt,
//     pinataGateway: gatewayUrl
//   })

//   const files = await pinata.files.private
//     .list()
//     .cid(cid as string)

//   if (files.files.length === 0) {
//     return c.json({ error: 'No files found' }, { status: 404 })
//   }

//   if (files.files[0].keyvalues.owner !== address.toLowerCase()) {
//     return c.json({ error: 'Unauthorized' }, { status: 401 })
//   }

//   try {
//     const updatedFile = await pinata.files.private.update({id: files.files[0].id,
//       keyvalues: {
//         status: status
//       }
//     })

//     return c.json({ updatedFile }, { status: 200 })
//   } catch (error) {
//     console.error('File update error:', error)
//     return c.json({ error: 'Failed to update file' }, { status: 500 })
//   }
// })

app.get('/pendingFilesByOwner', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.substring(7)
  const jwtPayload = await verifyJWT(token)
  if (!jwtPayload) {
    return c.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const requestedOwner = c.req.query('owner')?.toLowerCase()
  if (!requestedOwner) {
    return c.json({ error: 'Owner parameter is required' }, { status: 400 })
  }

  if (jwtPayload.address !== requestedOwner) {
    return c.json({ error: 'Unauthorized: Cannot access files for different owner' }, { status: 403 })
  }

  const { pinataJwt, gatewayUrl } = getPinataConfig()

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const files = await pinata.files.private.list().keyvalues({ owner: requestedOwner, status: "pending" }).limit(12)

  return c.json(files, { status: 200 })
})

app.get('/filesByOwnerByNextPageToken', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.substring(7)
  const jwtPayload = await verifyJWT(token)
  if (!jwtPayload) {
    return c.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const requestedOwner = c.req.query('owner')?.toLowerCase()
  if (!requestedOwner) {
    return c.json({ error: 'Owner parameter is required' }, { status: 400 })
  }

  if (jwtPayload.address !== requestedOwner) {
    return c.json({ error: 'Unauthorized: Cannot access files for different owner' }, { status: 403 })
  }

  const { pinataJwt, gatewayUrl } = getPinataConfig()

  const pinata = new PinataSDK({
    pinataJwt: pinataJwt,
    pinataGateway: gatewayUrl
  })

  const nextPageToken = c.req.query('next_page_token')
  const files = await pinata.files.private.list().pageToken(nextPageToken as string).limit(9);

  return c.json(files, { status: 200 })
})

app.get('/fileByAssetAddress', async (c) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'JWT token required' }, { status: 401 })
    }
  
    const token = authHeader.substring(7)
    const jwtPayload = await verifyJWT(token)
    if (!jwtPayload) {
      return c.json({ error: 'Invalid or expired token' }, { status: 401 })
    }
  
    const requestedUser = c.req.query('user')?.toLowerCase()
    if (!requestedUser) {
      return c.json({ error: 'Owner parameter is required' }, { status: 400 })
    }
  
    if (jwtPayload.address !== requestedUser) {
      return c.json({ error: 'Unauthorized: Cannot access files for different owner' }, { status: 403 })
    }

    const dXassetAddress = c.req.query('assetAddress')
    if (!dXassetAddress) {
      return c.json({ error: 'Asset address parameter is required' }, { status: 400 })
    }

    const dXassetContract = new ethers.Contract(dXassetAddress, dXasset_abi, provider)
    const balance = await dXassetContract.balanceOf(requestedUser)
    if (balance === 0) {
      return c.json({ error: 'Unauthorized: Do not have dXasset' }, { status: 403 })
    }

    const assetCid = await dXassetContract.assetCid()
  
    const { pinataJwt, gatewayUrl } = getPinataConfig()
  
    const pinata = new PinataSDK({
      pinataJwt: pinataJwt,
      pinataGateway: gatewayUrl
    })
  
    const files = await pinata.files.private
    .list()
    .cid(assetCid)

    return c.json(files, { status: 200 })
})

app.post('/delete/file', async (c) => {
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

  const cid = c.req.query('cid')
  const files = await pinata.files.private
  .list()
  .cid(cid as string)

  if (files.files.length === 0) {
    return c.json({ error: 'No files found' }, { status: 404 })
  }

  if (files.files[0].keyvalues.owner !== address.toLowerCase()) {
    return c.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (files.files[0].keyvalues.status === "onchain") {
    return c.json({ error: 'File already published on chain' }, { status: 400 })
  }

  if (files.files[0].name === `${address.slice(2,41).toLowerCase()}_${salt.slice(-10).toLowerCase()}`) {
    return c.json({ error: 'File already exists' }, { status: 400 })
  }

  try {
    const deletedFile = await pinata.files.private.delete([
      files.files[0].id
    ])

    return c.json({ deletedFile }, { status: 200 })
  } catch (error) {
    console.error('File delete error:', error)
    return c.json({ error: 'Failed to delete file' }, { status: 500 })
  }
})

export default app.fetch

export const config = {
  path: ["/fileByCid", "/filesByTags", "/create/group", "/update/file", "/pendingFilesByOwner", "/filesByOwnerByNextPageToken", "/delete/file", "/fileByAssetAddress"]
}
