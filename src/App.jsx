import { useState, useEffect } from 'react'
import { createClient } from 'genlayer-js'
import { testnetBradbury } from 'genlayer-js/chains'
import './App.css'

const CONTRACT = '0xcD6eF8FD01D5D1b138746aA2A1f64d5c8487fEEf'
const readClient = createClient({ chain: testnetBradbury })

function App() {
  const [account, setAccount] = useState(null)
  const [pool, setPool] = useState(null)
  const [claim, setClaim] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const [flightNumber, setFlightNumber] = useState('BA287')
  const [flightDate, setFlightDate] = useState('2026-08-22')
  const [threshold, setThreshold] = useState('180')
  const [statusUrl, setStatusUrl] = useState('https://www.flightaware.com/live/flight/BAW287')
  const [payoutAmount, setPayoutAmount] = useState('1')
  const [depositAmount, setDepositAmount] = useState('1')
  const [premiumAmount, setPremiumAmount] = useState('0.1')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const stats = await readClient.readContract({ address: CONTRACT, functionName: 'get_pool_stats', args: [] })
      setPool(stats)
      const c = await readClient.readContract({ address: CONTRACT, functionName: 'get_claim', args: [] })
      setClaim(c?.error ? null : c)
    } catch (e) { console.error(e) }
  }

  async function connect() {
    if (!window.ethereum) return alert('Install MetaMask')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setAccount(accounts[0])
  }

  function writeClient() {
    return createClient({ chain: testnetBradbury, account, provider: window.ethereum })
  }

  async function sendTx(name, args, value, waitMs, okMsg) {
    if (!account) return alert('Connect wallet first')
    setLoading(true)
    setStatus(`Sending ${name}…`)
    try {
      const client = writeClient()
      try { await client.connect('testnetBradbury') } catch {}
      const tx = await client.writeContract({ address: CONTRACT, functionName: name, args, value })
      setStatus(`Tx sent: ${String(tx).slice(0, 12)}… waiting`)
      setTimeout(() => { loadAll(); setLoading(false); setStatus(okMsg) }, waitMs)
    } catch (e) {
      setStatus('Error: ' + (e.message || 'failed'))
      setLoading(false)
    }
  }

  const isOwner = account && pool && account.toLowerCase() === String(pool.owner || '').toLowerCase()
  const statusClass = !claim ? '' :
    claim.status === 'approved' ? 'approved' :
    claim.status === 'rejected' ? 'rejected' :
    claim.status === 'approved_unpaid' ? 'unpaid' : 'open'

  return (
    <div className="app">
      <div className="glow"></div>
      <header>
        <div className="badge">GenLayer · Underwritten Pool</div>
        <h1>Flight Delay Pool</h1>
        <p className="sub">Premium · authorization · trusted sources · AI consensus · payout retry</p>
      </header>

      <section className="card">
        <h2>Pool</h2>
        <div className="stats-grid">
          <div><span>Balance</span><strong className="highlight">{pool ? (Number(pool.pool_balance)/1e18).toFixed(2) : '—'} GEN</strong></div>
          <div><span>Deposits</span><strong>{pool ? (Number(pool.total_deposits)/1e18).toFixed(2) : '—'} GEN</strong></div>
          <div><span>Paid out</span><strong>{pool ? (Number(pool.total_paid)/1e18).toFixed(2) : '—'} GEN</strong></div>
          <div><span>Claims</span><strong>{pool?.claim_count ?? '—'}</strong></div>
          <div><span>Max payout</span><strong>{pool ? (Number(pool.max_payout)/1e18).toFixed(2) : '—'} GEN</strong></div>
          <div><span>Min premium</span><strong>{pool ? (Number(pool.min_premium)/1e18).toFixed(2) : '—'} GEN</strong></div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Current claim</h2>
          {claim && <span className={`pill ${statusClass}`}>{claim.status}</span>}
        </div>
        {!claim ? <p className="muted">No claim yet.</p> : (
          <div className="claim-grid">
            <div><span>Flight</span><strong>{claim.flight_number}</strong></div>
            <div><span>Date</span><strong>{claim.flight_date}</strong></div>
            <div><span>Threshold</span><strong>{claim.delay_threshold_minutes} min</strong></div>
            <div><span>Payout</span><strong>{(Number(claim.payout_amount)/1e18).toFixed(2)} GEN</strong></div>
            <div><span>Premium paid</span><strong>{(Number(claim.premium_paid)/1e18).toFixed(2)} GEN</strong></div>
            <div><span>Authorized</span><strong>{claim.is_authorized ? 'Yes' : 'No'}</strong></div>
            <div><span>Flight status</span><strong>{claim.flight_status || '—'}</strong></div>
            <div><span>Paid</span><strong>{claim.is_paid ? 'Yes' : 'No'}</strong></div>
            {claim.resolution_note && <div className="full"><span>Note</span><strong className="note">{claim.resolution_note}</strong></div>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Actions</h2>
        {!account ? (
          <button className="btn primary" onClick={connect}>Connect Wallet</button>
        ) : (
          <>
            <p className="wallet">
              {account.slice(0,6)}…{account.slice(-4)}
              {isOwner ? ' · owner' : ''}
            </p>

            <div className="action-block">
              <h3>1. Deposit capital</h3>
              <div className="row">
                <input type="number" step="0.1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                <button className="btn" disabled={loading} onClick={() => sendTx('deposit', [], BigInt(Math.floor(Number(depositAmount)*1e18)), 25000, 'Deposit sent')}>Deposit</button>
              </div>
            </div>

            <div className="action-block">
              <h3>2. Open claim (requires premium)</h3>
              <div className="form-grid">
                <input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="Flight" />
                <input value={flightDate} onChange={e => setFlightDate(e.target.value)} placeholder="Date" />
                <input value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold min" />
                <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} placeholder="Payout GEN" />
                <input value={premiumAmount} onChange={e => setPremiumAmount(e.target.value)} placeholder="Premium GEN" />
                <input className="full" value={statusUrl} onChange={e => setStatusUrl(e.target.value)} placeholder="Trusted status URL" />
              </div>
              <button className="btn primary" disabled={loading || (claim && !claim.has_resolved)} onClick={() => sendTx(
                'open_claim',
                [flightNumber, flightDate, Number(threshold), statusUrl, Number(BigInt(Math.floor(Number(payoutAmount)*1e18)))],
                BigInt(Math.floor(Number(premiumAmount)*1e18)),
                30000,
                'Claim opened — waiting for authorization'
              )}>Open Claim</button>
            </div>

            {claim && !claim.has_resolved && (
              <div className="action-block">
                <h3>3. Authorize (owner only)</h3>
                <button className="btn primary" disabled={loading || !isOwner || claim.is_authorized} onClick={() => sendTx('authorize_claim', [], 0n, 25000, 'Claim authorized')}>
                  {claim.is_authorized ? 'Already authorized' : isOwner ? 'Authorize claim' : 'Owner only'}
                </button>
              </div>
            )}

            {claim && claim.is_authorized && !claim.has_resolved && (
              <div className="action-block">
                <h3>4. Resolve with AI consensus</h3>
                <p className="hint">Validators fetch live FlightAware / Flightradar24 data.</p>
                <button className="btn primary" disabled={loading} onClick={() => sendTx('resolve_claim', [], 0n, 80000, 'Resolution complete')}>Resolve</button>
              </div>
            )}

            {claim && claim.status === 'approved_unpaid' && (
              <div className="action-block">
                <h3>5. Pay unpaid claim</h3>
                <p className="hint">Approved but pool was short. Deposit more, then retry.</p>
                <button className="btn primary" disabled={loading} onClick={() => sendTx('pay_claim', [], 0n, 25000, 'Payout sent')}>Pay claim</button>
              </div>
            )}
          </>
        )}
        {status && <p className="status">{status}</p>}
      </section>

      <footer>
        <div>Contract · {CONTRACT}</div>
        <div>Testnet Bradbury · trusted sources only</div>
      </footer>
    </div>
  )
}

export default App
