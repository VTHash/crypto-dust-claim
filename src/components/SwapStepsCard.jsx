import React, { useMemo } from 'react'
import '../styles/SwapStepsCard.css'

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

const statusLabel = (s) => {
  if (s === 'confirmed') return 'Done'
  if (s === 'failed') return 'Failed'
  if (s === 'submitted') return 'Submitted'
  return 'Pending'
}

function StepDot({ status }) {
  const cls =
    status === 'confirmed'
      ? 'stepDot ok'
      : status === 'failed'
      ? 'stepDot bad'
      : status === 'submitted'
      ? 'stepDot live'
      : 'stepDot'
  return <div className={cls} />
}

function TxLink({ chainId, hash }) {
  if (!hash) return null

  const explorer =
    Number(chainId) === 1
      ? 'https://etherscan.io/tx/'
      : Number(chainId) === 8453
      ? 'https://basescan.org/tx/'
      : Number(chainId) === 10
      ? 'https://optimistic.etherscan.io/tx/'
      : null

  if (!explorer) return <span className="txHash">{shortAddr(hash)}</span>

  return (
    <a className="txLink" href={`${explorer}${hash}`} target="_blank" rel="noreferrer">
      View · {shortAddr(hash)}
    </a>
  )
}

export default function SwapStepsCard({ title = 'Swap', subtitle = 'Via DustClaimV3 / 0x', txs = [] }) {
  const rows = useMemo(() => {
    const kindOrder = { approval: 0, swap: 1, unknown: 2 }
    return [...txs].sort((a, b) => {
      const ta = Number(a.createdAt || 0)
      const tb = Number(b.createdAt || 0)
      if (ta !== tb) return ta - tb
      return (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
    })
  }, [txs])

  const flowStatus = useMemo(() => {
    if (!rows.length) return 'created'
    if (rows.some((t) => t.status === 'failed')) return 'failed'
    if (rows.every((t) => t.status === 'confirmed')) return 'confirmed'
    if (rows.some((t) => t.status === 'submitted')) return 'submitted'
    return 'created'
  }, [rows])

  const chainId = rows?.[0]?.chainId ?? null
  const from = rows?.[0]?.from ?? null

  return (
    <div className="stepsCard">
      <div className="stepsHeader">
        <div className="stepsHeaderTop">
          <div className="stepsTitle">{title}</div>
          <div className={`stepsBadge ${flowStatus}`}>{statusLabel(flowStatus)}</div>
        </div>

        <div className="stepsSub">
          <span>{subtitle}</span>
          {chainId ? <span className="dotSep">•</span> : null}
          {chainId ? <span>Chain {chainId}</span> : null}
          {from ? <span className="dotSep">•</span> : null}
          {from ? <span>{shortAddr(from)}</span> : null}
        </div>
      </div>

      <div className="stepsBody">
        {rows.length === 0 ? (
          <div className="stepsEmpty">No steps yet.</div>
        ) : (
          rows.map((t) => {
            const label =
              t.kind === 'approval'
                ? `Approve ${shortAddr(t.tokenAddress)}`
                : t.kind === 'swap'
                ? `Swap ${shortAddr(t.tokenAddress)} → Native`
                : 'Transaction'

            const hint =
              t.kind === 'approval'
                ? `Spender ${shortAddr(t.spender)}`
                : t.kind === 'swap'
                ? `Router ${shortAddr(t.spender)}`
                : ''

            return (
              <div className="stepRow" key={t.id}>
                <StepDot status={t.status} />

                <div className="stepMain">
                  <div className="stepLabel">{label}</div>
                  <div className="stepHint">{hint}</div>

                  {t.status === 'created' ? (
                    <div className="stepMeta">Waiting for wallet confirmation…</div>
                  ) : null}

                  {t.status === 'submitted' && !t.hash ? (
                    <div className="stepMeta">Submitted (hash pending)…</div>
                  ) : null}

                  {t.lastError ? <div className="stepMeta">Error: {t.lastError}</div> : null}
                </div>

                <div className="stepRight">
                  <div className={`stepState ${t.status}`}>{statusLabel(t.status)}</div>
                  <TxLink chainId={t.chainId} hash={t.hash} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
