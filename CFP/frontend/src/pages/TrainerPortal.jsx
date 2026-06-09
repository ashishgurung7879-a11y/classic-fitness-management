import React, { useEffect, useState } from 'react';
import SiteMeta from '../components/SiteMeta';
import PasswordInput from '../components/PasswordInput';
import useViewportMatch from '../hooks/useViewportMatch';
import { clearSession, fileToDataUrl, publicApi, setSession, trainerApi } from '../utils/api';
import { useToast } from '../context/ToastContext';

const tabs = [
  ['overview', 'Overview'],
  ['schedule', 'Schedule'],
  ['bookings', 'Bookings'],
  ['members', 'Members'],
  ['profile', 'Profile'],
];

const shellStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #0e0f12 0%, #13161e 100%)',
  color: '#fff',
};

const cardStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '22px',
  padding: '1.2rem',
  boxShadow: '0 18px 45px rgba(0,0,0,0.18)',
  backdropFilter: 'blur(8px)',
};

const specialityOptions = [
  'Strength Training',
  'HIIT & Cardio',
  'Yoga & Mobility',
  'Weight Loss',
  'Bodybuilding',
  'General Fitness',
];

const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const defaultTrainerLoginForm = { identifier: '', password: '' };
const defaultTrainerRegisterForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  password: '',
  photo: '',
  experience: '1',
  specialities: ['Strength Training'],
  certifications: '',
  bio: '',
};
const defaultTrainerForgotForm = { contact: '', otp: '', newPassword: '', confirmPassword: '' };
const defaultTrainerProfileForm = { firstName: '', lastName: '', phone: '', photo: '', bio: '', certifications: '' };

