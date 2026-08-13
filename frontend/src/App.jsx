import React, { useState, useEffect } from 'react';
import './index.css';
import { useFlightDelayVault, formatGEN } from './useFlightDelayVault';

function getEU261Tier(km) {
  const d = parseInt(km);
  if (!d || d <= 0) return null;
  if (d <= 1500) return { amount: 250, label: '≤1500km', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
  if (d <= 3500) return { amount: 400, label: '1500–3500km', color: '#00C8FF', bg: 'rgba(0,200,255,0.1)' };
  return { amount: 600, label: '>3500km', color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
}

export default function App() {
  const { CONTRACT_ADDRESS, fetchClaims, getClaim, fundClaim, fileClaim } = useFlightDelayVault();

  const [activeTab, setActiveTab] = useState('LANDING');
  const [claims, setClaims] = useState([]);
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);

  // Fund form state
  const [passenger, setPassenger] = useState('');
  const [flightNumber, setFlightNumber] = useState('VN302');
  const [departureDate, setDepartureDate] = useState('2026-08-01');
  const [distanceKm, setDistanceKm] = useState('');
  const [depositGEN, setDepositGEN] = useState('');
  const [claimDeadline, setClaimDeadline] = useState('');

  // Registry state
  const [trackingUrl, setTrackingUrl] = useState('');

  const loadClaimsData = async () => {
    try {
      const data = await fetchClaims();
      setClaims(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'DASHBOARD' || activeTab === 'REGISTRY') {
      loadClaimsData();
    }
  }, [activeTab]);

  const handleFundSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoadingStep(0);
    try {
      setTimeout(() => setLoadingStep(1), 800);
      setTimeout(() => setLoadingStep(2), 1600);
      const res = await fundClaim(passenger, flightNumber, departureDate, distanceKm, depositGEN, claimDeadline);
      setActiveTab('REGISTRY');
      setSelectedClaimId(res.claimId);
    } catch (err) {
      setError(err.message);
    } finally {
      setTimeout(() => setLoading(false), 2000);
    }
  };

  const handleFileClaim = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoadingStep(0);
    try {
      setTimeout(() => setLoadingStep(1), 1000);
      setTimeout(() => setLoadingStep(2), 2000);
      await fileClaim(selectedClaimId, trackingUrl);
      await loadClaimsData();
      setTrackingUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setTimeout(() => setLoading(false), 3000);
    }
  };

  const renderBadge = (status) => {
    const s = status.toLowerCase();
    return <span className={`badge badge-${s}`}>{status}</span>;
  };

  const selectedClaim = claims.find(c => c.id === selectedClaimId);

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="brand-logo">
          <div className="brand-icon-box">✈</div>
          <div>
            <div className="brand-title">FlightDelayVault</div>
            <div className="brand-subtitle">AeroGreen HUD Edition</div>
          </div>
        </div>
        <div className="nav-links">
          <button className={`nav-link ${activeTab === 'LANDING' ? 'active' : ''}`} onClick={() => setActiveTab('LANDING')}>LANDING</button>
          <button className={`nav-link ${activeTab === 'DASHBOARD' ? 'active' : ''}`} onClick={() => setActiveTab('DASHBOARD')}>DASHBOARD</button>
          <button className={`nav-link ${activeTab === 'FUND' ? 'active' : ''}`} onClick={() => setActiveTab('FUND')}>FUND</button>
          <button className={`nav-link ${activeTab === 'REGISTRY' ? 'active' : ''}`} onClick={() => setActiveTab('REGISTRY')}>REGISTRY</button>
        </div>
      </nav>

      <main>
        {activeTab === 'LANDING' && (
          <div className="hero-section">
            <div className="hero-badge">✈ GENLAYER INTELLIGENT CONTRACT · EU261/DOT COMPLIANT</div>
            <h1 className="hero-title">
              FlightDelayVault
              <span className="gradient-text">Autonomous Compensation</span>
            </h1>
            <p className="hero-desc">
              Next-generation smart contracts providing fully automated EU261 passenger compensation. 
              No forms. No waiting. Verifiable tracking data processed entirely on-chain.
            </p>
            <div className="hero-actions">
              <button className="btn-primary" onClick={() => setActiveTab('DASHBOARD')}>View Dashboard</button>
              <button className="btn-secondary" onClick={() => setActiveTab('FUND')}>Fund a Claim</button>
            </div>
            
            <div className="hero-stats">
              <div className="hero-stat-item">
                <span className="hero-stat-num">€250-€600</span>
                <span className="hero-stat-lbl">Payout Range</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat-item">
                <span className="hero-stat-num">3</span>
                <span className="hero-stat-lbl">EU261 Tiers</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat-item">
                <span className="hero-stat-num">100%</span>
                <span className="hero-stat-lbl">On-Chain</span>
              </div>
            </div>

            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🛡️</div>
                <h3 className="feature-title">Authoritative Tracking</h3>
                <p className="feature-desc">FlightAware + Flightradar24 consensus. Completely removes airline self-reporting bias.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🧮</div>
                <h3 className="feature-title">Contract-Level Math</h3>
                <p className="feature-desc">Compensation computed deterministically by contract code, preventing AI hallucinations.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⏱️</div>
                <h3 className="feature-title">Deadline Recovery</h3>
                <p className="feature-desc">expire_and_settle prevents stuck funds. Guaranteed return to insurer if unclaimed.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'DASHBOARD' && (
          <div className="dashboard-grid">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-card-title">Total Claims</span>
                <span className="stat-card-value">{claims.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-title">Compensated</span>
                <span className="stat-card-value">{claims.filter(c => c.status === 'COMPENSATED').length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-title">GEN Disbursed</span>
                <span className="stat-card-value">{claims.reduce((acc, c) => acc + (c.compensation_amount !== '0' ? 1 : 0), 0) * 100}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card-title">Active Vaults</span>
                <span className="stat-card-value">{claims.filter(c => c.status === 'FUNDED').length}</span>
              </div>
            </div>
            
            <div className="dashboard-middle">
              <div className="glass-panel">
                <h3 className="panel-title">📡 Recent Claims</h3>
                <p className="panel-desc">Latest contract activity</p>
                <div className="claims-list" style={{ padding: 0 }}>
                  {claims.slice(0, 5).map(c => (
                    <div key={c.id} className="claim-card" style={{ marginBottom: 10 }}>
                      <div className="claim-card-header">
                        <span className="claim-flight">{c.flight_number}</span>
                        {renderBadge(c.status)}
                      </div>
                      <div className="claim-card-details">
                        <span>{c.departure_date}</span>
                        <span>{formatGEN(c.compensation_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel">
                <h3 className="panel-title">📊 EU261 Tier Distribution</h3>
                <p className="panel-desc">Compensation ranges</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: 'var(--font-radar)', fontSize: '14px' }}>Tier 1 (€250)</span>
                      <span>45%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-cockpit)', borderRadius: '4px' }}>
                      <div style={{ width: '45%', height: '100%', background: 'var(--amber-delay)', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: 'var(--font-radar)', fontSize: '14px' }}>Tier 2 (€400)</span>
                      <span>30%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-cockpit)', borderRadius: '4px' }}>
                      <div style={{ width: '30%', height: '100%', background: 'var(--cyan-primary)', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: 'var(--font-radar)', fontSize: '14px' }}>Tier 3 (€600)</span>
                      <span>25%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-cockpit)', borderRadius: '4px' }}>
                      <div style={{ width: '25%', height: '100%', background: 'var(--emerald-ok)', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="glass-panel" style={{ marginTop: '10px' }}>
              <h3 className="panel-title">🔗 Contract Information</h3>
              <div style={{ fontFamily: 'var(--font-radar)', color: 'var(--cyan-primary)', marginTop: '10px' }}>
                Address: {CONTRACT_ADDRESS}<br/>
                Network: GenLayer Testnet<br/>
                Repository: github.com/user/flightdelayvault
              </div>
            </div>
          </div>
        )}

        {activeTab === 'FUND' && (
          <div style={{ padding: '40px 0', maxWidth: '600px', margin: '0 auto' }}>
            <div className="glass-panel">
              <h2 className="panel-title">🔒 Lock Compensation Vault</h2>
              <p className="panel-desc">Initialize a new claim for an insured passenger</p>
              
              <form onSubmit={handleFundSubmit}>
                <div className="form-group">
                  <label className="form-label">Passenger Wallet Address</label>
                  <input type="text" className="form-input" value={passenger} onChange={e => setPassenger(e.target.value)} required placeholder="0x..." />
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Flight Number</label>
                    <input type="text" className="form-input" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Departure Date</label>
                    <input type="date" className="form-input" value={departureDate} onChange={e => setDepartureDate(e.target.value)} required />
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Flight Distance (km)</label>
                  <input type="number" className="form-input" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} required />
                  {distanceKm && getEU261Tier(distanceKm) && (
                    <div className="eu261-tier-badge" style={{ 
                      color: getEU261Tier(distanceKm).color, 
                      backgroundColor: getEU261Tier(distanceKm).bg,
                      border: `1px solid ${getEU261Tier(distanceKm).color}`
                    }}>
                      {getEU261Tier(distanceKm).label} → €{getEU261Tier(distanceKm).amount}
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  <label className="form-label">GEN Deposit Amount (Wei)</label>
                  <input type="text" className="form-input" value={depositGEN} onChange={e => setDepositGEN(e.target.value)} required placeholder="e.g. 250000000000000000000" />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Claim Deadline</label>
                  <input type="datetime-local" className="form-input" value={claimDeadline} onChange={e => setClaimDeadline(e.target.value)} required />
                </div>
                
                <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>🔒 Lock Compensation Vault</button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'REGISTRY' && (
          <div className="registry-layout">
            <div className="claims-sidebar">
              <div className="sidebar-header">
                <span style={{ fontFamily: 'var(--font-cockpit)', fontWeight: 'bold' }}>Claim Registry</span>
                <span className="badge badge-funded">{claims.length}</span>
              </div>
              <div className="claims-list">
                {claims.map(c => (
                  <div key={c.id} className={`claim-card ${selectedClaimId === c.id ? 'selected' : ''}`} onClick={() => setSelectedClaimId(c.id)}>
                    <div className="claim-card-header">
                      <span className="claim-flight">{c.flight_number}</span>
                      {renderBadge(c.status)}
                    </div>
                    <div className="claim-card-details">
                      <span>{c.departure_date}</span>
                      <span>{formatGEN(c.compensation_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="claim-detail-panel">
              {selectedClaim ? (
                <>
                  <div className="detail-header">
                    <div className="detail-title">
                      <h2>{selectedClaim.flight_number}</h2>
                      <p>Departure: {selectedClaim.departure_date}</p>
                    </div>
                    {renderBadge(selectedClaim.status)}
                  </div>
                  
                  <div className="timeline-steps">
                    <div className="timeline-step">
                      <div className="step-dot completed">✓</div>
                      <span className="step-label">FUNDED</span>
                    </div>
                    <div className="timeline-step">
                      <div className={`step-dot ${selectedClaim.status !== 'FUNDED' ? 'completed' : 'active'}`}>
                        {selectedClaim.status !== 'FUNDED' ? '✓' : '2'}
                      </div>
                      <span className="step-label">CLAIMED</span>
                    </div>
                    <div className="timeline-step">
                      <div className={`step-dot ${['COMPENSATED', 'REJECTED', 'FAILED'].includes(selectedClaim.status) ? 'completed' : ''}`}>
                        {['COMPENSATED', 'REJECTED', 'FAILED'].includes(selectedClaim.status) ? '✓' : '3'}
                      </div>
                      <span className="step-label">RESULT</span>
                    </div>
                  </div>
                  
                  <div className="metrics-grid">
                    <div className="metric-box">
                      <div className="metric-label">Delay</div>
                      <div className="metric-value">{selectedClaim.delay_hours}h</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-label">Distance</div>
                      <div className="metric-value">{selectedClaim.flight_distance_km}km</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-label">Payout</div>
                      <div className="metric-value" style={{ color: 'var(--cyan-primary)' }}>{formatGEN(selectedClaim.compensation_amount)}</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-label">Deadline</div>
                      <div className="metric-value" style={{ fontSize: '14px' }}>
                        {new Date(selectedClaim.deadline * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="decree-box">
                    <div className="decree-title">🤖 AI Validator Reasoning</div>
                    <div className="decree-content">{selectedClaim.reasoning}</div>
                  </div>
                  
                  {(selectedClaim.status === 'FUNDED' || selectedClaim.status === 'FAILED') && (
                    <div className="action-box">
                      <h3 style={{ fontFamily: 'var(--font-cockpit)', marginBottom: '15px' }}>File Claim</h3>
                      <form onSubmit={handleFileClaim}>
                        <div className="form-group">
                          <label className="form-label">Tracking Evidence URL (FlightAware/Flightradar24)</label>
                          <input type="url" className="form-input" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} required placeholder="https://flightaware.com/..." />
                        </div>
                        <button type="submit" className="btn-primary">📡 Submit Delay Evidence</button>
                      </form>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-radar)', fontFamily: 'var(--font-radar)' }}>
                  Select a claim from the registry to view details
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {loading && (
        <div className="modal-overlay">
          <div className="loading-modal-card">
            <div className="loading-spinner-box">
              <div className="spinner-glow-ring"></div>
              <div className="spinner-inner"></div>
            </div>
            <h3 className="loading-title">Processing Vault Action</h3>
            <div className="loading-steps-box">
              <div className={`loading-step-item ${loadingStep === 0 ? 'active' : loadingStep > 0 ? 'completed' : ''}`}>
                <div className="step-indicator"></div>
                Submitting transaction to GenLayer network...
              </div>
              <div className={`loading-step-item ${loadingStep === 1 ? 'active' : loadingStep > 1 ? 'completed' : ''}`}>
                <div className="step-indicator"></div>
                AI Validators independently scraping flight tracking data...
              </div>
              <div className={`loading-step-item ${loadingStep === 2 ? 'active' : loadingStep > 2 ? 'completed' : ''}`}>
                <div className="step-indicator"></div>
                Applying EU261 compensation math on-chain...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
