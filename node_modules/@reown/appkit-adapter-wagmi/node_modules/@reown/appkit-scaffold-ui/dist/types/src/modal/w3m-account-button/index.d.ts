import type { WuiAccountButton } from '@reown/appkit-ui';
import { LitElement } from 'lit';
export declare class W3mAccountButton extends LitElement {
    private unsubscribe;
    disabled?: WuiAccountButton['disabled'];
    balance?: 'show' | 'hide';
    charsStart?: WuiAccountButton['charsStart'];
    charsEnd?: WuiAccountButton['charsEnd'];
    private caipAddress;
    private balanceVal;
    private balanceSymbol;
    private profileName;
    private profileImage;
    private network;
    private networkImage;
    private isUnsupportedChain;
    constructor();
    disconnectedCallback(): void;
    render(): import("lit").TemplateResult<1>;
    private onClick;
}
declare global {
    interface HTMLElementTagNameMap {
        'w3m-account-button': W3mAccountButton;
    }
}
