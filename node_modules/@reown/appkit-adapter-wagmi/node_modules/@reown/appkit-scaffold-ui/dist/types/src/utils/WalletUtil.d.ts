import { type WcWallet } from '@reown/appkit-core';
export declare const WalletUtil: {
    filterOutDuplicatesByRDNS(wallets: WcWallet[]): WcWallet[];
    filterOutDuplicatesByIds(wallets: WcWallet[]): WcWallet[];
    filterOutDuplicateWallets(wallets: WcWallet[]): WcWallet[];
};
