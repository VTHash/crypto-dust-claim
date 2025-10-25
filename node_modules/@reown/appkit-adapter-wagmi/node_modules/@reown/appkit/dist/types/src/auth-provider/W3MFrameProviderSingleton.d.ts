import type { CaipNetworkId } from '@reown/appkit-common';
import { W3mFrameProvider } from '@reown/appkit-wallet';
export declare class W3mFrameProviderSingleton {
    private static instance;
    private constructor();
    static getInstance(projectId: string, chainId?: number | CaipNetworkId): W3mFrameProvider;
}
