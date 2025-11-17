import React from "react";

/**
 * DustClaimAddressPage
 *
 * Props:
 * - address: string (wallet address being viewed)
 * - chains: Array<{
 * chainId: number;
 * chainName: string;
 * nativeSymbol?: string;
 * tokens: Array<{
 * symbol: string;
 * name?: string;
 * amount: string | number;
 * usdValue?: number;
 * logoUrl?: string;
 * }>;
 * }>
 * - isLoading?: boolean
 * - error?: string | null
 * - lastUpdated?: string | Date
 * - onClaimAll?: () => void
 * - onSwapAndClaimAll?: () => void
 */
const DustClaimAddressPage = ({
  address,
  chains = [],
  isLoading = false,
  error = null,
  lastUpdated,
  onClaimAll,
  onSwapAndClaimAll,
}) => {
  const hasDust =
    chains && chains.some((c) => c.tokens && c.tokens.length > 0);

  const formattedLastUpdated =
    lastUpdated &&
    (typeof lastUpdated === "string"
      ? lastUpdated
      : lastUpdated.toLocaleString());

  return (
    <div className="dustclaim-page">
      {/* HEADER */}
      <header className="dustclaim-header">
        <div>
          <h1 className="dustclaim-title">DustClaim – Address Overview</h1>
          <p className="dustclaim-subtitle">
            Scan and consolidate dust balances across multiple EVM chains.
          </p>
        </div>
        <div className="dustclaim-address-pill">
          <span className="dustclaim-address-label">Address</span>
          <span className="dustclaim-address-value">
            {address || "—"}
          </span>
        </div>
      </header>

      {/* STATUS / META */}
      <section className="dustclaim-meta">
        {isLoading && (
          <div className="dustclaim-banner dustclaim-banner--info">
            Scanning chains for dust balances…
          </div>
        )}
        {error && !isLoading && (
          <div className="dustclaim-banner dustclaim-banner--error">
            {error}
          </div>
        )}
        {!isLoading && !error && (
          <div className="dustclaim-banner dustclaim-banner--success">
            {hasDust ? (
              <>Dust balances found across supported chains.</>
            ) : (
              <>No dust detected for this address on supported chains.</>
            )}
            {formattedLastUpdated && (
              <span className="dustclaim-meta-time">
                &nbsp;· Last updated: {formattedLastUpdated}
              </span>
            )}
          </div>
        )}
      </section>

      {/* MAIN CONTENT */}
      <main className="dustclaim-main">
        {/* DUST BY CHAIN */}
        <section className="dustclaim-card">
          <h2>Dust Balances by Chain</h2>
          <p className="dustclaim-note">
            Small token balances (“dust”) detected for this address on each
            supported chain.
          </p>

          {!hasDust && !isLoading && !error && (
            <p className="dustclaim-empty">No dust currently detected.</p>
          )}

          {chains.map((chain) => {
            if (!chain.tokens || chain.tokens.length === 0) return null;

            return (
              <div key={chain.chainId} className="dustclaim-chain-block">
                <div className="dustclaim-chain-header">
                  <h3>{chain.chainName}</h3>
                  {chain.nativeSymbol && (
                    <span className="dustclaim-chain-tag">
                      Native: {chain.nativeSymbol}
                    </span>
                  )}
                </div>
                <ul className="dustclaim-token-list">
                  {chain.tokens.map((token, idx) => (
                    <li key={`${chain.chainId}-${token.symbol}-${idx}`}>
                      <div className="dustclaim-token-left">
                        {token.logoUrl && (
                          <img
                            src={token.logoUrl}
                            alt={token.symbol}
                            className="dustclaim-hfv-logo"
                          />
                        )}
                        <div>
                          <div className="dustclaim-token-symbol">
                            {token.symbol}
                          </div>
                          {token.name && (
                            <div className="dustclaim-token-name">
                              {token.name}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="dustclaim-token-right">
                        <div className="dustclaim-token-amount">
                          {token.amount} {token.symbol}
                        </div>
                        {typeof token.usdValue === "number" && (
                          <div className="dustclaim-token-usd">
                            ≈ ${token.usdValue.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {/* CONSOLIDATION OPTIONS */}
        <section className="dustclaim-card">
          <h2>Consolidation Options</h2>
          <p className="dustclaim-note">
            All actions are non-custodial. You will confirm each transaction
            from your wallet.
          </p>

          <div className="dustclaim-actions">
            <button
              className="dustclaim-btn"
              disabled={!hasDust || !onClaimAll}
              onClick={onClaimAll}
            >
              Claim Dust
            </button>
            <button
              className="dustclaim-btn dustclaim-btn--secondary"
              disabled={!hasDust || !onSwapAndClaimAll}
              onClick={onSwapAndClaimAll}
            >
              Swap &amp; Consolidate
            </button>
          </div>

          <ul className="dustclaim-list">
            <li>
              <strong>Claim Dust:</strong> Send detected dust tokens back to
              this address, chain by chain.
            </li>
            <li>
              <strong>Swap &amp; Consolidate:</strong> Where supported, swap
              dust into one token per chain (e.g. WETH, WBNB, or a stablecoin).
            </li>
            <li>
              <strong>Batch Actions:</strong> Group multiple claims/swaps into
              fewer clicks to save time.
            </li>
          </ul>
        </section>

        {/* FAQ */}
        <section className="dustclaim-card">
          <h2>FAQ</h2>

          <details open>
            <summary>What is DustClaim?</summary>
            <p>
              DustClaim is a non-custodial tool that scans supported
              blockchains for dust-level token balances linked to your wallet.
              It helps you view, claim, or consolidate tokens that are too
              small to notice in regular portfolio views.
            </p>
          </details>

          <details>
            <summary>How does DustClaim work?</summary>
            <p>
              DustClaim reads publicly available on-chain balances for the
              wallet address you connect or view. It identifies small token
              balances based on a configurable value threshold and displays
              them per chain.
            </p>
          </details>

          <details>
            <summary>Do you store my private keys or control my funds?</summary>
            <p>
              No. DustClaim is fully non-custodial. You connect your own
              wallet, and every transaction (claim or swap) must be explicitly
              signed and confirmed by you.
            </p>
          </details>

          <details>
            <summary>Is DustClaim free to use?</summary>
            <p>
              Yes, DustClaim itself is free. You only pay normal blockchain gas
              fees for any on-chain actions you choose to execute.
            </p>
          </details>

          <details>
            <summary>Which chains are supported?</summary>
            <p>
              DustClaim supports 30+ EVM chains including Ethereum, BNB Chain,
              Avalanche, Arbitrum, Optimism, Polygon, Base, Linea, Mantle,
              Zora, Moonbeam, Moonriver, Aurora, Syscoin, Flare, and more.
              Support will continue to expand over time.
            </p>
          </details>

          <details>
            <summary>Can DustClaim swap tokens for me?</summary>
            <p>
              Where available, DustClaim integrates swap routes (e.g. via
              Uniswap V3, 1inch, or other DEX routers) to consolidate small
              token balances into a single token per chain. Exact routes depend
              on the infrastructure available on each network.
            </p>
          </details>
        </section>

        {/* PRIVACY POLICY */}
        <section className="dustclaim-card">
          <h2>Privacy Policy</h2>

          <p>
            DustClaim does not collect or store personally identifying
            information. The app operates entirely on publicly available
            blockchain data.
          </p>

          <h3>Information We Access</h3>
          <ul className="dustclaim-list">
            <li>Public wallet addresses you connect or view.</li>
            <li>Token balances and on-chain activity for those addresses.</li>
            <li>Basic usage metrics (aggregated and anonymized where used).</li>
          </ul>

          <h3>Information We Do NOT Collect</h3>
          <ul className="dustclaim-list">
            <li>Private keys or seed phrases.</li>
            <li>Off-chain personal identity data (name, address, etc.).</li>
            <li>Direct custody of any funds or assets.</li>
          </ul>

          <h3>Cookies & Storage</h3>
          <p>
            DustClaim may use minimal local storage or cookies to remember UI
            preferences (such as theme or last-used chain). These do not
            include sensitive data.
          </p>

          <h3>Third-Party Services</h3>
          <p>
            Some features (price feeds, RPC endpoints, DEX aggregators) rely on
            third-party providers. Those services may have their own privacy
            policies, which you should review separately.
          </p>
        </section>

        {/* TERMS OF USE */}
        <section className="dustclaim-card">
          <h2>Terms of Use</h2>

          <h3>Non-Custodial Service</h3>
          <p>
            DustClaim is a non-custodial interface. All actions are executed
            directly on the blockchain via your wallet. The application never
            has access to your private keys or direct control over your assets.
          </p>

          <h3>No Financial Advice</h3>
          <p>
            DustClaim is an informational and utility tool only. Nothing on
            this site constitutes financial, legal, or tax advice. Always do
            your own research and consult a professional if needed.
          </p>

          <h3>Gas Fees & Network Risks</h3>
          <p>
            All transactions you approve will incur gas fees paid to the
            underlying network. Network congestion, reorgs, failed
            transactions, and other on-chain risks are outside the control of
            DustClaim.
          </p>

          <h3>No Guarantees</h3>
          <p>
            Dust detection is best-effort. Some tokens, chains, or balances may
            not appear due to RPC limitations, indexing delays, or unsupported
            token standards. Use at your own discretion.
          </p>

          <h3>User Responsibility</h3>
          <p>
            You are responsible for verifying all transaction details, token
            approvals, and destination addresses before signing. By using
            DustClaim, you acknowledge that you use the application “as is”
            without warranties of any kind.
          </p>
        </section>
      </main>
    </div>
  );
};

export default DustClaimAddressPage;