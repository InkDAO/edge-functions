import { Hono } from 'hono'
import { ethers } from 'ethers'
import { cors } from 'hono/cors'
import { marketplace_abi } from '../abis/marketPlace.ts'
import { provider } from '../utils/provider.ts'
import { marketplaceAddress } from '../utils/constants.ts'
import { deleteFile, getFileByCid } from '../utils/pinata.ts'
import { verifyJWT, getPinataConfig, corsOptions } from '../utils/shared.ts'
import { verifyTypedData } from "viem";

const app = new Hono()

app.use('*', cors(corsOptions))

/**
 * Get file by CID
 * jwt token is required for this request.
 * file should not be published on chain
 * file should be owned by the user
 * return the file data
 */
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

  const cid = c.req.query('cid')
  const file = await getFileByCid(cid as string, jwtPayload.address.toLowerCase())
  if (!file) {
    return c.json({ error: 'No file found' }, { status: 404 })
  }
  
  const { pinata } = getPinataConfig()
  const { data } = await pinata.gateways.private.get(file.cid)

  return c.json(data, { status: 200 })
})

/**
 * Get files by tags
 * public access is allowed
 * return the files meta data
 */
app.get('/filesByTags', async (c) => {
  const { pinata } = getPinataConfig()

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
  
  try {
    const files = await pinata.files.private.list().keyvalues(keyvalues).limit(9)

    return c.json({ 
      files: files.files || [],
      count: files.files.length || 0,
      tags: tagArray,
      next_page_token: files.next_page_token || null
    }, { status: 200 })
  } catch (error) {
    console.error('Error filtering files by multiple tags:', error)
    return c.json({ error: 'Failed to filter files by tags' }, { status: 500 })
  }
})

/**
 * Create a group and upload the file,first time draft is saved.
 * no jwt token is required for this request.
 * double attack is prevented by the groupName, 
 * - signature can't be used after 10 seconds
 * - it will revert withing 10 seconds if the groupName already exists.
 * return the upload data
 */
app.post('/create/group', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature
  const content = body.content || "Initial Empty Json"

  const verified = await verifyTypedData({
    address: address as `0x${string}`,
    domain: salt.domain,
    types: salt.types,
    primaryType: 'CreateFile',
    message: salt.message,
    signature: signature as `0x${string}`,
  });
  if (!verified) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }

  if (Date.now() / 1000 - parseInt(salt.message.timestamp) > 60) {
    return c.json({ error: 'Timestamp expired' }, { status: 401 })
  }
  
  const { pinata } = getPinataConfig()

  const groupName = `${salt.message.nonce}`
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

/**
 * Update the file, everytime the draft is saved. deleting the older file and creating the new one.
 * no jwt token is required for this request.
 * double attack is prevented by the file name, 
 * - it will revert if the file name already exists.
 * file should not be published on chain
 * file should be owned by the user
 * return the upload data
 */
app.post('/update/file', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature
  const content = body.content

  const verified = await verifyTypedData({
    address: address as `0x${string}`,
    domain: salt.domain,
    types: salt.types,
    primaryType: 'UpdateFile',
    message: salt.message,
    signature: signature as `0x${string}`,
  });
  if (!verified) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }

  if (Date.now() / 1000 - parseInt(salt.message.timestamp) > 60) {
    return c.json({ error: 'Timestamp expired' }, { status: 401 })
  }

  const { pinata } = getPinataConfig()

  try {
    const cid = c.req.query('cid')
    const file = await getFileByCid(cid as string, address.toLowerCase())
    if (!file) {
      return c.json({ error: 'No file found' }, { status: 404 })
    }

    if (file.name === `${salt.message.nonce}`) {
      return c.json({ error: 'File already updated' }, { status: 400 })
    }

    await deleteFile(file.id)

    try {
      const fileName = `${salt.message.nonce}`
      const upload = await pinata.upload.private
      .json({
        content: content,
        lang: "ts"
      })
      .group(file.group_id as string)
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

/**
 * Publish the file on chain.
 * - upload the thumbnail.png
 * no jwt token is required for this request.
 * double attack is prevented by the file status.
 * file should not be owned by the user
 * file should not be published on chain
 * return the thumbnail cid
 */
app.post('/publish/file', async (c) => {
  try {
    const formData = await c.req.formData()
    const thumbnail = formData.get('file') as File // thumbnail.png
    const saltString = formData.get('salt') as string
    const salt = JSON.parse(saltString)
    const address = formData.get('address') as string
    const signature = formData.get('signature') as string
    const hashtags = formData.get('hashtags') as string
    const hashtagsArray = hashtags.split(',').map(tag => tag.trim().toLowerCase());

    if (!thumbnail) {
      return c.json({ error: 'File is required' }, { status: 400 })
    }

    const verified = await verifyTypedData({
      address: address as `0x${string}`,
      domain: salt.domain,
      types: salt.types,
      primaryType: 'PublishFile',
      message: salt.message,
      signature: signature as `0x${string}`,
    });
    if (!verified) {
      return c.json({ error: 'Authentication failed' }, { status: 401 })
    }
  
    if (Date.now() / 1000 - parseInt(salt.message.timestamp) > 60) {
      return c.json({ error: 'Timestamp expired' }, { status: 401 })
    }

    const { pinata } = getPinataConfig()

    const cid = c.req.query('cid')
    const file = await getFileByCid(cid as string, address.toLowerCase())
    if (!file) {
      return c.json({ error: 'No file found' }, { status: 404 })
    }

    const keyvalues = hashtagsArray.reduce((acc, tag) => {
      acc[tag] = tag;
      return acc;
    }, {} as Record<string, string>);

    await pinata.files.private.update({id: file.id,
      keyvalues: {
        ...keyvalues,
        publishedAt: new Date().toISOString(),
      }
    })

    // Upload file with name "thumbnail.png"
    const upload = await pinata.upload.public
    .file(thumbnail)
    .name('thumbnail.png')
    .keyvalues({
      group: file.group_id as string,
    })

    return c.json({ thumbnailCid: upload.cid }, { status: 200 })
  } catch (error) {
    console.error('File upload error:', error)
    return c.json({ error: 'Failed to upload file' }, { status: 500 })
  }
})

/**
 * Get the pending files by owner
 * jwt token is required for this request.
 * return the owner's files data which are not published on chain
 */
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

  const { pinata } = getPinataConfig()

  const files = await pinata.files.private.list().keyvalues({ owner: requestedOwner, status: "pending" }).limit(12)

  return c.json(files, { status: 200 })
})

