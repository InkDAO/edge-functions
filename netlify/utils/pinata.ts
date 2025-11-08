import { ethers } from 'ethers'
import { getPinataConfig } from './shared.ts'
import { marketplace_abi } from '../abis/marketPlace.ts'
import { provider } from './provider.ts'
import { getMarketplaceAddress } from './shared.ts'

export const deleteFile = async (fileId: string) => {
  const { pinata } = getPinataConfig()

  try {
    const deletedFile = await pinata.files.private.delete([fileId])
    return deletedFile
  } catch (error) {
    console.error('File delete error:', error)
    return null
  }
}

export const getFileByCid = async (cid: string, authorizedAddress: string) => {
  if (!cid) {
    return null
  }
  
  const { pinata } = getPinataConfig()

  try {
    const response = await pinata.files.private.list().cid(cid)
    if (response.files.length === 0) {
      return null
    }

    const file = response.files[0];
    if (file.keyvalues.owner !== authorizedAddress.toLowerCase()) {
      return null;
    }
    
    if (file.keyvalues.status === "onchain") {
      return null;
    }

    return file;
  } catch (error) {
    console.error('File get error:', error)
    return null
  }
}

export const createFile = async (fileId: string, fileCid: string, fileName: string, groupId: any, author: string) => {
  const marketplaceContract = new ethers.Contract(getMarketplaceAddress(), marketplace_abi, provider)
  const postId = await marketplaceContract.postCidToTokenId(fileCid)
  if (postId !== 0n) {
    return false;
  }

  const { pinata } = getPinataConfig()

  await pinata.files.private.update({id: fileId,
    name: fileName,
    keyvalues: {
      owner: author.toLowerCase(),
      status: "pending",
    }
  })

  await pinata.groups.private.addFiles({
    groupId: groupId,
    files: [
      fileId,
    ],
  });

  return true;
}