const MAX_PROFILE_PHOTO_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PROFILE_PHOTO_DATA_URL_LENGTH = Math.ceil((MAX_PROFILE_PHOTO_FILE_BYTES * 4) / 3) + 1024;
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const HTTP_IMAGE_PATTERN = /^https?:\/\//i;

function validateProfilePhoto(value) {
  if (value === undefined || value === null || value === '') {
    return { value: '' };
  }

  const photo = String(value).trim();
  if (!photo) return { value: '' };

  if (photo.length > MAX_PROFILE_PHOTO_DATA_URL_LENGTH) {
    return { error: 'Photo too large. Choose an image under 2 MB.' };
  }

  if (!DATA_IMAGE_PATTERN.test(photo) && !HTTP_IMAGE_PATTERN.test(photo)) {
    return { error: 'Profile photo must be an image file or image URL.' };
  }

  return { value: photo };
}

module.exports = {
  MAX_PROFILE_PHOTO_FILE_BYTES,
  validateProfilePhoto,
};