/**
 * Get the files by owner by next page token
 * jwt token is required for this request.
 * return the files data by next page token
 */
app.get('/filesByNextPageToken', async (c) => {
  const { pinata } = getPinataConfig()

  const nextPageToken = c.req.query('next_page_token')
  const files = await pinata.files.private.list().pageToken(nextPageToken as string).limit(9);

  return c.json(files, { status: 200 })
})

/**
 * Get the file by asset address
 * jwt token is required for this request.
 * return file only when
 * - if the user has the dXasset token
 * - if the user is the author of the dXasset token
 * return the file data
 */
app.get('/fileByPostId', async (c) => {
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
    return c.json({ error: 'user parameter is required' }, { status: 400 })
  }

  const postId = c.req.query('postId')
  if (!postId) {
    return c.json({ error: 'Post ID parameter is required' }, { status: 400 })
  }

  try {
    const marketplaceContract = new ethers.Contract(marketplaceAddress, marketplace_abi, provider)
    const balance = await marketplaceContract.balanceOf(requestedUser, postId)
    const postInfo = await marketplaceContract.getPostInfo(postId)
    const author = postInfo.author
    if (author.toLowerCase() !== requestedUser.toLowerCase() && balance == 0) {
      return c.json({ error: 'Unauthorized: Do not have post' }, { status: 404 })
    }

    const postCid = postInfo.postCid
  
    const { pinata } = getPinataConfig()
  
    const { data } = await pinata.gateways.private.get(
      postCid as string
    )
  
    return c.json(data, { status: 200 })
  } catch (error) {
    console.error('File fetch error:', error)
    return c.json({ error: 'Failed to fetch file' }, { status: 500 })
  }
})

/**
 * Delete the file
 * no jwt token is required for this request.
 * double attack is prevented by the file name
 * file should be owned by the user
 * file should not be published on chain
 * return the deleted file data
 */
app.post('/delete/file', async (c) => {
  const body = await c.req.json()
  const salt = body.salt
  const address = body.address
  const signature = body.signature
  const cid = c.req.query('cid')

  const marketplaceContract = new ethers.Contract(marketplaceAddress, marketplace_abi, provider)
  const postId = await marketplaceContract.postCidToTokenId(cid)
  if (postId !== 0n) {
    return c.json({ error: 'File is published on chain' }, { status: 400 })
  }

  const verified = await verifyTypedData({
    address: address as `0x${string}`,
    domain: salt.domain,
    types: salt.types,
    primaryType: 'DeleteFile',
    message: salt.message,
    signature: signature as `0x${string}`,
  });
  if (!verified) {
    return c.json({ error: 'Authentication failed' }, { status: 401 })
  }

  if (Date.now() / 1000 - parseInt(salt.message.timestamp) > 60) {
    return c.json({ error: 'Timestamp expired' }, { status: 401 })
  }

  const file = await getFileByCid(cid as string, address.toLowerCase())
  if (!file) {
    return c.json({ error: 'No file found' }, { status: 404 })
  }

  if (file.name === `${salt.message.nonce}`) {
    return c.json({ error: 'File already deleted' }, { status: 400 })
  }

  const deletedFile = await deleteFile(file.id)
  if (deletedFile) {
    return c.json({ deletedFile }, { status: 200 })
  }

  return c.json({ error: 'Failed to delete file' }, { status: 500 })
})

/**
 * Get the file by address when the file is free
 * public access is allowed
 * no jwt token is required for this request.
 * no digital signature is required for this request.
 * return the file data
 */
app.get('/freeFileByPostId', async (c) => {
  const postId = c.req.query('postId')
  if (!postId) {
    return c.json({ error: 'Post ID parameter is required' }, { status: 400 })
  }

  try {
    const marketplaceContract = new ethers.Contract(marketplaceAddress, marketplace_abi, provider)
    const postInfo = await marketplaceContract.postInfo(postId)
    if (postInfo.priceInNative > 0) {
      return c.json({ error: 'File is not free' }, { status: 400 })
    }
  
    const { pinata } = getPinataConfig()
  
    const { data } = await pinata.gateways.private.get(
      postInfo.postCid as string
    )
  
    return c.json(data, { status: 200 })
  } catch (error) {
    console.error('File fetch error:', error)
    return c.json({ error: 'Failed to fetch file' }, { status: 500 })
  }
})

app.get('/filesMetaData', async (c) => {
  const { pinata } = getPinataConfig()
  
  const cid = c.req.query('cid')
  let files: any = []
  if (cid) {
    files = await pinata.files.private.list().cid(cid as string)
  } else {
    files = await pinata.files.private.list().limit(9)
  }

  return c.json(files, { status: 200 })
})

export default app.fetch
export const config = {
  path: ["/fileByCid", "/filesByTags", "/create/group", "/update/file", "/publish/file", "/pendingFilesByOwner", "/filesByNextPageToken", "/delete/file", "/fileByPostId", "/freeFileByPostId", "/filesMetaData"]
}
