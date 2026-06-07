import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

export default function PaymentModal({ plan, amount, onClose }) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  function handleMethod(method) {
    onClose();
    if (method === 'Cash') {
      showToast('Please visit the gym counter. We will activate your membership.');
      navigate('/contact');
      return;
    }

    const methodMap = { eSewa: 'esewa', Bank: 'prabhu_bank', Khalti: 'khalti' };
    navigate(`/payment?method=${methodMap[method]}&plan=${encodeURIComponent(plan)}&amount=${amount}`);
  }

  return (
    <div className="modal-overlay active" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Counter Payment</h2>
        <div className="modal-body">
          <div style={{ background: 'var(--dark)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--gray-light)', fontSize: '0.9rem' }}>Plan</span>
            <strong>{plan} Plan</strong>
          </div>
          <div style={{ background: 'var(--dark)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--gray-light)', fontSize: '0.9rem' }}>Amount</span>
            <strong style={{ color: 'var(--red)' }}>Rs. {(amount || 0).toLocaleString()}/month</strong>
          </div>

          <p style={{ color: 'var(--gray-light)', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Choose how you&apos;d like to pay:
          </p>

          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {[
              { method: 'eSewa', emoji: '💚', label: 'eSewa QR Code', sub: 'Scan and pay instantly' },
              { method: 'Bank', emoji: '🏦', label: 'Bank QR', sub: 'Bank transfer via QR' },
              { method: 'Cash', emoji: '💵', label: 'Cash at Counter', sub: 'Pay at the gym desk' },
            ].map(({ method, emoji, label, sub }) => (
              <button
                key={method}
                onClick={() => handleMethod(method)}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.2rem', background: 'var(--dark)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', cursor: 'pointer', color: 'var(--white)', textAlign: 'left', transition: 'all 0.2s' }}
                onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--red)'; }}
                onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</div>
                  <div style={{ color: 'var(--gray-light)', fontSize: '0.78rem' }}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
