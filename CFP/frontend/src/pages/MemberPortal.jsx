import React, { useEffect, useState } from 'react';
import SiteMeta from '../components/SiteMeta';
import PasswordInput from '../components/PasswordInput';
import useViewportMatch from '../hooks/useViewportMatch';
import { useNavigate } from 'react-router-dom';
import { clearSession, fileToDataUrl, memberApi, publicApi, setSession } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const tabs = [
  ['overview', 'Overview'],
  ['payments', 'Payments'],
  ['bookings', 'Bookings'],
  ['progress', 'Progress'],
  ['profile', 'Profile'],
  ['alerts', 'Alerts'],
];

const sectionStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #f8f8fa 0%, #f2f3f7 100%)',
  color: '#161616',
};

const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: '22px',
  padding: '1.25rem',
  boxShadow: '0 18px 45px rgba(15, 20, 30, 0.06)',
};

const badgeStyles = {
  active: { background: 'rgba(46, 204, 113, 0.12)', color: '#0f8c46' },
  pending: { background: 'rgba(243, 156, 18, 0.14)', color: '#b36d00' },
  expired: { background: 'rgba(231, 76, 60, 0.14)', color: '#b62d1f' },
};

const defaultLoginForm = { identifier: '', password: '', twoFactorCode: '' };
const defaultRegisterForm = { firstName: '', lastName: '', phone: '', email: '', password: '' };
const defaultForgotForm = { contact: '', otp: '', newPassword: '', confirmPassword: '' };
const defaultProfileForm = { firstName: '', lastName: '', phone: '', address: '', goal: '', photo: '' };
const defaultPasswordForm = { currentPassword: '', newPassword: '' };

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

