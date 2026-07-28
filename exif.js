/*
 * Minimal EXIF reader. Pulls GPS, camera make/model, timestamps and editing
 * software out of a JPEG's APP1 block. Not a full EXIF library.
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

  function parse(input) {
    var out = { hasExif: false, exifBytes: 0, fields: {}, gps: null };
    try {
      var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length < 4 || view.getUint16(0) !== 0xFFD8) return out; // not JPEG

      // Walk JPEG segments for an APP1 that begins with "Exif\0\0".
      var offset = 2, app1 = -1, app1len = 0;
      while (offset + 4 <= bytes.length) {
        if (view.getUint8(offset) !== 0xFF) break;
        var marker = view.getUint8(offset + 1);
        if (marker === 0xD9 || marker === 0xDA) break; // EOI / start-of-scan
        var size = view.getUint16(offset + 2);
        if (marker === 0xE1 && offset + 10 <= bytes.length &&
            bytes[offset + 4] === 0x45 && bytes[offset + 5] === 0x78 &&
            bytes[offset + 6] === 0x69 && bytes[offset + 7] === 0x66 &&
            bytes[offset + 8] === 0x00 && bytes[offset + 9] === 0x00) {
          app1 = offset; app1len = size; break;
        }
        offset += 2 + size;
      }
      if (app1 < 0) return out;

      out.hasExif = true;
      out.exifBytes = app1len + 2; // whole APP1 segment including the FFE1 marker

      var tiff = app1 + 10; // skip FF E1 <len:2> "Exif\0\0"
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
