import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberApi, publicApi } from '../utils/api';
import { useToast } from '../context/ToastContext';

function buildBookingDate(date, time) {
  const [timePart, meridiem = 'AM'] = String(time || '').trim().split(' ');
  const [rawHours = '0', rawMinutes = '0'] = timePart.split(':');
  let hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return date;
  }

  if (meridiem.toUpperCase() === 'PM' && hours < 12) {
    hours += 12;
  }
  if (meridiem.toUpperCase() === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

export default function BookingModal({ className, onClose }) {
  const [trainers, setTrainers] = useState([]);
  const [trainer, setTrainer] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    publicApi('/trainers').then(({ ok, data }) => {
      if (ok) setTrainers(data.trainers || []);
    });
  }, []);

  async function confirmBooking() {
    if (!localStorage.getItem('cfp_token')) {
      showToast('Please log in as a member first.');
      navigate('/member');
      return;
    }

    if (!trainer || !date || !time) {
      showToast('Select a trainer, date and time before confirming.');
      return;
    }

    setBusy(true);
    const { ok, data } = await memberApi('/bookings', {
      method: 'POST',
      body: {
        trainerId: trainer,
        date: buildBookingDate(date, time),
        time,
        className,
        type: 'class',
      },
    });
    setBusy(false);

    if (!ok) {
      showToast(data.message || 'Could not create booking.');
      return;
    }

    showToast(data.message || 'Booking confirmed.');
    onClose();
  }

  return (
    <div className="modal-overlay active" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className="modal-title">Book {className}</h2>
        <div className="modal-body">
          <label className="form-label">Select trainer</label>
          <select className="form-input" value={trainer} onChange={(event) => setTrainer(event.target.value)}>
            <option value="">Choose a trainer...</option>
            {trainers.map((item) => (
              <option key={item._id} value={item._id}>{item.firstName} {item.lastName || ''}</option>
            ))}
          </select>

          <label className="form-label" style={{ marginTop: '1rem' }}>Preferred date</label>
          <input type="date" className="form-input" value={date} min={today} onChange={(event) => setDate(event.target.value)} />

          <label className="form-label" style={{ marginTop: '1rem' }}>Preferred time</label>
          <select className="form-input" value={time} onChange={(event) => setTime(event.target.value)}>
            <option value="">Select a time...</option>
            {['6:00 AM', '8:00 AM', '10:00 AM', '5:00 PM', '7:00 PM'].map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>

          <button className="btn-red btn-full" style={{ marginTop: '1.5rem' }} onClick={confirmBooking} disabled={busy}>
            {busy ? 'Booking...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
