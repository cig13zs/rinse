(function (root, factory) {
  var policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  root.RinseImagePolicy = policy;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_FILE_BYTES = 30 * 1024 * 1024;
  var MAX_DIMENSION = 16000;
  var MAX_PIXELS = 80000000;

  function hasBytes(bytes, expected) {
    if (!bytes || bytes.length < expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (bytes[i] !== expected[i]) return false;
    }
    return true;
  }

  function kindFromSignature(bytes) {
    if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
    return null;
  }

  function inspect(mime, size, bytes) {
    if (!Number.isFinite(size) || size <= 0) {
      return { ok: false, reason: 'That file is empty or unreadable.' };
    }
    if (size > MAX_FILE_BYTES) {
      return { ok: false, reason: 'Choose a JPEG, PNG or WebP smaller than 30 MB.' };
    }

    var kind = kindFromSignature(bytes);
    if (!kind) {
      return { ok: false, reason: 'That file is not a valid JPEG, PNG or WebP.' };
    }

    var expectedMime = 'image/' + kind;
    if (mime && mime !== expectedMime) {
      return { ok: false, reason: 'The file type does not match its contents.' };
    }
    return { ok: true, kind: kind };
  }

  function dimensionsAllowed(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) &&
      width > 0 && height > 0 &&
      width <= MAX_DIMENSION && height <= MAX_DIMENSION &&
      width * height <= MAX_PIXELS;
  }

  return {
    inspect: inspect,
    kindFromSignature: kindFromSignature,
    dimensionsAllowed: dimensionsAllowed,
  };
}));
