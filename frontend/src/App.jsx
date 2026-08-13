import React, { useState, useEffect } from 'react';
import './index.css';
import { useFlightDelayVault, formatGen } from './useFlightDelayVault';

function getEU261Tier(km) {
  const d = parseInt(km, 10);
  if (!d || d <= 0) return null;
  if (d <= 1500) return { amount: 250, label: '≤1500km', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
  if (d <= 3500) return { amount: 400, label: '1500–3500km', color: '#00C8FF', bg: 'rgba(0,200,255,0.1)' };
  return { amount: 600, label: '>3500km', color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
}

export default function App() {
  const {
    contractAddress,
    address,
    claims,
    loading,
    error,
    txHash,
    txStatus,
    connectWallet,
    fetchClaimsState,
    fundCompensationClaim,
    fileDelayClaim,
    expireAndRelease,
  } = useFlightDelayVault();

  const [activeTab, setActiveTab] = useState('LANDING');
  const [selectedClaimId, setSelectedClaimId] = useState(null);

  // Fund form state
  const [passenger, setPassenger] = useState('');
  const [flightNumber, setFlightNumber] = useState('VN302');
  const [departureDate, setDepartureDate] = useState('2026-08-01');
  const [distanceKm, setDistanceKm] = useState('1150');
  const [depositGEN, setDepositGEN] = useState('250');
  const [claimDeadline, setClaimDeadline] = useState('');

  // Registry state
  const [trackingUrl, setTrackingUrl] = useState('https://flightdelayguard-app.vercel.app/mock_flight.json');
  const [timeUrl, setTimeUrl] = useState('https://flightdelayguard-app.vercel.app/mock_time.json');

  // Auto-select first claim if none selected
  useEffect(() => {
    if (activeTab === 'REGISTRY' && claims.length > 0 && selectedClaimId === null) {
      setSelectedClaimId(claims[0].id);
    }
  }, [activeTab, claims, selectedClaimId]);

  const handleFundSubmit = async (e) => {
    e.preventDefault();
    if (!passenger || !flightNumber || !departureDate || !distanceKm || !depositGEN) return;
    
    // Default deadline to 30 days in future if empty
    const deadlineTimestamp = claimDeadline 
      ? Math.floor(new Date(claimDeadline).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

    try {
      await fundCompensationClaim(passenger, flightNumber, departureDate, distanceKm, depositGEN, deadlineTimestamp);
      setActiveTab('REGISTRY');
      setSelectedClaimId(claims.length);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileClaimSubmit = async (e) => {
    e.preventDefault();
    if (selectedClaimId === null || !trackingUrl) return;
    try {
      await fileDelayClaim(selectedClaimId, trackingUrl);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExpireSubmit = async (e) => {
    e.preventDefault();
    if (selectedClaimId === null || !timeUrl) return;
    try {
      await expireAndRelease(selectedClaimId, timeUrl);
    } catch (err) {
      console.error(err);
    }
  };

  // Compute REAL metrics from claims state on-chain
  const totalClaimsCount = claims.length;
  const compensatedCount = claims.filter(c => c.status === 'COMPENSATED').length;
  const activeVaultsCount = claims.filter(c => c.status === 'FUNDED').length;
  const totalDisbursedWei = claims.reduce((sum, c) => sum + BigInt(c.compensation_amount || 0), 0n);

  const tier1Count = claims.filter(c => Number(c.flight_distance_km) <= 1500).length;
  const tier2Count = claims.filter(c => Number(c.flight_distance_km) > 1500 && Number(c.flight_distance_km) <= 3500).length;
  const tier3Count = claims.filter(c => Number(c.flight_distance_km) > 3500).length;

  const tier1Pct = totalClaimsCount > 0 ? Math.round((tier1Count / totalClaimsCount) * 100) : 0;
  const tier2Pct = totalClaimsCount > 0 ? Math.round((tier2Count / totalClaimsCount) * 100) : 0;
  const tier3Pct = totalClaimsCount > 0 ? Math.round((tier3Count / totalClaimsCount) * 100) : 0;

  const renderBadge = (status) => {
    const s = (status || 'FUNDED').toLowerCase();
    return <span className={`badge badge-${s}`}>{status}</span>;
  };

  const selectedClaim = claims.find(c => Number(c.id) === Number(selectedClaimId));
  const currentTier = getEU261Tier(distanceKm);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand-logo" onClick={() => setActiveTab('LANDING')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon-box">✈</div>
          <div>
            <div className="brand-title">FlightDelayVault</div>
            <div className="brand-subtitle">Autonomous EU261 Flight Delay Escrow</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="nav-links">
            <button
              onClick={() => setActiveTab('LANDING')}
              className={`nav-link ${activeTab === 'LANDING' ? 'active' : ''}`}
            >
              Landing
            </button>
            <button
              onClick={() => {
                setActiveTab('DASHBOARD');
                fetchClaimsState();
              }}
              className={`nav-link ${activeTab === 'DASHBOARD' ? 'active' : ''}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('FUND')}
              className={`nav-link ${activeTab === 'FUND' ? 'active' : ''}`}
            >
              Fund Claim
            </button>
            <button
              onClick={() => {
                setActiveTab('REGISTRY');
                fetchClaimsState();
              }}
              className={`nav-link ${activeTab === 'REGISTRY' ? 'active' : ''}`}
            >
              Claim Registry ({claims.length})
            </button>
          </div>

          <div style={{ background: '#0F172A', border: '1px solid var(--border-sky)', borderRadius: '10px', padding: '6px 14px', fontSize: '12px', color: 'var(--cyan-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--cyan-primary)', boxShadow: '0 0 8px var(--cyan-primary)' }} />
            StudioNet
          </div>

          {address ? (
            <div style={{ background: 'var(--cyan-glow)', border: '1px solid rgba(0, 200, 255, 0.4)', borderRadius: '10px', padding: '8px 16px', color: '#FFF', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-radar)' }}>
              <span>👛</span> {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-primary" style={{ width: 'auto', padding: '10px 20px', fontSize: '13px' }}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div style={{ background: 'var(--rose-glow)', border: '1px solid var(--rose-slash)', borderRadius: '12px', padding: '14px 20px', color: '#FFF', marginBottom: '24px', fontSize: '14px', fontFamily: 'var(--font-radar)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Error:</strong> {error}</div>
          <button onClick={() => fetchClaimsState()} style={{ background: 'transparent', border: '1px solid var(--rose-slash)', color: '#FFF', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-radar)' }}>Retry</button>
        </div>
      )}

      {/* Modern Web3 Full-Screen Loading Modal Overlay */}
      {loading && (
        <div className="modal-overlay">
          <div className="loading-modal-card">
            <div className="loading-spinner-box">
              <div className="animate-spin" style={{ fontSize: '36px', color: 'var(--cyan-primary)' }}>🔄</div>
              <div className="spinner-glow-ring" />
            </div>

            <h3 className="loading-modal-title">
              GenLayer EU261 Audit Consensus in Progress
            </h3>

            <p className="loading-modal-status">
              {txStatus || 'Connecting to GenLayer Virtual Machine & AI Validator Nodes...'}
            </p>

            <div className="loading-steps-box">
              <div className="loading-step-item">
                <span className="step-dot active" />
                <span>1. Scraper Node fetching authoritative flight tracking evidence</span>
              </div>
              <div className="loading-step-item">
                <span className="step-dot active" />
                <span>2. Leader AI Auditor evaluating delay hours against departure date</span>
              </div>
              <div className="loading-step-item">
                <span className="step-dot active" />
                <span>3. Validator Nodes re-scraping & verifying semantic consensus</span>
              </div>
            </div>

            {txHash && (
              <div className="loading-tx-hash">
                <span>TX HASH:</span> {txHash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LANDING TAB */}
      {activeTab === 'LANDING' && (
        <div className="landing-wrapper">
          <div className="hero-section">
            <div className="hero-badge">
              <span>✈ GENLAYER INTELLIGENT CONTRACT · EU261 / US DOT COMPLIANT</span>
            </div>

            <h1 className="hero-title">
              Autonomous Flight Delay Escrow <br />
              <span className="gradient-text">Instant On-Chain EU261 Compensation</span>
            </h1>

            <p className="hero-description">
              Eliminate paper forms and airline delay excuses. FlightDelayVault locks compensation funds into GenLayer Intelligent Contracts. Independent AI Validators scrape FlightAware and Flightradar24, automatically releasing €250–€600 compensation to passengers for delays ≥ 3 hours.
            </p>

            <div className="hero-cta-group">
              <button onClick={() => { setActiveTab('DASHBOARD'); fetchClaimsState(); }} className="btn-primary" style={{ width: 'auto', padding: '16px 36px', fontSize: '16px' }}>
                View Dashboard
              </button>
              <button onClick={() => setActiveTab('FUND')} className="btn-secondary">
                Fund Compensation Vault
              </button>
            </div>

            <div className="hero-stats">
              <div className="hero-stat-item">
                <div className="hero-stat-num">{totalClaimsCount}</div>
                <div className="hero-stat-lbl">Registered Vault Claims</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat-item">
                <div className="hero-stat-num" style={{ color: 'var(--emerald-ok)' }}>{formatGen(totalDisbursedWei.toString())} GEN</div>
                <div className="hero-stat-lbl">Total EU261 Disbursed</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat-item">
                <div className="hero-stat-num" style={{ color: 'var(--cyan-primary)' }}>{compensatedCount}</div>
                <div className="hero-stat-lbl">Compensated Passengers</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat-item">
                <div className="hero-stat-num" style={{ color: 'var(--amber-delay)' }}>{activeVaultsCount}</div>
                <div className="hero-stat-lbl">Active Pending Vaults</div>
              </div>
            </div>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'var(--cyan-glow)', color: 'var(--cyan-primary)' }}>🛡️</div>
              <h3 className="feature-title">Authoritative Tracking Sources</h3>
              <p className="feature-text">
                Evidence URLs must originate from independent tracking providers (<span className="code-tag">flightaware.com</span>, <span className="code-tag">flightradar24.com</span>). Airline self-reported status pages are rejected.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'var(--emerald-glow)', color: 'var(--emerald-ok)' }}>🧮</div>
              <h3 className="feature-title">Contract-Level EU261 Math</h3>
              <p className="feature-text">
                Compensation tiers (€250 / €400 / €600) are computed strictly by contract Python code based on flight distance. AI output is never trusted for financial amounts.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'var(--amber-glow)', color: 'var(--amber-delay)' }}>⏱️</div>
              <h3 className="feature-title">Deadline Expiry Recovery</h3>
              <p className="feature-text">
                If passengers do not file a claim before the deadline, insurers can reclaim locked funds via AI-verified time consensus, preventing funds from being trapped indefinitely.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'DASHBOARD' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-cockpit)', fontSize: '24px', color: '#FFF' }}>Protocol Dashboard</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-radar)', fontFamily: 'var(--font-radar)' }}>Real-time state fetched directly from GenLayer StudioNet contract</p>
            </div>
            <button onClick={() => fetchClaimsState()} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
              🔄 Refresh State
            </button>
          </div>

          <div className="dashboard-grid">
            <div className="stat-card">
              <div className="stat-header">TOTAL REGISTERED CLAIMS</div>
              <div className="stat-value">{totalClaimsCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">COMPENSATED CLAIMS</div>
              <div className="stat-value" style={{ color: 'var(--emerald-ok)' }}>{compensatedCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">GEN DISBURSED</div>
              <div className="stat-value" style={{ color: 'var(--cyan-primary)' }}>{formatGen(totalDisbursedWei.toString())} GEN</div>
            </div>
            <div className="stat-card">
              <div className="stat-header">ACTIVE PENDING VAULTS</div>
              <div className="stat-value" style={{ color: 'var(--amber-delay)' }}>{activeVaultsCount}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <div className="glass-panel">
              <div className="panel-title">📡 On-Chain Claim Records ({claims.length})</div>
              <div className="panel-desc">Live claims stored in GenLayer contract storage</div>

              {claims.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-radar)', fontFamily: 'var(--font-radar)' }}>
                  No claims found in contract storage yet. Click "Fund Claim" tab to register the first claim!
                </div>
              ) : (
                <div className="dossier-list">
                  {claims.map((claim) => (
                    <div
                      key={claim.id}
                      className={`dossier-item ${selectedClaimId === claim.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedClaimId(claim.id);
                        setActiveTab('REGISTRY');
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontFamily: 'var(--font-cockpit)', fontSize: '18px', fontWeight: 700, color: '#FFF' }}>
                            {claim.flight_number}
                          </span>
                          <span style={{ marginLeft: '12px', fontFamily: 'var(--font-radar)', fontSize: '12px', color: 'var(--text-radar)' }}>
                            {claim.departure_date} · {claim.flight_distance_km} km
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {renderBadge(claim.status)}
                          <span style={{ fontFamily: 'var(--font-cockpit)', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                            {formatGen(claim.compensation_amount || '0')} GEN
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel">
              <div className="panel-title">📊 EU261 Tier Distribution</div>
              <div className="panel-desc">Breakdown by flight distance tier</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-radar)', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--amber-delay)' }}>Tier 1 (≤1500km — €250)</span>
                    <span style={{ color: '#FFF' }}>{tier1Count} ({tier1Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier1Pct}%`, background: 'var(--amber-delay)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-radar)', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--cyan-primary)' }}>Tier 2 (1500–3500km — €400)</span>
                    <span style={{ color: '#FFF' }}>{tier2Count} ({tier2Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier2Pct}%`, background: 'var(--cyan-primary)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-radar)', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--emerald-ok)' }}>Tier 3 (&gt;3500km — €600)</span>
                    <span style={{ color: '#FFF' }}>{tier3Count} ({tier3Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier3Pct}%`, background: 'var(--emerald-ok)' }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '30px', padding: '16px', background: '#071124', borderRadius: '12px', border: '1px solid var(--border-sky)', fontSize: '11px', fontFamily: 'var(--font-radar)', color: 'var(--text-radar)' }}>
                <div><strong>Contract Address:</strong></div>
                <div style={{ color: 'var(--cyan-primary)', wordBreak: 'break-all', marginTop: '4px' }}>{contractAddress}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FUND TAB */}
      {activeTab === 'FUND' && (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div className="glass-panel">
            <h2 className="panel-title">🔒 Lock Compensation Vault</h2>
            <p className="panel-desc">
              Airlines / insurers lock EU261 compensation funds per passenger. Flight identity fields (flight number, date, distance) become immutable upon creation.
            </p>

            <form onSubmit={handleFundSubmit}>
              <div className="form-group">
                <label className="form-label">Passenger Wallet Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0x1111111111111111111111111111111111111111"
                  value={passenger}
                  onChange={e => setPassenger(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Flight Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VN302"
                    value={flightNumber}
                    onChange={e => setFlightNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Departure Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={departureDate}
                    onChange={e => setDepartureDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Flight Distance (km)
                  {currentTier && (
                    <span style={{ marginLeft: '12px', padding: '2px 10px', borderRadius: '12px', background: currentTier.bg, color: currentTier.color, fontSize: '11px' }}>
                      EU261 Tier: €{currentTier.amount} ({currentTier.label})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 1150 for HAN→SGN"
                  value={distanceKm}
                  onChange={e => setDistanceKm(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">GEN Deposit Amount (1 GEN = 1 €)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 250"
                    value={depositGEN}
                    onChange={e => setDepositGEN(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Claim Deadline (Optional)</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={claimDeadline}
                    onChange={e => setClaimDeadline(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '12px' }}>
                🔒 Lock Compensation Vault On-Chain
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REGISTRY TAB */}
      {activeTab === 'REGISTRY' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px' }}>
          {/* Left Sidebar List */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-cockpit)', fontWeight: 700, fontSize: '16px', color: '#FFF' }}>
                Claim Registry ({claims.length})
              </div>
              <button onClick={() => fetchClaimsState()} style={{ background: 'transparent', border: 'none', color: 'var(--cyan-primary)', cursor: 'pointer', fontSize: '14px' }}>🔄</button>
            </div>

            {claims.length === 0 ? (
              <div style={{ color: 'var(--text-radar)', fontSize: '13px', fontFamily: 'var(--font-radar)', padding: '20px 0', textAlign: 'center' }}>
                No claims loaded from contract. Click 🔄 to refresh.
              </div>
            ) : (
              <div className="dossier-list">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className={`dossier-item ${Number(selectedClaimId) === Number(claim.id) ? 'selected' : ''}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--font-cockpit)', fontSize: '16px', fontWeight: 700, color: '#FFF' }}>
                        {claim.flight_number}
                      </span>
                      {renderBadge(claim.status)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-radar)', color: 'var(--text-radar)' }}>
                      <span>{claim.departure_date}</span>
                      <span style={{ color: 'var(--cyan-primary)' }}>{formatGen(claim.compensation_amount || '0')} GEN</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Detail Panel */}
          <div className="glass-panel">
            {selectedClaim ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-cockpit)', fontSize: '28px', color: '#FFF' }}>{selectedClaim.flight_number}</h2>
                    <p style={{ fontFamily: 'var(--font-radar)', fontSize: '13px', color: 'var(--text-radar)', marginTop: '4px' }}>
                      Departure Date: {selectedClaim.departure_date} · Passenger: {selectedClaim.passenger}
                    </p>
                  </div>
                  <div>{renderBadge(selectedClaim.status)}</div>
                </div>

                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-header">DELAY HOURS</div>
                    <div className="stat-value">{selectedClaim.delay_hours || 0}h</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">FLIGHT DISTANCE</div>
                    <div className="stat-value">{selectedClaim.flight_distance_km} km</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">EU261 PAYOUT</div>
                    <div className="stat-value" style={{ color: 'var(--cyan-primary)' }}>{formatGen(selectedClaim.compensation_amount || '0')} GEN</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">VAULT BALANCE</div>
                    <div className="stat-value">{formatGen(selectedClaim.fund || '0')} GEN</div>
                  </div>
                </div>

                <div className={`decree-box ${selectedClaim.status === 'COMPENSATED' ? 'verified' : selectedClaim.status === 'REJECTED' ? 'slashed' : ''}`}>
                  <div style={{ fontFamily: 'var(--font-cockpit)', fontSize: '14px', fontWeight: 700, color: '#FFF', marginBottom: '8px' }}>
                    🤖 GenLayer AI Auditor Reasoning
                  </div>
                  <p style={{ fontFamily: 'var(--font-radar)', fontSize: '13px', color: 'var(--text-radar)', lineHeight: '20px' }}>
                    {selectedClaim.reasoning || 'Awaiting delay claim submission and AI consensus verification.'}
                  </p>
                </div>

                {/* File Delay Claim Form (if FUNDED or FAILED) */}
                {(selectedClaim.status === 'FUNDED' || selectedClaim.status === 'FAILED') && (
                  <div style={{ marginTop: '30px', padding: '20px', background: '#071124', borderRadius: '16px', border: '1px solid var(--border-sky)' }}>
                    <h3 style={{ fontFamily: 'var(--font-cockpit)', fontSize: '16px', color: '#FFF', marginBottom: '8px' }}>
                      📡 File Flight Delay Claim
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-radar)', fontFamily: 'var(--font-radar)', marginBottom: '16px' }}>
                      Submit official flight tracking URL (FlightAware or Flightradar24) to trigger GenLayer AI consensus.
                    </p>

                    <form onSubmit={handleFileClaimSubmit}>
                      <div className="form-group">
                        <label className="form-label">Flight Tracking Evidence URL</label>
                        <input
                          type="url"
                          className="form-input"
                          value={trackingUrl}
                          onChange={e => setTrackingUrl(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" className="btn-primary" disabled={loading}>
                        📡 Submit Delay Evidence & Trigger AI Consensus
                      </button>
                    </form>
                  </div>
                )}

                {/* Expire & Release Section (for Insurers) */}
                {selectedClaim.status === 'FUNDED' && (
                  <div style={{ marginTop: '20px', padding: '16px', background: '#071124', borderRadius: '12px', border: '1px solid var(--border-amber)' }}>
                    <div style={{ fontSize: '12px', fontFamily: 'var(--font-radar)', color: 'var(--amber-delay)', marginBottom: '8px' }}>
                      ⏱️ Insurer Recovery: Claim deadline = {selectedClaim.deadline ? new Date(selectedClaim.deadline * 1000).toLocaleString() : 'N/A'}
                    </div>
                    <form onSubmit={handleExpireSubmit} style={{ display: 'flex', gap: '12px' }}>
                      <input
                        type="url"
                        className="form-input"
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                        value={timeUrl}
                        onChange={e => setTimeUrl(e.target.value)}
                        placeholder="Authoritative Time Source URL"
                      />
                      <button type="submit" className="btn-secondary" style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: '12px' }} disabled={loading}>
                        Expire & Recover Funds
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-radar)', fontFamily: 'var(--font-radar)' }}>
                Select a claim from the left registry sidebar to inspect details or file evidence.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
