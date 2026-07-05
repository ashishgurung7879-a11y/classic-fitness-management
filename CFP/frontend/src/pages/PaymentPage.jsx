import React, { useEffect, useState } from 'react';
import SiteMeta from '../components/SiteMeta';
import useViewportMatch from '../hooks/useViewportMatch';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fileToDataUrl, memberApi, publicApi } from '../utils/api';
import { useToast } from '../context/ToastContext';

const methodMeta = {
  esewa: {
    label: 'eSewa',
    color: '#0f9d58',
    helper: 'Scan with eSewa and submit the transaction screenshot below.',
  },
  prabhu_bank: {
    label: 'Bank',
    color: '#cc0000',
    helper: 'Use a banking app that supports the Bank QR and keep the receipt screenshot.',
  },
  khalti: {
    label: 'Khalti',
    color: '#5c2d91',
    helper: 'Khalti is supported for proof submissions even if you paid outside this page.',
  },
};

function normalizeMethodKey(value) {
  if (value === 'prabhu') return 'prabhu_bank';
  if (value === 'prabhu_bank' || value === 'khalti' || value === 'esewa') return value;
  return 'esewa';
}

function titleCase(value) {
  return String(value || '')
    .split(' ')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '')
    .join(' ');
}

function parseAmount(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

export default function PaymentPage() {
  const isCompact = useViewportMatch('(max-width: 1023px)');
  const isPhone = useViewportMatch('(max-width: 767px)');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [fileData, setFileData] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [method, setMethod] = useState(
    normalizeMethodKey(searchParams.get('gateway') || searchParams.get('method') || 'esewa')
  );
  const [plan, setPlan] = useState(searchParams.get('plan') || 'Starter');
  const [amount, setAmount] = useState(parseAmount(searchParams.get('amount'), 1500));
  const [paymentSettings, setPaymentSettings] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const gatewayStatus = searchParams.get('status') || '';
  const paymentId = searchParams.get('pid') || '';

  const configuredMethods = Object.entries(methodMeta).reduce((methods, [key, defaults]) => {
    methods[key] = { ...defaults, ...(paymentSettings[key] || {}) };
    return methods;
  }, {});
  const meta = configuredMethods[method] || configuredMethods.esewa;

  useEffect(() => {
    const nextMethod = normalizeMethodKey(searchParams.get('gateway') || searchParams.get('method') || 'esewa');
    const nextPlan = searchParams.get('plan');
    const nextAmount = searchParams.get('amount');

    setMethod(nextMethod);

    if (nextPlan) {
      setPlan(nextPlan);
    }

    if (nextAmount) {
      setAmount((current) => parseAmount(nextAmount, current));
    }
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function loadPaymentSettings() {
      const { ok, data } = await publicApi('/payment-settings');
      if (!mounted) return;

      if (ok) {
        setPaymentSettings(data.methods || {});
      } else {
        showToast(data.message || 'Could not load payment QR settings.');
      }

      setSettingsLoading(false);
    }

    loadPaymentSettings();

    return () => {
      mounted = false;
    };
  }, [showToast]);

  const statusNotice =
    gatewayStatus === 'success'
      ? {
          tone: '#0f8c46',
          background: 'rgba(46, 204, 113, 0.12)',
          border: '1px solid rgba(46, 204, 113, 0.22)',
          text: `Your ${meta.label} payment returned successfully. Upload the receipt or enter the transaction reference so the gym can verify it.`,
        }
      : gatewayStatus === 'failed'
        ? {
            tone: '#b62d1f',
            background: 'rgba(231, 76, 60, 0.12)',
            border: '1px solid rgba(231, 76, 60, 0.22)',
            text: `The ${meta.label} payment was not completed. You can try again or submit proof after paying through another method.`,
          }
        : null;

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('Screenshot must be under 3MB.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setFileData(dataUrl);
      setPreview(dataUrl);
    } catch {
      showToast('Could not read the selected screenshot.');
    }
  }

  async function submitProof() {
    if (!localStorage.getItem('cfp_token')) {
      showToast('Please log in as a member before submitting payment proof.');
      navigate('/member');
      return;
    }

    if (!referenceId && !fileData) {
      showToast('Add either a transaction reference or a screenshot.');
      return;
    }

    setBusy(true);
    const { ok, data } = await memberApi('/manual-payments/submit', {
      method: 'POST',
      body: {
        paymentMethod: method,
        plan: String(plan || 'Starter').toLowerCase(),
        amount,
        referenceId,
        screenshot: fileData,
      },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Could not submit payment proof.');
      return;
    }

    showToast(data.message || 'Payment submitted for verification.');
    navigate('/member');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #faf9f7 0%, #f3f4f6 100%)', color: '#161616' }}>
      <SiteMeta
        title={`Payment Portal | ${titleCase(plan)} | Classic Fitness Park`}
        description={`Submit ${meta.label} payment proof for the ${titleCase(plan)} plan at Classic Fitness Park.`}
        robots="noindex,nofollow"
      />
      <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <img src="/logo.jpg" alt="CFP" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #cc0000' }} />
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', lineHeight: 1 }}>QR Payment Portal</div>
              <div style={{ color: '#666', fontSize: '0.84rem' }}>Payment proof flow connected to the gym API.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-outline" onClick={() => navigate('/')}>Website</button>
            <button type="button" className="btn-red" onClick={() => navigate('/member')}>Member Portal</button>
          </div>
        </div>

        {statusNotice ? (
          <div
            style={{
              marginBottom: '1rem',
              padding: '1rem 1.1rem',
              borderRadius: '18px',
              background: statusNotice.background,
              border: statusNotice.border,
              color: statusNotice.tone,
            }}
          >
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
              {gatewayStatus === 'success' ? 'Payment Return Received' : 'Payment Not Completed'}
            </strong>
            <div>{statusNotice.text}</div>
            {paymentId ? (
              <div style={{ marginTop: '0.4rem', fontSize: '0.84rem', color: '#555' }}>
                Payment ID: <code>{paymentId}</code>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '0.95fr 1.05fr', gap: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.08)', padding: '1.4rem', boxShadow: '0 18px 40px rgba(15,20,30,0.06)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: meta.color }}>Step 1 • Choose a method</div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '3rem', lineHeight: 0.95, margin: '0.45rem 0 0.65rem' }}>
              {titleCase(plan)} Plan
            </h1>
            <p style={{ color: '#555', marginTop: 0 }}>{meta.helper}</p>

            <div style={{ display: 'grid', gap: '0.7rem', marginTop: '1rem' }}>
              {Object.entries(configuredMethods).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  disabled={value.isActive === false}
                  style={{
                    textAlign: 'left',
                    borderRadius: '16px',
                    border: key === method ? `2px solid ${value.color}` : '1px solid rgba(0,0,0,0.08)',
                    background: key === method ? 'rgba(255,255,255,0.98)' : '#f8f8fa',
                    opacity: value.isActive === false ? 0.56 : 1,
                    padding: '0.95rem 1rem',
                    cursor: value.isActive === false ? 'not-allowed' : 'pointer',
                    color: '#161616',
                  }}
                >
                  <strong>{value.label}</strong>
                  <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.2rem' }}>{value.isActive === false ? 'Currently unavailable.' : value.helper}</div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <label>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Plan label</div>
                <input className="inp" value={plan} onChange={(event) => setPlan(event.target.value)} />
              </label>
              <label>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Amount</div>
                <input className="inp" value={amount} onChange={(event) => setAmount(parseAmount(event.target.value, amount))} />
              </label>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.08)', padding: '1.4rem', boxShadow: '0 18px 40px rgba(15,20,30,0.06)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: meta.color }}>Step 2 • Upload proof</div>
            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '0.95fr 1.05fr', gap: '1rem', alignItems: 'center', marginTop: '0.9rem' }}>
              <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '20px', padding: '1rem', textAlign: 'center' }}>
                {meta.imageUrl ? (
                  <img src={meta.imageUrl} alt={`${meta.label} QR`} style={{ width: '100%', maxWidth: '240px', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: '14px' }} />
                ) : (
                  <div style={{ width: '100%', maxWidth: '240px', aspectRatio: '1 / 1', margin: '0 auto', borderRadius: '14px', display: 'grid', placeItems: 'center', background: '#f8f8fa', color: '#777', padding: '1rem', lineHeight: 1.5 }}>
                    {settingsLoading ? 'Loading QR...' : 'QR image will appear after admin uploads it.'}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', lineHeight: 1 }}>{meta.label}</div>
                <div style={{ color: '#666', marginTop: '0.35rem' }}>Submit the exact amount: <strong style={{ color: '#cc0000' }}>Rs. {Number(amount || 0).toLocaleString()}</strong></div>
                <div style={{ color: '#666', marginTop: '0.35rem' }}>Plan reference: <strong>{titleCase(plan)}</strong></div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.9rem', marginTop: '1rem' }}>
              <label>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Transaction reference</div>
                <input className="inp" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} placeholder="Optional if you upload a screenshot" />
              </label>

              <label>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Payment screenshot</div>
                <input className="inp" type="file" accept="image/*" onChange={handleFileChange} />
              </label>

              {preview && (
                <div style={{ padding: '0.8rem', borderRadius: '18px', background: '#f8f8fa', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <img src={preview} alt="Payment proof preview" style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '14px' }} />
                </div>
              )}

              <button type="button" className="btn-red btn-full" disabled={busy} onClick={submitProof}>
                {busy ? 'Submitting Proof...' : 'Submit Payment Proof'}
              </button>

              <p style={{ color: '#666', fontSize: '0.84rem', marginBottom: 0 }}>
                The backend stores this as a manual payment submission and the admin dashboard can verify or reject it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
