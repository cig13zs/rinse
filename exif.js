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

  function latin(bytes, start, end) {
    var s = '';
    end = Math.min(end, bytes.length);
    for (var i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function utf8(bytes, start, end) {
    var sub = bytes.subarray(start, Math.min(end, bytes.length));
    try { return new TextDecoder('utf-8').decode(sub); } catch (_) { return latin(sub, 0, sub.length); }
  }
  function clip(s, n) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  }

  // Who and where from an XMP packet: the fields an editor or a photo library fills in.
  var XMP_FIELDS = [['dc:creator', 'Creator'], ['photoshop:City', 'City'], ['photoshop:State', 'Region'],
    ['photoshop:Country', 'Country'], ['Iptc4xmpCore:Location', 'Location'], ['exif:GPSLatitude', 'GPS latitude'],
    ['exif:GPSLongitude', 'GPS longitude'], ['xmp:CreatorTool', 'Made with']];
  function readXmp(xml) {
    var info = {};
    XMP_FIELDS.forEach(function (f) {
      var attr = new RegExp(f[0] + '\\s*=\\s*"([^"]*)"').exec(xml);
      var elem = new RegExp('<' + f[0] + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + f[0] + '>').exec(xml);
      var v = attr ? attr[1] : elem ? elem[1].replace(/<[^>]*>/g, ' ') : '';
      v = clip(v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), 80);
      if (v) info[f[1]] = v;
    });
    return info;
  }

  // IPTC-IIM records inside a Photoshop APP13 block: by-line and place names.
  var IPTC_FIELDS = { 80: 'By-line', 90: 'City', 95: 'Region', 101: 'Country', 116: 'Copyright' };
  function readIptc(bytes, view, start, end) {
    var info = {}, p = start;
    while (p + 12 <= end) {
      if (latin(bytes, p, p + 4) !== '8BIM') break;
      var id = view.getUint16(p + 4), nameLen = bytes[p + 6];
      var q = p + 6 + ((nameLen + 2) & ~1); // Pascal name, padded to even length
      if (q + 4 > end) break;
      var size = view.getUint32(q), data = q + 4;
      if (id === 0x0404) {
        var r = data, stop = Math.min(data + size, end);
        while (r + 5 <= stop && bytes[r] === 0x1C) {
          var len = view.getUint16(r + 3);
          var label = bytes[r + 1] === 2 && IPTC_FIELDS[bytes[r + 2]];
          if (label && !info[label]) info[label] = clip(utf8(bytes, r + 5, r + 5 + len), 80);
          r += 5 + len;
        }
      }
      p = data + size + (size & 1);
    }
    return info;
  }

  // Every metadata block in the file besides the EXIF fields: what it is, its size and anything personal in it.
  function scanBlocks(bytes, view, format) {
    var blocks = [];
    function add(kind, label, size, info, personal) {
      info = info || {};
      blocks.push({ kind: kind, label: label, bytes: size, info: info,
        personal: personal === undefined ? Object.keys(info).length > 0 : personal });
    }
    if (format === 'jpeg') {
      var o = 2, sos = -1;
      while (o + 4 <= bytes.length && bytes[o] === 0xFF) {
        var m = bytes[o + 1];
        if (m === 0xD9) break;
        if (m === 0xDA) { sos = o; break; }
        var size = view.getUint16(o + 2), body = o + 4, end = Math.min(o + 2 + size, bytes.length);
        var head = latin(bytes, body, Math.min(body + 35, end));
        if (m === 0xE1 && head.indexOf('http://ns.adobe.com/xap/1.0/\0') === 0) add('xmp', 'XMP (editing and library data)', size + 2, readXmp(utf8(bytes, body + 29, end)));
        else if (m === 0xE1 && head.indexOf('http://ns.adobe.com/xmp/extension/') === 0) add('xmp', 'Extended XMP', size + 2, readXmp(utf8(bytes, body, end)));
        else if (m === 0xED && head.indexOf('Photoshop 3.0\0') === 0) add('iptc', 'IPTC (captions and credits)', size + 2, readIptc(bytes, view, body + 14, end));
        else if (m === 0xE2 && head.indexOf('ICC_PROFILE\0') === 0) add('icc', 'Colour profile', size + 2, {}, false);
        else if (m === 0xE2 && head.indexOf('MPF\0') === 0) add('mpf', 'Multi-picture index (MPF)', size + 2, {}, false);
        else if (m === 0xFE) add('comment', 'Comment', size + 2, { Text: clip(utf8(bytes, body, end), 80) });
        o += 2 + size;
      }
      if (sos >= 0) {
        // Entropy-coded data escapes 0xFF, so the first FF D9 after the scan header is the end of the image.
        for (var i = sos + 2; i + 1 < bytes.length; i++) {
          if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
            var extra = bytes.length - (i + 2);
            if (extra > 64) {
              var tail = latin(bytes, i + 2, Math.min(bytes.length, i + 2 + 65536));
              var what = tail.indexOf('ftyp') >= 0 ? 'a video clip (motion photo)' : tail.indexOf('\xFF\xD8') >= 0 ? 'more images (a depth map, HDR gain map or preview)' : 'unknown data';
              add('trailer', 'Data after the image', extra, { Contains: what }, true);
            }
            break;
          }
        }
      }
    } else if (format === 'png') {
      var p = 8;
      while (p + 8 <= bytes.length) {
        var n = view.getUint32(p), type = latin(bytes, p + 4, p + 8), d = p + 8, e = Math.min(d + n, bytes.length);
        if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
          var z = d; while (z < e && bytes[z] !== 0) z++;
          var key = latin(bytes, d, z), text = '';
          if (type === 'tEXt') text = latin(bytes, z + 1, e);
          else if (type === 'iTXt' && bytes[z + 1] === 0) {
            var t = z + 3; while (t < e && bytes[t] !== 0) t++; t++; while (t < e && bytes[t] !== 0) t++;
            text = utf8(bytes, t + 1, e);
          }
          if (key === 'XML:com.adobe.xmp') add('xmp', 'XMP (editing and library data)', n + 12, readXmp(text));
          else add('text', 'Text: ' + clip(key, 40), n + 12, text ? { Text: clip(text, 80) } : { Text: '(compressed)' });
        } else if (type === 'iCCP') add('icc', 'Colour profile', n + 12, {}, false);
        else if (type === 'tIME') add('time', 'Last-modified time', n + 12, {}, false);
        if (type === 'IEND') break;
        p += n + 12;
      }
    } else if (format === 'webp') {
      var q = 12;
      while (q + 8 <= bytes.length) {
        var len = view.getUint32(q + 4, true), kind = latin(bytes, q, q + 4);
        if (kind === 'XMP ') add('xmp', 'XMP (editing and library data)', len + 8, readXmp(utf8(bytes, q + 8, q + 8 + len)));
        else if (kind === 'ICCP') add('icc', 'Colour profile', len + 8, {}, false);
        q += 8 + len + (len & 1);
      }
    }
    return blocks;
  }

  function parse(input) {
    var out = { format: 'unknown', hasExif: false, exifBytes: 0, fields: {}, gps: null, blocks: [] };
    try {
      var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var found = locate(bytes, view);
      out.format = found.format;
      try { out.blocks = scanBlocks(bytes, view, found.format); } catch (_) { /* keep the EXIF readout */ }
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
