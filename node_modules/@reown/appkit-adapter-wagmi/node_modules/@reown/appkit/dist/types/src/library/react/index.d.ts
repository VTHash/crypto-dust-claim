import type { W3mAccountButton, W3mButton, W3mConnectButton, W3mNetworkButton, W3mOnrampWidget } from '@reown/appkit-scaffold-ui';
import type { AppKit } from '../../../src/client.js';
import type { AppKitOptions } from '../../utils/TypesUtil.js';
import type { ChainNamespace } from '@reown/appkit-common';
type OpenOptions = {
    view: 'Account' | 'Connect' | 'Networks' | 'ApproveTransaction' | 'OnRampProviders';
};
type ThemeModeOptions = AppKitOptions['themeMode'];
type ThemeVariablesOptions = AppKitOptions['themeVariables'];
declare global {
    namespace JSX {
        interface IntrinsicElements {
            'w3m-connect-button': Pick<W3mConnectButton, 'size' | 'label' | 'loadingLabel'>;
            'w3m-account-button': Pick<W3mAccountButton, 'disabled' | 'balance'>;
            'w3m-button': Pick<W3mButton, 'size' | 'label' | 'loadingLabel' | 'disabled' | 'balance'>;
            'w3m-network-button': Pick<W3mNetworkButton, 'disabled'>;
            'w3m-onramp-widget': Pick<W3mOnrampWidget, 'disabled'>;
        }
    }
}
export declare function getAppKit(appKit: AppKit): void;
export declare function useAppKitProvider<T>(chainNamespace: ChainNamespace): {
    walletProvider: T;
    walletProviderType: ("walletConnect" | "injected" | "coinbaseWallet" | "eip6963" | "w3mAuth" | "coinbaseWalletSDK") | undefined;
};
export declare function useAppKitTheme(): {
    themeMode: "dark" | "light";
    themeVariables: import("@reown/appkit-core").ThemeVariables;
    setThemeMode: (themeMode: ThemeModeOptions) => void;
    setThemeVariables: (themeVariables: ThemeVariablesOptions) => void;
};
export declare function useAppKit(): {
    open: (options?: OpenOptions) => Promise<void>;
    close: () => Promise<void>;
};
export declare function useWalletInfo(): {
    walletInfo: import("@reown/appkit-core").ConnectedWalletInfo;
};
export declare function useAppKitState(): import("@reown/appkit-core").PublicStateControllerState;
export declare function useAppKitEvents(): {
    timestamp: number;
    data: import("@reown/appkit-core").Event;
};
export {};
