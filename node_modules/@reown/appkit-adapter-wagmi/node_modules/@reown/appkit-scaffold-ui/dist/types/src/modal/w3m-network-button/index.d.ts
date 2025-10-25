import type { WuiNetworkButton } from '@reown/appkit-ui';
import { LitElement } from 'lit';
export declare class W3mNetworkButton extends LitElement {
    static styles: import("lit").CSSResult;
    private unsubscribe;
    disabled?: WuiNetworkButton['disabled'];
    label?: string;
    private network;
    private networkImage;
    private caipAddress;
    private loading;
    private isUnsupportedChain;
    constructor();
    disconnectedCallback(): void;
    render(): import("lit").TemplateResult<1>;
    private getLabel;
    private onClick;
}
declare global {
    interface HTMLElementTagNameMap {
        'w3m-network-button': W3mNetworkButton;
    }
}
