export function useFlightDelayVault() {
  const CONTRACT_ADDRESS = '0xFDb21ba414507D1C0d0C7c0292b8909f8E5bB45C';
  
  const MOCK_CLAIMS = [
    { id: 0, flight_number: 'VN302', departure_date: '2026-08-01', flight_distance_km: 1150, status: 'COMPENSATED', delay_hours: 4, compensation_amount: (250n * 10n**18n).toString(), reasoning: 'Flight VN302 on 2026-08-01: scheduled 08:00, actual 12:00 UTC. Delay = 4 hours. Distance 1150km ≤ 1500km → EU261 Tier 1: €250.', deadline: 1785000000 },
    { id: 1, flight_number: 'EK384', departure_date: '2026-07-28', flight_distance_km: 5840, status: 'COMPENSATED', delay_hours: 6, compensation_amount: (600n * 10n**18n).toString(), reasoning: 'Flight EK384 on 2026-07-28: scheduled 23:00, actual 05:00 UTC+1. Delay = 6 hours. Distance 5840km > 3500km → EU261 Tier 3: €600.', deadline: 1784000000 },
    { id: 2, flight_number: 'VN210', departure_date: '2026-08-05', flight_distance_km: 2200, status: 'FUNDED', delay_hours: 0, compensation_amount: '0', reasoning: 'Claim funded. Awaiting passenger delay evidence submission.', deadline: 1786000000 },
    { id: 3, flight_number: 'QH202', departure_date: '2026-08-03', flight_distance_km: 890, status: 'REJECTED', delay_hours: 1, compensation_amount: '0', reasoning: 'Flight QH202 on 2026-08-03: scheduled 14:00, actual 15:00 UTC. Delay = 1 hour. Delay < 3 hours minimum threshold. EU261 compensation not triggered.', deadline: 1785500000 },
    { id: 4, flight_number: 'VN858', departure_date: '2026-08-07', flight_distance_km: 3100, status: 'FAILED', delay_hours: 0, compensation_amount: '0', reasoning: 'TRACKING_FETCH_FAILED: Could not scrape flight tracking data. Funds preserved for retry.', deadline: 1786500000 },
  ];
  
  const fetchClaims = async () => {
    await new Promise(r => setTimeout(r, 800));
    return MOCK_CLAIMS;
  };
  
  const getClaim = async (id) => {
    await new Promise(r => setTimeout(r, 400));
    return MOCK_CLAIMS.find(c => c.id === parseInt(id)) || null;
  };
  
  const fundClaim = async (passenger, flightNumber, departureDate, distanceKm, depositWei, deadlineTs) => {
    await new Promise(r => setTimeout(r, 2000));
    return { txHash: '0xabc123...def456', claimId: MOCK_CLAIMS.length };
  };
  
  const fileClaim = async (claimId, trackingUrl) => {
    await new Promise(r => setTimeout(r, 3000));
    return { txHash: '0xdef789...abc012', status: 'COMPENSATED' };
  };
  
  const expireClaim = async (claimId, timeUrl) => {
    await new Promise(r => setTimeout(r, 2000));
    return { txHash: '0x111222...333444' };
  };
  
  return { CONTRACT_ADDRESS, fetchClaims, getClaim, fundClaim, fileClaim, expireClaim };
}

export function formatGEN(wei) {
  if (!wei || wei === '0') return '0 GEN';
  const val = BigInt(wei) / BigInt(10**15); // milliGEN
  return (Number(val) / 1000).toFixed(0) + ' GEN';
}
