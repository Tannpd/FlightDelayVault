import { useState, useCallback, useEffect } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x4c478A2137DB044508196eD7DEfa4B574a0145f1';
const RPC_ENDPOINT = import.meta.env.VITE_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';

const customStudionet = {
  ...studionet,
  rpcUrls: {
    default: { http: [RPC_ENDPOINT] },
    public: { http: [RPC_ENDPOINT] },
  }
};

let _readClient = null;

function getReadClient() {
  if (!_readClient) {
    _readClient = createClient({ chain: customStudionet });
  }
  return _readClient;
}

function getWriteClient(account) {
  if (typeof account === 'string') {
    return createClient({ chain: customStudionet, account: account });
  }
  return createClient({ chain: customStudionet, account });
}

// Fallback account generator for non-MetaMask browser environments
function getFallbackAccount() {
  if (typeof window === 'undefined') return createAccount();
  try {
    const savedPk = localStorage.getItem('flightdelay_genlayer_pk');
    if (savedPk && savedPk.startsWith('0x') && savedPk.length === 66) {
      return createAccount(savedPk);
    }
    const newAcc = createAccount();
    if (newAcc && newAcc.privateKey) {
      localStorage.setItem('flightdelay_genlayer_pk', newAcc.privateKey);
    }
    return newAcc;
  } catch (e) {
    return createAccount();
  }
}

// Convert Wei (u256) to human readable GEN string
export function formatGen(weiVal) {
  if (!weiVal) return '0';
  try {
    const big = BigInt(weiVal);
    const integerPart = big / 10n**18n;
    const fractionalPart = big % 10n**18n;
    let fractionStr = fractionalPart.toString().padStart(18, '0');
    fractionStr = fractionStr.replace(/0+$/, '');
    if (fractionStr === '') {
      return integerPart.toString();
    }
    return `${integerPart}.${fractionStr.slice(0, 4)}`;
  } catch (e) {
    return '0';
  }
}

// Convert human readable GEN string to Wei (u256 BigInt)
export function parseGen(genVal) {
  if (!genVal || genVal.toString().trim() === '') return 0n;
  try {
    const parts = genVal.toString().split('.');
    let integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    fractionalPart = fractionalPart.slice(0, 18).padEnd(18, '0');
    return BigInt(integerPart) * 10n**18n + BigInt(fractionalPart);
  } catch (e) {
    return 0n;
  }
}

