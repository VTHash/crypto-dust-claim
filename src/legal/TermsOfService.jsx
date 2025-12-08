export default function TermsOfService() {
  return (
    <div className="legal-page">
      <h1>Terms of Service</h1>
      <p><strong>Last Updated:</strong> December 2025</p>

      <h2>1. Introduction</h2>
      <p>
        Welcome to DustClaim (“DustClaim”, “we”, “our”, “the Platform”). These Terms 
        govern your access to and use of our non-custodial dust aggregation and claim interface.
        By accessing the Platform, you agree to abide by these Terms. If you disagree, you must 
        discontinue use immediately.
      </p>

      <h2>2. Non-Custodial Nature</h2>
      <p>
        DustClaim does not hold private keys, custody funds, or control user wallets. 
        All transactions occur directly on-chain via user-initiated signatures.
      </p>

      <h2>3. DEX Aggregation</h2>
      <p>
        DustClaim sources routing and pricing from decentralized exchanges and third-party 
        aggregators. We do not guarantee execution quality, finality, or liquidity availability.
      </p>

      <h2>4. No Financial Advice</h2>
      <p>
        Nothing provided by DustClaim constitutes investment, legal, or tax advice. 
        Use of digital assets carries risk.
      </p>

      <h2>5. User Responsibilities</h2>
      <ul>
        <li>Maintaining control of private keys and wallet security</li>
        <li>Verifying all transaction details before signing</li>
        <li>Complying with applicable laws and restrictions</li>
      </ul>

      <h2>6. Limitation of Liability</h2>
      <p>
        DustClaim is provided “as is” without warranties. We are not liable for any loss 
        including but not limited to gas fees, failed transactions, smart contract bugs, 
        slippage, or lost funds.
      </p>

      <h2>7. Amendments</h2>
      <p>We may update these Terms at any time. Continued use indicates acceptance.</p>
    </div>
  );
}