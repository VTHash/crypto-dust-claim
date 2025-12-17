import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

const toKey = (id) => String(id)

// Default thresholds (used when Settings not provided)
const DEFAULT_DUST_THRESHOLDS = {
native: 0.001, // e.g., ETH < 0.001
tokenUnit: 0.01 // token units < 0.01
}

class Web3Service {
constructor() {
this.providers = {}
this.initializeProviders()
}

initializeProviders() {
this.providers = {}
Object.keys(SUPPORTED_CHAINS).forEach((rawId) => {
const id = toKey(rawId)
const chain = SUPPORTED_CHAINS[id]
if (!chain?.rpcUrl) return
try {
this.providers[id] = new ethers.JsonRpcProvider(chain.rpcUrl, Number(id))
} catch (e) {
console.warn(RPC init failed for chain ${id}, e)
}
})
}

getProvider(chainId) {
const id = toKey(chainId)
const p = this.providers[id]
if (!p) console.warn(No provider for chain ${id}. Check SUPPORTED_CHAINS.rpcUrl)
return p
}

// ---------- native balances ----------
async getBalance(chainId, address) {
try {
const provider = this.getProvider(chainId)
if (!provider) return '0'
const balance = await provider.getBalance(address)
return ethers.formatEther(balance)
} catch {
return '0'
}
}

// ---------- curated ERC-20 fallback (old behaviour) ----------
async _readErc20Balance(provider, tokenAddress, userAddress) {
const abi = [
'function balanceOf(address) view returns (uint256)',
'function decimals() view returns (uint8)',
'function symbol() view returns (string)'
]
const c = new ethers.Contract(tokenAddress, abi, provider)
const [raw, decimals, symbol] = await Promise.all([
c.balanceOf(userAddress),
c.decimals(),
c.symbol().catch(() => '') // some tokens throw on symbol()
])
return { amount: ethers.formatUnits(raw, decimals), decimals, symbol }
}

// SAME curated list you had before – used only as a fallback
TOKENS = {
'1': {
USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
},
'10': {
USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'
},
'137': {
USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
},
'42161': {
USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
},
'56': {
USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
USDT: '0x55d398326f99059fF775485246999027B3197955'
}
// …you can add more chains/tokens here later if you want
}

async _getTokenBalancesFallback(chainId, address) {
const key = toKey(chainId)
const entries = Object.entries(this.TOKENS[key] || {})
if (!entries.length) return []

const provider = this.getProvider(key)  
if (!provider) return []  

const out = []  
for (const [symbolGuess, token] of entries) {  
  try {  
    const { amount, decimals, symbol } = await this._readErc20Balance(  
      provider,  
      token,  
      address  
    )  
    const bal = parseFloat(amount)  
    if (bal > 0) {  
      out.push({  
        symbol: symbol || symbolGuess,  
        balance: amount,  
        address: token,  
        decimals,  
        chainId: Number(key)  
      })  
    }  
  } catch {  
    // ignore single token failures  
  }  
}  
return out

}

// ---------- main token discovery ----------
async getTokenBalances(chainId, address) {
const key = Number(chainId)
const provider = this.getProvider(key)
if (!provider) return []

// 1) try auto-discovery  
try {  
  const discovered = await discoverAllERC20s({  
    provider,  
    chainId: key,  
    owner: address  
  })  

  const out = []  
  for (const t of discovered) {  
    try {  
      const human = ethers.formatUnits(t.balance, t.decimals ?? 18)  
      const bal = parseFloat(human)  
      if (bal > 0) {  
        out.push({  
          chainId: key,  
          address: t.address,  
          symbol: t.symbol || 'TOKEN',  
          decimals: t.decimals ?? 18,  
          balance: human  
        })  
      }  
    } catch (e) {  
      console.warn('Token decode failed on chain', key, t.address, e?.message)  
    }  
  }  

  // If discovery worked & found something, use it  
  if (out.length > 0) return out  
  console.warn(`Auto discovery found 0 tokens on chain ${key}, falling back to TOKENS map`)  
} catch (e) {  
  console.warn('Auto token discovery failed on chain', key, e?.message)  
}  

// 2) fallback: curated list (old behaviour)  
return this._getTokenBalancesFallback(chainId, address)

}

// ---------- valuation + dust marking ----------
async getDetailedChainView(chainId, address, settings = null) {
const key = Number(chainId)
const symbol = SUPPORTED_CHAINS[key]?.symbol || 'ETH'

const nativeBalance = await this.getBalance(key, address)  
const tokens = await this.getTokenBalances(key, address)  

const nativePrice = await priceService.getNativeUsdPrice(key)  
const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)  

const tokenAddrs = tokens.map((t) => t.address.toLowerCase())  
const priceMap = tokenAddrs.length  
  ? await priceService.getTokenUsdPrices(key, tokenAddrs)  
  : {}  

const tokenDetails = tokens.map((t) => {  
  const price = priceMap[t.address.toLowerCase()] || 0  
  const value = parseFloat(t.balance || '0') * price  
  return { ...t, price, value }  
})  

const nativeDustThreshold =  
  settings && settings.nativeDustThreshold != null  
    ? Number(settings.nativeDustThreshold)  
    : DEFAULT_DUST_THRESHOLDS.native  

const isNativeDust =  
  parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < nativeDustThreshold  

let claimableTokens = []  

if (settings) {  
  const includeNonDust = !!settings.includeNonDust  
  const minUsd = Number(settings.tokenMinUSD ?? 0)  
  const maxUsdRaw = settings.tokenMaxUSD  
  const maxUsd =  
    maxUsdRaw === undefined || maxUsdRaw === null || maxUsdRaw === 0  
      ? Infinity  
      : Number(maxUsdRaw)  

  if (includeNonDust) {  
    claimableTokens = tokenDetails.filter((t) => Number(t.balance || 0) > 0)  
  } else {  
    claimableTokens = tokenDetails.filter((t) => {  
      const v = Number(t.value || 0)  
      return v >= minUsd && v <= maxUsd  
    })  
  }  
} else {  
  claimableTokens = tokenDetails.filter(  
    (t) => parseFloat(t.balance || '0') < DEFAULT_DUST_THRESHOLDS.tokenUnit  
  )  
}  

const totalValue = Number(  
  (nativeValue + tokenDetails.reduce((s, x) => s + x.value, 0)).toFixed(6)  
)  

return {  
  chainId: key,  
  chainName: SUPPORTED_CHAINS[key]?.name || `Chain ${key}`,  
  symbol,  
  nativeBalance,  
  nativePrice,  
  nativeValue,  
  tokenDetails,  
  claimableTokens,  
  hasDust: isNativeDust || claimableTokens.length > 0,  
  totalValue  
}

}

async scanChains(chainIds, address, settings = null) {
const out = []
for (const id of chainIds) {
try {
out.push(await this.getDetailedChainView(id, address, settings))
} catch (e) {
console.warn('scan error for chain', id, e?.message)
}
}
return out
}
}

export default new Web3Service()