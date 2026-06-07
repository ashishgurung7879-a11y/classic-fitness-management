import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicPageShell from '../components/PublicPageShell';
import PageHero from '../components/PageHero';
import MembershipSection from '../sections/MembershipSection';
import NoticeBoard from '../sections/NoticeBoard';
import PaymentModal from '../modals/PaymentModal';

export default function MembershipPage() {
  const navigate = useNavigate();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState({ plan: '', amount: 0 });

  function openPayment(plan, amount) {
    setPaymentPlan({ plan, amount });
    setPaymentOpen(true);
  }

  return (
    <PublicPageShell
      pageClass="page-membership"
      title="Membership Plans | Classic Fitness Park"
      description="Compare membership plans, payment options, and benefits for joining Classic Fitness Park in Kakarvitta."
    >
      <PageHero
        eyebrow="Membership Options"
        title={<>Choose A Plan And Start Training</>}
        description="Pick a monthly plan, pay online or at the counter, and manage your membership from the member dashboard."
        theme="ember"
        actions={[
          { label: 'Open Payment Page', variant: 'btn-red', onClick: () => navigate('/payment') },
          { label: 'Talk To The Team', variant: 'btn-outline', onClick: () => navigate('/contact') },
        ]}
        highlights={[
          { label: 'Starter', value: 'Rs. 1,500', note: 'A practical entry point into the gym.' },
          { label: 'Pro', value: 'Rs. 2,000', note: 'More classes, more support, more momentum.' },
        ]}
        aside={(
          <div className="page-pricing-card">
            <span className="page-spotlight-kicker">What You Unlock</span>
            <ul className="page-check-list">
              <li>Member dashboard access</li>
              <li>QR proof payment flow</li>
              <li>Trainer and class booking support</li>
            </ul>
          </div>
        )}
      />
      <MembershipSection onPay={openPayment} />
      <NoticeBoard />
      {paymentOpen && <PaymentModal plan={paymentPlan.plan} amount={paymentPlan.amount} onClose={() => setPaymentOpen(false)} />}
    </PublicPageShell>
  );
}
