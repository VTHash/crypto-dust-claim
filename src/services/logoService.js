// ============================================================================
// LOGO SERVICE — FINAL VERIFIED VERSION
// - Native logos (from /public/logo)
// - ERC20 logos (from TrustWallet repo)
// - Auto fallback to generic icon
// ============================================================================

// Base URL for TrustWallet repo (raw icons)
const TRUSTWALLET_ASSETS =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

// Local fallback
const GENERIC_ICON = '/logos/tokens/generic-token.png';

// ============================================================================
// 1) Native logos from public/logo
// ============================================================================
export const NATIVE_LOGOS = {
  1: '/logo/ethereum.png',
  10: '/logo/optimism.png',
  56: '/logo/bnb.png',
  137: '/logo/polygon.png',
  42161: '/logo/arbitrum.png',
  43114: '/logo/avalanche.png',
  8453: '/logo/base.png',
  324: '/logo/zksync.png',
  5000: '/logo/mantle.png',
  59144: '/logo/linea.png',
  81457: '/logo/blast.png',
  250: '/logo/fantom.png',
  32456: '/logo/scroll.png',
  80085: '/logo/bera.png',
};

// ============================================================================
// 2) TrustWallet blockchain folder mapping
// MUST match EXACT repo folder names to avoid 404s
// ============================================================================
const CHAIN_PATHS = {
  1: 'ethereum',
  10: 'optimism',
  56: 'smartchain',
  137: 'polygon',
  42161: 'arbitrum',
  43114: 'avalanchec',
  8453: 'base',
  324: 'zksync',
  5000: 'mantle',
  59144: 'linea',
  81457: 'blast',
  250: 'fantom',
  32456: 'scroll',
  80085: 'berachain',
  204: 'opbnb',
};

// DEFAULT to Ethereum folder for unknown chains
function getChainPath(chainId) {
  return CHAIN_PATHS[chainId] || 'ethereum';
}

// ============================================================================
// 3) MAIN FUNCTION — resolve native / ERC20 logo
// ============================================================================
export function getTokenLogo(address, symbol, chainId = 1) {
  // Native token case
  if (!address || address === 'native') {
    return NATIVE_LOGOS[chainId] || GENERIC_ICON;
  }

  // ERC20 case
  try {
    const lower = address.toLowerCase();
    const path = getChainPath(chainId);

    return `${TRUSTWALLET_ASSETS}/${path}/assets/${lower}/logo.png`;
  } catch {
    return GENERIC_ICON;
  }
}

// ============================================================================
// 4) (Optional) Preload / verify a token logo
// ============================================================================
export async function preloadLogo(address, chainId = 1) {
  const url = getTokenLogo(address, null, chainId);

  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) throw new Error('Not found');
    return url;
  } catch {
    return GENERIC_ICON;
  }
}