export default function MemberPortal() {
  const isCompact = useViewportMatch('(max-width: 1023px)');
  const isPhone = useViewportMatch('(max-width: 767px)');
  const isTiny = useViewportMatch('(max-width: 359px)');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { login: syncLogin, logout: syncLogout } = useAuth();
  const [authTab, setAuthTab] = useState('login');
  const [view, setView] = useState('auth');
  const [activeTab, setActiveTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [forgotForm, setForgotForm] = useState(defaultForgotForm);
  const [profileForm, setProfileForm] = useState(defaultProfileForm);
  const [passwordForm, setPasswordForm] = useState(defaultPasswordForm);
  const [workoutCalories, setWorkoutCalories] = useState('150');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('cfp_token')) {
      loadDashboard();
    }
  }, []);

  async function loadDashboard() {
    const [{ ok, data }, notificationsResponse] = await Promise.all([
      memberApi('/dashboard/member'),
      memberApi('/notifications/my'),
    ]);

    if (!ok || !data.dashboard?.user) {
      clearSession('member');
      syncLogout();
      clearMemberState();
      setView('auth');
      return;
    }

    const nextDashboard = data.dashboard;
    setDashboard(nextDashboard);
    setNotifications(notificationsResponse.ok ? (notificationsResponse.data.notifications || []) : []);
    setProfileForm({
      firstName: nextDashboard.user.firstName || '',
      lastName: nextDashboard.user.lastName || '',
      phone: nextDashboard.user.phone || '',
      address: nextDashboard.user.address || '',
      goal: nextDashboard.user.fitnessData?.goal || '',
      photo: nextDashboard.user.photo || '',
    });
    setView('dashboard');
  }

  function clearMemberState() {
    setDashboard(null);
    setNotifications([]);
    setProfileForm(defaultProfileForm);
    setPasswordForm(defaultPasswordForm);
    setWorkoutCalories('150');
    setNeedsTwoFactor(false);
    setResetCodeSent(false);
    setActiveTab('overview');
  }

  function switchAuthTab(nextTab) {
    setAuthTab(nextTab);
    setNeedsTwoFactor(false);
    setResetCodeSent(false);
    setLoginForm(defaultLoginForm);
    setRegisterForm(defaultRegisterForm);
    setForgotForm(defaultForgotForm);
    clearMemberState();
  }

  async function handleLogin() {
    const identifier = loginForm.identifier.trim();
    const password = loginForm.password;

    if (!identifier || !password) {
      showToast('Enter your phone or email and password.');
      return;
    }

    clearSession('member');
    syncLogout();
    clearMemberState();
    setBusy(true);
    const { ok, data } = await publicApi('/auth/login', {
      method: 'POST',
      body: {
        identifier,
        password,
        twoFactorCode: loginForm.twoFactorCode,
      },
    });
    setBusy(false);

    if (!ok && data.requireTwoFactor) {
      setNeedsTwoFactor(true);
      showToast('Enter the 2FA code to finish signing in.');
      return;
    }

    if (!ok) {
      showToast(data.message || 'Login failed.');
      return;
    }

    if (data.user?.role !== 'member') {
      showToast('This account is not a member account.');
      return;
    }

    setSession('member', data.token, data.user);
    syncLogin(data.user, data.token);
    setNeedsTwoFactor(false);
    setLoginForm(defaultLoginForm);
    await loadDashboard();
    showToast(`Welcome back, ${data.user.firstName}.`);
  }

  async function handleRegister() {
    if (!registerForm.firstName || !registerForm.phone || !registerForm.password) {
      showToast('First name, phone and password are required.');
      return;
    }

    setBusy(true);
    const { ok, data } = await publicApi('/auth/register', {
      method: 'POST',
      body: { ...registerForm, role: 'member' },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Registration failed.');
      return;
    }

    setRegisterForm(defaultRegisterForm);
    setLoginForm(defaultLoginForm);
    setAuthTab('login');
    showToast(data.message || 'Registration submitted.');
  }

  async function handleForgotPasswordRequest() {
    if (!forgotForm.contact) {
      showToast('Enter your phone number or email first.');
      return;
    }

    setBusy(true);
    const { ok, data } = await publicApi('/auth/forgot-password', {
      method: 'POST',
      body: { contact: forgotForm.contact },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Could not send reset code.');
      return;
    }

    setResetCodeSent(true);
    setForgotForm((current) => ({
      ...current,
      otp: data.developmentOtp || current.otp,
    }));
    showToast(data.message || 'Reset code sent.');
  }

  async function handleResetPassword() {
    if (!forgotForm.contact || !forgotForm.otp || !forgotForm.newPassword) {
      showToast('Fill in contact, reset code, and new password.');
      return;
    }

    if (forgotForm.newPassword.length < 6) {
      showToast('New password must be at least 6 characters.');
      return;
    }

    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      showToast('New password and confirm password do not match.');
      return;
    }

    setBusy(true);
    const { ok, data } = await publicApi('/auth/reset-password', {
      method: 'POST',
      body: {
        contact: forgotForm.contact,
        otp: forgotForm.otp,
        newPassword: forgotForm.newPassword,
      },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Could not reset password.');
      return;
    }

    setForgotForm(defaultForgotForm);
    setResetCodeSent(false);
    setNeedsTwoFactor(false);
    setAuthTab('login');
    showToast(data.message || 'Password reset successfully.');
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    const { ok, data } = await memberApi('/auth/update', {
      method: 'PUT',
      body: {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone,
        address: profileForm.address,
        photo: profileForm.photo,
        fitnessData: { goal: profileForm.goal },
      },
    });

    if (!ok) {
      showToast(data.message || 'Could not update profile.');
      return;
    }

    if (dashboard?.user) {
      const updatedUser = { ...dashboard.user, ...data.user };
      setDashboard((current) => ({ ...current, user: updatedUser }));
      setSession('member', localStorage.getItem('cfp_token') || '', updatedUser);
      syncLogin(updatedUser, localStorage.getItem('cfp_token') || '');
    }

    showToast('Profile updated.');
  }

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a profile photo under 2 MB.');
      return;
    }

    setProfilePhotoUploading(true);
    try {
      const photo = await fileToDataUrl(file);
      setProfileForm((current) => ({ ...current, photo }));
      showToast(`${file.name} is ready to save.`);
    } catch (error) {
      showToast(error.message || 'Could not read the selected photo.');
    } finally {
      setProfilePhotoUploading(false);
      event.target.value = '';
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showToast('Enter both your current and new password.');
      return;
    }

    const { ok, data } = await memberApi('/auth/change-password', {
      method: 'PUT',
      body: passwordForm,
    });

    if (!ok) {
      showToast(data.message || 'Could not change password.');
      return;
    }

    if (data.token && data.user) {
      setSession('member', data.token, data.user);
      syncLogin(data.user, data.token);
      setDashboard((current) => ({ ...current, user: data.user }));
    }

    setPasswordForm({ currentPassword: '', newPassword: '' });
    showToast('Password changed successfully.');
  }

  async function handleWorkoutLog() {
    const { ok, data } = await memberApi('/auth/log-workout', {
      method: 'POST',
      body: { calories: Number(workoutCalories || 0) },
    });

    if (!ok) {
      showToast(data.message || 'Could not log workout.');
      return;
    }

    setDashboard((current) => ({
      ...current,
      stats: { ...(current?.stats || {}), ...(data.stats || {}) },
    }));
    showToast('Workout logged.');
  }

  function handleLogout() {
    clearSession('member');
    syncLogout();
    clearMemberState();
    setLoginForm(defaultLoginForm);
    setRegisterForm(defaultRegisterForm);
    setForgotForm(defaultForgotForm);
    setView('auth');
    navigate('/');
  }

  if (view === 'auth') {
    return (
      <div style={{ ...sectionStyle, display: 'grid', placeItems: 'center', padding: isPhone ? '1rem' : '2rem' }}>
        <SiteMeta
          title="Member Portal | Classic Fitness Park"
          description="Member login, payments, bookings, progress tracking, and profile tools for Classic Fitness Park."
          robots="noindex,nofollow"
        />
        <div style={{ width: '100%', maxWidth: '460px', minWidth: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: isPhone ? '1rem' : '1.5rem' }}>
            <img src="/logo.jpg" alt="Classic Fitness Park" style={{ width: isPhone ? '72px' : '84px', height: isPhone ? '72px' : '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #cc0000' }} />
            <h1 style={{ marginTop: '1rem', fontFamily: "'Bebas Neue', sans-serif", fontSize: isPhone ? '2.2rem' : '2.6rem', letterSpacing: 0, lineHeight: 1 }}>Member Portal</h1>
            <p style={{ color: '#666', margin: '0.45rem 0 0', lineHeight: 1.5 }}>Account access for memberships, payments and progress.</p>
          </div>

          <div style={{ ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '0.65rem' : '0.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <button type="button" className={authTab === 'login' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('login')}>Login</button>
              <button type="button" className={authTab === 'register' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('register')}>Register</button>
              <button type="button" className={authTab === 'forgot' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('forgot')}>Reset</button>
            </div>

            {authTab === 'login' ? (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Phone or email</div>
                  <input className="inp" value={loginForm.identifier} onChange={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="98XXXXXXXX or email@example.com" autoComplete="off" />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Password</div>
                  <PasswordInput
                    className="inp"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    autoComplete="off"
                  />
                </label>
                {needsTwoFactor && (
                  <label>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>2FA code</div>
                    <input className="inp" value={loginForm.twoFactorCode} onChange={(event) => setLoginForm((current) => ({ ...current, twoFactorCode: event.target.value }))} placeholder="6-digit code" />
                  </label>
                )}
                <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleLogin}>
                  {busy ? 'Signing In...' : needsTwoFactor ? 'Verify & Continue' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className="btn-outline btn-full"
                  onClick={() => {
                    setAuthTab('forgot');
                    setForgotForm((current) => ({ ...current, contact: loginForm.identifier || current.contact }));
                  }}
                >
                  Forgot Password
                </button>
              </div>
            ) : authTab === 'forgot' ? (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Phone or email</div>
                  <input
                    className="inp"
                    value={forgotForm.contact}
                    onChange={(event) => setForgotForm((current) => ({ ...current, contact: event.target.value }))}
                    placeholder="98XXXXXXXX or email@example.com"
                  />
                </label>
                <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleForgotPasswordRequest}>
                  {busy ? 'Sending Code...' : resetCodeSent ? 'Resend Reset Code' : 'Send Reset Code By SMS'}
                </button>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Reset code</div>
                  <input
                    className="inp"
                    value={forgotForm.otp}
                    onChange={(event) => setForgotForm((current) => ({ ...current, otp: event.target.value }))}
                    placeholder="6-digit code"
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>New password</div>
                  <PasswordInput
                    className="inp"
                    value={forgotForm.newPassword}
                    onChange={(event) => setForgotForm((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Confirm new password</div>
                  <PasswordInput
                    className="inp"
                    value={forgotForm.confirmPassword}
                    onChange={(event) => setForgotForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
                <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleResetPassword}>
                  {busy ? 'Resetting Password...' : 'Reset Password'}
                </button>
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#666' }}>
                  The reset code expires in 10 minutes. SMS delivery needs `SMS_GATEWAY_URL` configured in `Backend/.env`.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                  <label>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>First name</div>
                    <input className="inp" value={registerForm.firstName} onChange={(event) => setRegisterForm((current) => ({ ...current, firstName: event.target.value }))} />
                  </label>
                  <label>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Last name</div>
                    <input className="inp" value={registerForm.lastName} onChange={(event) => setRegisterForm((current) => ({ ...current, lastName: event.target.value }))} />
                  </label>
                </div>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Phone</div>
                  <input className="inp" value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} placeholder="98XXXXXXXX" />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Email</div>
                  <input className="inp" type="email" value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="Optional" />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Password</div>
                  <PasswordInput
                    className="inp"
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
                <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleRegister}>
                  {busy ? 'Submitting...' : 'Create Member Account'}
                </button>
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#666' }}>New member signups stay pending until the gym approves them.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const user = dashboard?.user || {};
  const membership = dashboard?.membership || {};
  const payments = dashboard?.payments || [];
  const bookings = dashboard?.bookings || [];
  const attendance = dashboard?.attendance || [];
  const stats = dashboard?.stats || {};
  const statusKey = membership.isActive && membership.daysLeft > 0 ? 'active' : membership.daysLeft === 0 && membership.endDate ? 'expired' : 'pending';

  return (
    <div style={sectionStyle}>
      <SiteMeta
        title="Member Dashboard | Classic Fitness Park"
        description="Track memberships, bookings, payments, and personal progress in the Classic Fitness Park member dashboard."
        robots="noindex,nofollow"
      />
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid rgba(0,0,0,0.08)', backdropFilter: 'blur(10px)' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: isPhone ? '0.8rem 0.85rem' : '0.9rem 1.25rem', display: isPhone ? 'grid' : 'flex', gridTemplateColumns: '1fr', alignItems: 'center', justifyContent: 'space-between', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <img src={user.photo || '/logo.jpg'} alt="CFP" style={{ width: isPhone ? '42px' : '46px', height: isPhone ? '42px' : '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #cc0000', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isPhone ? '1.35rem' : '1.8rem', lineHeight: 1, overflowWrap: 'anywhere', letterSpacing: 0 }}>Classic Fitness Park</div>
              <div style={{ color: '#666', fontSize: '0.82rem' }}>Welcome, {user.firstName || 'Member'}</div>
            </div>
          </div>
          <div style={{ display: isPhone ? 'grid' : 'flex', gridTemplateColumns: isTiny ? '1fr' : '1fr 1fr', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', width: isPhone ? '100%' : 'auto' }}>
            <span style={{ ...badgeStyles[statusKey], borderRadius: '999px', padding: '0.45rem 0.9rem', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center', gridColumn: isPhone && !isTiny ? '1 / -1' : undefined }}>
              {statusKey === 'active' ? `${membership.daysLeft} days left` : statusKey === 'expired' ? 'Membership expired' : 'Pending activation'}
            </span>
            <button type="button" className="btn-outline" style={{ width: isPhone ? '100%' : undefined }} onClick={() => navigate('/')}>Website</button>
            <button type="button" className="btn-red" style={{ width: isPhone ? '100%' : undefined }} onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: isPhone ? '1rem 0.85rem 2rem' : '1.5rem 1.25rem 3rem' }}>
        <div style={{ ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '1rem' : cardStyle.padding, marginBottom: '1.25rem', background: 'linear-gradient(135deg, rgba(204,0,0,0.07), rgba(255,255,255,0.98))' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '2fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.82rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a02818', fontWeight: 800 }}>Membership Snapshot</div>
              <h1 style={{ margin: '0.35rem 0 0.55rem', fontFamily: "'Bebas Neue', sans-serif", fontSize: isPhone ? '2.2rem' : '3rem', lineHeight: 0.95, letterSpacing: 0, overflowWrap: 'anywhere' }}>
                {membership.plan ? membership.plan.toUpperCase() : 'PENDING'} PLAN
              </h1>
              <p style={{ margin: 0, color: '#555', maxWidth: '620px' }}>
                Your member ID is {membership.memberId || 'being assigned'}.
                {membership.endDate ? ` Renewal ends on ${formatDate(membership.endDate)}.` : ' The gym will activate your membership after approval.'}
              </p>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                <div style={{ color: '#666', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Due amount</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#cc0000' }}>{money(membership.dueAmount)}</div>
              </div>
              <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                <div style={{ color: '#666', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>Paid amount</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1c8e42' }}>{money(membership.paidAmount)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isTiny ? '1fr' : isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isPhone ? '0.75rem' : '1rem', marginBottom: '1.25rem' }}>
          {[
            ['Workouts', stats.totalWorkouts || 0],
            ['Calories', stats.caloriesBurned || 0],
            ['Payments', payments.length],
            ['Sessions', bookings.length],
          ].map(([label, value]) => (
            <div key={label} style={cardStyle}>
              <div style={{ color: '#666', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.2rem', marginTop: '0.35rem' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: isPhone ? 'grid' : 'flex', gridTemplateColumns: isTiny ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" className={activeTab === id ? 'btn-red' : 'btn-outline'} style={{ width: isPhone ? '100%' : undefined }} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1.2fr 0.8fr', gap: '1rem' }}>
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Recent activity</h2>
              {payments.length === 0 && bookings.length === 0 ? (
                <p style={{ color: '#666', marginBottom: 0 }}>Your account is ready. New payments and bookings will appear here.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.85rem' }}>
                  {payments.slice(0, 3).map((payment) => (
                    <div key={payment._id} style={{ padding: '0.95rem 1rem', borderRadius: '16px', background: '#f7f7f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: isPhone ? 'flex-start' : 'center', flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
                        <div>
                          <strong>{payment.description || 'Membership payment'}</strong>
                          <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.2rem' }}>{formatDate(payment.createdAt, true)}</div>
                        </div>
                        <span style={{ ...badgeStyles[payment.status === 'completed' ? 'active' : payment.status === 'rejected' ? 'expired' : 'pending'], borderRadius: '999px', padding: '0.35rem 0.7rem', fontSize: '0.78rem', fontWeight: 700 }}>
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>Quick actions</h2>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <button type="button" className="btn-red btn-full" onClick={() => navigate(`/payment?plan=${encodeURIComponent((membership.plan || 'Starter').replace(/^./, (char) => char.toUpperCase()))}&amount=${membership.plan === 'pro' ? 2000 : membership.plan === 'elite' ? 5000 : 1500}`)}>
                    Renew membership
                  </button>
                  <button type="button" className="btn-outline btn-full" onClick={() => setActiveTab('profile')}>Update profile</button>
                  <button type="button" className="btn-outline btn-full" onClick={() => setActiveTab('alerts')}>View alerts</button>
                </div>
              </div>

              <div style={cardStyle}>
                <h2 style={{ marginTop: 0 }}>Attendance</h2>
                <p style={{ color: '#666', marginTop: 0 }}>
                  Online attendance is currently handled at the gym counter. Historical records already stored in the database still appear below.
                </p>
                <div style={{ marginTop: '0.75rem', color: '#333', fontWeight: 700 }}>{attendance.length} saved records</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>Payment history</h2>
                  <p style={{ color: '#666', marginBottom: 0 }}>QR submissions and approved payments are merged into one feed.</p>
                </div>
                <button type="button" className="btn-red" onClick={() => navigate('/payment')}>Open payment page</button>
              </div>
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
                {payments.length === 0 ? (
                  <p style={{ color: '#666', marginBottom: 0 }}>No payments yet.</p>
                ) : payments.map((payment) => (
                  <div key={payment._id} style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.2fr auto auto', gap: '1rem', alignItems: 'center', padding: '0.95rem 1rem', borderRadius: '16px', background: '#f7f7f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div>
                      <strong>{payment.description || 'Membership payment'}</strong>
                      <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                        {String(payment.method || 'cash').toUpperCase()} • {formatDate(payment.createdAt, true)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800 }}>{money(payment.totalAmount)}</div>
                    <span style={{ ...badgeStyles[payment.status === 'completed' ? 'active' : payment.status === 'rejected' ? 'expired' : 'pending'], borderRadius: '999px', padding: '0.35rem 0.7rem', fontSize: '0.78rem', fontWeight: 700 }}>
                      {payment.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Bookings</h2>
            {bookings.length === 0 ? (
              <p style={{ color: '#666', marginBottom: 0 }}>No bookings yet. Use the home page to reserve classes or trainer sessions.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {bookings.map((booking) => (
                  <div key={booking._id} style={{ padding: '0.95rem 1rem', borderRadius: '16px', background: '#f7f7f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{booking.className || booking.notes || 'Class booking'}</strong>
                        <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                          {formatDate(booking.date, true)}
                          {booking.trainer ? ` • ${booking.trainer.firstName} ${booking.trainer.lastName || ''}` : ''}
                        </div>
                      </div>
                      <span style={{ ...badgeStyles[booking.status === 'completed' ? 'active' : booking.status === 'cancelled' ? 'expired' : 'pending'], borderRadius: '999px', padding: '0.35rem 0.7rem', fontSize: '0.78rem', fontWeight: 700 }}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'progress' && (
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: '1rem' }}>
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Log a workout</h2>
              <p style={{ color: '#666' }}>Use this when you finish a session and want the portal to track your progress stats.</p>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Calories burned</div>
                  <input className="inp" value={workoutCalories} onChange={(event) => setWorkoutCalories(event.target.value)} />
                </label>
                <button type="button" className="btn-red btn-full" onClick={handleWorkoutLog}>Log Workout</button>
              </div>
            </div>
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Saved attendance</h2>
              {attendance.length === 0 ? (
                <p style={{ color: '#666', marginBottom: 0 }}>No attendance records are stored for this account yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {attendance.slice(0, 8).map((record) => (
                    <div key={record._id} style={{ padding: '0.8rem 0.9rem', borderRadius: '14px', background: '#f7f7f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                      <strong>{formatDate(record.checkinAt, true)}</strong>
                      <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                        {record.checkoutAt ? `Checked out at ${formatDate(record.checkoutAt, true)}` : 'Check-out not recorded'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: '1rem' }}>
            <form style={cardStyle} onSubmit={handleProfileSave}>
              <h2 style={{ marginTop: 0 }}>Update profile</h2>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '96px 1fr', gap: '0.85rem', alignItems: 'center' }}>
                  <div style={{ width: '96px', height: '96px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #cc0000', background: '#f3f3f5', display: 'grid', placeItems: 'center', color: '#777', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                    {profileForm.photo ? (
                      <img src={profileForm.photo} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>No photo</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <label className="btn-outline btn-full" style={{ cursor: 'pointer', textAlign: 'center' }}>
                      <input type="file" accept="image/*" onChange={handleProfilePhotoChange} style={{ display: 'none' }} />
                      {profilePhotoUploading ? 'Reading Photo...' : 'Choose Profile Picture'}
                    </label>
                    {profileForm.photo ? (
                      <button type="button" className="btn-outline btn-full" onClick={() => setProfileForm((current) => ({ ...current, photo: '' }))}>
                        Remove Profile Picture
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                  <label>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>First name</div>
                    <input className="inp" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} />
                  </label>
                  <label>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Last name</div>
                    <input className="inp" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} />
                  </label>
                </div>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Phone</div>
                  <input className="inp" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Address</div>
                  <input className="inp" value={profileForm.address} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Primary goal</div>
                  <input className="inp" value={profileForm.goal} onChange={(event) => setProfileForm((current) => ({ ...current, goal: event.target.value }))} placeholder="Build muscle, lose fat, improve endurance..." />
                </label>
                <button type="submit" className="btn-red btn-full">Save Profile</button>
              </div>
            </form>

            <form style={cardStyle} onSubmit={handlePasswordChange}>
              <h2 style={{ marginTop: 0 }}>Change password</h2>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>Current password</div>
                  <PasswordInput
                    className="inp"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: '#666' }}>New password</div>
                  <PasswordInput
                    className="inp"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" className="btn-red btn-full">Update Password</button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Notifications</h2>
            {notifications.length === 0 ? (
              <p style={{ color: '#666', marginBottom: 0 }}>No messages yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {notifications.map((notification) => (
                  <div key={notification._id} style={{ padding: '0.95rem 1rem', borderRadius: '16px', background: '#f7f7f9', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{notification.title}</strong>
                      <span style={{ color: '#666', fontSize: '0.84rem' }}>{formatDate(notification.createdAt, true)}</span>
                    </div>
                    <p style={{ color: '#555', margin: '0.45rem 0 0' }}>{notification.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
