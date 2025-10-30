import { ethers } from 'ethers'

// ---- Multicall v3 addresses (widely deployed) ----
const MULTICALL3 = {
  1: '0xcA11bde05977b3631167028862bE2a173976CA11',
  10: '0xcA11bde05977b3631167028862bE2a173976CA11',
  56: '0xcA11bde05977b3631167028862bE2a173976CA11',
  100: '0xcA11bde05977b3631167028862bE2a173976CA11',
  137: '0xcA11bde05977b3631167028862bE2a173976CA11',
  195: null, // X1 (no standard multicall yet -> will use indexer)
  250: '0xcA11bde05977b3631167028862bE2a173976CA11',
  1329: null, // Sei EVM (indexer fallback)
  8453: '0xcA11bde05977b3631167028862bE2a173976CA11',
  34443: '0xcA11bde05977b3631167028862bE2a173976CA11', // Mode
  42161: '0xcA11bde05977b3631167028862bE2a173976CA11',
  43114: '0xcA11bde05977b3631167028862bE2a173976CA11',
  59144: '0xcA11bde05977b3631167028862bE2a173976CA11', // Linea
  80094: null, // Berachain bArtio
  7777777:'0xcA11bde05977b3631167028862bE2a173976CA11', // Zora
};

// Simple ERC-20 ABI
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// Public tokenlist sources per chain (best effort). You can add more.
const TOKENLIST_SOURCES = {
  1: [
    // Uniswap default + 1inch mainnet
    'https://tokens.uniswap.org',
    'https://api.1inch.io/v5.0/1/tokens',
  ],
  10: ['https://api.1inch.io/v5.0/10/tokens'],
  56: ['https://api.1inch.io/v5.0/56/tokens'],
  100:['https://tokens.coingecko.com/xdai/all.json'],
  137:['https://api.1inch.io/v5.0/137/tokens'],
  42161:['https://api.1inch.io/v5.0/42161/tokens'],
  8453:['https://api.1inch.io/v5.0/8453/tokens'],
  43114:['https://tokens.coingecko.com/avalanche/all.json'],
  250: ['https://tokens.coingecko.com/fantom/all.json'],
  34443:['https://raw.githubusercontent.com/mode-network/asset-list/main/list.json'],
  59144:['https://raw.githubusercontent.com/Consensys/linea-token-list/main/build/linea-mainnet.json'],
  7777777:['https://raw.githubusercontent.com/zora-community/token-list/main/zora.tokenlist.json'],
  // fallbacks for chains without good lists: 195 (X1), 1329 (Sei), 80094 (Bera)
};

// Map Covalent chain id (or alias) for each EVM chain we support
const COVALENT_CHAIN = {
  1: 'eth-mainnet',
  10: 'optimism-mainnet',
  56: 'bsc-mainnet',
  100: 'gnosis-mainnet',
  137: 'polygon-mainnet',
  42161: 'arbitrum-mainnet',
  8453: 'base-mainnet',
  43114: 'avalanche-mainnet',
  250: 'fantom-mainnet',
  34443: 'mode-mainnet',
  59144: 'linea-mainnet',
  7777777: 'zora-mainnet',
  // experimental / may be unsupported by covalent free tier:
  195: 'x1-mainnet',
  1329: 'sei-mainnet',
  80094: 'berachain-bartio',
};

