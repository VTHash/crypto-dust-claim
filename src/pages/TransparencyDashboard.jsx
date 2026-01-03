import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import'./TransparencyDashboard.css';
/**
 * Public Transparency Dashboard (read-only, no wallet)
 * - No .env usage (public constants only)
 * - Optimized RPC load:
 * - Single latest block fetch + one sample block fetch for block-time estimate
 * - Parallelized contract reads
 * - Swap-volume logs are fetched only when the user clicks "Load 24h Volume"
 * - Safer math:
 * - Avoid Number(BigInt) for supply/ratios
 * - Price computed using BigInt fixed-point (WAD = 1e18)
 */

// -------------------- Public constants (NOT secrets) --------------------
const LINEA_RPC = "https://rpc.linea.build";

const DUST_ADDRESS = "0xF312Ec9f8087C87fbF3439B0369eA233a1EE4A7D";
const WETH_ADDRESS = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";

const IZUMI_POOL = {
  name: "WETH / DUST",
  address: "0x64DfC88EBD972ED35365aAA0fDACBEB4086Ee941",
  dex: "iZUMi",
  feeTier: "0.30%",
  type: "ALGEBRA",
};

const ZERO = "0x0000000000000000000000000000000000000000";
const WAD = 10n ** 18n;

// -------------------- ABIs --------------------
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const ALGEBRA_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
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

function absBigInt(x) {
  return x < 0n ? -x : x;
}

/**
 * BigInt percent formatter:
 * returns "12.345678%" with `dp` decimals
 */
function percentFromRatio(numer, denom, dp = 6) {
  if (denom === 0n) return "-";
  const scale = 10n ** BigInt(dp);
  // percent = (numer/denom)*100
  const p = (numer * 100n * scale) / denom; // scaled percent
  const intPart = p / scale;
  const frac = (p % scale).toString().padStart(dp, "0");
  return `${intPart.toString()}.${frac}%`;
}

/**
 * Compute price as WAD-scaled using sqrtPriceX96:
 * price(token1 per token0) = (sqrtP^2 / 2^192)
 * Return WAD-scaled (1e18) value: priceWad = price * 1e18
 *
 * Using BigInt avoids overflow from Number(sqrtP^2).
 */
function priceWadFromSqrtPriceX96(sqrtPriceX96) {
  const sp = BigInt(sqrtPriceX96);
  const numerator = sp * sp * WAD; // scale
  const denom = 2n ** 192n;
  if (denom === 0n) return 0n;
  return numerator / denom; // WAD-scaled
}

/**
 * Invert WAD price: invWad = (1e18*1e18)/priceWad
 */
function invertWad(priceWad) {
  if (priceWad === 0n) return 0n;
  return (WAD * WAD) / priceWad;
}

/**
 * Estimate blocks for multiple windows using ONE latest + ONE sample block.
 * Returns { secPerBlock, fromBlocks: { [secondsBack]: fromBlockBigInt } }
 */
