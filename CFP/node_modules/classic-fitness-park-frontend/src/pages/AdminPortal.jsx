import React, { useEffect, useState } from 'react';
import SiteMeta from '../components/SiteMeta';
import PasswordInput from '../components/PasswordInput';
import { adminApi, clearSession, fileToDataUrl, setSession } from '../utils/api';
import { useToast } from '../context/ToastContext';

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'members', label: 'Members' },
  { id: 'measurements', label: 'Measurement Chart' },
  { id: 'memberApps', label: 'Member Applications' },
  { id: 'trainerApps', label: 'Trainer Applications' },
  { id: 'products', label: 'Products' },
  { id: 'payments', label: 'Payments' },
  { id: 'paymentQr', label: 'Payment QR' },
  { id: 'notices', label: 'Notices' },
  { id: 'contacts', label: 'Contacts' },
];

const defaultProductForm = {
  id: '',
  name: '',
  category: 'protein',
  price: '1500',
  salePrice: '',
  stock: '10',
  badge: '',
  emoji: 'PRO',
  imageUrl: '',
  description: '',
  isActive: true,
};

const defaultNoticeForm = {
  title: '',
  message: '',
  type: 'announcement',
  color: '#CC0000',
  emoji: 'NEWS',
};

const defaultPaymentMethods = {
  esewa: {
    label: 'eSewa',
    color: '#0f9d58',
    helper: 'Scan with eSewa and submit the transaction screenshot below.',
    imageUrl: '',
    isActive: true,
  },
  prabhu_bank: {
    label: 'Bank',
    color: '#cc0000',
    helper: 'Use a banking app that supports the Bank QR and keep the receipt screenshot.',
    imageUrl: '',
    isActive: true,
  },
  khalti: {
    label: 'Khalti',
    color: '#5c2d91',
    helper: 'Khalti is supported for proof submissions even if you paid outside this page.',
    imageUrl: '',
    isActive: true,
  },
};

const measurementFields = [
  { key: 'height', label: 'Height', unit: 'cm', required: true },
  { key: 'weight', label: 'Weight', unit: 'kg', required: true },
  { key: 'forearms', label: 'Forearms', unit: 'cm', optional: true },
  { key: 'biceps', label: 'Biceps', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'abdomen', label: 'Abdomen', unit: 'cm' },
  { key: 'thighs', label: 'Thighs', unit: 'cm' },
  { key: 'calves', label: 'Calves', unit: 'cm' },
];

function createDefaultMeasurementForm() {
  return {
    id: '',
    measuredAt: formatDateInput(new Date()),
    trainer: '',
    height: '',
    weight: '',
    forearms: '',
    biceps: '',
    chest: '',
    abdomen: '',
    thighs: '',
    calves: '',
    notes: '',
  };
}

function mapMeasurementToForm(record) {
  const form = createDefaultMeasurementForm();
  form.id = record?._id || '';
  form.measuredAt = formatDateInput(record?.measuredAt);
  form.trainer = record?.trainer?._id || record?.trainer || '';
  form.notes = record?.notes || '';
  measurementFields.forEach((field) => {
    form[field.key] = record?.[field.key] === undefined || record?.[field.key] === null
      ? ''
      : String(record[field.key]);
  });
  return form;
}

function formatDate(value, withTime = false) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

function measurementValue(record, field) {
  const value = Number(record?.[field.key]);
  if (!Number.isFinite(value) || value <= 0) return 'Not set';
  return `${value.toLocaleString()} ${field.unit}`;
}

function measurementDelta(current, previous, field) {
  const currentValue = Number(current?.[field.key]);
  const previousValue = Number(previous?.[field.key]);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null;
  return currentValue - previousValue;
}

function fullName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || 'Unnamed member';
}

function createDefaultMemberForm() {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);

  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    photo: '',
    gender: 'male',
    dateOfBirth: '',
    address: '',
    approvalStatus: 'approved',
    isActive: true,
    plan: 'starter',
    shift: 'morning',
    startDate: formatDateInput(today),
    endDate: formatDateInput(endDate),
    dueAmount: '0',
    paidAmount: '0',
    memberId: '',
  };
}

function mapMemberToForm(member) {
  return {
    firstName: member?.firstName || '',
    lastName: member?.lastName || '',
    email: member?.email || '',
    phone: member?.phone || '',
    password: '',
    photo: member?.photo || '',
    gender: member?.gender || 'male',
    dateOfBirth: formatDateInput(member?.dateOfBirth),
    address: member?.address || '',
    approvalStatus: member?.approvalStatus || 'approved',
    isActive: member?.membership?.isActive !== false && member?.isActive !== false,
    plan: member?.membership?.plan || 'starter',
    shift: member?.membership?.shift || 'morning',
    startDate: formatDateInput(member?.membership?.startDate),
    endDate: formatDateInput(member?.membership?.endDate),
    dueAmount: String(member?.membership?.dueAmount ?? 0),
    paidAmount: String(member?.membership?.paidAmount ?? 0),
    memberId: member?.membership?.memberId || '',
  };
}

function buildMemberPayload(form, mode) {
  const payload = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    photo: form.photo || '',
    gender: form.gender,
    dateOfBirth: form.dateOfBirth || '',
    address: form.address.trim(),
    approvalStatus: form.approvalStatus,
    isActive: form.isActive,
    plan: form.plan,
    shift: form.shift,
    startDate: form.startDate || '',
    endDate: form.endDate || '',
    dueAmount: Number(form.dueAmount || 0),
    paidAmount: Number(form.paidAmount || 0),
    memberId: form.memberId.trim(),
  };

  if (mode === 'create') {
    payload.password = form.password;
  } else if (form.password) {
    payload.password = form.password;
  }

  return payload;
}

function getMemberStatus(member) {
  if (!member) {
    return { label: 'Unknown', tone: 'neutral' };
  }

  if (member.approvalStatus === 'pending') {
    return { label: 'Pending', tone: 'warning' };
  }

  if (member.approvalStatus === 'rejected') {
    return { label: 'Rejected', tone: 'danger' };
  }

  const endDate = member.membership?.endDate ? new Date(member.membership.endDate) : null;
  const active = member.isActive !== false && member.membership?.isActive !== false && (!endDate || endDate >= new Date());

  return active
    ? { label: 'Active', tone: 'success' }
    : { label: 'Inactive', tone: 'neutral' };
}

function getLeadTone(status) {
  if (status === 'closed') return 'success';
  if (status === 'in_progress') return 'info';
  return 'warning';
}

function displayTag(value, fallback = 'NEWS') {
  const cleaned = String(value || '').trim().replace(/[^a-z0-9 ]/gi, '').toUpperCase();
  return cleaned ? cleaned.slice(0, 10) : fallback;
}

function StatusPill({ tone = 'neutral', children }) {
  return <span className={`admin-pill admin-pill-${tone}`}>{children}</span>;
}

function Field({ label, children }) {
  return (
    <label className="admin-label">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ message }) {
  return <div className="admin-empty">{message}</div>;
}

