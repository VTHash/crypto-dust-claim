// src/services/dexService.js
import axios from "axios";

/**
 * Official ZeroEx aggregator hosts (chain-specific)
 */
const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',                 // Ethereum (Mainnet)

  10: 'https://optimism.api.0x.org',        // Optimism
  56: 'https://bsc.api.0x.org',             // BSC
  130: 'https://unichain.api.0x.org',       // Unichain
  137: 'https://polygon.api.0x.org',        // Polygon
  143: 'https://monad.api.0x.org',          // Monad
  146: 'https://sonic.api.0x.org',          // Sonic
  480: 'https://worldchain.api.0x.org',     // World Chain
  5000: 'https://mantle.api.0x.org',        // Mantle
  9745: 'https://plasma.api.0x.org',        // Plasma

  42161: 'https://arbitrum.api.0x.org',     // Arbitrum
  43114: 'https://avalanche.api.0x.org',    // Avalanche
  534352: 'https://scroll.api.0x.org',      // Scroll
  59144: 'https://linea.api.0x.org',        // Linea

  80094: 'https://berachain.api.0x.org',    // Berachain
  81457: 'https://blast.api.0x.org',        // Blast
  34443: 'https://mode.api.0x.org',         // Mode
  8453: 'https://base.api.0x.org',          // Base
  57073: 'https://ink.api.0x.org',          // Ink
};
/** Normalize amount to string */
const toAmountStr = (amount) =>
  typeof amount === "bigint" ? amount.toString() : String(amount ?? "0");

class DexService0x {
  // ---------------------------------------------------------------------------
  // GET QUOTE
  // ---------------------------------------------------------------------------
  /**
   * Returns the best 0x quote with buyAmount, estimatedGas, etc.
   */
  async getQuote(chainId, tokenIn, tokenOut, amount, slippagePct = 1) {
    const host = ZEROX_HOST_BY_CHAIN[Number(chainId)];
    if (!host) throw new Error(`0x does not support chain ${chainId}`);

    try {
      const { data } = await axios.get(`${host}/swap/v1/quote`, {
        params: {
          sellToken: tokenIn,
          buyToken: tokenOut,
          sellAmount: toAmountStr(amount),
          slippagePercentage: Number(slippagePct) / 100,
        },
      });

      return {
        aggregator: "0x",
        fromTokenAmount: toAmountStr(amount),
        toTokenAmount: data?.buyAmount ?? "0",
        estimatedGas: data?.estimatedGas ?? null,
        tx: data, // full tx object for execution
      };
    } catch (err) {
      console.error("0x quote error:", err?.response?.data || err.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // BUILD EXECUTION TX
  // ---------------------------------------------------------------------------
  /**
   * Returns a wallet-ready tx ({ to, data, value }) for MetaMask / WalletConnect.
   */
  buildSwapTx(quote, fromAddress) {
    if (!quote?.tx) throw new Error("Missing transaction data from 0x API");

    const tx = quote.tx;

    return {
      from: fromAddress,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? "0x0",
      gas: tx.gas,          // optional
      gasPrice: tx.gasPrice // optional
    };
  }

  // ---------------------------------------------------------------------------
  // DIRECT EXECUTION (if using signer directly)
  // ---------------------------------------------------------------------------
  /**
   * Executes a 0x swap via signer.sendTransaction().
   */
  async executeSwap(quote, signer) {
    if (!quote?.tx) throw new Error("No tx object provided for execution");

    const { to, data, value, gas } = quote.tx;

    const tx = await signer.sendTransaction({
      to,
      data,
      gasLimit: gas ? BigInt(gas) : undefined,
      value: value ? BigInt(value) : 0n,
    });

    return await tx.wait();
  }
}

export default new DexService0x();
