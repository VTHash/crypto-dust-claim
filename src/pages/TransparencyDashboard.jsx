import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import "./TransparencyDashboard.css";

/**
 * Public Transparency Dashboard (read-only, no wallet)
 *
 * IMPORTANT:
 * - We intentionally do NOT call pool-specific functions (like globalState/liquidity)
 * because some pool contracts revert on those ABI calls.
 * - Liquidity is shown using on-chain ERC20 balances held by the pool address.
 * This is robust, verifiable, and works for any AMM style.
 */

// -------------------- Public constants (NOT secrets) --------------------
const LINEA_RPC = "https://rpc.linea.build";

const DUST_ADDRESS = "0xF312Ec9f8087C87fbF3439B0369eA233a1EE4A7D";
const WETH_ADDRESS = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";

// iZUMi Analytics-confirmed pool address
const IZUMI_POOL = {
  key: "izumi",
  name: "WETH / DUST",
  address: "0x64DfC88EBD972ED35365aAA0fDACBEB4086Ee941",
  dex: "iZUMi",
  feeTier: "0.30%",
  analyticsUrl:
    "https://analytics.izumi.finance/pool?chainId=59144&poolAddress=0x64dfc88ebd972ed35365aaa0fdacbeb4086ee941",
};

// Lynex pool (your confirmed analytics/pairs address)
const LYNEX_POOL = {
  key: "lynex",
  name: "WETH / DUST",
  address: "0x45c19a6095aa8be674b51cca5d60bd28efa242c7",
  dex: "Lynex",
  feeTier: "0.01%",
  analyticsUrl:
    "https://app.lynex.fi/analytics/pairs/0x45c19a6095aa8be674b51cca5d60bd28efa242c7",
};

// ETHEREX pool
const ETHEREX_POOL = {
  key: "etherex",
  name: "WETH / DUST",
  address: "0x738b0486527eaa4443ffd5d9ca47a870387d92d9",
  dex: "Etherex",
  feeTier: "2%", // approximate; update if wrong
  analyticsUrl:
    "https://www.etherex.finance/liquidity/0x738b0486527eaa4443ffd5d9ca47a870387d92d9",
};

const POOLS = [IZUMI_POOL, LYNEX_POOL, ETHEREX_POOL];

const ZERO = "0x0000000000000000000000000000000000000000";

