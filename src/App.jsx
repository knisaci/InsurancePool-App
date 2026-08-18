import { useState, useEffect } from 'react'
import { createClient } from 'genlayer-js'
import { testnetBradbury } from 'genlayer-js/chains'
import './App.css'

const CONTRACT = '0x1913bE0df2Ffa71e42623ae74833b06B5a990DeE'

const readClient = createClient({ chain: testnetBradbury })

function App() {
  const [account, setAccount] = useState(null)
  const [pool, setPool] = useState(null)
  const [claim, setClaim] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  // Form state for opening a claim
  const [flightNumber, setFlightNumber] = useState('BA287')
  const [flightDate, setFlightDate] = useState('2026-08-18')
  const [threshold, setThreshold] = useState('180')
  const [statusUrl, setStatusUrl] = useState('https://www.flightaware.com/live/flight/BAW287')
  const [payoutAmount, setPayoutAmount] = useState('1')
  const [depositAmount, setDepositAmount] = useState('1')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      const stats = await readClient.readContract({
        address: CONTRACT,
        functionName: 'get_pool_stats',
        args: [],
      })
      setPool(stats)

      const c = await readClient.readContract({
        address: CONTRACT,
        functionName: 'get_claim',
        args: [],
      })
      setClaim(c?.error ? null : c)
    } catch (e) {
      console.error(e)
    }
  }

  async function connect() {
    if (!window.ethereum) return alert('Install MetaMask')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setAccount(accounts[0])
  }

  function getWriteClient() {
    return createClient({
      chain: testnetBradbury,
      account,
      provider: window.ethereum,
    })
  }

  async function doDeposit() {
    if (!account) return alert('Connect wallet first')
    setLoading(true)
    setStatus('Depositing…')
    try {
      const client = getWriteClient()
      try { await client.connect('testnetBradbury') } catch {}
      const value = BigInt(Math.floor(Number(depositAmount) * 1e18))
      const tx = await client.writeContract({
        address: CONTRACT,
        functionName: 'deposit',
        args: [],
        value,
      })
      setStatus(`Deposit sent: ${tx.slice(0, 12)}…`)
      setTimeout(() => { loadAll(); setLoading(false); setStatus('Deposit complete') }, 20000)
    } catch (e) {
      setStatus('Error: ' + (e.message || 'failed'))
      setLoading(false)
    }
  }

  async function doOpenClaim() {
    if (!account) return alert('Connect wallet first')
    setLoading(true)
    setStatus('Opening claim…')
    try {
      const client = getWriteClient()
      try { await client.connect('testnetBradbury') } catch {}
      const payoutWei = BigInt(Math.floor(Number(payoutAmount) * 1e18))
      const tx = await client.writeContract({
        address: CONTRACT,
        functionName: 'open_claim',
        args: [flightNumber, flightDate, Number(threshold), statusUrl, Number(payoutWei)],
        value: 0n,
      })
      setStatus(`Claim opened: ${tx.slice(0, 12)}…`)
      setTimeout(() => { loadAll(); setLoading(false); setStatus('Claim opened') }, 25000)
    } catch (e) {
      setStatus('Error: ' + (e.message || 'failed'))
      setLoading(false)
    }
  }

  async function doResolve() {
    if (!account) return alert('Connect wallet first')
    setLoading(true)
    setStatus('Resolving… AI consensus running (30–90s)')
    try {
      const client = getWriteClient()
      try { await client.connect('testnetBradbury') } catch {}
      const tx = await client.writeContract({
        address: CONTRACT,
        functionName: 'resolve_claim',
        args: [],
        value: 0n,
      })
      setStatus(`Resolve sent: ${tx.slice(0, 12)}… waiting for consensus`)
      setTimeout(() => { loadAll(); setLoading(false); setStatus('Resolution complete') }, 75000)
    } catch (e) {
      setStatus('Error: ' + (e.message || 'failed'))
      setLoading(false)
    }
  }

  const statusClass = claim?.status === 'approved' ? 'approved' :
                      claim?.status === 'rejected' ? 'rejected' : 'open'

  return (
    <div className="app">
      <div className="glow"></div>

      <header>
        <div className="badge">GenLayer × Insurance</div>
        <h1>Flight Delay Pool</h1>
        <p className="sub">Parametric insurance powered by AI consensus</p>
      </header>

      {/* Pool Stats */}
      <section className="card stats">
        <h2>Pool</h2>
        <div className="stats-grid">
          <div>
            <span>Total Deposits</span>
            <strong>{pool ? (Number(pool.total_deposits) / 1e18).toFixed(2) : '—'} GEN</strong>
          </div>
          <div>
            <span>Total Paid</span>
            <strong>{pool ? (Number(pool.total_paid) / 1e18).toFixed(2) : '—'} GEN</strong>
          </div>
          <div>
            <span>Pool Balance</span>
            <strong className="highlight">{pool ? (Number(pool.pool_balance) / 1e18).toFixed(2) : '—'} GEN</strong>
          </div>
          <div>
            <span>Claims</span>
            <strong>{pool?.claim_count ?? '—'}</strong>
          </div>
        </div>
      </section>

      {/* Current Claim */}
      <section className="card">
        <div className="card-head">
          <h2>Current Claim</h2>
          {claim && (
            <span className={`pill ${statusClass}`}>{claim.status}</span>
          )}
        </div>

        {!claim ? (
          <p className="muted">No active claim. Open one below.</p>
        ) : (
          <div className="claim-grid">
            <div><span>Flight</span><strong>{claim.flight_number}</strong></div>
            <div><span>Date</span><strong>{claim.flight_date}</strong></div>
            <div><span>Threshold</span><strong>{claim.delay_threshold_minutes} min</strong></div>
            <div><span>Payout</span><strong>{(Number(claim.payout_amount) / 1e18).toFixed(2)} GEN</strong></div>
            <div><span>Flight Status</span><strong>{claim.flight_status || '—'}</strong></div>
            <div><span>Delay</span><strong>{claim.delay_minutes} min</strong></div>
            <div><span>Resolved</span><strong>{claim.has_resolved ? 'Yes' : 'No'}</strong></div>
            <div><span>Paid</span><strong>{claim.is_paid ? 'Yes' : 'No'}</strong></div>
            {claim.resolution_note && (
              <div className="full"><span>Note</span><strong className="note">{claim.resolution_note}</strong></div>
            )}
          </div>
        )}
      </section>

      {/* Actions */}
      <section className="card">
        <h2>Actions</h2>

        {!account ? (
          <button className="btn primary" onClick={connect}>Connect Wallet</button>
        ) : (
          <>
            <p className="wallet">Connected · {account.slice(0, 6)}…{account.slice(-4)}</p>

            {/* Deposit */}
            <div className="action-block">
              <h3>Deposit Capital</h3>
              <div className="row">
                <input
                  type="number"
                  step="0.1"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  placeholder="GEN amount"
                />
                <button className="btn" onClick={doDeposit} disabled={loading}>Deposit</button>
              </div>
            </div>

            {/* Open Claim */}
            <div className="action-block">
              <h3>Open Claim</h3>
              <div className="form-grid">
                <input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="Flight number" />
                <input value={flightDate} onChange={e => setFlightDate(e.target.value)} placeholder="YYYY-MM-DD" />
                <input value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold (min)" />
                <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} placeholder="Payout (GEN)" />
                <input className="full" value={statusUrl} onChange={e => setStatusUrl(e.target.value)} placeholder="Status URL" />
              </div>
              <button className="btn primary" onClick={doOpenClaim} disabled={loading || (claim && !claim.has_resolved)}>
                Open Claim
              </button>
            </div>

            {/* Resolve */}
            {claim && !claim.has_resolved && (
              <div className="action-block">
                <h3>Resolve Claim</h3>
                <p className="hint">AI validators will fetch live flight data and reach consensus.</p>
                <button className="btn primary" onClick={doResolve} disabled={loading}>
                  {loading ? 'Resolving…' : 'Resolve with AI Consensus'}
                </button>
              </div>
            )}
          </>
        )}

        {status && <p className="status">{status}</p>}
      </section>

      <footer>
        <div>Contract · {CONTRACT}</div>
        <div>Testnet Bradbury</div>
      </footer>
    </div>
  )
}

export default App