async function estimateFromBlocks(provider, secondsBackList) {
  const latest = await provider.getBlock("latest");
  if (!latest?.number || !latest?.timestamp) {
    return {
      secPerBlock: 3,
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

  return {
    secPerBlock,
    latestNumber: latest.number,
    fromBlocks,
  };
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
  const [poolState, setPoolState] = useState(null);

  // Optional: on-demand volume loading (reduces RPC load)
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volume24h, setVolume24h] = useState(null);

  // Manual refresh (no auto polling)
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Inline header button styles (works with your existing theme even if btn classes differ)
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

  // Pair header styles (logos)
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
    zIndex: 1, // above td-card ::before
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

  // Main load: emissions + pool balances + price state (no swap logs)
  useEffect(() => {
    let mounted = true;

    async function loadCore() {
      setLoading(true);
      setErr("");
      setVolume24h(null);

      try {
        // Sanity checks
        if (!ethers.isAddress(DUST_ADDRESS)) throw new Error("Invalid DUST_ADDRESS constant.");
        if (!ethers.isAddress(WETH_ADDRESS)) throw new Error("Invalid WETH_ADDRESS constant.");
        if (!ethers.isAddress(IZUMI_POOL.address)) throw new Error("Invalid iZUMi pool address constant.");

        const dust = new ethers.Contract(DUST_ADDRESS, ERC20_ABI, provider);
        const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);
        const pool = new ethers.Contract(IZUMI_POOL.address, ALGEBRA_POOL_ABI, provider);

        // Estimate windows with 2 RPC calls total: latest + sample
        const { latestNumber, fromBlocks } = await estimateFromBlocks(provider, [
          24 * 3600,
          7 * 24 * 3600,
        ]);

        const from24h = fromBlocks[24 * 3600];
        const from7d = fromBlocks[7 * 24 * 3600];

        // Parallelize core reads
        const [
          name,
          symbol,
          decimals,
          totalSupply,
          token0,
          token1,
          gs,
          liq,
          poolDustBal,
          poolWethBal,
        ] = await Promise.all([
          dust.name(),
          dust.symbol(),
          dust.decimals(),
          dust.totalSupply(),
          pool.token0(),
          pool.token1(),
          pool.globalState(),
          pool.liquidity(),
          dust.balanceOf(IZUMI_POOL.address),
          weth.balanceOf(IZUMI_POOL.address),
        ]);

        if (!mounted) return;

        setTokenMeta({ name, symbol, decimals: Number(decimals) });
        setAsOf(nowSec());

        // Emissions: getLogs (mint transfers)
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

        // These two are the “heaviest” calls besides swap logs, but required for your metrics.
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

        // Price math (BigInt-safe)
        const sqrtPriceX96 = BigInt(gs.price.toString());
        const priceToken1PerToken0Wad = priceWadFromSqrtPriceX96(sqrtPriceX96); // WAD
        const priceToken0PerToken1Wad = invertWad(priceToken1PerToken0Wad); // WAD

        // Map to WETH/DUST semantics
        const t0 = String(token0).toLowerCase();
        const t1 = String(token1).toLowerCase();
        const isT0Weth = t0 === WETH_ADDRESS.toLowerCase();
        const isT1Weth = t1 === WETH_ADDRESS.toLowerCase();
        const isT0Dust = t0 === DUST_ADDRESS.toLowerCase();
        const isT1Dust = t1 === DUST_ADDRESS.toLowerCase();

        // If token0=WETH token1=DUST => priceToken1PerToken0 = DUST per WETH
        // Else if token0=DUST token1=WETH => priceToken1PerToken0 = WETH per DUST
        let dustPerWethWad = 0n;
        let wethPerDustWad = 0n;

        if (isT0Weth && isT1Dust) {
          dustPerWethWad = priceToken1PerToken0Wad;
          wethPerDustWad = priceToken0PerToken1Wad;
        } else if (isT0Dust && isT1Weth) {
          wethPerDustWad = priceToken1PerToken0Wad;
          dustPerWethWad = priceToken0PerToken1Wad;
        }

        if (!mounted) return;

        setEmissions({
          totalSupply: BigInt(totalSupply.toString()),
          minted24h,
          minted7d,
          dailyActiveClaimers: uniqueClaimers24h.size,
          latestBlock: latestNumber,
          from24h,
        });

        setPoolState({
          ...IZUMI_POOL,
          token0,
          token1,
          liquidityActive: BigInt(liq.toString()),
          sqrtPriceX96,
          tick: gs.tick,
          fee: gs.fee,
          unlocked: gs.unlocked,
          poolDustBalance: BigInt(poolDustBal.toString()),
          poolWethBalance: BigInt(poolWethBal.toString()),
          // WAD-scaled prices
          dustPerWethWad,
          wethPerDustWad,
          isT0Weth,
          isT1Weth,
          isT0Dust,
          isT1Dust,
        });
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load transparency dashboard.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadCore();
    return () => {
      mounted = false;
    };
  }, [provider, refreshNonce]);

  // On-demand: load swap volume logs (heavy) only when user asks
  async function load24hVolume() {
    if (!emissions) return;

    setVolumeLoading(true);
    setErr("");

    try {
      const pool = new ethers.Contract(IZUMI_POOL.address, ALGEBRA_POOL_ABI, provider);
      const swapTopic = pool.interface.getEvent("Swap").topicHash;

      const swapLogs = await provider.getLogs({
        address: IZUMI_POOL.address,
        fromBlock: emissions.from24h,
        toBlock: BigInt(emissions.latestBlock),
        topics: [swapTopic],
      });

      let vol0 = 0n;
      let vol1 = 0n;

      for (const log of swapLogs) {
        const parsed = pool.interface.parseLog(log);
        const amt0 = BigInt(parsed.args.amount0 ?? 0n);
        const amt1 = BigInt(parsed.args.amount1 ?? 0n);
        vol0 += absBigInt(amt0);
        vol1 += absBigInt(amt1);
      }

      setVolume24h({ vol0, vol1, swaps: swapLogs.length });
    } catch (e) {
      setErr(e?.message || "Failed to load 24h volume.");
    } finally {
      setVolumeLoading(false);
    }
  }

  const decimals = tokenMeta?.decimals ?? 18;

  // Health indicators (BigInt-safe ratios)
  const health = useMemo(() => {
    if (!emissions || !poolState) return null;

    const supply = emissions.totalSupply;
    const poolDust = poolState.poolDustBalance;
    const daily = emissions.minted24h;

    return {
      poolDustPctOfSupply: percentFromRatio(poolDust, supply, 6), // poolDust / supply
      dailyEmissionsVsPoolDust: percentFromRatio(daily, poolDust, 6), // minted24h / poolDust
    };
  }, [emissions, poolState]);

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

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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

          {/* Liquidity */}
          <section className="td-card">
            <h2 className="td-h2">Liquidity</h2>

            {/* Pair header with logos */}
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
                <div style={{ fontSize: 14, fontWeight: 950, letterSpacing: ".3px", display: "flex", alignItems: "center", gap: 6 }}>
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
                    {IZUMI_POOL.feeTier}
                  </span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: "var(--muted)" }}>
                  {IZUMI_POOL.dex} • Linea • Concentrated Liquidity
                </div>
              </div>
            </div>

            <div className="divider" />

            {poolState ? (
              <>
                <div className="td-grid">
                  <Metric
                    label="Pool DUST balance (on-chain)"
                    value={`${formatUnitsSafe(poolState.poolDustBalance, 18)} DUST`}
                  />
                  <Metric
                    label="Pool WETH balance (on-chain)"
                    value={`${formatUnitsSafe(poolState.poolWethBalance, 18)} WETH`}
                  />
                  <Metric
                    label="Active CL liquidity (Algebra)"
                    value={poolState.liquidityActive.toString()}
                  />
                  <Metric
                    label="Spot price"
                    value={
                      poolState.dustPerWethWad > 0n && poolState.wethPerDustWad > 0n
                        ? `1 WETH ≈ ${formatUnitsSafe(poolState.dustPerWethWad, 18)} DUST • 1 DUST ≈ ${formatUnitsSafe(poolState.wethPerDustWad, 18)} WETH`
                        : "Unavailable (unexpected token ordering)"
                    }
                  />
                </div>

                <div className="divider" />

                {/* Volume is heavy: load on demand */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    style={headerBtnStyle}
                    onClick={load24hVolume}
                    disabled={volumeLoading}
                    title="Fetch Swap logs for last 24h (heavier RPC call)"
                  >
                    {volumeLoading ? "Loading 24h Volume…" : "Load 24h Volume"}
                  </button>

                  <div className="td-muted" style={{ fontSize: 12 }}>
                    This call indexes Swap logs and is intentionally manual to reduce RPC load.
                  </div>
                </div>

                {volume24h && (
                  <div className="td-grid" style={{ marginTop: 12 }}>
                    <Metric label="24h swaps (count)" value={`${volume24h.swaps}`} />
                    <Metric label="24h volume (token0 raw)" value={volume24h.vol0.toString()} />
                    <Metric label="24h volume (token1 raw)" value={volume24h.vol1.toString()} />
                    <Metric label="Pool contract" value={shortAddr(poolState.address)} />
                  </div>
                )}

                <div className="td-note">
                  For CL pools, “TVL” can drop if price moves outside LP ranges. Pool token balances remain the most
                  straightforward on-chain liquidity view for a public dashboard.
                </div>
              </>
            ) : (
              <div className="td-muted">Pool data unavailable.</div>
            )}
          </section>

          {/* Health indicators */}
          <section className="td-card">
            <h2 className="td-h2">Health indicators</h2>

            <div className="td-grid">
              <Metric
                label="Pool DUST vs total supply (proxy)"
                value={health?.poolDustPctOfSupply ?? "-"}
              />
              <Metric
                label="Daily emissions as % of pool DUST (proxy)"
                value={health?.dailyEmissionsVsPoolDust ?? "-"}
              />
              <Metric
                label="Emission vs liquidity trend charts"
                value="Planned: store daily snapshots (or index logs server-side) for charts."
              />
              <Metric
                label="Slippage observations during peak volume"
                value="Planned: compute per-swap price impact from Swap logs (best server-side)."
              />
            </div>

            <div className="td-note">
              Ratios are computed using BigInt fixed-point math (no unsafe float conversions). For production-grade USD TVL,
              volume normalization, and slippage, add a lightweight indexer or subgraph-backed API.
            </div>
          </section>
        </>
      )}
    </div>
  );
}