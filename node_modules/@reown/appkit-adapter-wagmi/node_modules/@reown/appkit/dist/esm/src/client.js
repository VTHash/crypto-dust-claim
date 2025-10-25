import { AccountController, BlockchainApiController, ConnectionController, ConnectorController, CoreHelperUtil, EventsController, ModalController, ChainController, PublicStateController, ThemeController, SnackController, RouterController, EnsController, OptionsController, NetworkController, AssetUtil, ApiController } from '@reown/appkit-core';
import { setColorTheme, setThemeVariables } from '@reown/appkit-ui';
import { ConstantsUtil, CaipNetworksUtil, SafeLocalStorage, SafeLocalStorageKeys } from '@reown/appkit-common';
import { UniversalAdapterClient } from './universal-adapter/client.js';
import { PresetsUtil } from '@reown/appkit-utils';
import { ProviderUtil } from './store/ProviderUtil.js';
// -- Export Controllers -------------------------------------------------------
export { AccountController, NetworkController };
// -- Helpers -------------------------------------------------------------------
let isInitialized = false;
// -- Client --------------------------------------------------------------------
export class AppKit {
    constructor(options) {
        this.initPromise = undefined;
        this.setStatus = (status, chain) => {
            AccountController.setStatus(status, chain);
        };
        this.getIsConnectedState = () => Boolean(ChainController.state.activeCaipAddress);
        this.setAllAccounts = (addresses, chain) => {
            AccountController.setAllAccounts(addresses, chain);
            OptionsController.setHasMultipleAddresses(addresses?.length > 1);
        };
        this.addAddressLabel = (address, label, chain) => {
            AccountController.addAddressLabel(address, label, chain);
        };
        this.removeAddressLabel = (address, chain) => {
            AccountController.removeAddressLabel(address, chain);
        };
        this.getCaipAddress = (chainNamespace) => {
            if (ChainController.state.activeChain === chainNamespace || !chainNamespace) {
                return ChainController.state.activeCaipAddress;
            }
            return ChainController.getAccountProp('caipAddress', chainNamespace);
        };
        this.getAddress = (chainNamespace) => {
            if (ChainController.state.activeChain === chainNamespace || !chainNamespace) {
                return AccountController.state.address;
            }
            return ChainController.getAccountProp('address', chainNamespace);
        };
        this.getProvider = () => AccountController.state.provider;
        this.getPreferredAccountType = () => AccountController.state.preferredAccountType;
        this.setCaipAddress = (caipAddress, chain) => {
            AccountController.setCaipAddress(caipAddress, chain);
        };
        this.setProvider = (provider, chain) => {
            AccountController.setProvider(provider, chain);
        };
        this.setBalance = (balance, balanceSymbol, chain) => {
            AccountController.setBalance(balance, balanceSymbol, chain);
        };
        this.setProfileName = (profileName, chain) => {
            AccountController.setProfileName(profileName, chain);
        };
        this.setProfileImage = (profileImage, chain) => {
            AccountController.setProfileImage(profileImage, chain);
        };
        this.resetAccount = (chain) => {
            AccountController.resetAccount(chain);
        };
        this.setCaipNetwork = caipNetwork => {
            ChainController.setActiveCaipNetwork(caipNetwork);
        };
        this.getCaipNetwork = (chainNamespace) => {
            if (chainNamespace) {
                return NetworkController.getRequestedCaipNetworks().filter(c => c.chainNamespace === chainNamespace)?.[0];
            }
            return ChainController.state.activeCaipNetwork;
        };
        this.getCaipNetworks = () => NetworkController.getRequestedCaipNetworks();
        this.getActiveChainNamespace = () => ChainController.state.activeChain;
        this.setRequestedCaipNetworks = (requestedCaipNetworks, chain) => {
            NetworkController.setRequestedCaipNetworks(requestedCaipNetworks, chain);
        };
        this.getApprovedCaipNetworkIds = () => NetworkController.getApprovedCaipNetworkIds();
        this.setApprovedCaipNetworksData = chain => NetworkController.setApprovedCaipNetworksData(chain);
        this.resetNetwork = () => {
            NetworkController.resetNetwork();
        };
        this.setConnectors = connectors => {
            const allConnectors = [...ConnectorController.getConnectors(), ...connectors];
            ConnectorController.setConnectors(allConnectors);
        };
        this.addConnector = connector => {
            ConnectorController.addConnector(connector);
        };
        this.getConnectors = () => ConnectorController.getConnectors();
        this.resetWcConnection = () => {
            ConnectionController.resetWcConnection();
        };
        this.fetchIdentity = request => BlockchainApiController.fetchIdentity(request);
        this.setAddressExplorerUrl = (addressExplorerUrl, chain) => {
            AccountController.setAddressExplorerUrl(addressExplorerUrl, chain);
        };
        this.setSmartAccountDeployed = (isDeployed, chain) => {
            AccountController.setSmartAccountDeployed(isDeployed, chain);
        };
        this.setConnectedWalletInfo = (connectedWalletInfo, chain) => {
            AccountController.setConnectedWalletInfo(connectedWalletInfo, chain);
        };
        this.setSmartAccountEnabledNetworks = (smartAccountEnabledNetworks, chain) => {
            NetworkController.setSmartAccountEnabledNetworks(smartAccountEnabledNetworks, chain);
        };
        this.setPreferredAccountType = (preferredAccountType, chain) => {
            AccountController.setPreferredAccountType(preferredAccountType, chain);
        };
        this.getReownName = address => EnsController.getNamesForAddress(address);
        this.resolveReownName = async (name) => {
            const wcNameAddress = await EnsController.resolveName(name);
            const networkNameAddresses = Object.values(wcNameAddress?.addresses) || [];
            return networkNameAddresses[0]?.address || false;
        };
        this.setEIP6963Enabled = enabled => {
            OptionsController.setEIP6963Enabled(enabled);
        };
        this.setClientId = clientId => {
            BlockchainApiController.setClientId(clientId);
        };
        this.getConnectorImage = connector => AssetUtil.getConnectorImage(connector);
        this.handleUnsafeRPCRequest = () => {
            if (this.isOpen()) {
                // If we are on the modal but there is no transaction stack, close the modal
                if (this.isTransactionStackEmpty()) {
                    return;
                }
                // Check if we need to replace or redirect
                this.redirect('ApproveTransaction');
            }
            else {
                // If called from outside the modal, open ApproveTransaction
                this.open({ view: 'ApproveTransaction' });
            }
        };
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        this.adapter = options.adapters?.[0];
        this.initControllers(options);
        this.initOrContinue();
    }
    static getInstance() {
        return this.instance;
    }
    // -- Public -------------------------------------------------------------------
    async open(options) {
        await this.initOrContinue();
        ModalController.open(options);
    }
    async close() {
        await this.initOrContinue();
        ModalController.close();
    }
    setLoading(loading) {
        ModalController.setLoading(loading);
    }
    // -- Adapter Methods ----------------------------------------------------------
    getError() {
        return '';
    }
    getChainId() {
        return ChainController.state.activeCaipNetwork?.chainId;
    }
    switchNetwork(caipNetwork) {
        return NetworkController.switchActiveNetwork(caipNetwork);
    }
    getWalletProvider() {
        return ChainController.state.activeChain
            ? ProviderUtil.state.providers[ChainController.state.activeChain]
            : null;
    }
    getWalletProviderType() {
        return ChainController.state.activeChain
            ? ProviderUtil.state.providerIds[ChainController.state.activeChain]
            : null;
    }
    subscribeProvider() {
        return null;
    }
    getThemeMode() {
        return ThemeController.state.themeMode;
    }
    getThemeVariables() {
        return ThemeController.state.themeVariables;
    }
    setThemeMode(themeMode) {
        ThemeController.setThemeMode(themeMode);
        setColorTheme(ThemeController.state.themeMode);
    }
    setThemeVariables(themeVariables) {
        ThemeController.setThemeVariables(themeVariables);
        setThemeVariables(ThemeController.state.themeVariables);
    }
    subscribeTheme(callback) {
        return ThemeController.subscribe(callback);
    }
    getWalletInfo() {
        return AccountController.state.connectedWalletInfo;
    }
    subscribeWalletInfo(callback) {
        return AccountController.subscribeKey('connectedWalletInfo', callback);
    }
    subscribeShouldUpdateToAddress(callback) {
        AccountController.subscribeKey('shouldUpdateToAddress', callback);
    }
    subscribeCaipNetworkChange(callback) {
        NetworkController.subscribeKey('caipNetwork', callback);
    }
    getState() {
        return PublicStateController.state;
    }
    subscribeState(callback) {
        return PublicStateController.subscribe(callback);
    }
    showErrorMessage(message) {
        SnackController.showError(message);
    }
    showSuccessMessage(message) {
        SnackController.showSuccess(message);
    }
    getEvent() {
        return { ...EventsController.state };
    }
    subscribeEvents(callback) {
        return EventsController.subscribe(callback);
    }
    replace(route) {
        RouterController.replace(route);
    }
    redirect(route) {
        RouterController.push(route);
    }
    popTransactionStack(cancel) {
        RouterController.popTransactionStack(cancel);
    }
    isOpen() {
        return ModalController.state.open;
    }
    isTransactionStackEmpty() {
        return RouterController.state.transactionStack.length === 0;
    }
    isTransactionShouldReplaceView() {
        return RouterController.state.transactionStack[RouterController.state.transactionStack.length - 1]?.replace;
    }
    // -- Private ------------------------------------------------------------------
    async initControllers(options) {
        OptionsController.setProjectId(options.projectId);
        OptionsController.setSdkVersion(options.sdkVersion);
        this.adapters = options.adapters;
        this.setMetadata(options);
        this.extendCaipNetworks(options);
        this.initializeUniversalAdapter(options);
        this.initializeAdapters(options);
        this.setDefaultNetwork(options);
        OptionsController.setAllWallets(options.allWallets);
        OptionsController.setIncludeWalletIds(options.includeWalletIds);
        OptionsController.setExcludeWalletIds(options.excludeWalletIds);
        if (options.excludeWalletIds) {
            ApiController.searchWalletByIds({ ids: options.excludeWalletIds });
        }
        OptionsController.setFeaturedWalletIds(options.featuredWalletIds);
        OptionsController.setTokens(options.tokens);
        OptionsController.setTermsConditionsUrl(options.termsConditionsUrl);
        OptionsController.setPrivacyPolicyUrl(options.privacyPolicyUrl);
        OptionsController.setCustomWallets(options.customWallets);
        OptionsController.setFeatures(options.features);
        OptionsController.setEnableWalletConnect(options.enableWalletConnect !== false);
        OptionsController.setEnableWallets(options.enableWallets !== false);
        if (options.metadata) {
            OptionsController.setMetadata(options.metadata);
        }
        if (options.themeMode) {
            ThemeController.setThemeMode(options.themeMode);
        }
        if (options.themeVariables) {
            ThemeController.setThemeVariables(options.themeVariables);
        }
        if (options.disableAppend) {
            OptionsController.setDisableAppend(Boolean(options.disableAppend));
        }
        const evmAdapter = options.adapters?.find(adapter => adapter.chainNamespace === ConstantsUtil.CHAIN.EVM);
        // Set the SIWE client for EVM chains
        if (evmAdapter) {
            if (options.siweConfig) {
                const { SIWEController } = await import('@reown/appkit-siwe');
                SIWEController.setSIWEClient(options.siweConfig);
            }
        }
    }
    setMetadata(options) {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }
        options.metadata = {
            name: document.getElementsByTagName('title')[0]?.textContent || '',
            description: document.querySelector('meta[property="og:description"]')?.content || '',
            url: window.location.origin,
            icons: [document.querySelector('link[rel~="icon"]')?.href || '']
        };
    }
    extendCaipNetworks(options) {
        options.networks = CaipNetworksUtil.extendCaipNetworks(options.networks, {
            networkImageIds: PresetsUtil.NetworkImageIds,
            customNetworkImageUrls: options.chainImages,
            projectId: options.projectId
        });
        options.defaultNetwork = options.networks.find(n => n.id === options.defaultNetwork?.id);
    }
    initializeUniversalAdapter(options) {
        this.universalAdapter = new UniversalAdapterClient(options);
        ChainController.initializeUniversalAdapter(this.universalAdapter, options.adapters || []);
        this.universalAdapter.construct?.(this, options);
    }
    initializeAdapters(options) {
        ChainController.initialize(options.adapters || []);
        options.adapters?.forEach(adapter => {
            // @ts-expect-error will introduce construct later
            adapter.construct?.(this, options);
        });
    }
    setDefaultNetwork(options) {
        const extendedDefaultNetwork = options.defaultNetwork
            ? CaipNetworksUtil.extendCaipNetwork(options.defaultNetwork, {
                networkImageIds: PresetsUtil.NetworkImageIds,
                customNetworkImageUrls: options.chainImages,
                projectId: options.projectId
            })
            : undefined;
        const previousNetwork = SafeLocalStorage.getItem(SafeLocalStorageKeys.ACTIVE_CAIP_NETWORK_ID);
        const caipNetwork = previousNetwork
            ? options.networks.find(n => n.id === previousNetwork)
            : undefined;
        const network = caipNetwork ?? extendedDefaultNetwork ?? options.networks[0];
        ChainController.setActiveCaipNetwork(network);
    }
    async initOrContinue() {
        if (!this.initPromise && !isInitialized && CoreHelperUtil.isClient()) {
            isInitialized = true;
            this.initPromise = new Promise(async (resolve) => {
                await Promise.all([
                    import('@reown/appkit-ui'),
                    import('@reown/appkit-scaffold-ui/w3m-modal')
                ]);
                const modal = document.createElement('w3m-modal');
                if (!OptionsController.state.disableAppend) {
                    document.body.insertAdjacentElement('beforeend', modal);
                }
                resolve();
            });
        }
        return this.initPromise;
    }
}
//# sourceMappingURL=client.js.map