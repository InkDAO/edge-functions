import { ethers } from 'ethers'

export const provider = new ethers.JsonRpcProvider(`https://ethereum-sepolia.core.chainstack.com/${process.env.CHAINSTACK_KEY}`)