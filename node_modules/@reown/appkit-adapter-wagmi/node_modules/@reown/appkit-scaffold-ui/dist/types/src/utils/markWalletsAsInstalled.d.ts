import type { WcWallet } from '@reown/appkit-core';
export declare function markWalletsAsInstalled(wallets: WcWallet[]): (WcWallet & {
    installed: boolean;
})[];
