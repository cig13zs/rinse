/*
 * Minimal EXIF reader. Pulls GPS, camera make/model, timestamps and editing
 * software out of the EXIF block of a JPEG (APP1), PNG (eXIf chunk) or WebP
 * (EXIF chunk). Not a full EXIF library.
 *
 * Never throws on malformed input: a truncated file degrades to { hasExif }
 * plus whatever fields parsed, rather than killing the page.
 *
 * Browser (window.RinseExif) and Node (require), so the test runs the same
 * parser the page ships.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RinseExif = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function startsWith(bytes, at, list) {
    if (at + list.length > bytes.length) return false;
    for (var i = 0; i < list.length; i++) if (bytes[at + i] !== list[i]) return false;
    return true;
  }
  var EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

  // Finds the TIFF block that holds the EXIF data. Returns { format, tiff, size } or a format only.
  function locate(bytes, view) {
    if (bytes.length >= 4 && view.getUint16(0) === 0xFFD8) {
      var offset = 2;
      while (offset + 4 <= bytes.length) {
        if (view.getUint8(offset) !== 0xFF) break;
        var marker = view.getUint8(offset + 1);
        if (marker === 0xD9 || marker === 0xDA) break; // EOI / start-of-scan
        var size = view.getUint16(offset + 2);
        if (marker === 0xE1 && startsWith(bytes, offset + 4, EXIF_HEADER)) {
          return { format: 'jpeg', tiff: offset + 10, size: size + 2 }; // whole APP1 segment
        }
        offset += 2 + size;
      }
      return { format: 'jpeg' };
    }
    if (startsWith(bytes, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
      var p = 8;
      while (p + 8 <= bytes.length) {
        var n = view.getUint32(p), type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
        if (type === 'eXIf') return { format: 'png', tiff: p + 8, size: n + 12 };
        if (type === 'IEND') break;
        p += n + 12;
      }
      return { format: 'png' };
    }
    if (startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
      var q = 12;
      while (q + 8 <= bytes.length) {
        var len = view.getUint32(q + 4, true), kind = String.fromCharCode(bytes[q], bytes[q + 1], bytes[q + 2], bytes[q + 3]);
        if (kind === 'EXIF') {
          // Some writers keep the JPEG-style "Exif\0\0" prefix inside the chunk.
          return { format: 'webp', tiff: q + 8 + (startsWith(bytes, q + 8, EXIF_HEADER) ? 6 : 0), size: len + 8 + (len & 1) };
        }
        q += 8 + len + (len & 1);
      }
      return { format: 'webp' };
    }
    return { format: 'unknown' };
  }

  function parse(input) {
    var out = { format: 'unknown', hasExif: false, exifBytes: 0, fields: {}, gps: null };
    try {
      var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var found = locate(bytes, view);
      out.format = found.format;
      if (found.tiff === undefined) return out;

      out.hasExif = true;
      out.exifBytes = found.size;

      var tiff = found.tiff;
      if (tiff + 8 > bytes.length) return out;
      var le = view.getUint16(tiff) === 0x4949; // "II" little-endian, else "MM"
      if (view.getUint16(tiff + 2, le) !== 0x002A) return out; // TIFF magic 42

      function rd16(o) { return view.getUint16(tiff + o, le); }
      function rd32(o) { return view.getUint32(tiff + o, le); }
      function ascii(o, count) {
        var s = '';
        for (var i = 0; i < count && tiff + o + i < bytes.length; i++) {
          var c = bytes[tiff + o + i];
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        return s.trim();
      }
      function rational(o) {
        var num = view.getUint32(tiff + o, le), den = view.getUint32(tiff + o + 4, le);
        return den ? num / den : 0;
      }
      function eachTag(ifdOff, cb) {
        if (ifdOff <= 0 || tiff + ifdOff + 2 > bytes.length) return;
        var n = rd16(ifdOff);
        for (var i = 0; i < n; i++) {
          var e = ifdOff + 2 + i * 12;
          if (tiff + e + 12 > bytes.length) return;
          var tag = rd16(e), type = rd16(e + 2), count = rd32(e + 4);
          var bytesN = (TYPE_SIZE[type] || 1) * count;
          var valOff = bytesN <= 4 ? (e + 8) : rd32(e + 8); // inline vs pointer
          cb(tag, type, count, valOff, e);
        }
      }

      function readGPS(gpsOff) {
        var g = { latRef: '', lonRef: '', lat: [], lon: [] };
        eachTag(gpsOff, function (tag, type, count, valOff) {
          if (tag === 1) g.latRef = ascii(valOff, count);
          else if (tag === 2) g.lat = [rational(valOff), rational(valOff + 8), rational(valOff + 16)];
          else if (tag === 3) g.lonRef = ascii(valOff, count);
          else if (tag === 4) g.lon = [rational(valOff), rational(valOff + 8), rational(valOff + 16)];
        });
        if (g.lat.length === 3 && g.lon.length === 3) {
          var lat = g.lat[0] + g.lat[1] / 60 + g.lat[2] / 3600;
          var lon = g.lon[0] + g.lon[1] / 60 + g.lon[2] / 3600;
          if (g.latRef === 'S') lat = -lat;
          if (g.lonRef === 'W') lon = -lon;
          return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
        }
        return null;
      }

      var F = out.fields, ifd0 = rd32(4);
      eachTag(ifd0, function (tag, type, count, valOff) {
        if (tag === 0x010F) F.Make = ascii(valOff, count);
        else if (tag === 0x0110) F.Model = ascii(valOff, count);
        else if (tag === 0x0131) F.Software = ascii(valOff, count);
        else if (tag === 0x0132) F.DateTime = ascii(valOff, count);
        else if (tag === 0x0112) F.Orientation = view.getUint16(tiff + valOff, le);
        else if (tag === 0x8769) eachTag(rd32(valOff), function (t2, ty2, c2, vo2) {
          if (t2 === 0x9003) F.DateTimeOriginal = ascii(vo2, c2);
        });
        else if (tag === 0x8825) out.gps = readGPS(rd32(valOff));
      });
    } catch (err) {
      out.error = String(err && err.message || err);
    }
    return out;
  }

  return { parse: parse };
}));
