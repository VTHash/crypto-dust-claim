import React from "react";

function EmissionsLiquidity() {
  return (
    <>
      <style>{`
      :root{
        --bg0:#05080d;
        --bg1:#070d14;
        --text:#e6edf3;
        --muted:rgba(230,237,243,.72);
        --muted2:rgba(230,237,243,.58);
        --blue:#38bdf8;
        --green:#22c55e;
        --card:rgba(255,255,255,.03);
        --line:rgba(34,197,94,.22);
        --shadowBlue: 0 0 8px rgba(56,189,248,1), 0 0 24px rgba(56,189,248,.85), 0 0 54px rgba(56,189,248,.65);
        --shadowGreen: inset 0 0 10px rgba(34,197,94,.55), 0 0 16px rgba(34,197,94,.45);
      }

      *{box-sizing:border-box}
      html,body{height:100%}
      body{
        margin:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif;
        background: radial-gradient(1200px 700px at 20% -10%, rgba(56,189,248,.12), transparent 55%),
                    radial-gradient(900px 650px at 80% 0%, rgba(34,197,94,.10), transparent 50%),
                    linear-gradient(180deg, var(--bg1), var(--bg0));
        color:var(--text);
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      a{color:inherit;text-decoration:none}
      a:focus{outline:2px solid rgba(56,189,248,.65); outline-offset:3px; border-radius:10px}

      .wrap{
        width:100%;
        max-width: 860px;
        margin: 0 auto;
        padding: 18px 14px 34px;
        padding-bottom: calc(34px + env(safe-area-inset-bottom));
      }

      /* Header */
      .topbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom: 14px;
      }
      .brand{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:0;
      }
      .logo{
        width:42px;height:42px;border-radius:14px;
        display:grid;place-items:center;
        background: rgba(255,255,255,.02);
        border: 1.5px solid rgba(56,189,248,.35);
        box-shadow: 0 0 18px rgba(56,189,248,.18);
        overflow:hidden;
        flex:0 0 auto;
      }
      .logo svg{display:block}
      .brandText{min-width:0}
      .brandTitle{
        margin:0;
        font-size: 16px;
        font-weight: 900;
        letter-spacing: .3px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        text-shadow: 0 0 12px rgba(56,189,248,.35), 0 0 10px rgba(34,197,94,.25);
      }
      .brandSub{
        margin:2px 0 0;
        font-size: 12px;
        color: var(--muted);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .btnRow{
        display:flex; gap:10px; flex:0 0 auto;
      }
      .btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(34,197,94,.28);
        background: rgba(34,197,94,.09);
        color: #baffd8;
        font-weight: 900;
        letter-spacing: .2px;
        box-shadow: var(--shadowGreen);
        user-select:none;
      }
      .btn.secondary{
        border: 1px solid rgba(56,189,248,.28);
        background: rgba(56,189,248,.08);
        color: #cfefff;
        box-shadow: 0 0 12px rgba(56,189,248,.22);
      }

      /* Card Frame */
      .card{
        position:relative;
        background: var(--card);
        border-radius: 22px;
        padding: 18px;
        border: 2px solid rgba(56,189,248,.72);
        box-shadow: var(--shadowBlue);
        overflow:hidden;
      }
      .card::before{
        content:"";
        position:absolute;
        inset: 8px;
        border-radius: 16px;
        border: 1.5px solid rgba(34,197,94,.75);
        pointer-events:none;
        box-shadow: inset 0 0 10px rgba(34,197,94,.55), 0 0 18px rgba(34,197,94,.35);
      }

      .hero{
        position:relative;
        padding: 4px 2px 10px;
      }
      .h1{
        margin: 6px 0 6px;
        font-size: 22px;
        font-weight: 950;
        letter-spacing: .35px;
        text-shadow: 0 0 14px rgba(56,189,248,.55), 0 0 12px rgba(34,197,94,.35);
      }
      .lead{
        margin:0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .pillRow{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-top: 12px;
      }
      .pill{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 900;
        color:#baffd8;
        background: rgba(34,197,94,.16);
        border: 1px solid rgba(34,197,94,.62);
        box-shadow: inset 0 0 8px rgba(34,197,94,.42), 0 0 10px rgba(34,197,94,.22);
      }
      .pill.blue{
        color:#cfefff;
        background: rgba(56,189,248,.14);
        border: 1px solid rgba(56,189,248,.55);
        box-shadow: inset 0 0 8px rgba(56,189,248,.28), 0 0 10px rgba(56,189,248,.18);
      }

      .divider{
        height:1px;
        background: linear-gradient(90deg, transparent, rgba(34,197,94,.35), rgba(56,189,248,.25), transparent);
        margin: 14px 0;
      }

      .section{
        padding: 2px 2px 0;
      }
      .h2{
        margin: 10px 0 6px;
        font-size: 15px;
        font-weight: 950;
        letter-spacing: .25px;
      }
      .p{
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.55;
        color: var(--muted);
      }

      .grid{
        display:grid;
        grid-template-columns: 1fr;
        gap: 12px;
        margin-top: 8px;
      }
      .mini{
        position:relative;
        background: rgba(255,255,255,.02);
        border: 1px solid rgba(34,197,94,.18);
        border-radius: 18px;
        padding: 14px;
      }
      .miniTitle{
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 950;
        color: rgba(230,237,243,.95);
      }
      ul{
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      li{margin: 6px 0}

      .kv{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }
      .kv:last-child{border-bottom:0}
      .k{
        color: var(--muted2);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .2px;
      }
      .v{
        color: rgba(230,237,243,.92);
        font-size: 12.5px;
        font-weight: 900;
        text-align:right;
        max-width: 60%;
      }
      .mono{
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
      }

      .faq{
        margin-top: 6px;
      }
      details{
        border: 1px solid rgba(56,189,248,.18);
        background: rgba(255,255,255,.015);
        border-radius: 16px;
        padding: 10px 12px;
        margin: 10px 0;
      }
      summary{
        cursor:pointer;
        list-style:none;
        font-weight: 950;
        font-size: 13px;
        color: rgba(230,237,243,.95);
      }
      summary::-webkit-details-marker{display:none}
      details p{
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      .footerNote{
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(34,197,94,.18);
        color: rgba(230,237,243,.65);
        font-size: 12px;
        line-height: 1.45;
      }

      /* Responsive */
      @media (min-width: 740px){
        .wrap{padding: 22px 16px 44px}
        .h1{font-size: 26px}
        .grid{grid-template-columns: 1fr 1fr}
        .card{padding: 22px}
      }

      .addressBox {
  margin: 10px 0;
  padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border-radius: 10px;
  word-break: break-all;
  font-size: 13px;
}

.explorerLink {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
  color: #38bdf8;
  text-decoration: none;
}

.explorerLink:hover {
  text-decoration: underline;
}

.mutedText {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
}
      `}</style>

      <div className="wrap">
        {/* Top bar */}
        <div className="topbar">
          <a className="brand" href="/" aria-label="Back to DustClaim home">
            <div className="logo" aria-hidden="true">
              {/* Simple broom mark (inline SVG so no asset needed) */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M15.5 4.5c1.2 1.2 1.2 3.1 0 4.3L9.7 14.6" stroke="rgba(56,189,248,.95)" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8.5 15.8l-1.7 1.7c-.6.6-.6 1.6 0 2.2l.5.5c.6.6 1.6.6 2.2 0l1.7-1.7" stroke="rgba(34,197,94,.95)" strokeWidth="2" strokeLinecap="round"/>
                <path d="M9.6 14.7l4.8 4.8" stroke="rgba(230,237,243,.7)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="brandText">
              <p className="brandTitle">DustClaim</p>
              <p className="brandSub">Emissions, Liquidity & Transparency</p>
            </div>
          </a>

          <div className="btnRow">
            <a className="btn secondary" href="https://dustclaim.eth.limo/" target="_blank" rel="noreferrer">
              Open Claim App
            </a>
            <a className="btn" href="/legal">
              Legal
            </a>
          </div>
        </div>

        {/* Main Card */}
        <div className="card">
          <div className="hero">
            <h1 className="h1">Emissions & Liquidity</h1>
            <p className="lead">
              This page explains how DUST is issued, how liquidity is seeded and expanded, and how users can verify behavior on-chain.
            </p>

            <div className="pillRow" aria-label="Key protocol properties">
              <span className="pill">Permissionless</span>
              <span className="pill">Non-custodial</span>
              <span className="pill blue">Linea</span>
              <span className="pill">On-chain rules</span>
            </div>
          </div>

          <div className="divider"></div>

          {/* Overview */}
          <section className="section" id="overview">
            <h2 className="h2">Overview</h2>
            <p className="p">
              DustClaim is deployed on Linea. DUST tokens are created only through an on-chain daily claim mechanism.
              There are no private allocations, no presales, and no discretionary mint authority. Supply grows only when users claim.
            </p>
          </section>

          <div className="card">
  <h3>Token Contract</h3>

  <div className="addressBox">
    <code>0xF312Ec9f8087C87fbF3439B0369eA233a1EE4A7D</code>
  </div>

  <a
    href="https://lineascan.build/address/0xF312Ec9f8087C87fbF3439B0369eA233a1EE4A7D"
    target="_blank"
    rel="noopener noreferrer"
    className="explorerLink"
  >
    View on Lineascan
  </a>

  <p className="mutedText">
    This is the canonical DUST ERC-20 contract on Linea. All emissions,
    claims, and liquidity reference this address.
  </p>
</div>

          {/* Emissions */}
          <section className="section" id="emissions">
            <h2 className="h2">Token Emissions</h2>

            <div className="mini">
              <p className="miniTitle">How DUST is minted</p>
              <ul>
                <li>Each eligible wallet may claim <b>5 DUST every 24 hours</b>.</li>
                <li>Tokens are minted <b>only at the moment of claim</b>.</li>
                <li>If no one claims, <b>no new tokens</b> are created.</li>
              </ul>
            </div>

            <div style={{ height: "10px" }}></div>

            <div className="mini" aria-label="Scaling examples">
              <p className="miniTitle">Emission scaling examples</p>
              <div className="kv">
                <div className="k">1,000 daily users</div>
                <div className="v">5,000 DUST/day</div>
              </div>
              <div className="kv">
                <div className="k">5,000 daily users</div>
                <div className="v">25,000 DUST/day</div>
              </div>
              <div className="kv">
                <div className="k">10,000 daily users</div>
                <div className="v">50,000 DUST/day</div>
              </div>
            </div>
          </section>

          <div className="divider"></div>

          {/* Liquidity */}
          <section className="section" id="liquidity">
            <h2 className="h2">Liquidity Design</h2>
            <p className="p">
              Liquidity is seeded conservatively to support organic price discovery. Liquidity is expanded incrementally based on objective conditions
              (usage, volume, and measurable slippage), rather than attempting to defend specific price levels.
            </p>

            <div className="grid">
              <div className="mini">
                <p className="miniTitle">Launch philosophy</p>
                <ul>
                  <li>Conservative initial liquidity to reduce distortions.</li>
                  <li>ETH-paired pools for simple routing.</li>
                  <li>No artificial price floors or reactive “defense.”</li>
                </ul>
              </div>

              <div className="mini">
                <p className="miniTitle">Non-disruptive expansion rule</p>
                <ul>
                  <li>Expand liquidity only after sustained demand is observed.</li>
                  <li>Prefer small, repeatable adds over one-time large adds.</li>
                  <li>Avoid abrupt changes that move market price materially.</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="divider"></div>

          {/* Stress / Risk */}
          <section className="section" id="stress">
            <h2 className="h2">Risk & Stress Modeling</h2>
            <p className="p">
              In a worst-case scenario where claimers sell immediately, sell pressure is time-distributed by design.
              There is no single event that releases a large lump-sum supply. Market impact depends primarily on pool depth and volume.
            </p>

            <div className="mini">
              <p className="miniTitle">What users should understand</p>
              <ul>
                <li>DUST emissions scale with real activity (daily claimers).</li>
                <li>Liquidity depth determines slippage and short-term volatility.</li>
                <li>Early markets can be volatile; conservative liquidity reduces protocol-level risk but does not remove market risk.</li>
              </ul>
            </div>
          </section>

          <div className="divider"></div>

          {/* Governance / Control */}
          <section className="section" id="control">
            <h2 className="h2">Governance & Control</h2>
            <p className="p">
              The protocol enforces distribution rules on-chain. There is no discretionary minting, no manual issuance, and no off-chain authorization layer.
            </p>

            <div className="mini">
              <p className="miniTitle">No discretionary controls</p>
              <ul>
                <li>No ability to “mint more” outside the claim function.</li>
                <li>No parameter changes required for normal operation.</li>
                <li>Users can verify issuance behavior from on-chain events.</li>
              </ul>
            </div>
          </section>

          <div className="divider"></div>

          {/* Dashboard Spec */}
          <section className="section" id="dashboard">
            <h2 className="h2">Public Transparency Dashboard (Planned)</h2>
            <p className="p">
              A read-only dashboard (no wallet connection) will visualize emissions and liquidity using on-chain data.
            </p>

            <div className="grid">
              <div className="mini">
                <p className="miniTitle">Emissions</p>
                <ul>
                  <li>Total supply</li>
                  <li>Minted (24h / 7d)</li>
                  <li>Daily active claimers</li>
                </ul>
              </div>

              <div className="mini">
                <p className="miniTitle">Liquidity</p>
                <ul>
                  <li>Liquidity per DEX / pool</li>
                  <li>Price + volume</li>
                  <li>Liquidity vs circulating supply</li>
                </ul>
              </div>
            </div>

            <div style={{ height: "12px" }}></div>

            <div className="mini">
              <p className="miniTitle">Health indicators</p>
              <ul>
                <li>Daily emissions as % of pool liquidity</li>
                <li>Emission vs liquidity trend charts</li>
                <li>Slippage observations during peak volume</li>
              </ul>
            </div>
          </section>

          <div className="divider"></div>

          {/* FAQ */}
          <section className="section" id="faq">
            <h2 className="h2">Emission & Liquidity FAQ</h2>

            <div className="faq">
              <details>
                <summary>Does the team control emissions?</summary>
                <p>
                  Emissions occur through the on-chain daily claim mechanism. Supply increases only when users claim.
                  There is no discretionary process that mints tokens outside that flow.
                </p>
              </details>

              <details>
                <summary>Why seed liquidity conservatively?</summary>
                <p>
                  Conservative seeding supports organic price discovery and reduces the risk of creating artificial price conditions early.
                  Liquidity can be expanded gradually as usage grows.
                </p>
              </details>

              <details>
                <summary>Can price still be volatile?</summary>
                <p>
                  Yes. Market price is determined by supply and demand. Early markets typically have lower liquidity and can move more sharply.
                  Liquidity depth reduces slippage but does not eliminate volatility.
                </p>
              </details>

              <details>
                <summary>How can I verify claims and supply on-chain?</summary>
                <p>
                  You can verify supply and transfer activity via Linea explorers. DUST issuance and transfers are observable from on-chain events.
                </p>
              </details>
            </div>
          </section>

          <div className="footerNote">
            <div>
              For questions and support: <b>support@dutsclaim.xyz</b>
            </div>
            <div style={{ marginTop: "6px" }}>
              Tip: For the smoothest experience, open the claim app inside MetaMask’s in-app browser.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default EmissionsLiquidity
