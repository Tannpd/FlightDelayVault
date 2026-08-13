import React, { useState, useEffect } from 'react';
import './index.css';
import { useFlightDelayVault, formatGen } from './useFlightDelayVault';
import {
  Plane, ShieldCheck, Calculator, Clock, RefreshCw, Wallet,
  PlusCircle, ArrowRight, ExternalLink, FileText, Sparkles,
  CheckCircle2, AlertCircle, BarChart3, Layers, Send, ChevronRight
} from 'lucide-react';

function getEU261Tier(km) {
  const d = parseInt(km, 10);
  if (!d || d <= 0) return null;
  if (d <= 1500) return { amount: 250, label: '≤1500km', color: 'var(--amber-warning)', bg: 'rgba(245,158,11,0.1)' };
  if (d <= 3500) return { amount: 400, label: '1500–3500km', color: 'var(--sky-primary)', bg: 'rgba(0,200,255,0.1)' };
  return { amount: 600, label: '>3500km', color: 'var(--emerald-success)', bg: 'rgba(16,185,129,0.1)' };
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
        <div className="nav-brand" onClick={() => setActiveTab('LANDING')} style={{ cursor: 'pointer' }}>
          <Plane size={24} color="var(--sky-primary)" />
          <div>
            <div style={{ lineHeight: '1.2' }}>FlightDelayVault</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Autonomous EU261 Flight Delay Escrow</div>
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

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', color: 'var(--sky-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--sky-primary)', boxShadow: '0 0 8px var(--sky-primary)' }} />
            StudioNet
          </div>

          {address ? (
            <div className="wallet-button connected mono">
              <Wallet size={16} /> {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          ) : (
            <button onClick={connectWallet} className="wallet-button">
              <Wallet size={16} /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--rose-danger)', borderRadius: '12px', padding: '16px 20px', color: '#FFF', marginBottom: '24px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} color="var(--rose-danger)" />
            <span><strong>Error:</strong> {error}</span>
          </div>
          <button onClick={() => fetchClaimsState()} style={{ background: 'transparent', border: '1px solid var(--rose-danger)', color: '#FFF', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Modern Web3 Full-Screen Loading Modal Overlay */}
      {loading && (
        <div className="modal-overlay">
          <div className="loading-modal-card">
            <RefreshCw className="loading-spinner" size={48} />

            <h3 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '12px' }}>
              GenLayer EU261 Audit Consensus in Progress
            </h3>

            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              {txStatus || 'Connecting to GenLayer Virtual Machine & AI Validator Nodes...'}
            </p>

            <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <CheckCircle2 size={16} color="var(--sky-primary)" />
                <span style={{ fontSize: '14px' }}>1. Scraper Node fetching authoritative flight tracking evidence</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <CheckCircle2 size={16} color="var(--sky-primary)" />
                <span style={{ fontSize: '14px' }}>2. Leader AI Auditor evaluating delay hours against departure date</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <CheckCircle2 size={16} color="var(--sky-primary)" />
                <span style={{ fontSize: '14px' }}>3. Validator Nodes re-scraping & verifying semantic consensus</span>
              </div>
            </div>

            {txHash && (
              <div className="mono" style={{ fontSize: '13px', color: 'var(--sky-primary)', background: 'var(--sky-glow)', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontWeight: 700 }}>TX HASH:</span> {txHash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LANDING TAB */}
      {activeTab === 'LANDING' && (
        <div className="hero-wrapper">
          <div className="hero-badge">
            <Plane size={14} /> GENLAYER INTELLIGENT CONTRACT · EU261 / US DOT COMPLIANT
          </div>

          <h1 className="hero-title">
            Autonomous Flight Delay Escrow <br />
            <span>Instant On-Chain EU261 Compensation</span>
          </h1>

          <p className="hero-subtitle">
            Eliminate paper forms and airline delay excuses. FlightDelayVault locks compensation funds into GenLayer Intelligent Contracts. Independent AI Validators scrape FlightAware and Flightradar24, automatically releasing €250–€600 compensation to passengers for delays ≥ 3 hours.
          </p>

          <div className="hero-cta-group">
            <button onClick={() => { setActiveTab('DASHBOARD'); fetchClaimsState(); }} className="btn-primary">
              <BarChart3 size={20} /> View Dashboard
            </button>
            <button onClick={() => setActiveTab('FUND')} className="btn-secondary">
              <PlusCircle size={20} /> Fund Compensation Vault
            </button>
          </div>

          <div className="hero-stats-row">
            <div className="hero-stat-item">
              <div className="hero-stat-num">{totalClaimsCount}</div>
              <div className="hero-stat-lbl">Registered Vault Claims</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat-item">
              <div className="hero-stat-num" style={{ color: 'var(--emerald-success)' }}>{formatGen(totalDisbursedWei.toString())} GEN</div>
              <div className="hero-stat-lbl">Total EU261 Disbursed</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat-item">
              <div className="hero-stat-num" style={{ color: 'var(--sky-primary)' }}>{compensatedCount}</div>
              <div className="hero-stat-lbl">Compensated Passengers</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat-item">
              <div className="hero-stat-num" style={{ color: 'var(--amber-warning)' }}>{activeVaultsCount}</div>
              <div className="hero-stat-lbl">Active Pending Vaults</div>
            </div>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon"><ShieldCheck size={28} /></div>
              <h3>Authoritative Tracking Sources</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Evidence URLs must originate from independent tracking providers (flightaware.com, flightradar24.com). Airline self-reported status pages are rejected.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--emerald-success)' }}><Calculator size={28} /></div>
              <h3>Contract-Level EU261 Math</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Compensation tiers (€250 / €400 / €600) are computed strictly by contract Python code based on flight distance. AI output is never trusted for financial amounts.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber-warning)' }}><Clock size={28} /></div>
              <h3>Deadline Expiry Recovery</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                If passengers do not file a claim before the deadline, insurers can reclaim locked funds via AI-verified time consensus, preventing funds from being trapped indefinitely.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'DASHBOARD' && (
        <div>
          <div className="panel-header">
            <div>
              <h2 className="panel-title"><BarChart3 size={24} /> Protocol Dashboard</h2>
              <p style={{ color: 'var(--text-muted)' }}>Real-time state fetched directly from GenLayer StudioNet contract</p>
            </div>
            <button onClick={() => fetchClaimsState()} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
              <RefreshCw size={16} /> Refresh State
            </button>
          </div>

          <div className="dashboard-grid">
            <div className="stat-card">
              <Layers className="stat-icon" size={24} />
              <div className="stat-label">TOTAL REGISTERED CLAIMS</div>
              <div className="stat-value">{totalClaimsCount}</div>
            </div>
            <div className="stat-card">
              <CheckCircle2 className="stat-icon" size={24} />
              <div className="stat-label">COMPENSATED CLAIMS</div>
              <div className="stat-value" style={{ color: 'var(--emerald-success)' }}>{compensatedCount}</div>
            </div>
            <div className="stat-card">
              <Wallet className="stat-icon" size={24} />
              <div className="stat-label">GEN DISBURSED</div>
              <div className="stat-value" style={{ color: 'var(--sky-primary)' }}>{formatGen(totalDisbursedWei.toString())}</div>
            </div>
            <div className="stat-card">
              <Clock className="stat-icon" size={24} />
              <div className="stat-label">ACTIVE PENDING VAULTS</div>
              <div className="stat-value" style={{ color: 'var(--amber-warning)' }}>{activeVaultsCount}</div>
            </div>
          </div>

          <div className="registry-layout">
            <div className="glass-panel">
              <h3 className="panel-title"><FileText size={20} /> On-Chain Claim Records ({claims.length})</h3>
              <p className="panel-desc">Live claims stored in GenLayer contract storage</p>

              {claims.length === 0 ? (
                <div className="empty-state-card">
                  <div className="icon-box"><FileText size={32} /></div>
                  <h3>No Claims Found</h3>
                  <p>No claims found in contract storage yet. Register the first claim to get started!</p>
                  <button onClick={() => setActiveTab('FUND')} className="btn-primary">
                    <PlusCircle size={18} /> Lock Your First Vault
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {claims.map((claim) => (
                    <div
                      key={claim.id}
                      className={`claim-card ${selectedClaimId === claim.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedClaimId(claim.id);
                        setActiveTab('REGISTRY');
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '4px' }}>
                            {claim.flight_number}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            {claim.departure_date} · {claim.flight_distance_km} km
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {renderBadge(claim.status)}
                          <span style={{ fontWeight: 700, color: 'var(--sky-primary)' }}>
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
              <h3 className="panel-title"><Plane size={20} /> EU261 Tier Distribution</h3>
              <p className="panel-desc">Breakdown by flight distance tier</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--amber-warning)' }}>Tier 1 (≤1500km — €250)</span>
                    <span style={{ color: '#FFF' }}>{tier1Count} ({tier1Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier1Pct}%`, background: 'var(--amber-warning)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--sky-primary)' }}>Tier 2 (1500–3500km — €400)</span>
                    <span style={{ color: '#FFF' }}>{tier2Count} ({tier2Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier2Pct}%`, background: 'var(--sky-primary)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--emerald-success)' }}>Tier 3 (&gt;3500km — €600)</span>
                    <span style={{ color: '#FFF' }}>{tier3Count} ({tier3Pct}%)</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${tier3Pct}%`, background: 'var(--emerald-success)' }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>CONTRACT ADDRESS:</div>
                <div className="mono" style={{ color: 'var(--sky-primary)', wordBreak: 'break-all', fontSize: '14px' }}>{contractAddress}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FUND TAB */}
      {activeTab === 'FUND' && (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div className="glass-panel">
            <h2 className="panel-title"><ShieldCheck size={24} /> Lock Compensation Vault</h2>
            <p className="panel-desc">
              Airlines / insurers lock EU261 compensation funds per passenger. Flight identity fields (flight number, date, distance) become immutable upon creation.
            </p>

            <form onSubmit={handleFundSubmit}>
              <div className="form-group">
                <label className="form-label">Passenger Wallet Address</label>
                <input
                  type="text"
                  className="form-input mono"
                  placeholder="0x1111111111111111111111111111111111111111"
                  value={passenger}
                  onChange={e => setPassenger(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                  <label className="form-label">Departure Date</label>
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
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  Flight Distance (km)
                  {currentTier && (
                    <span className="eu261-tier-badge">
                      EU261 Tier: €{currentTier.amount} ({currentTier.label})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 1150"
                  value={distanceKm}
                  onChange={e => setDistanceKm(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">GEN Deposit Amount (1 GEN = 1 €)</label>
                  <input
                    type="number"
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

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={loading}>
                <PlusCircle size={20} /> Lock Compensation Vault On-Chain
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REGISTRY TAB */}
      {activeTab === 'REGISTRY' && (
        <div className="registry-layout">
          {/* Left Sidebar List */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div className="panel-header" style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text-heading)' }}>
                Claim Registry ({claims.length})
              </div>
              <button onClick={() => fetchClaimsState()} className="btn-secondary" style={{ padding: '6px', borderRadius: '8px' }}>
                <RefreshCw size={16} />
              </button>
            </div>

            {claims.length === 0 ? (
              <div className="empty-state-card" style={{ padding: '40px 20px' }}>
                <FileText size={32} color="var(--sky-primary)" style={{ margin: '0 auto 12px' }} />
                <p style={{ margin: 0 }}>No claims loaded. Refresh or lock a vault.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className={`claim-card ${Number(selectedClaimId) === Number(claim.id) ? 'selected' : ''}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                    style={{ marginBottom: 0, padding: '16px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                        {claim.flight_number}
                      </span>
                      {renderBadge(claim.status)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>{claim.departure_date}</span>
                      <span style={{ color: 'var(--sky-primary)', fontWeight: 600 }}>{formatGen(claim.compensation_amount || '0')} GEN</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-heading)', marginBottom: '8px' }}>{selectedClaim.flight_number}</h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} /> {selectedClaim.departure_date} <span style={{ margin: '0 8px' }}>·</span> <Wallet size={16} /> <span className="mono">{selectedClaim.passenger}</span>
                    </p>
                  </div>
                  <div>{renderBadge(selectedClaim.status)}</div>
                </div>

                <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
                  <div className="stat-card" style={{ padding: '20px' }}>
                    <div className="stat-label">DELAY HOURS</div>
                    <div className="stat-value">{selectedClaim.delay_hours || 0}h</div>
                  </div>
                  <div className="stat-card" style={{ padding: '20px' }}>
                    <div className="stat-label">FLIGHT DISTANCE</div>
                    <div className="stat-value">{selectedClaim.flight_distance_km} km</div>
                  </div>
                  <div className="stat-card" style={{ padding: '20px' }}>
                    <div className="stat-label">EU261 PAYOUT</div>
                    <div className="stat-value" style={{ color: 'var(--sky-primary)' }}>{formatGen(selectedClaim.compensation_amount || '0')} GEN</div>
                  </div>
                  <div className="stat-card" style={{ padding: '20px' }}>
                    <div className="stat-label">VAULT BALANCE</div>
                    <div className="stat-value">{formatGen(selectedClaim.fund || '0')} GEN</div>
                  </div>
                </div>

                <div className={`decree-box ${selectedClaim.status === 'COMPENSATED' ? 'verified' : selectedClaim.status === 'REJECTED' ? 'slashed' : ''}`}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} color="var(--sky-primary)" /> GenLayer AI Auditor Reasoning
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-body)', lineHeight: '1.6' }}>
                    {selectedClaim.reasoning || 'Awaiting delay claim submission and AI consensus verification.'}
                  </p>
                </div>

                {/* File Delay Claim Form (if FUNDED or FAILED) */}
                {(selectedClaim.status === 'FUNDED' || selectedClaim.status === 'FAILED') && (
                  <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid var(--border-accent)' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ExternalLink size={20} /> File Flight Delay Claim
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
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
                      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                        <Send size={18} /> Submit Delay Evidence & Trigger AI Consensus
                      </button>
                    </form>
                  </div>
                )}

                {/* Expire & Release Section (for Insurers) */}
                {selectedClaim.status === 'FUNDED' && (
                  <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--amber-warning)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={18} /> Insurer Recovery: Claim deadline = {selectedClaim.deadline ? new Date(selectedClaim.deadline * 1000).toLocaleString() : 'N/A'}
                    </div>
                    <form onSubmit={handleExpireSubmit} style={{ display: 'flex', gap: '16px' }}>
                      <input
                        type="url"
                        className="form-input"
                        style={{ flex: 1 }}
                        value={timeUrl}
                        onChange={e => setTimeUrl(e.target.value)}
                        placeholder="Authoritative Time Source URL"
                      />
                      <button type="submit" className="btn-secondary" style={{ whiteSpace: 'nowrap' }} disabled={loading}>
                        Expire & Recover Funds
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state-card" style={{ padding: '80px 24px' }}>
                <div className="icon-box"><ChevronRight size={32} /></div>
                <h3>Select a Claim</h3>
                <p>Select a claim from the left registry sidebar to inspect details or file evidence.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