function noticeTag(value) {
  const cleaned = String(value || '').trim().replace(/[^a-z0-9 ]/gi, '').toUpperCase();
  return cleaned ? cleaned.slice(0, 10) : 'NEWS';
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

export default function TrainerPortal() {
  const isCompact = useViewportMatch('(max-width: 1023px)');
  const isPhone = useViewportMatch('(max-width: 767px)');
  const isTiny = useViewportMatch('(max-width: 359px)');
  const { showToast } = useToast();
  const [view, setView] = useState('auth');
  const [authTab, setAuthTab] = useState('login');
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [trainer, setTrainer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [members, setMembers] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loginForm, setLoginForm] = useState(defaultTrainerLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultTrainerRegisterForm);
  const [forgotForm, setForgotForm] = useState(defaultTrainerForgotForm);
  const [profileForm, setProfileForm] = useState(defaultTrainerProfileForm);
  const [slotForm, setSlotForm] = useState({ dayOfWeek: '1', startTime: '06:00', endTime: '08:00', maxBookings: '3' });
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [photoUploading, setPhotoUploading] = useState('');

  useEffect(() => {
    if (localStorage.getItem('cfp_trainer_token')) {
      bootstrap();
    }
  }, []);

  async function bootstrap() {
    const me = await trainerApi('/auth/me');
    if (!me.ok || me.data.user?.role !== 'trainer') {
      clearSession('trainer');
      clearTrainerDashboardState();
      setView('auth');
      return;
    }

    setTrainer(me.data.user);
    setProfileForm({
      firstName: me.data.user.firstName || '',
      lastName: me.data.user.lastName || '',
      phone: me.data.user.phone || '',
      photo: me.data.user.photo || '',
      bio: me.data.user.trainerProfile?.bio || '',
      certifications: me.data.user.trainerProfile?.certifications || '',
    });
    setView('dashboard');
    await Promise.all([loadBookings(), loadMembers(), loadNotices(), loadSchedule(me.data.user._id || me.data.user.id)]);
  }

  async function loadBookings() {
    const { ok, data } = await trainerApi('/bookings/trainer');
    if (ok) setBookings(data.bookings || []);
  }

  async function loadMembers() {
    const { ok, data } = await trainerApi('/members');
    if (ok) setMembers(data.members || []);
  }

  async function loadNotices() {
    const { ok, data } = await trainerApi('/notices');
    if (ok) setNotices(data.notices || []);
  }

  async function loadSchedule(trainerId = trainer?._id || trainer?.id) {
    if (!trainerId) return;
    const { ok, data } = await trainerApi(`/trainers/${trainerId}/schedule`);
    if (ok) setSchedule(data.schedule || []);
  }

  function clearTrainerDashboardState() {
    setTrainer(null);
    setBookings([]);
    setSchedule([]);
    setMembers([]);
    setNotices([]);
    setProfileForm(defaultTrainerProfileForm);
    setPhotoUploading('');
    setTab('overview');
  }

  function switchAuthTab(nextTab) {
    setAuthTab(nextTab);
    setLoginForm(defaultTrainerLoginForm);
    setRegisterForm(defaultTrainerRegisterForm);
    setForgotForm(defaultTrainerForgotForm);
    setResetCodeSent(false);
    clearTrainerDashboardState();
  }

  async function handleLogin() {
    const identifier = loginForm.identifier.trim();
    const password = loginForm.password;

    if (!identifier || !password) {
      showToast('Enter your trainer phone or email and password.');
      return;
    }

    clearSession('trainer');
    clearTrainerDashboardState();
    setBusy(true);
    const { ok, data } = await publicApi('/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Login failed.');
      return;
    }

    if (data.user?.role !== 'trainer') {
      showToast('This account is not a trainer account.');
      return;
    }

    setSession('trainer', data.token, data.user);
    setTrainer(data.user);
    setLoginForm(defaultTrainerLoginForm);
    setProfileForm({
      firstName: data.user.firstName || '',
      lastName: data.user.lastName || '',
      phone: data.user.phone || '',
      photo: data.user.photo || '',
      bio: data.user.trainerProfile?.bio || '',
      certifications: data.user.trainerProfile?.certifications || '',
    });
    setView('dashboard');
    await Promise.all([loadBookings(), loadMembers(), loadNotices(), loadSchedule(data.user._id || data.user.id)]);
    showToast(`Welcome back, ${data.user.firstName}.`);
  }

  async function handleRegister() {
    if (!registerForm.firstName || !registerForm.phone || !registerForm.password) {
      showToast('Complete the required trainer application fields.');
      return;
    }

    setBusy(true);
    const { ok, data } = await publicApi('/auth/register', {
      method: 'POST',
      body: {
        firstName: registerForm.firstName,
        lastName: registerForm.lastName,
        phone: registerForm.phone,
        email: registerForm.email,
        password: registerForm.password,
        photo: registerForm.photo,
        role: 'trainer',
        trainerApplication: {
          experience: registerForm.experience,
          specialities: registerForm.specialities,
          certifications: registerForm.certifications,
          bio: registerForm.bio,
        },
      },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Trainer application failed.');
      return;
    }

    setRegisterForm(defaultTrainerRegisterForm);
    setLoginForm(defaultTrainerLoginForm);
    setAuthTab('login');
    showToast(data.message || 'Application submitted.');
  }

  async function handleForgotPasswordRequest() {
    if (!forgotForm.contact) {
      showToast('Enter trainer phone number or email first.');
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

    setForgotForm(defaultTrainerForgotForm);
    setResetCodeSent(false);
    setAuthTab('login');
    showToast(data.message || 'Password reset successfully.');
  }

  function logout() {
    clearSession('trainer');
    clearTrainerDashboardState();
    setLoginForm(defaultTrainerLoginForm);
    setRegisterForm(defaultTrainerRegisterForm);
    setForgotForm(defaultTrainerForgotForm);
    setResetCodeSent(false);
    setView('auth');
  }

  async function saveProfile(event) {
    event.preventDefault();
    const { ok, data } = await trainerApi('/auth/update', {
      method: 'PUT',
      body: {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone,
        photo: profileForm.photo,
        trainerProfile: {
          bio: profileForm.bio,
          certifications: profileForm.certifications,
        },
      },
    });

    if (!ok) {
      showToast(data.message || 'Could not update profile.');
      return;
    }

    setTrainer(data.user);
    setSession('trainer', localStorage.getItem('cfp_trainer_token') || '', data.user);
    showToast('Trainer profile updated.');
  }

  async function handlePhotoChange(event, target) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      showToast('Choose a profile photo under 2 MB.');
      event.target.value = '';
      return;
    }

    setPhotoUploading(target);
    try {
      const photo = await fileToDataUrl(file);
      if (target === 'register') {
        setRegisterForm((current) => ({ ...current, photo }));
      } else {
        setProfileForm((current) => ({ ...current, photo }));
      }
      showToast(`${file.name} is ready to save.`);
    } catch (error) {
      showToast(error.message || 'Could not read the selected photo.');
    } finally {
      setPhotoUploading('');
      event.target.value = '';
    }
  }

  async function addScheduleSlot(event) {
    event.preventDefault();
    const trainerId = trainer?._id || trainer?.id;
    if (!trainerId) return;

    const { ok, data } = await trainerApi(`/trainers/${trainerId}/schedule`, {
      method: 'POST',
      body: {
        dayOfWeek: Number(slotForm.dayOfWeek),
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
        maxBookings: Number(slotForm.maxBookings),
      },
    });

    if (!ok) {
      showToast(data.message || 'Could not save schedule slot.');
      return;
    }

    setSlotForm({ dayOfWeek: '1', startTime: '06:00', endTime: '08:00', maxBookings: '3' });
    showToast('Schedule slot added.');
    await loadSchedule(trainerId);
  }

  function toggleSpeciality(value) {
    setRegisterForm((current) => {
      const exists = current.specialities.includes(value);
      return {
        ...current,
        specialities: exists
          ? current.specialities.filter((item) => item !== value)
          : [...current.specialities, value],
      };
    });
  }

  if (view === 'auth') {
    return (
      <div style={{ ...shellStyle, display: 'grid', placeItems: 'center', padding: isPhone ? '1rem' : '2rem' }}>
        <SiteMeta
          title="Trainer Portal | Classic Fitness Park"
          description="Trainer login, applications, schedule slots, bookings, and profile management for Classic Fitness Park."
          robots="noindex,nofollow"
        />
        <div style={{ width: '100%', maxWidth: authTab === 'register' ? '720px' : '460px', minWidth: 0, ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '1rem' : cardStyle.padding }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <img src="/logo.jpg" alt="CFP" style={{ width: isPhone ? '72px' : '84px', height: isPhone ? '72px' : '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #cc0000' }} />
            <h1 style={{ margin: '1rem 0 0.35rem', fontFamily: "'Bebas Neue', sans-serif", fontSize: isPhone ? '2.25rem' : '2.8rem', letterSpacing: 0, lineHeight: 1 }}>Trainer Portal</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>Application, schedule and coaching dashboard.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            <button type="button" className={authTab === 'login' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('login')}>Login</button>
            <button type="button" className={authTab === 'register' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('register')}>Apply</button>
            <button type="button" className={authTab === 'forgot' ? 'btn-red btn-full' : 'btn-outline btn-full'} onClick={() => switchAuthTab('forgot')}>Reset</button>
          </div>

          {authTab === 'login' ? (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Phone or email</div><input className="inp" value={loginForm.identifier} onChange={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="9800000000 or trainer@example.com" autoComplete="off" /></label>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Password</div><PasswordInput className="inp" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} autoComplete="off" /></label>
              <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleLogin}>{busy ? 'Signing In...' : 'Login as Trainer'}</button>
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
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Phone or email</div><input className="inp" value={forgotForm.contact} onChange={(event) => setForgotForm((current) => ({ ...current, contact: event.target.value }))} placeholder="9800000000 or trainer@example.com" autoComplete="off" /></label>
              <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleForgotPasswordRequest}>
                {busy ? 'Sending Code...' : resetCodeSent ? 'Resend Reset Code' : 'Send Reset Code'}
              </button>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Reset code</div><input className="inp" value={forgotForm.otp} onChange={(event) => setForgotForm((current) => ({ ...current, otp: event.target.value }))} placeholder="6-digit code" autoComplete="one-time-code" /></label>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>New password</div><PasswordInput className="inp" value={forgotForm.newPassword} onChange={(event) => setForgotForm((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" /></label>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Confirm new password</div><PasswordInput className="inp" value={forgotForm.confirmPassword} onChange={(event) => setForgotForm((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" /></label>
              <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleResetPassword}>
                {busy ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>First name</div><input className="inp" value={registerForm.firstName} onChange={(event) => setRegisterForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Last name</div><input className="inp" value={registerForm.lastName} onChange={(event) => setRegisterForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Phone</div><input className="inp" value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Email (optional)</div><input className="inp" type="email" value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="Optional" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Password</div><PasswordInput className="inp" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" /></label>
                <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Experience (years)</div><input className="inp" value={registerForm.experience} onChange={(event) => setRegisterForm((current) => ({ ...current, experience: event.target.value }))} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '104px minmax(0, 1fr)', gap: '0.85rem', alignItems: 'center', padding: '0.9rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ width: isPhone ? '96px' : '104px', height: isPhone ? '96px' : '104px', borderRadius: '16px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.55)', justifySelf: isPhone ? 'start' : 'auto' }}>
                  {registerForm.photo ? <img src={registerForm.photo} alt="Trainer profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Photo'}
                </div>
                <div style={{ display: 'grid', gap: '0.65rem', minWidth: 0 }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>Profile picture</div>
                    <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.84rem', marginTop: '0.25rem', lineHeight: 1.45 }}>Choose a clear trainer photo from this device.</div>
                  </div>
                  <label className="btn-outline" style={{ textAlign: 'center', cursor: 'pointer', width: isPhone ? '100%' : 'fit-content' }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => handlePhotoChange(event, 'register')} />
                    {photoUploading === 'register' ? 'Reading Photo...' : registerForm.photo ? 'Change Picture' : 'Choose Picture'}
                  </label>
                  {registerForm.photo ? (
                    <button type="button" className="btn-outline" style={{ width: isPhone ? '100%' : 'fit-content' }} onClick={() => setRegisterForm((current) => ({ ...current, photo: '' }))}>
                      Remove Picture
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem', color: 'rgba(255,255,255,0.72)' }}>Specialities</div>
                <div style={{ display: isPhone ? 'grid' : 'flex', gridTemplateColumns: isTiny ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '0.55rem', flexWrap: 'wrap' }}>
                  {specialityOptions.map((option) => {
                    const selected = registerForm.specialities.includes(option);
                    return (
                      <button key={option} type="button" className={selected ? 'btn-red' : 'btn-outline'} style={{ width: isPhone ? '100%' : undefined }} onClick={() => toggleSpeciality(option)}>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Certifications</div><input className="inp" value={registerForm.certifications} onChange={(event) => setRegisterForm((current) => ({ ...current, certifications: event.target.value }))} /></label>
              <label><div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Bio</div><textarea className="inp" rows={4} value={registerForm.bio} onChange={(event) => setRegisterForm((current) => ({ ...current, bio: event.target.value }))} /></label>
              <button type="button" className="btn-red btn-full" disabled={busy} onClick={handleRegister}>{busy ? 'Submitting...' : 'Submit Trainer Application'}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const applicationStatus = trainer?.trainerProfile?.applicationStatus || 'pending';

  return (
    <div style={shellStyle}>
      <SiteMeta
        title="Trainer Dashboard | Classic Fitness Park"
        description="Manage schedule, bookings, member visibility, and trainer profile details in the Classic Fitness Park trainer dashboard."
        robots="noindex,nofollow"
      />
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(11,12,16,0.92)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isPhone ? '0.85rem' : '1rem 1.25rem', display: isPhone ? 'grid' : 'flex', gridTemplateColumns: '1fr', justifyContent: 'space-between', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: isPhone ? '1.55rem' : '2rem', lineHeight: 1, letterSpacing: 0, overflowWrap: 'anywhere' }}>Trainer Dashboard</div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.84rem' }}>
              {trainer?.firstName || 'Trainer'} • {applicationStatus.toUpperCase()}
            </div>
          </div>
          <div style={{ display: isPhone ? 'grid' : 'flex', gridTemplateColumns: isTiny ? '1fr' : '1fr 1fr', gap: '0.65rem', flexWrap: 'wrap', width: isPhone ? '100%' : 'auto' }}>
            <button type="button" className="btn-outline" style={{ width: isPhone ? '100%' : undefined }} onClick={() => Promise.all([loadBookings(), loadMembers(), loadNotices(), loadSchedule()])}>Refresh</button>
            <button type="button" className="btn-red" style={{ width: isPhone ? '100%' : undefined }} onClick={logout}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isPhone ? '1rem 0.85rem 2rem' : '1.25rem' }}>
        {applicationStatus !== 'approved' && (
          <div style={{ ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '1rem' : cardStyle.padding, marginBottom: '1rem', borderColor: 'rgba(255,176,46,0.28)', background: 'rgba(255,176,46,0.06)' }}>
            <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#ffcf78' }}>Application status: {applicationStatus.toUpperCase()}</strong>
            <span style={{ color: 'rgba(255,255,255,0.76)' }}>
              You can edit your profile and prepare your schedule, but you will only appear on the public website after admin approval.
            </span>
          </div>
        )}

        <div style={{ display: isPhone ? 'grid' : 'flex', gridTemplateColumns: isTiny ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'btn-red' : 'btn-outline'} style={{ width: isPhone ? '100%' : undefined }} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: isTiny ? '1fr' : isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isPhone ? '0.75rem' : '1rem' }}>
            {[
              ['Members Visible', members.length],
              ['Upcoming Sessions', bookings.filter((booking) => new Date(booking.date) >= new Date()).length],
              ['Schedule Slots', schedule.length],
              ['Specialities', trainer?.trainerProfile?.specialities?.length || 0],
            ].map(([label, value]) => (
              <div key={label} style={cardStyle}>
                <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.3rem', marginTop: '0.4rem' }}>{value}</div>
              </div>
            ))}

            <div style={{ ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '1rem' : cardStyle.padding, gridColumn: isPhone ? '1 / -1' : '1 / span 2' }}>
              <h2 style={{ marginTop: 0 }}>Recent notices</h2>
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                {notices.slice(0, 4).map((notice) => (
                  <div key={notice._id || notice.title} style={{ padding: '0.85rem 0.95rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <strong>{noticeTag(notice.icon || notice.emoji || notice.type || notice.title)} {notice.title}</strong>
                    <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem', fontSize: '0.84rem' }}>{notice.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle, borderRadius: isPhone ? '16px' : cardStyle.borderRadius, padding: isPhone ? '1rem' : cardStyle.padding, gridColumn: isPhone ? '1 / -1' : '3 / span 2' }}>
              <h2 style={{ marginTop: 0 }}>Upcoming bookings</h2>
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                {bookings.slice(0, 4).map((booking) => (
                  <div key={booking._id} style={{ padding: '0.85rem 0.95rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <strong>{booking.user?.firstName || 'Member'} {booking.user?.lastName || ''}</strong>
                    <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem', fontSize: '0.84rem' }}>
                      {booking.notes || booking.className || 'Session'} • {formatDate(booking.date, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'schedule' && (
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '0.9fr 1.1fr', gap: '1rem' }}>
            <form style={cardStyle} onSubmit={addScheduleSlot}>
              <h2 style={{ marginTop: 0 }}>Add schedule slot</h2>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Day of week</div><select className="inp" value={slotForm.dayOfWeek} onChange={(event) => setSlotForm((current) => ({ ...current, dayOfWeek: event.target.value }))}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.8rem' }}>
                  <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Start time</div><input className="inp" type="time" value={slotForm.startTime} onChange={(event) => setSlotForm((current) => ({ ...current, startTime: event.target.value }))} /></label>
                  <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>End time</div><input className="inp" type="time" value={slotForm.endTime} onChange={(event) => setSlotForm((current) => ({ ...current, endTime: event.target.value }))} /></label>
                </div>
                <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Max bookings</div><input className="inp" value={slotForm.maxBookings} onChange={(event) => setSlotForm((current) => ({ ...current, maxBookings: event.target.value }))} /></label>
                <button type="submit" className="btn-red btn-full">Save Slot</button>
              </div>
            </form>

            <div style={{ ...cardStyle, display: 'grid', gap: '0.7rem' }}>
              <h2 style={{ marginTop: 0 }}>Current schedule</h2>
              {schedule.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 0 }}>No schedule slots saved yet.</p> : schedule.map((slot) => (
                <div key={slot._id} style={{ padding: '0.85rem 0.95rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <strong>Day {slot.dayOfWeek}</strong>
                  <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem', fontSize: '0.84rem' }}>
                    {slot.startTime} to {slot.endTime} • {slot.bookedSlots || 0}/{slot.maxBookings || 1} booked
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'bookings' && (
          <div style={{ ...cardStyle, display: 'grid', gap: '0.8rem' }}>
            <h2 style={{ marginTop: 0 }}>Assigned bookings</h2>
            {bookings.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 0 }}>No bookings assigned yet.</p> : bookings.map((booking) => (
              <div key={booking._id} style={{ padding: '0.95rem 1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr auto', gap: '1rem', alignItems: 'center' }}>
                  <div>
                    <strong>{booking.user?.firstName || 'Member'} {booking.user?.lastName || ''}</strong>
                    <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem', fontSize: '0.84rem' }}>
                      {booking.user?.phone || 'No phone'} • {formatDate(booking.date, true)}
                    </div>
                    <div style={{ color: '#ffcf78', marginTop: '0.35rem', fontSize: '0.84rem' }}>{booking.notes || booking.className || 'Session'}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: booking.status === 'cancelled' ? '#ff8f8f' : '#9df0a8' }}>{booking.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'members' && (
          <div style={{ ...cardStyle, display: 'grid', gap: '0.8rem' }}>
            <h2 style={{ marginTop: 0 }}>Gym members</h2>
            {members.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 0 }}>No member records available.</p> : members.map((member) => (
              <div key={member._id} style={{ padding: '0.95rem 1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <strong>{member.firstName} {member.lastName || ''}</strong>
                <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: '0.25rem', fontSize: '0.84rem' }}>
                  {member.phone} • {(member.membership?.plan || 'none').toUpperCase()} • {member.membership?.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'profile' && (
          <form style={{ ...cardStyle, maxWidth: '720px' }} onSubmit={saveProfile}>
            <h2 style={{ marginTop: 0 }}>Update trainer profile</h2>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '128px minmax(0, 1fr)', gap: '1rem', alignItems: 'center', padding: '1rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ width: '128px', height: '128px', borderRadius: '20px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.55)' }}>
                  {profileForm.photo ? <img src={profileForm.photo} alt="Trainer profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Photo'}
                </div>
                <div style={{ display: 'grid', gap: '0.7rem', minWidth: 0 }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>Profile picture</div>
                    <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.84rem', marginTop: '0.25rem', lineHeight: 1.45 }}>This photo appears on the public trainer page after admin approval.</div>
                  </div>
                  <div style={{ display: isPhone ? 'grid' : 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <label className="btn-outline" style={{ textAlign: 'center', cursor: 'pointer', width: isPhone ? '100%' : undefined }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => handlePhotoChange(event, 'profile')} />
                      {photoUploading === 'profile' ? 'Reading Photo...' : profileForm.photo ? 'Change Picture' : 'Choose Picture'}
                    </label>
                    {profileForm.photo ? (
                      <button type="button" className="btn-outline" style={{ width: isPhone ? '100%' : undefined }} onClick={() => setProfileForm((current) => ({ ...current, photo: '' }))}>
                        Remove Picture
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>First name</div><input className="inp" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
                <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Last name</div><input className="inp" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              </div>
              <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Phone</div><input className="inp" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Bio</div><textarea className="inp" rows={4} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} /></label>
              <label><div style={{ fontSize: '0.78rem', marginBottom: '0.35rem', color: 'rgba(255,255,255,0.72)' }}>Certifications</div><textarea className="inp" rows={3} value={profileForm.certifications} onChange={(event) => setProfileForm((current) => ({ ...current, certifications: event.target.value }))} /></label>
              <button type="submit" className="btn-red btn-full">Save Trainer Profile</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
