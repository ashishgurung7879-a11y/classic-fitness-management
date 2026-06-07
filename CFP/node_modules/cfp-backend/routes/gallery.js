const express = require('express');
const r = express.Router();
const { Gallery } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

// Default gallery photos using the gym's real local photos
const DEFAULT_PHOTOS = [
  { title: 'Main Gym Floor', imageUrl: '/gym-photos/gym-01.jpeg', category: 'gym' },
  { title: 'Weight Training', imageUrl: '/gym-photos/gym-02.jpeg', category: 'equipment' },
  { title: 'Cardio Zone', imageUrl: '/gym-photos/gym-03.jpeg', category: 'gym' },
  { title: 'Strength Area', imageUrl: '/gym-photos/gym-04.jpeg', category: 'classes' },
  { title: 'Free Weights', imageUrl: '/gym-photos/gym-05.jpeg', category: 'classes' },
  { title: 'Machine Zone', imageUrl: '/gym-photos/gym-06.jpeg', category: 'classes' },
  { title: 'Supplement Counter', imageUrl: '/gym-photos/gym-07.jpeg', category: 'equipment' },
  { title: 'Coaching Session', imageUrl: '/gym-photos/gym-08.jpeg', category: 'equipment' },
  { title: 'Training Session', imageUrl: '/gym-photos/gym-09.jpeg', category: 'classes' }
];

function toPublicGalleryUrl(req, imageUrl = '') {
  if (!imageUrl) return '';
  if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  const normalizedPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${req.protocol}://${req.get('host')}${normalizedPath}`;
}

r.get('/', async (req, res) => {
  const { category } = req.query;
  let photos = await Gallery.find({ isActive: true, ...(category && category !== 'all' ? { category } : {}) }).sort({ createdAt: -1 });
  // If no photos in DB, return defaults
  if (!photos.length) {
    photos = DEFAULT_PHOTOS.filter(p => !category || category === 'all' || p.category === category);
  }

  const normalizedPhotos = photos.map((photo) => {
    const plainPhoto = typeof photo.toObject === 'function' ? photo.toObject() : { ...photo };
    return {
      ...plainPhoto,
      imageUrl: toPublicGalleryUrl(req, plainPhoto.imageUrl)
    };
  });

  res.json({ success: true, photos: normalizedPhotos });
});

r.post('/', protect, authorize('admin'), async (req, res) => {
  const payload = {
    title: String(req.body?.title || '').trim(),
    imageUrl: String(req.body?.imageUrl || '').trim(),
    category: String(req.body?.category || 'gym').trim() || 'gym',
    isActive: req.body?.isActive !== false && req.body?.isActive !== 'false',
    addedBy: req.user.id
  };
  if (!payload.imageUrl) {
    return res.status(400).json({ success: false, message: 'Image URL is required' });
  }
  const photo = await Gallery.create(payload);
  res.status(201).json({ success: true, photo });
});

r.delete('/:id', protect, authorize('admin'), async (req, res) => {
  await Gallery.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Photo deleted' });
});

module.exports = r;
