export default function LegalDisclaimers() {
  return (
    <div className="legal-page">
      <h1>Legal Disclaimers</h1>
      <p><strong>Last Updated:</strong> December 2025</p>

      <h2>1. Non-Custodial Disclaimer</h2>
      <p>
        DustClaim never controls user assets, private keys, or transactions. 
        All actions are executed directly through user wallets.
      </p>

      <h2>2. Smart Contract Disclaimer</h2>
      <p>
        Interacting with smart contracts carries inherent risk including bugs, 
        exploits, and unexpected behavior. Use at your own risk.
      </p>

      <h2>3. DEX Aggregation Disclaimer</h2>
      <p>
        Pricing, routing, and liquidity come from external decentralized exchanges 
        and aggregators. DustClaim does not guarantee execution quality or outcome.
      </p>

      <h2>4. No Financial Advice</h2>
      <p>
        DustClaim provides no investment, tax, or legal advice. Digital assets 
        may be volatile and may result in total loss.
      </p>

      <h2>5. No Liability</h2>
      <p>
        DustClaim is provided “as is”. We are not liable for losses, gas fees, 
        failed transactions, or smart contract vulnerabilities.
      </p>
    </div>
  );
}