export function useFlightDelayVault() {
  const [address, setAddress] = useState('');
  const [glAccount, setGlAccount] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStatus, setTxStatus] = useState('');

  // Connect wallet
  const connectWallet = useCallback(async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts.length > 0) {
          const userAddr = accounts[0];
          setAddress(userAddr);
          setGlAccount(userAddr);
          return userAddr;
        }
      }
      const acc = getFallbackAccount();
      setGlAccount(acc);
      setAddress(acc.address);
      return acc.address;
    } catch (err) {
      console.error('Wallet connect error:', err);
      const acc = getFallbackAccount();
      setGlAccount(acc);
      setAddress(acc.address);
      return acc.address;
    }
  }, []);

  // Fetch real claim data on-chain from GenLayer contract
  const fetchClaimsState = useCallback(async () => {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return;
    setLoading(true);
    setError('');
    try {
      const client = getReadClient();
      const countBig = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_claims_count',
        args: [],
      });

      const count = Number(countBig);
      const fetchedClaims = [];

      for (let i = 0; i < count; i++) {
        const claimJsonStr = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_claim',
          args: [i],
        });
        if (claimJsonStr && claimJsonStr !== '{}') {
          try {
            const parsed = JSON.parse(claimJsonStr);
            fetchedClaims.push(parsed);
          } catch (e) {
            console.error(`Error parsing claim #${i}:`, e);
          }
        }
      }

      // Exact reflection of on-chain state (0 if 0 claims created yet)
      setClaims(fetchedClaims);
    } catch (err) {
      console.warn('GenLayer RPC fetch warning:', err);
      // On connection error, keep current claims state
    } finally {
      setLoading(false);
    }
  }, []);

  // Fund compensation claim on-chain
  const fundCompensationClaim = useCallback(async (passengerAddr, flightNumber, departureDate, distanceKm, depositGen, deadlineTs) => {
    setLoading(true);
    setError('');
    setTxStatus('Initializing compensation deposit transaction...');
    try {
      let currentAcc = glAccount;
      if (!currentAcc) {
        const connectedAddr = await connectWallet();
        currentAcc = connectedAddr;
      }

      const client = getWriteClient(currentAcc);
      const weiValue = parseGen(depositGen);
      const distInt = parseInt(distanceKm, 10);
      const deadInt = parseInt(deadlineTs, 10);

      setTxStatus('Broadcasting fund_compensation_claim to GenLayer StudioNet...');

      const tx = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'fund_compensation_claim',
        args: [passengerAddr, flightNumber, departureDate, distInt, deadInt],
        value: weiValue,
      });

      setTxHash(tx.hash || tx);
      setTxStatus('Waiting for GenLayer transaction finalization...');

      const receipt = await client.waitForTransactionReceipt({ hash: tx.hash || tx });
      setTxStatus('Compensation claim successfully funded on-chain!');

      await fetchClaimsState();
      return receipt;
    } catch (err) {
      console.error('Fund claim error:', err);
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setLoading(false);
      setTxHash('');
      setTxStatus('');
    }
  }, [glAccount, connectWallet, fetchClaimsState]);

  // File delay claim & trigger AI audit consensus on-chain
  const fileDelayClaim = useCallback(async (claimId, trackingEvidenceUrl) => {
    setLoading(true);
    setError('');
    setTxStatus('Submitting tracking evidence to GenLayer AI Validators...');
    try {
      let currentAcc = glAccount;
      if (!currentAcc) {
        const connectedAddr = await connectWallet();
        currentAcc = connectedAddr;
      }

      const client = getWriteClient(currentAcc);
      const cidInt = parseInt(claimId, 10);

      setTxStatus('AI Validators scraping tracking page & auditing EU261 eligibility...');

      const tx = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'file_delay_claim',
        args: [cidInt, trackingEvidenceUrl],
      });

      setTxHash(tx.hash || tx);
      setTxStatus('Executing Lead AI Auditor & Validator consensus...');

      const receipt = await client.waitForTransactionReceipt({ hash: tx.hash || tx });
      setTxStatus('EU261 delay audit completed and settled on-chain!');

      await fetchClaimsState();
      return receipt;
    } catch (err) {
      console.error('File claim error:', err);
      setError(err.message || 'Delay claim filing failed');
      throw err;
    } finally {
      setLoading(false);
      setTxHash('');
      setTxStatus('');
    }
  }, [glAccount, connectWallet, fetchClaimsState]);

  // Expire & release compensation deposit on-chain
  const expireAndRelease = useCallback(async (claimId, timeSourceUrl) => {
    setLoading(true);
    setError('');
    setTxStatus('Submitting deadline expiry check to GenLayer AI Time Consensus...');
    try {
      let currentAcc = glAccount;
      if (!currentAcc) {
        const connectedAddr = await connectWallet();
        currentAcc = connectedAddr;
      }

      const client = getWriteClient(currentAcc);
      const cidInt = parseInt(claimId, 10);

      setTxStatus('Verifying timestamp > claim deadline via authoritative time source...');

      const tx = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'expire_and_release',
        args: [cidInt, timeSourceUrl],
      });

      setTxHash(tx.hash || tx);
      setTxStatus('Finalizing deadline recovery release on-chain...');

      const receipt = await client.waitForTransactionReceipt({ hash: tx.hash || tx });
      setTxStatus('Deadline settlement completed!');

      await fetchClaimsState();
      return receipt;
    } catch (err) {
      console.error('Expire claim error:', err);
      setError(err.message || 'Expiry settlement failed');
      throw err;
    } finally {
      setLoading(false);
      setTxHash('');
      setTxStatus('');
    }
  }, [glAccount, connectWallet, fetchClaimsState]);

  // Initial fetch on mount
  useEffect(() => {
    fetchClaimsState();
  }, [fetchClaimsState]);

  return {
    contractAddress: CONTRACT_ADDRESS,
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
  };
}
