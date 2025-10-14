import { getPinataConfig } from './shared.ts'

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