// -------------------- ABIs --------------------
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// -------------------- Helpers --------------------
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function shortAddr(a) {
  if (!a || a.length < 10) return a || "-";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUnitsSafe(v, decimals) {
  if (v === undefined || v === null) return "-";
  try {
    return ethers.formatUnits(v, decimals);
  } catch {
    return String(v);
  }
}

/**
 * BigInt percent formatter: (numer/denom)*100 with dp decimals
 */
function percentFromRatio(numer, denom, dp = 6) {
  if (!denom || denom === 0n) return "-";
  const scale = 10n ** BigInt(dp);
  const p = (numer * 100n * scale) / denom;
  const intPart = p / scale;
  const frac = (p % scale).toString().padStart(dp, "0");
  return `${intPart.toString()}.${frac}%`;
}

/**
 * Estimate fromBlock for multiple windows using only:
 * - getBlock("latest")
 * - getBlock(latest - sampleBack)
 */
async function estimateFromBlocks(provider, secondsBackList) {
  const latest = await provider.getBlock("latest");
  if (!latest?.number || !latest?.timestamp) {
    return {
      latestNumber: 0,
      fromBlocks: Object.fromEntries(secondsBackList.map((s) => [s, 0n])),
    };
  }

  const sampleBack = 5000;
  const sampleNumber = Math.max(0, latest.number - sampleBack);
  const sample = await provider.getBlock(sampleNumber);

  let secPerBlock = 3;
  if (sample?.timestamp) {
    const dt = Number(latest.timestamp) - Number(sample.timestamp);
    const blocks = latest.number - sample.number;
    if (dt > 0 && blocks > 0) secPerBlock = dt / blocks;
  }

  const fromBlocks = {};
  for (const secondsBack of secondsBackList) {
    const approxBlocksBack = Math.ceil(secondsBack / secPerBlock);
    const from = latest.number - approxBlocksBack;
    fromBlocks[secondsBack] = BigInt(Math.max(0, from));
  }

  return { latestNumber: latest.number, fromBlocks };
}

function Metric({ label, value }) {
  return (
    <div className="td-metric">
      <div className="td-metric-label">{label}</div>
      <div className="td-metric-value">{value}</div>
    </div>
  );
}

export default function TransparencyDashboard() {
  const navigate = useNavigate();
  const provider = useMemo(() => new ethers.JsonRpcProvider(LINEA_RPC), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [asOf, setAsOf] = useState(nowSec());
  const [tokenMeta, setTokenMeta] = useState(null);
  const [emissions, setEmissions] = useState(null);

  // poolBalancesByKey: { izumi: { poolDustBalance, poolWethBalance }, lynex: {...} }
  const [poolBalancesByKey, setPoolBalancesByKey] = useState(null);

  const [refreshNonce, setRefreshNonce] = useState(0);

  // Button styles 
  const headerBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(56,189,248,.28)",
    background: "rgba(56,189,248,.08)",
    color: "#cfefff",
    fontWeight: 900,
    letterSpacing: ".2px",
    boxShadow: "0 0 12px rgba(56,189,248,.22)",
    cursor: "pointer",
    userSelect: "none",
  };

  const softBtnStyle = {
    ...headerBtnStyle,
    border: "1px solid rgba(34,197,94,.28)",
    background: "rgba(34,197,94,.09)",
    color: "#baffd8",
    boxShadow: "inset 0 0 10px rgba(34,197,94,.25), 0 0 12px rgba(34,197,94,.18)",
  };

  const pairHeaderStyle = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 12px",
    borderRadius: 18,
    background: "rgba(255,255,255,.02)",
    border: "1px solid rgba(34,197,94,.22)",
    boxShadow: "inset 0 0 10px rgba(34,197,94,.18)",
    position: "relative",
    zIndex: 1,
  };

  const iconsWrapStyle = { position: "relative", width: 46, height: 32, flex: "0 0 auto" };
  const iconBaseStyle = {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#000",
    objectFit: "contain",
    border: "1px solid rgba(255,255,255,.18)",
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        // Sanity checks (addresses + minimal contract existence)
        if (!ethers.isAddress(DUST_ADDRESS)) throw new Error("Invalid DUST_ADDRESS.");
        if (!ethers.isAddress(WETH_ADDRESS)) throw new Error("Invalid WETH_ADDRESS.");

        for (const p of POOLS) {
          if (!ethers.isAddress(p.address)) throw new Error(`Invalid pool address for ${p.dex}.`);
        }

        // Verify pool addresses have code (prevents confusing empty results)
        // (2 calls total for 2 pools)
        const codes = await Promise.all(POOLS.map((p) => provider.getCode(p.address)));
        for (let i = 0; i < POOLS.length; i++) {
          if (!codes[i] || codes[i] === "0x") {
            throw new Error(`${POOLS[i].dex} pool address has no contract code on Linea.`);
          }
        }

        const dust = new ethers.Contract(DUST_ADDRESS, ERC20_ABI, provider);
        const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

        // 2 RPC calls: latest+sample
        const { latestNumber, fromBlocks } = await estimateFromBlocks(provider, [
          24 * 3600,
          7 * 24 * 3600,
        ]);

        const from24h = fromBlocks[24 * 3600];
        const from7d = fromBlocks[7 * 24 * 3600];

        // Parallelized token meta + supply + pool balances
        // (adds only 2 extra balanceOf calls for Lynex)
        const [
          name,
          symbol,
          decimals,
          totalSupply,
          izumiDustBal,
          izumiWethBal,
          lynexDustBal,
          lynexWethBal,
        ] = await Promise.all([
          dust.name(),
          dust.symbol(),
          dust.decimals(),
          dust.totalSupply(),
          dust.balanceOf(IZUMI_POOL.address),
          weth.balanceOf(IZUMI_POOL.address),
          dust.balanceOf(LYNEX_POOL.address),
          weth.balanceOf(LYNEX_POOL.address),
        ]);

        if (!mounted) return;

        setTokenMeta({ name, symbol, decimals: Number(decimals) });
        setAsOf(nowSec());

        setPoolBalancesByKey({
          [IZUMI_POOL.key]: {
            poolDustBalance: BigInt(izumiDustBal.toString()),
            poolWethBalance: BigInt(izumiWethBal.toString()),
          },
          [LYNEX_POOL.key]: {
            poolDustBalance: BigInt(lynexDustBal.toString()),
            poolWethBalance: BigInt(lynexWethBal.toString()),
          },
        });

        // Mint logs (2 calls) — required for emissions metrics
        const transferTopic = dust.interface.getEvent("Transfer").topicHash;

        const mintFilter24h = {
          address: DUST_ADDRESS,
          fromBlock: from24h,
          toBlock: BigInt(latestNumber),
          topics: [transferTopic, ethers.zeroPadValue(ZERO, 32)],
        };

        const mintFilter7d = {
          address: DUST_ADDRESS,
          fromBlock: from7d,
          toBlock: BigInt(latestNumber),
          topics: [transferTopic, ethers.zeroPadValue(ZERO, 32)],
        };

        const [mintLogs24h, mintLogs7d] = await Promise.all([
          provider.getLogs(mintFilter24h),
          provider.getLogs(mintFilter7d),
        ]);

        let minted24h = 0n;
        let minted7d = 0n;
        const uniqueClaimers24h = new Set();

        for (const log of mintLogs24h) {
          const parsed = dust.interface.parseLog(log);
          const to = parsed?.args?.to;
          const value = parsed?.args?.value ?? 0n;
          minted24h += BigInt(value);
          if (typeof to === "string" && ethers.isAddress(to)) uniqueClaimers24h.add(to.toLowerCase());
        }

        for (const log of mintLogs7d) {
          const parsed = dust.interface.parseLog(log);
          const value = parsed?.args?.value ?? 0n;
          minted7d += BigInt(value);
        }

        setEmissions({
          totalSupply: BigInt(totalSupply.toString()),
          minted24h,
          minted7d,
          dailyActiveClaimers: uniqueClaimers24h.size,
        });
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load transparency dashboard.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [provider, refreshNonce]);

  const decimals = tokenMeta?.decimals ?? 18;

  const healthByPool = useMemo(() => {
    if (!emissions || !poolBalancesByKey) return null;

    const out = {};
    for (const p of POOLS) {
      const b = poolBalancesByKey[p.key];
      if (!b) continue;

      out[p.key] = {
        poolDustPctOfSupply: percentFromRatio(b.poolDustBalance, emissions.totalSupply, 6),
        dailyEmissionsVsPoolDust: percentFromRatio(emissions.minted24h, b.poolDustBalance, 6),
      };
    }
    return out;
  }, [emissions, poolBalancesByKey]);

  function PoolBlock({ pool }) {
    const b = poolBalancesByKey?.[pool.key];
    const h = healthByPool?.[pool.key];

    return (
      <>
        {/* Pair header with logos (same design for both pools) */}
        <div style={pairHeaderStyle}>
          <div style={iconsWrapStyle}>
            <img
              src="/logo/weth.png"
              alt="WETH"
              style={{
                ...iconBaseStyle,
                position: "absolute",
                left: 0,
                top: 2,
                zIndex: 1,
                boxShadow: "0 0 8px rgba(56,189,248,.35)",
              }}
            />
            <img
              src="/logo/dustclaim.png"
              alt="DUST"
              style={{
                ...iconBaseStyle,
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: 2,
                boxShadow: "0 0 10px rgba(34,197,94,.45), inset 0 0 6px rgba(34,197,94,.35)",
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 950,
                letterSpacing: ".3px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              WETH <span style={{ opacity: 0.5 }}>/</span> DUST
              <span
                style={{
                  marginLeft: 6,
                  padding: "2px 7px",
                  fontSize: 11,
                  fontWeight: 900,
                  borderRadius: 999,
                  color: "#cfefff",
                  background: "rgba(56,189,248,.14)",
                  border: "1px solid rgba(56,189,248,.45)",
                }}
              >
                {pool.feeTier}
              </span>
              <span
                style={{
                  padding: "2px 7px",
                  fontSize: 11,
                  fontWeight: 900,
                  borderRadius: 999,
                  color: "#baffd8",
                  background: "rgba(34,197,94,.14)",
                  border: "1px solid rgba(34,197,94,.40)",
                }}
              >
                {pool.dex}
              </span>
            </div>

            <div style={{ marginTop: 2, fontSize: 12, color: "var(--muted)" }}>
              {pool.dex} • Linea • Pool balances view
            </div>
          </div>
        </div>

        <div className="divider" />

        {b ? (
          <>
            <div className="td-grid">
              <Metric
                label="Pool DUST balance (on-chain)"
                value={`${formatUnitsSafe(b.poolDustBalance, 18)} DUST`}
              />
              <Metric
                label="Pool WETH balance (on-chain)"
                value={`${formatUnitsSafe(b.poolWethBalance, 18)} WETH`}
              />
              <Metric label="Pool contract" value={shortAddr(pool.address)} />
              <Metric
                label="Analytics"
                value={
                  <a className="explorerLink" href={pool.analyticsUrl} target="_blank" rel="noreferrer">
                    View on {pool.dex} Analytics
                  </a>
                }
              />
            </div>

            <div className="divider" />

            <h2 className="td-h2" style={{ marginTop: 2 }}>
              Health indicators (proxy)
            </h2>

            <div className="td-grid">
              <Metric label="Pool DUST vs total supply" value={h?.poolDustPctOfSupply ?? "-"} />
              <Metric label="Daily emissions as % of pool DUST" value={h?.dailyEmissionsVsPoolDust ?? "-"} />
            </div>
          </>
        ) : (
          <div className="td-muted">Pool balances unavailable.</div>
        )}
      </>
    );
  }

  return (
    <div className="td-wrap">
      <div className="td-header">
        <div>
          <h1 className="td-title">Public Transparency Dashboard</h1>
          <div className="td-sub">Read-only on-chain analytics (Linea). No wallet connection.</div>
          <div className="td-sub">
            Token: <code>{shortAddr(DUST_ADDRESS)}</code>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button style={headerBtnStyle} onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
          <button style={softBtnStyle} onClick={() => setRefreshNonce((n) => n + 1)} disabled={loading}>
            Refresh
          </button>
          <div className="td-asof">As of: {new Date(asOf * 1000).toLocaleString()}</div>
        </div>
      </div>

      {err && (
        <div className="td-error">
          <strong>Error:</strong> {err}
        </div>
      )}

      {loading && <div className="td-loading">Loading on-chain data…</div>}

      {!loading && tokenMeta && emissions && (
        <>
          {/* Emissions */}
          <section className="td-card">
            <h2 className="td-h2">Emissions</h2>

            <div className="td-grid">
              <Metric
                label="Total supply"
                value={`${formatUnitsSafe(emissions.totalSupply, decimals)} ${tokenMeta.symbol}`}
              />
              <Metric
                label="Minted (24h)"
                value={`${formatUnitsSafe(emissions.minted24h, decimals)} ${tokenMeta.symbol}`}
              />
              <Metric
                label="Minted (7d)"
                value={`${formatUnitsSafe(emissions.minted7d, decimals)} ${tokenMeta.symbol}`}
              />
              <Metric label="Daily active claimers (24h)" value={`${emissions.dailyActiveClaimers}`} />
            </div>

            <div className="td-note">
              “Minted” is computed from ERC20 <code>Transfer</code> events where <code>from</code> is <code>0x0</code>.
            </div>
          </section>

          {/* Liquidity both pools */}
          <section className="td-card">
            <h2 className="td-h2">Liquidity</h2>

            <PoolBlock pool={IZUMI_POOL} />

            <div className="divider" style={{ margin: "16px 0" }} />

            <PoolBlock pool={LYNEX_POOL} />
          </section>
        </>
      )}
    </div>
  );
}