export default function AdminPortal() {
  const { showToast } = useToast();
  const [view, setView] = useState('login');
  const [tab, setTab] = useState('dashboard');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [adminUser, setAdminUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersError, setMembersError] = useState('');
  const [memberApps, setMemberApps] = useState([]);
  const [trainerApps, setTrainerApps] = useState([]);
  const [products, setProducts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(defaultPaymentMethods);
  const [notices, setNotices] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [memberFilters, setMemberFilters] = useState({ search: '', plan: '' });
  const [memberMode, setMemberMode] = useState('create');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberDetail, setMemberDetail] = useState(null);
  const [memberForm, setMemberForm] = useState(createDefaultMemberForm());
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberPhotoUploading, setMemberPhotoUploading] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [measurementForm, setMeasurementForm] = useState(createDefaultMeasurementForm());
  const [measurementLoading, setMeasurementLoading] = useState(false);
  const [measurementSaving, setMeasurementSaving] = useState(false);
  const [trainerPhotoUploadingId, setTrainerPhotoUploadingId] = useState('');
  const [trainerPasswordForms, setTrainerPasswordForms] = useState({});
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [qrMethod, setQrMethod] = useState('esewa');
  const [qrUploading, setQrUploading] = useState(false);
  const [qrSaving, setQrSaving] = useState(false);
  const [noticeForm, setNoticeForm] = useState(defaultNoticeForm);

  useEffect(() => {
    if (localStorage.getItem('cfp_admin_token')) {
      bootstrap();
    }
  }, []);

  useEffect(() => {
    if (view !== 'app' || tab !== 'members' || memberMode === 'create') {
      return;
    }

    if (!members.length) {
      setSelectedMemberId('');
      setMemberDetail(null);
      return;
    }

    const selectionStillExists = selectedMemberId && members.some((member) => member._id === selectedMemberId);
    if (!selectionStillExists) {
      openMember(members[0]._id);
    }
  }, [members, memberMode, selectedMemberId, tab, view]);

  async function bootstrap() {
    const me = await adminApi('/auth/me');
    if (!me.ok || me.data.user?.role !== 'admin') {
      clearSession('admin');
      setView('login');
      return;
    }

    setAdminUser(me.data.user);
    setView('app');
    await refreshAll(false);
  }

  async function refreshAll(showMessage = true) {
    setRefreshing(true);
    await Promise.all([
      loadStats(),
      loadMembers(),
      loadMemberApps(),
      loadTrainerApps(),
      loadProducts(),
      loadPayments(),
      loadPaymentSettings(),
      loadNotices(),
      loadContacts(),
    ]);
    setRefreshing(false);

    if (showMessage) {
      showToast('Dashboard refreshed.');
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const submittedForm = new FormData(event.currentTarget);
    const identifier = String(submittedForm.get('identifier') || loginForm.identifier || '').trim();
    const password = String(submittedForm.get('password') || loginForm.password || '');

    if (identifier !== loginForm.identifier || password !== loginForm.password) {
      setLoginForm({ identifier, password });
    }

    if (!identifier || !password) {
      showToast('Enter your admin phone or email and password.');
      return;
    }

    setBusy(true);
    const { ok, data } = await adminApi('/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Login failed.');
      return;
    }

    if (data.user?.role !== 'admin') {
      showToast('This account is not an admin account.');
      return;
    }

    setSession('admin', data.token, data.user);
    setAdminUser(data.user);
    setLoginForm({ identifier: '', password: '' });
    setView('app');
    await refreshAll(false);
    showToast(`Welcome back, ${data.user.firstName}.`);
  }

  function logout() {
    clearSession('admin');
    setAdminUser(null);
    setStats(null);
    setMembers([]);
    setMemberApps([]);
    setTrainerApps([]);
    setProducts([]);
    setPayments([]);
    setPaymentSettings(defaultPaymentMethods);
    setNotices([]);
    setContacts([]);
    setMemberMode('create');
    setSelectedMemberId('');
    setMemberDetail(null);
    setMemberForm(createDefaultMemberForm());
    setMeasurements([]);
    setMeasurementForm(createDefaultMeasurementForm());
    setTrainerPasswordForms({});
    setProductForm(defaultProductForm);
    setQrMethod('esewa');
    setNoticeForm(defaultNoticeForm);
    setMenuOpen(false);
    setView('login');
  }

  async function loadStats() {
    const { ok, data } = await adminApi('/dashboard/admin');
    if (ok) setStats(data.stats || null);
  }

  async function loadMembers() {
    const { ok, data } = await adminApi('/members');
    if (ok) {
      setMembers(data.members || []);
      setMembersError('');
      return;
    }

    setMembersError(data.message || 'Could not load members.');
  }

  async function loadMemberApps() {
    const { ok, data } = await adminApi('/members/applications');
    if (ok) setMemberApps(data.members || []);
  }

  async function loadTrainerApps() {
    const { ok, data } = await adminApi('/trainers/applications?status=all');
    if (ok) setTrainerApps(data.trainers || []);
  }

  async function loadProducts() {
    const { ok, data } = await adminApi('/products/admin/all');
    if (!ok) return;
    setProducts(data.products || []);
    try {
      const publicProducts = (data.products || []).filter((product) => product?.isActive !== false);
      localStorage.setItem('cfp_shop_products_cache', JSON.stringify(publicProducts));
    } catch {
      localStorage.removeItem('cfp_shop_products_cache');
    }
  }

  async function loadPayments() {
    const { ok, data } = await adminApi('/manual-payments/all');
    if (ok) setPayments(data.payments || []);
  }

  async function loadPaymentSettings() {
    const { ok, data } = await adminApi('/payment-settings');
    if (ok) {
      setPaymentSettings({ ...defaultPaymentMethods, ...(data.methods || {}) });
    }
  }

  async function loadNotices() {
    const { ok, data } = await adminApi('/notices');
    if (ok) setNotices(data.notices || []);
  }

  async function loadContacts() {
    const { ok, data } = await adminApi('/contact');
    if (ok) setContacts(data.leads || []);
  }

  async function loadMeasurements(memberId = selectedMemberId) {
    if (!memberId) {
      setMeasurements([]);
      return;
    }

    setMeasurementLoading(true);
    const { ok, data } = await adminApi(`/measurements?memberId=${encodeURIComponent(memberId)}`);
    setMeasurementLoading(false);

    if (ok) {
      setMeasurements(data.measurements || []);
      return;
    }

    setMeasurements([]);
    showToast(data.message || 'Could not load measurements.');
  }

  async function openMember(id) {
    if (!id) return;

    setMemberLoading(true);
    setMemberMode('edit');
    setSelectedMemberId(id);
    const { ok, data } = await adminApi(`/members/${id}`);
    setMemberLoading(false);

    if (!ok) {
      showToast(data.message || 'Could not load member details.');
      return;
    }

    setMemberDetail(data.member);
    setMemberForm(mapMemberToForm(data.member));
    setMeasurementForm(createDefaultMeasurementForm());
    await loadMeasurements(id);
  }

  function startNewMember() {
    setTab('members');
    setMenuOpen(false);
    setSelectedMemberId('');
    setMemberDetail(null);
    setMemberMode('create');
    setMemberForm(createDefaultMemberForm());
    setMeasurements([]);
    setMeasurementForm(createDefaultMeasurementForm());
  }

  function resetProductForm() {
    setProductForm(defaultProductForm);
  }

  async function saveMember(event) {
    event.preventDefault();

    if (!memberForm.firstName.trim() || !memberForm.phone.trim()) {
      showToast('First name and phone are required.');
      return;
    }

    if (memberMode === 'create' && !memberForm.password) {
      showToast('Please set a password for the new member.');
      return;
    }

    if (memberForm.password && memberForm.password.length < 6) {
      showToast('Member password must be at least 6 characters.');
      return;
    }

    setMemberSaving(true);
    const endpoint = memberMode === 'create' ? '/members' : `/members/${selectedMemberId}`;
    const method = memberMode === 'create' ? 'POST' : 'PUT';
    const { ok, data } = await adminApi(endpoint, {
      method,
      body: buildMemberPayload(memberForm, memberMode),
    });
    setMemberSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not save member.');
      return;
    }

    showToast(data.message || (memberMode === 'create' ? 'Member created.' : 'Member updated.'));
    await Promise.all([loadMembers(), loadStats(), loadPayments()]);

    if (data.member?._id) {
      await openMember(data.member._id);
    } else if (selectedMemberId) {
      await openMember(selectedMemberId);
    }

    setMemberMode('edit');
  }

  async function clearMemberDue() {
    if (!selectedMemberId) return;

    setMemberSaving(true);
    const { ok, data } = await adminApi(`/members/${selectedMemberId}`, {
      method: 'PUT',
      body: { dueAmount: 0 },
    });
    setMemberSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not clear due amount.');
      return;
    }

    showToast('Due amount cleared.');
    await Promise.all([loadMembers(), loadStats()]);
    await openMember(selectedMemberId);
  }

  async function toggleMemberActiveState() {
    if (!selectedMemberId || !memberDetail) return;

    const nextValue = !(memberForm.isActive === true);
    setMemberSaving(true);
    const { ok, data } = await adminApi(`/members/${selectedMemberId}`, {
      method: 'PUT',
      body: { isActive: nextValue },
    });
    setMemberSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not update membership status.');
      return;
    }

    showToast(nextValue ? 'Member activated.' : 'Member marked inactive.');
    await Promise.all([loadMembers(), loadStats()]);
    await openMember(selectedMemberId);
  }

  async function updateMemberApplication(id, action) {
    const { ok, data } = await adminApi(`/members/${id}/${action}`, { method: 'PUT', body: {} });
    if (!ok) {
      showToast(data.message || 'Could not update member application.');
      return;
    }

    showToast(data.message || 'Member application updated.');
    await Promise.all([loadMemberApps(), loadMembers(), loadStats()]);
  }

  async function updateTrainerApplication(id, action) {
    const { ok, data } = await adminApi(`/trainers/${id}/${action}`, { method: 'PUT', body: {} });
    if (!ok) {
      showToast(data.message || 'Could not update trainer application.');
      return;
    }

    showToast(data.message || 'Trainer application updated.');
    await Promise.all([loadTrainerApps(), loadStats()]);
  }

  async function handleMemberPhotoChange(event) {
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

    setMemberPhotoUploading(true);
    try {
      const photo = await fileToDataUrl(file);
      setMemberForm((current) => ({ ...current, photo }));
      showToast(`${file.name} is ready to save.`);
    } catch (error) {
      showToast(error.message || 'Could not read the selected photo.');
    } finally {
      setMemberPhotoUploading(false);
      event.target.value = '';
    }
  }

  async function handleTrainerPhotoChange(event, trainer) {
    const file = event.target.files?.[0];
    if (!file || !trainer?._id) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose a trainer photo under 2 MB.');
      return;
    }

    setTrainerPhotoUploadingId(trainer._id);
    try {
      const photo = await fileToDataUrl(file);
      const { ok, data } = await adminApi(`/trainers/${trainer._id}`, {
        method: 'PUT',
        body: { photo },
      });

      if (!ok) {
        showToast(data.message || 'Could not save trainer photo.');
        return;
      }

      showToast('Trainer photo updated.');
      await loadTrainerApps();
    } catch (error) {
      showToast(error.message || 'Could not read the selected photo.');
    } finally {
      setTrainerPhotoUploadingId('');
      event.target.value = '';
    }
  }

  async function resetTrainerPassword(trainer) {
    const password = String(trainerPasswordForms[trainer._id] || '');
    if (!password) {
      showToast('Enter a new trainer password first.');
      return;
    }

    if (password.length < 6) {
      showToast('Trainer password must be at least 6 characters.');
      return;
    }

    const { ok, data } = await adminApi(`/trainers/${trainer._id}`, {
      method: 'PUT',
      body: { password },
    });

    if (!ok) {
      showToast(data.message || 'Could not reset trainer password.');
      return;
    }

    setTrainerPasswordForms((current) => ({ ...current, [trainer._id]: '' }));
    showToast(`Password reset for ${fullName(trainer)}.`);
  }

  async function saveMeasurement(event) {
    event.preventDefault();
    if (!selectedMemberId) {
      showToast('Select a member before adding measurements.');
      return;
    }

    if (!measurementForm.measuredAt || !measurementForm.height || !measurementForm.weight) {
      showToast('Measurement date, height, and weight are required.');
      return;
    }

    const body = {
      member: selectedMemberId,
      measuredAt: measurementForm.measuredAt,
      trainer: measurementForm.trainer || undefined,
      notes: measurementForm.notes,
    };
    measurementFields.forEach((field) => {
      if (measurementForm[field.key] !== '') body[field.key] = Number(measurementForm[field.key]);
    });

    const existingRecordForDate = measurements.find((record) => (
      formatDateInput(record.measuredAt) === measurementForm.measuredAt &&
      (!measurementForm.id || record._id !== measurementForm.id)
    ));
    const measurementId = measurementForm.id || existingRecordForDate?._id || '';
    const endpoint = measurementId ? `/measurements/${measurementId}` : '/measurements';
    const method = measurementId ? 'PUT' : 'POST';

    setMeasurementSaving(true);
    const { ok, data } = await adminApi(endpoint, { method, body });
    setMeasurementSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not save measurement.');
      return;
    }

    showToast(data.message || (measurementId ? 'Measurement updated.' : 'Measurement saved.'));
    setMeasurementForm(createDefaultMeasurementForm());
    await loadMeasurements(selectedMemberId);
  }

  function handleMeasurementDateChange(value) {
    const existingRecord = measurements.find((record) => formatDateInput(record.measuredAt) === value);
    if (existingRecord) {
      setMeasurementForm(mapMeasurementToForm(existingRecord));
      showToast('Existing measurement loaded for this date. Save to update it.');
      return;
    }

    setMeasurementForm((current) => ({
      ...createDefaultMeasurementForm(),
      measuredAt: value,
      trainer: current.trainer,
    }));
  }

  function editMeasurement(record) {
    setMeasurementForm(mapMeasurementToForm(record));
  }

  function clearMeasurementSelection() {
    setSelectedMemberId('');
    setMemberDetail(null);
    setMeasurements([]);
    setMeasurementForm(createDefaultMeasurementForm());
  }

  async function deleteMeasurement(id) {
    if (!window.confirm('Delete this measurement record?')) {
      return;
    }

    const { ok, data } = await adminApi(`/measurements/${id}`, { method: 'DELETE' });
    if (!ok) {
      showToast(data.message || 'Could not delete measurement.');
      return;
    }

    showToast(data.message || 'Measurement deleted.');
    await loadMeasurements(selectedMemberId);
  }

  async function handleProductImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Choose an image under 2 MB for smoother uploads.');
      return;
    }

    setImageUploading(true);
    try {
      const imageUrl = await fileToDataUrl(file);
      setProductForm((current) => ({ ...current, imageUrl }));
      showToast(`${file.name} is ready to save.`);
    } catch (error) {
      showToast(error.message || 'Could not read the selected image.');
    } finally {
      setImageUploading(false);
      event.target.value = '';
    }
  }

  function updatePaymentSetting(field, value) {
    setPaymentSettings((current) => ({
      ...current,
      [qrMethod]: {
        ...(defaultPaymentMethods[qrMethod] || {}),
        ...(current[qrMethod] || {}),
        [field]: value,
      },
    }));
  }

  async function handleQrImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file for the QR.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showToast('Choose a QR image under 3 MB.');
      return;
    }

    setQrUploading(true);
    try {
      const imageUrl = await fileToDataUrl(file);
      updatePaymentSetting('imageUrl', imageUrl);
      showToast(`${file.name} is ready to save.`);
    } catch (error) {
      showToast(error.message || 'Could not read the QR image.');
    } finally {
      setQrUploading(false);
      event.target.value = '';
    }
  }

  async function savePaymentQr(event) {
    event.preventDefault();

    const currentSettings = {
      ...(defaultPaymentMethods[qrMethod] || {}),
      ...(paymentSettings[qrMethod] || {}),
    };

    setQrSaving(true);
    const { ok, data } = await adminApi(`/payment-settings/${qrMethod}`, {
      method: 'PUT',
      body: currentSettings,
    });
    setQrSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not save QR settings.');
      return;
    }

    setPaymentSettings({ ...defaultPaymentMethods, ...(data.methods || {}) });
    showToast(data.message || 'QR settings saved.');
  }

  async function saveProduct(event) {
    event.preventDefault();

    if (!productForm.name.trim()) {
      showToast('Product name is required.');
      return;
    }

    setProductSaving(true);
    const endpoint = productForm.id ? `/products/${productForm.id}` : '/products';
    const method = productForm.id ? 'PUT' : 'POST';
    const { ok, data } = await adminApi(endpoint, {
      method,
      body: {
        name: productForm.name,
        category: productForm.category,
        price: Number(productForm.price),
        salePrice: productForm.salePrice ? Number(productForm.salePrice) : null,
        stock: Number(productForm.stock),
        badge: productForm.badge,
        emoji: productForm.emoji,
        imageUrl: productForm.imageUrl,
        description: productForm.description,
        isActive: productForm.isActive,
      },
    });
    setProductSaving(false);

    if (!ok) {
      showToast(data.message || 'Could not save product.');
      return;
    }

    showToast(data.message || 'Product saved.');
    resetProductForm();
    await loadProducts();
  }

  function editProduct(product) {
    setTab('products');
    setProductForm({
      id: product._id,
      name: product.name || '',
      category: product.category || 'protein',
      price: String(product.price || ''),
      salePrice: product.salePrice ? String(product.salePrice) : '',
      stock: String(product.stock ?? 0),
      badge: product.badge || '',
      emoji: product.emoji || 'PRO',
      imageUrl: product.imageUrl || '',
      description: product.description || '',
      isActive: product.isActive !== false,
    });
  }

  async function deleteProduct(id) {
    if (!window.confirm('Delete this product from the catalog?')) {
      return;
    }

    const { ok, data } = await adminApi(`/products/${id}`, { method: 'DELETE' });
    if (!ok) {
      showToast(data.message || 'Could not delete product.');
      return;
    }

    showToast(data.message || 'Product removed.');
    if (productForm.id === id) {
      resetProductForm();
    }
    await loadProducts();
  }

  async function verifyPayment(id, action) {
    const endpoint = action === 'verify' ? `/manual-payments/${id}/verify` : `/manual-payments/${id}/reject`;
    const body = action === 'verify'
      ? { adminNote: 'Verified from admin dashboard.' }
      : { adminNote: 'Rejected from admin dashboard.' };
    const { ok, data } = await adminApi(endpoint, { method: 'PUT', body });

    if (!ok) {
      showToast(data.message || 'Could not update payment.');
      return;
    }

    showToast(data.message || 'Payment updated.');
    await Promise.all([loadPayments(), loadStats(), loadMembers()]);
  }

  async function postNotice(event) {
    event.preventDefault();
    const { ok, data } = await adminApi('/notices', { method: 'POST', body: noticeForm });
    if (!ok) {
      showToast(data.message || 'Could not post notice.');
      return;
    }

    showToast(data.message || 'Notice posted.');
    setNoticeForm(defaultNoticeForm);
    await loadNotices();
  }

  async function deleteNotice(id) {
    if (!window.confirm('Delete this notice?')) {
      return;
    }

    const { ok, data } = await adminApi(`/notices/${id}`, { method: 'DELETE' });
    if (!ok) {
      showToast(data.message || 'Could not delete notice.');
      return;
    }

    showToast(data.message || 'Notice removed.');
    await loadNotices();
  }

  async function updateContact(id, status) {
    const { ok, data } = await adminApi(`/contact/${id}`, { method: 'PUT', body: { status } });
    if (!ok) {
      showToast(data.message || 'Could not update contact status.');
      return;
    }

    showToast(data.message || 'Contact lead updated.');
    await loadContacts();
  }

  const filteredMembers = members.filter((member) => {
    const search = memberFilters.search.trim().toLowerCase();
    const matchesSearch = !search || [
      member.firstName,
      member.lastName,
      member.phone,
      member.email,
      member.membership?.memberId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search);

    const matchesPlan = !memberFilters.plan || member.membership?.plan === memberFilters.plan;
    return matchesSearch && matchesPlan;
  });

  const dueMembers = [...members]
    .filter((member) => Number(member.membership?.dueAmount || 0) > 0)
    .sort((left, right) => Number(right.membership?.dueAmount || 0) - Number(left.membership?.dueAmount || 0))
    .slice(0, 5);

  const recentPayments = [...payments]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);

  const openContacts = contacts.filter((lead) => lead.status !== 'closed').length;
  const hasUploadedProductImage = productForm.imageUrl.startsWith('data:image');
  const hasUploadedMemberPhoto = memberForm.photo?.startsWith('data:image');
  const approvedTrainers = trainerApps.filter((trainer) => trainer.trainerProfile?.applicationStatus === 'approved');
  const currentQrSettings = {
    ...(defaultPaymentMethods[qrMethod] || {}),
    ...(paymentSettings[qrMethod] || {}),
  };
  const hasQrImage = Boolean(currentQrSettings.imageUrl);

  function renderDashboard() {
    const statCards = [
      {
        label: 'Members',
        value: stats?.members?.total || 0,
        detail: `${stats?.members?.active || 0} active members`,
      },
      {
        label: 'Pending Applications',
        value: stats?.members?.pendingApplications || 0,
        detail: 'New member approvals waiting',
      },
      {
        label: 'Trainer Requests',
        value: stats?.trainers?.pendingApplications || 0,
        detail: 'Trainer applications to review',
      },
      {
        label: 'Pending Payments',
        value: stats?.payments?.pending || 0,
        detail: 'Manual payment proofs to verify',
      },
      {
        label: 'Revenue This Month',
        value: money(stats?.revenue?.thisMonth || 0),
        detail: `Total revenue ${money(stats?.revenue?.total || 0)}`,
      },
      {
        label: 'Attendance Today',
        value: stats?.attendance?.today || 0,
        detail: 'Member check-ins recorded today',
      },
    ];

    return (
      <div className="admin-main-stack">
        <section className="admin-hero">
          <div>
            <p className="admin-eyebrow">Operations Center</p>
            <h1>Classic Fitness Park Admin</h1>
            <p className="admin-hero-copy">
              Manage memberships, approvals, product inventory, notices, and payment proof from one polished dashboard.
            </p>
          </div>
          <div className="admin-hero-actions">
            <button type="button" className="btn-red" onClick={startNewMember}>Add Member</button>
            <button type="button" className="btn-outline" onClick={() => setTab('products')}>Open Products</button>
            <button type="button" className="btn-outline" onClick={() => setTab('payments')}>Review Payments</button>
            <button type="button" className="btn-outline" onClick={() => setTab('measurements')}>Measurement Chart</button>
            <button type="button" className="btn-outline" onClick={() => setTab('paymentQr')}>Payment QR</button>
          </div>
        </section>

        <section className="admin-grid-tiles">
          {statCards.map((card) => (
            <article key={card.label} className="admin-stat-card">
              <p className="admin-stat-label">{card.label}</p>
              <div className="admin-stat-value">{card.value}</div>
              <p className="admin-stat-detail">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="admin-dual-grid">
          <article className="admin-surface">
            <div className="admin-surface-header">
              <div>
                <h2>Members with Due</h2>
                <p>Keep an eye on unpaid balances and memberships.</p>
              </div>
              <button type="button" className="btn-outline" onClick={() => setTab('members')}>Manage</button>
            </div>
            {dueMembers.length === 0 ? (
              <EmptyState message="No due balances right now." />
            ) : (
              <div className="admin-mini-list">
                {dueMembers.map((member) => (
                  <button key={member._id} type="button" className="admin-mini-item" onClick={() => { setTab('members'); openMember(member._id); }}>
                    <div>
                      <strong>{fullName(member)}</strong>
                      <span>{member.membership?.plan || 'starter'} plan</span>
                    </div>
                    <div className="admin-mini-item-side">
                      <StatusPill tone="warning">{money(member.membership?.dueAmount || 0)} due</StatusPill>
                      <span>Ends {formatDate(member.membership?.endDate)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="admin-surface">
            <div className="admin-surface-header">
              <div>
                <h2>Recent Manual Payments</h2>
                <p>The latest payment proofs submitted by members.</p>
              </div>
              <button type="button" className="btn-outline" onClick={() => setTab('payments')}>Open Queue</button>
            </div>
            {recentPayments.length === 0 ? (
              <EmptyState message="No manual payments have been submitted yet." />
            ) : (
              <div className="admin-mini-list">
                {recentPayments.map((payment) => (
                  <div key={payment._id} className="admin-mini-item static">
                    <div>
                      <strong>{fullName(payment.user)}</strong>
                      <span>{(payment.plan || 'starter').toUpperCase()} by {String(payment.paymentMethod || 'cash').toUpperCase()}</span>
                    </div>
                    <div className="admin-mini-item-side">
                      <StatusPill tone={payment.status === 'verified' ? 'success' : payment.status === 'rejected' ? 'danger' : 'warning'}>
                        {payment.status}
                      </StatusPill>
                      <span>{money(payment.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="admin-grid-tiles compact">
          <article className="admin-queue-card">
            <p className="admin-queue-label">Member Applications</p>
            <div className="admin-queue-value">{memberApps.length}</div>
          </article>
          <article className="admin-queue-card">
            <p className="admin-queue-label">Trainer Applications</p>
            <div className="admin-queue-value">{trainerApps.filter((trainer) => trainer.trainerProfile?.applicationStatus === 'pending').length}</div>
          </article>
          <article className="admin-queue-card">
            <p className="admin-queue-label">Open Leads</p>
            <div className="admin-queue-value">{openContacts}</div>
          </article>
          <article className="admin-queue-card">
            <p className="admin-queue-label">Catalog Items</p>
            <div className="admin-queue-value">{products.length}</div>
          </article>
        </section>
      </div>
    );
  }

  function renderMembers() {
    const activeStatus = memberForm.isActive ? 'Active membership' : 'Inactive membership';
    const activeTone = memberForm.isActive ? 'success' : 'neutral';

    return (
      <div className="admin-main-stack">
        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Members</h2>
              <p>Search the list, open full details, and manage plans, dates, and due balances.</p>
            </div>
            <div className="admin-toolbar">
              <button type="button" className="btn-outline" onClick={loadMembers}>Refresh List</button>
              <button type="button" className="btn-red" onClick={startNewMember}>Add Member</button>
            </div>
          </div>

          <div className="admin-filter-row">
            <Field label="Search Members">
              <input
                className="admin-control"
                value={memberFilters.search}
                onChange={(event) => setMemberFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search name, phone, email, member ID"
              />
            </Field>
            <Field label="Plan Filter">
              <select
                className="admin-control"
                value={memberFilters.plan}
                onChange={(event) => setMemberFilters((current) => ({ ...current, plan: event.target.value }))}
              >
                <option value="">All plans</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="elite">Elite</option>
                <option value="none">None</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="admin-member-layout">
          <article className="admin-surface">
            <div className="admin-list-summary">
              <strong>{filteredMembers.length}</strong>
              <span>members shown</span>
            </div>
            {filteredMembers.length === 0 ? (
              <EmptyState message={membersError || 'No members match your current search.'} />
            ) : (
              <div className="admin-member-list">
                {filteredMembers.map((member) => {
                  const status = getMemberStatus(member);
                  return (
                    <button
                      key={member._id}
                      type="button"
                      className={`admin-member-row ${selectedMemberId === member._id && memberMode === 'edit' ? 'active' : ''}`}
                      onClick={() => openMember(member._id)}
                    >
                      <div className="admin-member-row-top">
                        <div>
                          <div className="admin-member-name">{fullName(member)}</div>
                          <div className="admin-meta-line">
                            {member.phone}
                            {member.email ? ` | ${member.email}` : ''}
                          </div>
                        </div>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </div>
                      <div className="admin-chip-row">
                        <StatusPill tone="info">{(member.membership?.plan || 'starter').toUpperCase()}</StatusPill>
                        <StatusPill tone={Number(member.membership?.dueAmount || 0) > 0 ? 'warning' : 'success'}>
                          {money(member.membership?.dueAmount || 0)} due
                        </StatusPill>
                      </div>
                      <div className="admin-meta-line">
                        Start {formatDate(member.membership?.startDate)} | End {formatDate(member.membership?.endDate)} | Shift {(member.membership?.shift || 'morning').toUpperCase()}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <article className="admin-surface">
            <div className="admin-surface-header">
              <div>
                <h2>{memberMode === 'create' ? 'Add Member' : 'Member Detail'}</h2>
                <p>
                  {memberMode === 'create'
                    ? 'Create a member directly from the admin dashboard.'
                    : 'Edit membership plan, dates, due amount, and core member details.'}
                </p>
              </div>
              <div className="admin-toolbar">
                <StatusPill tone={activeTone}>{activeStatus}</StatusPill>
                {memberMode === 'edit' && (
                  <button type="button" className="btn-outline" onClick={toggleMemberActiveState}>
                    {memberForm.isActive ? 'Mark Inactive' : 'Activate'}
                  </button>
                )}
              </div>
            </div>

            {memberLoading ? (
              <EmptyState message="Loading member details..." />
            ) : (
              <>
                {memberMode === 'edit' && memberDetail && (
                  <div className="admin-member-summary">
                    <div>
                      <span className="admin-summary-label">Member ID</span>
                      <strong>{memberDetail.membership?.memberId || 'Will be generated'}</strong>
                    </div>
                    <div>
                      <span className="admin-summary-label">Joined</span>
                      <strong>{formatDate(memberDetail.createdAt)}</strong>
                    </div>
                    <div>
                      <span className="admin-summary-label">Last Updated</span>
                      <strong>{formatDate(memberDetail.updatedAt, true)}</strong>
                    </div>
                  </div>
                )}

                <form className="admin-form-stack" onSubmit={saveMember}>
                  <div className="admin-image-preview">
                    {memberForm.photo ? (
                      <img src={memberForm.photo} alt={fullName(memberForm) || 'Member profile preview'} />
                    ) : (
                      <div className="admin-image-placeholder">No member profile picture selected yet</div>
                    )}
                  </div>

                  <div className="admin-upload-block">
                    <label className="admin-upload-label">
                      <input type="file" accept="image/*" onChange={handleMemberPhotoChange} />
                      <span>{memberPhotoUploading ? 'Reading photo...' : 'Choose Member Profile Picture'}</span>
                    </label>
                    <div className="admin-upload-copy">
                      {memberForm.photo ? 'Profile picture is attached. Save the member to keep it.' : 'Choose a clear face photo from this device.'}
                    </div>
                  </div>

                  {memberForm.photo && (
                    <div className="admin-toolbar">
                      <StatusPill tone={hasUploadedMemberPhoto ? 'success' : 'info'}>
                        {hasUploadedMemberPhoto ? 'Local photo ready' : 'Profile photo set'}
                      </StatusPill>
                      <button type="button" className="btn-outline" onClick={() => setMemberForm((current) => ({ ...current, photo: '' }))}>
                        Remove Profile Picture
                      </button>
                    </div>
                  )}

                  <div className="admin-form-grid">
                    <Field label="First Name">
                      <input className="admin-control" value={memberForm.firstName} onChange={(event) => setMemberForm((current) => ({ ...current, firstName: event.target.value }))} />
                    </Field>
                    <Field label="Last Name">
                      <input className="admin-control" value={memberForm.lastName} onChange={(event) => setMemberForm((current) => ({ ...current, lastName: event.target.value }))} />
                    </Field>
                  </div>

                  <div className="admin-form-grid">
                    <Field label="Phone">
                      <input className="admin-control" value={memberForm.phone} onChange={(event) => setMemberForm((current) => ({ ...current, phone: event.target.value }))} placeholder="9800000000" />
                    </Field>
                    <Field label="Email (Optional)">
                      <input className="admin-control" type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} placeholder="Optional" />
                    </Field>
                  </div>

                  <Field label={memberMode === 'create' ? 'Member Login Password' : 'Reset Member Password'}>
                    <PasswordInput className="admin-control" value={memberForm.password} onChange={(event) => setMemberForm((current) => ({ ...current, password: event.target.value }))} placeholder={memberMode === 'create' ? 'Set login password' : 'Leave blank to keep current password'} autoComplete="new-password" />
                  </Field>

                  <div className="admin-form-grid admin-form-grid-three">
                    <Field label="Plan">
                      <select className="admin-control" value={memberForm.plan} onChange={(event) => setMemberForm((current) => ({ ...current, plan: event.target.value }))}>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="elite">Elite</option>
                        <option value="none">None</option>
                      </select>
                    </Field>
                    <Field label="Shift">
                      <select className="admin-control" value={memberForm.shift} onChange={(event) => setMemberForm((current) => ({ ...current, shift: event.target.value }))}>
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                        <option value="night">Night</option>
                        <option value="multi">Multi</option>
                      </select>
                    </Field>
                    <Field label="Approval Status">
                      <select className="admin-control" value={memberForm.approvalStatus} onChange={(event) => setMemberForm((current) => ({ ...current, approvalStatus: event.target.value }))}>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </Field>
                  </div>

                  <div className="admin-form-grid admin-form-grid-three">
                    <Field label="Start Date">
                      <input className="admin-control" type="date" value={memberForm.startDate} onChange={(event) => setMemberForm((current) => ({ ...current, startDate: event.target.value }))} />
                    </Field>
                    <Field label="End Date">
                      <input className="admin-control" type="date" value={memberForm.endDate} onChange={(event) => setMemberForm((current) => ({ ...current, endDate: event.target.value }))} />
                    </Field>
                    <Field label="Member ID">
                      <input className="admin-control" value={memberForm.memberId} onChange={(event) => setMemberForm((current) => ({ ...current, memberId: event.target.value }))} placeholder="Auto-generated if blank" />
                    </Field>
                  </div>

                  <div className="admin-form-grid">
                    <Field label="Due Amount">
                      <input className="admin-control" type="number" min="0" value={memberForm.dueAmount} onChange={(event) => setMemberForm((current) => ({ ...current, dueAmount: event.target.value }))} />
                    </Field>
                    <Field label="Paid Amount">
                      <input className="admin-control" type="number" min="0" value={memberForm.paidAmount} onChange={(event) => setMemberForm((current) => ({ ...current, paidAmount: event.target.value }))} />
                    </Field>
                  </div>

                  <div className="admin-form-grid admin-form-grid-three">
                    <Field label="Gender">
                      <select className="admin-control" value={memberForm.gender} onChange={(event) => setMemberForm((current) => ({ ...current, gender: event.target.value }))}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                    <Field label="Date of Birth">
                      <input className="admin-control" type="date" value={memberForm.dateOfBirth} onChange={(event) => setMemberForm((current) => ({ ...current, dateOfBirth: event.target.value }))} />
                    </Field>
                    <Field label="Membership Status">
                      <select className="admin-control" value={memberForm.isActive ? 'true' : 'false'} onChange={(event) => setMemberForm((current) => ({ ...current, isActive: event.target.value === 'true' }))}>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Address">
                    <textarea className="admin-control admin-textarea" rows={3} value={memberForm.address} onChange={(event) => setMemberForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address or notes" />
                  </Field>

                  <div className="admin-inline-note">
                    To add due amount, update the due field and save. Use Clear Due when the outstanding balance is fully paid.
                  </div>

                  <div className="admin-toolbar">
                    <button type="submit" className="btn-red" disabled={memberSaving}>
                      {memberSaving ? 'Saving...' : memberMode === 'create' ? 'Create Member' : 'Save Changes'}
                    </button>
                    {memberMode === 'edit' && (
                      <button type="button" className="btn-outline" onClick={clearMemberDue}>
                        Clear Due
                      </button>
                    )}
                    {memberMode === 'edit' && (
                      <button type="button" className="btn-outline" onClick={startNewMember}>
                        New Member Form
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </article>
        </section>
      </div>
    );
  }

  function renderMeasurements() {
    const selectedMember = members.find((member) => member._id === selectedMemberId) || memberDetail;
    const latestMeasurement = measurements[measurements.length - 1];
    const previousMeasurement = measurements[measurements.length - 2];
    const chartFields = measurementFields.filter((field) => ['weight', 'chest', 'abdomen', 'biceps', 'thighs', 'calves'].includes(field.key));
    const chartMax = Math.max(
      1,
      ...measurements.flatMap((record) => chartFields.map((field) => Number(record?.[field.key]) || 0))
    );

    return (
      <div className="admin-main-stack">
        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Measurement Chart</h2>
              <p>Select a member, record measurements, and compare progress over time.</p>
            </div>
            <div className="admin-toolbar">
              <button type="button" className="btn-outline" onClick={loadMembers}>Refresh Members</button>
            </div>
          </div>

          <div className="admin-form-grid">
            <Field label="Select Member">
              <select
                className="admin-control"
                value={selectedMemberId}
                onChange={(event) => {
                  if (event.target.value) {
                    openMember(event.target.value);
                  } else {
                    clearMeasurementSelection();
                  }
                }}
              >
                <option value="">Choose a member</option>
                {members.map((member) => (
                  <option key={member._id} value={member._id}>
                    {fullName(member)} - {member.phone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Member Summary">
              <div className="admin-control static">
                {selectedMember ? `${fullName(selectedMember)} | ${(selectedMember.membership?.plan || 'starter').toUpperCase()} plan` : 'No member selected'}
              </div>
            </Field>
          </div>
        </section>

        {!selectedMemberId ? (
          <EmptyState message="Choose a member above to open their measurement chart." />
        ) : (
          <div className="admin-products-layout">
            <section className="admin-surface">
              <div className="admin-surface-header">
                <div>
                  <h2>{measurementForm.id ? 'Update Measurement' : 'Add Measurement'}</h2>
                  <p>
                    {measurementForm.id
                      ? 'This selected date already has a record. Saving will update that chart point.'
                      : 'Pick a date. If that date already exists, the saved record will load for editing.'}
                  </p>
                </div>
              </div>

              <form className="admin-form-stack" onSubmit={saveMeasurement}>
                <div className="admin-form-grid">
                  <Field label="Measurement Date">
                    <input className="admin-control" type="date" value={measurementForm.measuredAt} onChange={(event) => handleMeasurementDateChange(event.target.value)} />
                  </Field>
                  <Field label="Trainer">
                    <select className="admin-control" value={measurementForm.trainer} onChange={(event) => setMeasurementForm((current) => ({ ...current, trainer: event.target.value }))}>
                      <option value="">No trainer selected</option>
                      {approvedTrainers.map((trainer) => (
                        <option key={trainer._id} value={trainer._id}>{fullName(trainer)}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="admin-form-grid admin-form-grid-three">
                  {measurementFields.map((field) => (
                    <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''} (${field.unit})`}>
                      <input
                        className="admin-control"
                        type="number"
                        min="0"
                        step="0.1"
                        value={measurementForm[field.key]}
                        onChange={(event) => setMeasurementForm((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </Field>
                  ))}
                </div>

                <Field label="Notes">
                  <textarea className="admin-control admin-textarea" rows={3} value={measurementForm.notes} onChange={(event) => setMeasurementForm((current) => ({ ...current, notes: event.target.value }))} />
                </Field>

                <button type="submit" className="btn-red" disabled={measurementSaving}>
                  {measurementSaving ? 'Saving...' : measurementForm.id ? 'Update Measurement' : 'Save Measurement'}
                </button>
                {measurementForm.id ? (
                  <button type="button" className="btn-outline" onClick={() => setMeasurementForm(createDefaultMeasurementForm())}>
                    Add New Date
                  </button>
                ) : null}
              </form>
            </section>

            <section className="admin-surface">
              <div className="admin-surface-header">
                <div>
                  <h2>Latest Progress</h2>
                  <p>{measurementLoading ? 'Loading measurements...' : `${measurements.length} record${measurements.length === 1 ? '' : 's'} saved.`}</p>
                </div>
              </div>

              {measurements.length === 0 ? (
                <EmptyState message="No measurement records yet." />
              ) : (
                <div className="admin-card-list">
                  <article className="admin-record-card">
                    <div className="admin-record-main">
                      <div className="admin-record-title">Latest: {formatDate(latestMeasurement.measuredAt)}</div>
                      <div className="admin-chip-row">
                        {measurementFields.map((field) => {
                          const delta = measurementDelta(latestMeasurement, previousMeasurement, field);
                          return (
                            <StatusPill key={field.key} tone={delta === null ? 'info' : delta > 0 ? 'warning' : delta < 0 ? 'success' : 'neutral'}>
                              {field.label}: {measurementValue(latestMeasurement, field)}
                              {delta === null || delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)})`}
                            </StatusPill>
                          );
                        })}
                      </div>
                    </div>
                  </article>

                  <div className="admin-measurement-chart">
                    {chartFields.map((field) => (
                      <div key={field.key} className="admin-measurement-chart-row">
                        <strong>{field.label}</strong>
                        <div className="admin-measurement-bars">
                          {measurements.slice(-6).map((record) => {
                            const value = Number(record?.[field.key]) || 0;
                            const width = Math.max(4, Math.round((value / chartMax) * 100));
                            return (
                              <div key={`${record._id}-${field.key}`} className="admin-measurement-bar-wrap">
                                <span className="admin-measurement-bar" style={{ width: `${width}%` }} />
                                <small>{value ? `${value}${field.unit}` : '-'}</small>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {measurements.slice().reverse().map((record) => (
                    <article key={record._id} className="admin-record-card">
                      <div className="admin-record-main">
                        <div className="admin-record-title">{formatDate(record.measuredAt)}</div>
                        <div className="admin-meta-line">
                          Trainer: {record.trainer ? fullName(record.trainer) : 'Not selected'}
                        </div>
                        <div className="admin-chip-row">
                          {measurementFields.map((field) => (
                            <StatusPill key={field.key} tone="info">{field.label}: {measurementValue(record, field)}</StatusPill>
                          ))}
                        </div>
                        {record.notes ? <p>{record.notes}</p> : null}
                      </div>
                      <div className="admin-toolbar vertical">
                        <button type="button" className="btn-outline" onClick={() => editMeasurement(record)}>Edit</button>
                        <button type="button" className="btn-outline" onClick={() => deleteMeasurement(record._id)}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  function renderMemberApplications() {
    return (
      <section className="admin-surface">
        <div className="admin-surface-header">
          <div>
            <h2>Member Applications</h2>
            <p>Approve or reject new member registrations waiting for review.</p>
          </div>
          <button type="button" className="btn-outline" onClick={loadMemberApps}>Refresh</button>
        </div>
        {memberApps.length === 0 ? (
          <EmptyState message="No pending member applications." />
        ) : (
          <div className="admin-card-list">
            {memberApps.map((member) => (
              <article key={member._id} className="admin-record-card">
                <div className="admin-record-main">
                  <div className="admin-record-title">{fullName(member)}</div>
                  <div className="admin-meta-line">{member.phone} {member.email ? `| ${member.email}` : ''}</div>
                  <div className="admin-meta-line">
                    Plan {(member.membership?.plan || 'starter').toUpperCase()} | Submitted {formatDate(member.createdAt, true)}
                  </div>
                </div>
                <div className="admin-toolbar">
                  <button type="button" className="btn-red" onClick={() => updateMemberApplication(member._id, 'approve')}>Approve</button>
                  <button type="button" className="btn-outline" onClick={() => updateMemberApplication(member._id, 'reject')}>Reject</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderTrainerApplications() {
    return (
      <section className="admin-surface">
        <div className="admin-surface-header">
          <div>
            <h2>Trainer Applications</h2>
            <p>Review trainer experience, specialities, and application status.</p>
          </div>
          <button type="button" className="btn-outline" onClick={loadTrainerApps}>Refresh</button>
        </div>
        {trainerApps.length === 0 ? (
          <EmptyState message="No trainer applications found." />
        ) : (
          <div className="admin-card-list">
            {trainerApps.map((trainer) => (
              <article key={trainer._id} className="admin-record-card">
                <div className="admin-record-main">
                  <div className="admin-record-title">{fullName(trainer)}</div>
                  <div className="admin-meta-line">
                    {trainer.phone} | {trainer.email || 'No email'} | {trainer.trainerProfile?.experience || 0} years experience
                  </div>
                  <div className="admin-meta-line">
                    Specialities: {(trainer.trainerProfile?.specialities || []).join(', ') || 'Not listed'}
                  </div>
                </div>
                <div className="admin-toolbar">
                  <StatusPill tone={trainer.trainerProfile?.applicationStatus === 'approved' ? 'success' : trainer.trainerProfile?.applicationStatus === 'rejected' ? 'danger' : 'warning'}>
                    {trainer.trainerProfile?.applicationStatus || 'pending'}
                  </StatusPill>
                  <button type="button" className="btn-red" onClick={() => updateTrainerApplication(trainer._id, 'approve')}>Approve</button>
                  <button type="button" className="btn-outline" onClick={() => updateTrainerApplication(trainer._id, 'reject')}>Reject</button>
                </div>
                <div className="admin-form-grid" style={{ marginTop: '0.85rem' }}>
                  <Field label="Reset Login Password">
                    <PasswordInput
                      className="admin-control"
                      value={trainerPasswordForms[trainer._id] || ''}
                      onChange={(event) => setTrainerPasswordForms((current) => ({ ...current, [trainer._id]: event.target.value }))}
                      placeholder="Set new trainer password"
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Trainer Login">
                    <div className="admin-control static">
                      {trainer.email || trainer.phone}
                    </div>
                  </Field>
                </div>
                <div className="admin-toolbar" style={{ marginTop: '0.75rem' }}>
                  <button type="button" className="btn-outline" onClick={() => resetTrainerPassword(trainer)}>Save New Password</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderProducts() {
    return (
      <div className="admin-products-layout">
        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>{productForm.id ? 'Edit Product' : 'Add Product'}</h2>
              <p>Upload product photos from the device or keep using a direct image URL.</p>
            </div>
            {productForm.id && (
              <button type="button" className="btn-outline" onClick={resetProductForm}>Clear Form</button>
            )}
          </div>

          <form className="admin-form-stack" onSubmit={saveProduct}>
            <div className="admin-image-preview">
              {productForm.imageUrl ? (
                <img src={productForm.imageUrl} alt={productForm.name || 'Product preview'} />
              ) : (
                <div className="admin-image-placeholder">No product photo selected yet</div>
              )}
            </div>

            <div className="admin-form-grid">
              <Field label="Product Name">
                <input className="admin-control" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Category">
                <select className="admin-control" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="protein">Protein</option>
                  <option value="vitamins">Vitamins</option>
                  <option value="gear">Gear</option>
                  <option value="apparel">Apparel</option>
                  <option value="drinks">Drinks</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            <div className="admin-form-grid admin-form-grid-three">
              <Field label="Price">
                <input className="admin-control" type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} />
              </Field>
              <Field label="Sale Price">
                <input className="admin-control" type="number" min="0" value={productForm.salePrice} onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))} />
              </Field>
              <Field label="Stock">
                <input className="admin-control" type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm((current) => ({ ...current, stock: event.target.value }))} />
              </Field>
            </div>

            <div className="admin-form-grid admin-form-grid-three">
              <Field label="Badge">
                <input className="admin-control" value={productForm.badge} onChange={(event) => setProductForm((current) => ({ ...current, badge: event.target.value }))} placeholder="Best seller, new, sale" />
              </Field>
              <Field label="Label">
                <input className="admin-control" value={productForm.emoji} onChange={(event) => setProductForm((current) => ({ ...current, emoji: event.target.value }))} placeholder="PRO" />
              </Field>
              <Field label="Visibility">
                <select className="admin-control" value={productForm.isActive ? 'true' : 'false'} onChange={(event) => setProductForm((current) => ({ ...current, isActive: event.target.value === 'true' }))}>
                  <option value="true">Visible</option>
                  <option value="false">Hidden</option>
                </select>
              </Field>
            </div>

            <div className="admin-upload-block">
              <label className="admin-upload-label">
                <input type="file" accept="image/*" onChange={handleProductImageChange} />
                <span>{imageUploading ? 'Reading image...' : 'Choose Photo From Device'}</span>
              </label>
              <div className="admin-upload-copy">
                {hasUploadedProductImage ? 'Device photo is attached and will be saved with the product.' : 'You can also keep using an image URL below.'}
              </div>
            </div>

            {!hasUploadedProductImage && (
              <Field label="Image URL">
                <input className="admin-control" value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://example.com/product.jpg" />
              </Field>
            )}

            {hasUploadedProductImage && (
              <div className="admin-toolbar">
                <StatusPill tone="success">Local image ready</StatusPill>
                <button type="button" className="btn-outline" onClick={() => setProductForm((current) => ({ ...current, imageUrl: '' }))}>
                  Remove Selected Photo
                </button>
              </div>
            )}

            <Field label="Description">
              <textarea className="admin-control admin-textarea" rows={4} value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>

            <button type="submit" className="btn-red" disabled={productSaving}>
              {productSaving ? 'Saving...' : productForm.id ? 'Update Product' : 'Create Product'}
            </button>
          </form>
        </section>

        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Catalog</h2>
              <p>{products.length} products in the current catalog.</p>
            </div>
          </div>

          {products.length === 0 ? (
            <EmptyState message="No products in the catalog yet." />
          ) : (
            <div className="admin-catalog">
              {products.map((product) => (
                <article key={product._id} className="admin-product-card">
                  <div className="admin-product-thumb">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} />
                    ) : (
                      <div className="admin-image-placeholder">No image</div>
                    )}
                  </div>
                  <div className="admin-product-copy">
                    <div className="admin-record-title">{product.name}</div>
                    <div className="admin-meta-line">
                      {(product.category || 'other').toUpperCase()} | {money(product.salePrice || product.price)} | Stock {product.stock ?? 0}
                    </div>
                    <div className="admin-chip-row">
                      {product.badge ? <StatusPill tone="info">{product.badge}</StatusPill> : null}
                      <StatusPill tone={product.isActive === false ? 'neutral' : 'success'}>
                        {product.isActive === false ? 'Hidden' : 'Visible'}
                      </StatusPill>
                    </div>
                    <p>{product.description || 'No description provided yet.'}</p>
                  </div>
                  <div className="admin-toolbar vertical">
                    <button type="button" className="btn-outline" onClick={() => editProduct(product)}>Edit</button>
                    <button type="button" className="btn-red" onClick={() => deleteProduct(product._id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderPayments() {
    return (
      <section className="admin-surface">
        <div className="admin-surface-header">
          <div>
            <h2>Manual Payments</h2>
            <p>Review payment proof and update member balances after verification.</p>
          </div>
          <button type="button" className="btn-outline" onClick={loadPayments}>Refresh</button>
        </div>
        {payments.length === 0 ? (
          <EmptyState message="No manual payment submissions yet." />
        ) : (
          <div className="admin-card-list">
            {payments.map((payment) => (
              <article key={payment._id} className="admin-payment-card">
                <div className="admin-payment-main">
                  <div className="admin-record-title">{fullName(payment.user)}</div>
                  <div className="admin-meta-line">
                    {(payment.plan || 'starter').toUpperCase()} | {String(payment.paymentMethod || 'cash').toUpperCase()} | {formatDate(payment.createdAt, true)}
                  </div>
                  <div className="admin-meta-line">Reference: {payment.referenceId || 'No reference ID'}</div>
                  <div className="admin-chip-row">
                    <StatusPill tone={payment.status === 'verified' ? 'success' : payment.status === 'rejected' ? 'danger' : 'warning'}>
                      {payment.status}
                    </StatusPill>
                    <StatusPill tone="info">{money(payment.amount)}</StatusPill>
                  </div>
                </div>
                {payment.screenshot ? (
                  <div className="admin-proof-thumb">
                    <img src={payment.screenshot} alt="Payment proof" />
                  </div>
                ) : (
                  <div className="admin-proof-thumb empty">No screenshot</div>
                )}
                <div className="admin-toolbar vertical">
                  {payment.status === 'pending' ? (
                    <>
                      <button type="button" className="btn-red" onClick={() => verifyPayment(payment._id, 'verify')}>Verify</button>
                      <button type="button" className="btn-outline" onClick={() => verifyPayment(payment._id, 'reject')}>Reject</button>
                    </>
                  ) : (
                    <StatusPill tone={payment.status === 'verified' ? 'success' : 'danger'}>{payment.status}</StatusPill>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderPaymentQr() {
    return (
      <div className="admin-products-layout">
        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Payment QR Setup</h2>
              <p>Upload the QR picture members should scan on the payment page.</p>
            </div>
            <button type="button" className="btn-outline" onClick={loadPaymentSettings}>Refresh</button>
          </div>

          <form className="admin-form-stack" onSubmit={savePaymentQr}>
            <Field label="Payment Method">
              <select className="admin-control" value={qrMethod} onChange={(event) => setQrMethod(event.target.value)}>
                {Object.entries(defaultPaymentMethods).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </Field>

            <div className="admin-image-preview admin-qr-preview">
              {hasQrImage ? (
                <img src={currentQrSettings.imageUrl} alt={`${currentQrSettings.label} QR preview`} />
              ) : (
                <div className="admin-image-placeholder">No QR picture selected yet</div>
              )}
            </div>

            <div className="admin-upload-block">
              <label className="admin-upload-label">
                <input type="file" accept="image/*" onChange={handleQrImageChange} />
                <span>{qrUploading ? 'Reading QR...' : 'Choose QR Picture From Device'}</span>
              </label>
              <div className="admin-upload-copy">
                {hasQrImage ? 'QR picture is attached. Save it to update the public payment page.' : 'Upload a clear square QR photo for best scanning.'}
              </div>
            </div>

            <div className="admin-form-grid">
              <Field label="Label">
                <input className="admin-control" value={currentQrSettings.label} onChange={(event) => updatePaymentSetting('label', event.target.value)} />
              </Field>
              <Field label="Color">
                <input className="admin-control" value={currentQrSettings.color} onChange={(event) => updatePaymentSetting('color', event.target.value)} />
              </Field>
            </div>

            <Field label="Helper Text">
              <textarea className="admin-control admin-textarea" rows={3} value={currentQrSettings.helper} onChange={(event) => updatePaymentSetting('helper', event.target.value)} />
            </Field>

            <Field label="Image URL">
              <input className="admin-control" value={currentQrSettings.imageUrl} onChange={(event) => updatePaymentSetting('imageUrl', event.target.value)} placeholder="Upload from device or paste a direct image URL" />
            </Field>

            <Field label="Status">
              <select className="admin-control" value={currentQrSettings.isActive ? 'true' : 'false'} onChange={(event) => updatePaymentSetting('isActive', event.target.value === 'true')}>
                <option value="true">Visible</option>
                <option value="false">Hidden</option>
              </select>
            </Field>

            <div className="admin-toolbar">
              <button type="submit" className="btn-red" disabled={qrSaving}>
                {qrSaving ? 'Saving...' : 'Save QR Settings'}
              </button>
              {hasQrImage ? (
                <button type="button" className="btn-outline" onClick={() => updatePaymentSetting('imageUrl', '')}>
                  Remove QR Picture
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Current Payment Methods</h2>
              <p>These options appear on the member QR payment page.</p>
            </div>
          </div>

          <div className="admin-card-list">
            {Object.entries(paymentSettings).map(([key, setting]) => (
              <article key={key} className="admin-payment-card">
                <div className="admin-proof-thumb">
                  {setting.imageUrl ? (
                    <img src={setting.imageUrl} alt={`${setting.label} QR`} />
                  ) : (
                    <div className="admin-image-placeholder">No QR</div>
                  )}
                </div>
                <div className="admin-payment-main">
                  <div className="admin-record-title">{setting.label}</div>
                  <div className="admin-meta-line">{setting.helper}</div>
                  <div className="admin-chip-row">
                    <StatusPill tone={setting.isActive === false ? 'neutral' : 'success'}>
                      {setting.isActive === false ? 'Hidden' : 'Visible'}
                    </StatusPill>
                    <StatusPill tone="info">{setting.imageUrl ? 'QR added' : 'Needs QR'}</StatusPill>
                  </div>
                </div>
                <div className="admin-toolbar vertical">
                  <button type="button" className="btn-outline" onClick={() => setQrMethod(key)}>Edit</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderNotices() {
    return (
      <div className="admin-products-layout">
        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Post Notice</h2>
              <p>Share updates with members straight from the admin dashboard.</p>
            </div>
          </div>
          <form className="admin-form-stack" onSubmit={postNotice}>
            <Field label="Title">
              <input className="admin-control" value={noticeForm.title} onChange={(event) => setNoticeForm((current) => ({ ...current, title: event.target.value }))} />
            </Field>
            <Field label="Message">
              <textarea className="admin-control admin-textarea" rows={5} value={noticeForm.message} onChange={(event) => setNoticeForm((current) => ({ ...current, message: event.target.value }))} />
            </Field>
            <div className="admin-form-grid admin-form-grid-three">
              <Field label="Type">
                <input className="admin-control" value={noticeForm.type} onChange={(event) => setNoticeForm((current) => ({ ...current, type: event.target.value }))} />
              </Field>
              <Field label="Color">
                <input className="admin-control" value={noticeForm.color} onChange={(event) => setNoticeForm((current) => ({ ...current, color: event.target.value }))} />
              </Field>
              <Field label="Label">
                <input className="admin-control" value={noticeForm.emoji} onChange={(event) => setNoticeForm((current) => ({ ...current, emoji: event.target.value }))} />
              </Field>
            </div>
            <button type="submit" className="btn-red">Publish Notice</button>
          </form>
        </section>

        <section className="admin-surface">
          <div className="admin-surface-header">
            <div>
              <h2>Published Notices</h2>
              <p>Current notices visible to members.</p>
            </div>
          </div>
          {notices.length === 0 ? (
            <EmptyState message="No notices have been posted yet." />
          ) : (
            <div className="admin-card-list">
              {notices.map((notice) => (
                <article key={notice._id} className="admin-record-card">
                  <div className="admin-record-main">
                    <div className="admin-record-title">{notice.emoji || 'NEWS'} {notice.title}</div>
                    <div className="admin-chip-row">
                      <StatusPill tone="info">{notice.type || 'announcement'}</StatusPill>
                      <StatusPill tone="success">{notice.color || '#CC0000'}</StatusPill>
                    </div>
                    <p>{notice.message}</p>
                  </div>
                  <button type="button" className="btn-red" onClick={() => deleteNotice(notice._id)}>Delete</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderContacts() {
    return (
      <section className="admin-surface">
        <div className="admin-surface-header">
          <div>
            <h2>Contact Leads</h2>
            <p>Keep track of inquiries coming from the public website.</p>
          </div>
          <button type="button" className="btn-outline" onClick={loadContacts}>Refresh</button>
        </div>
        {contacts.length === 0 ? (
          <EmptyState message="No contact submissions yet." />
        ) : (
          <div className="admin-card-list">
            {contacts.map((lead) => (
              <article key={lead._id} className="admin-record-card">
                <div className="admin-record-main">
                  <div className="admin-record-title">{lead.name}</div>
                  <div className="admin-meta-line">
                    {lead.phone || 'No phone'} | {lead.email || 'No email'} | {formatDate(lead.createdAt, true)}
                  </div>
                  <div className="admin-chip-row">
                    <StatusPill tone={getLeadTone(lead.status)}>{lead.status || 'new'}</StatusPill>
                  </div>
                  <p>{lead.message}</p>
                </div>
                <div className="admin-toolbar vertical">
                  <button type="button" className="btn-outline" onClick={() => updateContact(lead._id, 'in_progress')}>In Progress</button>
                  <button type="button" className="btn-red" onClick={() => updateContact(lead._id, 'closed')}>Close</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderContent() {
    switch (tab) {
      case 'dashboard':
        return renderDashboard();
      case 'members':
        return renderMembers();
      case 'measurements':
        return renderMeasurements();
      case 'memberApps':
        return renderMemberApplications();
      case 'trainerApps':
        return renderTrainerApplications();
      case 'products':
        return renderProducts();
      case 'payments':
        return renderPayments();
      case 'paymentQr':
        return renderPaymentQr();
      case 'notices':
        return renderNotices();
      case 'contacts':
        return renderContacts();
      default:
        return renderDashboard();
    }
  }

  if (view === 'login') {
    return (
      <div className="admin-shell admin-login">
        <SiteMeta
          title="Admin Portal | Classic Fitness Park"
          description="Admin access for members, trainers, products, manual payments, notices, and contact leads."
          robots="noindex,nofollow"
        />
        <div className="admin-login-grid">
          <section className="admin-login-copy-card">
            <p className="admin-eyebrow">Classic Fitness Park</p>
            <h1>Beautiful control starts here.</h1>
            <p className="admin-hero-copy">
              Sign in to manage memberships, see payment activity, maintain the shop catalog, and keep the gym running from one polished dashboard.
            </p>
            <div className="admin-login-stats">
              <div>
                <strong>Members</strong>
                <span>Plans, dates, dues, and details</span>
              </div>
              <div>
                <strong>Products</strong>
                <span>Upload photos straight from the device</span>
              </div>
              <div>
                <strong>Payments</strong>
                <span>Review manual proof quickly</span>
              </div>
            </div>
          </section>

          <form className="admin-login-card" onSubmit={handleLogin}>
            <div className="admin-login-brand">
              <img src="/logo.jpg" alt="CFP" />
              <div>
                <p className="admin-eyebrow">Admin Access</p>
                <h2>Sign in</h2>
              </div>
            </div>
            <Field label="Phone or Email">
              <input
                className="admin-control"
                name="identifier"
                value={loginForm.identifier}
                onChange={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))}
                onInput={(event) => setLoginForm((current) => ({ ...current, identifier: event.target.value }))}
                placeholder="9800000000 or admin@classicfitnesspark.com.np"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label="Password">
              <PasswordInput
                className="admin-control"
                name="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                onInput={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter admin password"
                autoComplete="current-password"
              />
            </Field>
            <button type="submit" className="btn-red btn-full" disabled={busy}>
              {busy ? 'Signing In...' : 'Login as Admin'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <SiteMeta
        title="Admin Dashboard | Classic Fitness Park"
        description="Manage gym operations, approvals, catalog items, payments, and notices from the Classic Fitness Park admin dashboard."
        robots="noindex,nofollow"
      />

      <div className={`admin-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-brand-block">
            <button type="button" className="admin-mobile-toggle" onClick={() => setMenuOpen(true)}>Menu</button>
            <img src="/logo.jpg" alt="CFP" />
            <div>
              <div className="admin-brand-title">Classic Fitness Park</div>
              <div className="admin-brand-subtitle">Signed in as {adminUser?.firstName || 'Admin'}</div>
            </div>
          </div>
          <div className="admin-toolbar">
            <button type="button" className="btn-outline" onClick={() => refreshAll()} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="btn-red" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="admin-layout">
        <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="admin-sidebar-header">
            <div>
              <p className="admin-eyebrow">Control Panel</p>
              <h2>Navigation</h2>
            </div>
            <button type="button" className="admin-sidebar-close" onClick={() => setMenuOpen(false)}>Close</button>
          </div>

          <nav className="admin-nav">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-nav-btn ${tab === item.id ? 'active' : ''}`}
                onClick={() => {
                  setTab(item.id);
                  setMenuOpen(false);
                }}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="admin-sidebar-note">
            <strong>Quick actions</strong>
            <button type="button" className="btn-red btn-full" onClick={startNewMember}>Add Member</button>
            <button type="button" className="btn-outline btn-full" onClick={() => { setTab('products'); setMenuOpen(false); }}>Add Product</button>
            <button type="button" className="btn-outline btn-full" onClick={() => { setTab('paymentQr'); setMenuOpen(false); }}>Payment QR</button>
          </div>
        </aside>

        <main className="admin-main">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