// small helper: safe fetch JSON
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function normalizeTokenList(chainId, raw) {
  // 1inch returns { tokens: {address: {...}} }, others return { tokens: [...] } or {pairs, tokens}
  const out = [];
  if (!raw) return out;

  if (raw.tokens && !Array.isArray(raw.tokens)) {
    // 1inch shape
    for (const [addr, t] of Object.entries(raw.tokens)) {
      out.push({ address: addr, symbol: t.symbol, decimals: t.decimals });
    }
  } else if (Array.isArray(raw.tokens)) {
    for (const t of raw.tokens) {
      if (!t?.address) continue;
      out.push({ address: t.address, symbol: t.symbol || '', decimals: t.decimals ?? 18 });
    }
  } else if (Array.isArray(raw)) {
    for (const t of raw) {
      if (!t?.address) continue;
      out.push({ address: t.address, symbol: t.symbol || '', decimals: t.decimals ?? 18 });
    }
  }
  // dedupe by address
  const seen = new Set();
  return out.filter(t => {
    const k = t.address.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(t => ({ ...t, chainId }));
}

async function loadTokenListForChain(chainId) {
  const urls = TOKENLIST_SOURCES[Number(chainId)] || [];
  const merged = [];
  for (const url of urls) {
    try {
      const json = await fetchJson(url);
      merged.push(...normalizeTokenList(chainId, json));
    } catch {
      // continue
    }
  }
  return merged;
}

async function multicallBalances(provider, chainId, owner, tokens) {
  const mcAddr = MULTICALL3[Number(chainId)];
  if (!mcAddr) return []; // no multicall on this chain
  const iface = new ethers.Interface([
    'function aggregate((address target, bytes callData)[]) public returns (uint256 blockNumber, bytes[] returnData)'
  ]);
  const calls = tokens.map(t => ({
    target: t.address,
    callData: new ethers.Interface(ERC20_ABI).encodeFunctionData('balanceOf', [owner]),
  }));
  // chunk to avoid response size limits
  const CHUNK = 200;
  const results = [];
  for (let i = 0; i < calls.length; i += CHUNK) {
    const slice = calls.slice(i, i + CHUNK);
    try {
      const data = await provider.call({ to: mcAddr, data: iface.encodeFunctionData('aggregate', [slice]) });
      const decoded = iface.decodeFunctionResult('aggregate', data);
      const ret = decoded[1];
      for (let j = 0; j < ret.length; j++) {
        const r = ret[j];
        const bal = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], r)[0];
        if (bal > 0n) {
          const tok = tokens[i + j];
          results.push({
            chainId: Number(chainId),
            address: tok.address,
            symbol: tok.symbol,
            decimals: tok.decimals ?? 18,
            balance: bal.toString(),
          });
        }
      }
    } catch {
      // ignore this chunk
    }
  }
  return results;
}

async function covalentBalances(chainId, address, apiKey) {
  const chain = COVALENT_CHAIN[Number(chainId)];
  if (!chain || !apiKey) return [];
  const url = `https://api.covalenthq.com/v1/${chain}/address/${address}/balances_v2/?nft=false&no-spam=true&key=${apiKey}`;
  try {
    const json = await fetchJson(url);
    const items = json?.data?.items || [];
    return items
      .filter(i => i.type === 'cryptocurrency' && i.contract_decimals != null && i.contract_address)
      .map(i => ({
        chainId: Number(chainId),
        address: i.contract_address,
        symbol: i.contract_ticker_symbol || '',
        decimals: i.contract_decimals ?? 18,
        balance: i.balance || '0',
      }));
  } catch {
    return [];
  }
}

export async function discoverAllERC20s({ provider, chainId, owner }) {
  const apiKey = import.meta.env.VITE_COVALENT_KEY || '';
  // 1) try multicall on a big list
  let tokens = await loadTokenListForChain(chainId);
  let results = [];
  if (tokens.length && provider) {
    results = await multicallBalances(provider, chainId, owner, tokens);
  }
  // 2) fallback to indexer for full coverage (or to complement)
  const more = await covalentBalances(chainId, owner, apiKey);
  if (more.length) {
    // merge, preferring indexer symbol/decimals if multicall returned zero info
    const byAddr = new Map(results.map(r => [r.address.toLowerCase(), r]));
    for (const m of more) {
      const k = m.address.toLowerCase();
      if (!byAddr.has(k)) byAddr.set(k, m);
    }
    results = Array.from(byAddr.values());
  }
  return results;
}
