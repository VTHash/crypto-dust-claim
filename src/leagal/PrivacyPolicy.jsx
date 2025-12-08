export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <h1>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> December 2025</p>

      <h2>1. Introduction</h2>
      <p>
        DustClaim (“we”, “our”, “us”) is committed to protecting your privacy. 
        This GDPR-compliant Privacy Policy explains what data we process, why, and how.
      </p>

      <h2>2. Data Controller</h2>
      <p>
        The Data Controller for GDPR purposes is the DustClaim project team, operating 
        as a non-custodial decentralized software provider.
      </p>

      <h2>3. Data We Collect</h2>
      <ul>
        <li>Basic site analytics (anonymized)</li>
        <li>IP address (minimized & anonymized where possible)</li>
        <li>Browser and device metadata</li>
        <li>Wallet address only when connecting (DustClaim stores none of this off-chain)</li>
      </ul>

      <h2>4. Lawful Basis</h2>
      <ul>
        <li>Legitimate interest — security, fraud prevention, site operation</li>
        <li>Consent — cookie preferences, optional communications</li>
      </ul>

      <h2>5. How We Use Data</h2>
      <p> We only store onClick visits for Global statistics only.
        To operate the interface, diagnose issues, improve performance, and ensure security. 
        DustClaim does <strong>not</strong> sell, rent, or share any personal data.
      </p>

      <h2>6. Blockchain Data</h2>
      <p>
        All wallet interactions occur entirely on-chain. Blockchain data is public and cannot 
        be altered or deleted under GDPR due to its immutable nature.
      </p>

      <h2>7. International Transfers</h2>
      <p>
        Data may be processed in non-EU jurisdictions with appropriate safeguards.
      </p>

      <h2>8. GDPR Rights</h2>
      <ul>
        <li>Access</li>
        <li>Correction</li>
        <li>Deletion (where technically possible)</li>
        <li>Objection</li>
        <li>Portability</li>
        <li>Withdraw consent</li>
      </ul>

      <h2>9. Contact</h2>
      <p>For GDPR requests: support@dustclaim.io</p>
    </div>
  );
}