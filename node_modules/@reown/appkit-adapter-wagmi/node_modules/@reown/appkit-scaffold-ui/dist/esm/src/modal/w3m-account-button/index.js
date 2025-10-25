var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { AccountController, AssetController, AssetUtil, ChainController, CoreHelperUtil, ModalController, NetworkController } from '@reown/appkit-core';
import { customElement } from '@reown/appkit-ui';
import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
let W3mAccountButton = class W3mAccountButton extends LitElement {
    constructor() {
        super();
        this.unsubscribe = [];
        this.disabled = false;
        this.balance = 'show';
        this.charsStart = 4;
        this.charsEnd = 6;
        this.caipAddress = ChainController.state.activeCaipAddress;
        this.balanceVal = AccountController.state.balance;
        this.balanceSymbol = AccountController.state.balanceSymbol;
        this.profileName = AccountController.state.profileName;
        this.profileImage = AccountController.state.profileImage;
        this.network = ChainController.state.activeCaipNetwork;
        this.networkImage = this.network ? AssetUtil.getNetworkImage(this.network) : undefined;
        this.isUnsupportedChain = NetworkController.state.isUnsupportedChain;
        this.unsubscribe.push(...[
            AssetController.subscribeNetworkImages(() => {
                this.networkImage = this.network?.imageId
                    ? AssetUtil.getNetworkImage(this.network)
                    : undefined;
            }),
            ChainController.subscribeKey('activeCaipAddress', val => (this.caipAddress = val)),
            AccountController.subscribeKey('balance', val => (this.balanceVal = val)),
            AccountController.subscribeKey('balanceSymbol', val => (this.balanceSymbol = val)),
            AccountController.subscribeKey('profileName', val => (this.profileName = val)),
            AccountController.subscribeKey('profileImage', val => (this.profileImage = val)),
            ChainController.subscribeKey('activeCaipNetwork', val => {
                this.network = val;
                this.networkImage = val?.imageId ? AssetUtil.getNetworkImage(val) : undefined;
            }),
            NetworkController.subscribeKey('isUnsupportedChain', val => {
                this.isUnsupportedChain = val;
            })
        ]);
    }
    disconnectedCallback() {
        this.unsubscribe.forEach(unsubscribe => unsubscribe());
    }
    render() {
        const showBalance = this.balance === 'show';
        return html `
      <wui-account-button
        .disabled=${Boolean(this.disabled)}
        .isUnsupportedChain=${this.isUnsupportedChain}
        address=${ifDefined(CoreHelperUtil.getPlainAddress(this.caipAddress))}
        profileName=${ifDefined(this.profileName)}
        networkSrc=${ifDefined(this.networkImage)}
        avatarSrc=${ifDefined(this.profileImage)}
        balance=${showBalance
            ? CoreHelperUtil.formatBalance(this.balanceVal, this.balanceSymbol)
            : ''}
        @click=${this.onClick.bind(this)}
        data-testid="account-button"
        .charsStart=${this.charsStart}
        .charsEnd=${this.charsEnd}
      >
      </wui-account-button>
    `;
    }
    onClick() {
        if (this.isUnsupportedChain) {
            ModalController.open({ view: 'UnsupportedChain' });
        }
        else {
            ModalController.open();
        }
    }
};
__decorate([
    property({ type: Boolean })
], W3mAccountButton.prototype, "disabled", void 0);
__decorate([
    property()
], W3mAccountButton.prototype, "balance", void 0);
__decorate([
    property()
], W3mAccountButton.prototype, "charsStart", void 0);
__decorate([
    property()
], W3mAccountButton.prototype, "charsEnd", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "caipAddress", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "balanceVal", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "balanceSymbol", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "profileName", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "profileImage", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "network", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "networkImage", void 0);
__decorate([
    state()
], W3mAccountButton.prototype, "isUnsupportedChain", void 0);
W3mAccountButton = __decorate([
    customElement('w3m-account-button')
], W3mAccountButton);
export { W3mAccountButton };
//# sourceMappingURL=index.js.map