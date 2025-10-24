// services/batchService.js
import { ethers } from 'ethers';
import web3Service from './web3Service';

class BatchService {
  constructor() {
    this.batchAbi = [
      'function batchTransfer(address[] recipients, uint256[] amounts) external'
    ];
  }

  /**
   * Prepare batch txs. We only BUILD tx objects here; caller sends them with a signer.
   * claims = [{ tokenAddress, recipient, amount (string or BigInt), chainId }]
   */
  async createBatchDustClaim(claims) {
    const byToken = {};
    for (const c of claims) {
      const key = `${c.chainId}:${c.tokenAddress}`;
      byToken[key] = byToken[key] || { chainId: c.chainId, tokenAddress: c.tokenAddress, list: [] };
      byToken[key].list.push(c);
    }

    const txs = [];
    for (const key of Object.keys(byToken)) {
      const { chainId, tokenAddress, list } = byToken[key];

      if (list.length > 1) {
        // Batch
        const recipients = list.map(x => x.recipient);
        const amounts = list.map(x => ethers.toBigInt(x.amount));
        const provider = web3Service.getRpcProvider(chainId);
        const contract = new ethers.Contract(tokenAddress, this.batchAbi, provider);
        const data = contract.interface.encodeFunctionData('batchTransfer', [recipients, amounts]);

        txs.push({
          chainId,
          to: tokenAddress,
          data,
          value: '0',
          gasLimit: 100000 + recipients.length * 30000
        });
      } else {
        // Single transfer (ERC20 transfer data)
        const only = list[0];
        const erc20Iface = new ethers.Interface(['function transfer(address,uint256)']);
        const data = erc20Iface.encodeFunctionData('transfer', [
          only.recipient,
          ethers.toBigInt(only.amount)
        ]);
        txs.push({
          chainId: only.chainId,
          to: only.tokenAddress,
          data,
          value: '0',
          gasLimit: 65000
        });
      }
    }

    return txs;
  }

  calculateGasSavings(individualTxs, batchTxs) {
    const i = individualTxs.reduce((n, tx) => n + Number(tx.gasLimit || 0), 0);
    const b = batchTxs.reduce((n, tx) => n + Number(tx.gasLimit || 0), 0);
    const savings = i - b;
    return {
      individualGas: i,
      batchGas: b,
      savings,
      savingsPercentage: i ? ((savings / i) * 100).toFixed(2) : '0.00'
    };
  }
}

export default new BatchService();