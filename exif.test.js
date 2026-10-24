/*
 * Hand-builds a JPEG with a GPS EXIF block and reads it back. Catches drift in
 * the offset math.  Run: node exif.test.js
 */
var assert = require('assert');
var parse = require('./exif.js').parse;

function buildTiff() {
  var tiff = new Uint8Array(178);
  var dv = new DataView(tiff.buffer);
  function A(o, str) { for (var i = 0; i < str.length; i++) tiff[o + i] = str.charCodeAt(i); }

  tiff[0] = 0x49; tiff[1] = 0x49;      // "II" little-endian
  dv.setUint16(2, 0x002A, true);       // TIFF magic
  dv.setUint32(4, 8, true);            // IFD0 at offset 8

  var e = 10;
  function entry(tag, type, count, setVal) {
    dv.setUint16(e, tag, true);
    dv.setUint16(e + 2, type, true);
    dv.setUint32(e + 4, count, true);
    setVal(e + 8);
    e += 12;
  }

  dv.setUint16(8, 4, true);            // IFD0: 4 entries
  entry(0x010F, 2, 8, function (o) { dv.setUint32(o, 62, true); });  // Make -> 62
  entry(0x0110, 2, 5, function (o) { dv.setUint32(o, 70, true); });  // Model -> 70
  entry(0x0112, 3, 1, function (o) { dv.setUint16(o, 1, true); });   // Orientation = 1
  entry(0x8825, 4, 1, function (o) { dv.setUint32(o, 76, true); });  // GPS IFD -> 76
  dv.setUint32(58, 0, true);           // no next IFD

  A(62, 'TestCam'); A(70, 'MX-1');     // ASCII values (zero-terminated by init)

  dv.setUint16(76, 4, true);           // GPS IFD: 4 entries
  e = 78;
  entry(1, 2, 2, function (o) { tiff[o] = 0x4E; }); // GPSLatitudeRef  = "N"
  entry(2, 5, 3, function (o) { dv.setUint32(o, 130, true); }); // GPSLatitude  -> 130
  entry(3, 2, 2, function (o) { tiff[o] = 0x45; }); // GPSLongitudeRef = "E"
  entry(4, 5, 3, function (o) { dv.setUint32(o, 154, true); }); // GPSLongitude -> 154
  dv.setUint32(126, 0, true);          // no next IFD

  // Latitude 14/1, 30/1, 0/1 -> 14.5 ; Longitude 121/1, 0/1, 0/1 -> 121
  var r = [[130, 14], [138, 30], [146, 0], [154, 121], [162, 0], [170, 0]];
  for (var i = 0; i < r.length; i++) { dv.setUint32(r[i][0], r[i][1], true); dv.setUint32(r[i][0] + 4, 1, true); }

  return tiff;
}

function buildJpegWithExif() {
  var tiff = buildTiff();
  var size = 2 + 6 + tiff.length;      // APP1 size field (big-endian)
  var seg = new Uint8Array(6 + 6 + tiff.length);
  var sdv = new DataView(seg.buffer);
  sdv.setUint16(0, 0xFFD8);            // SOI
  sdv.setUint16(2, 0xFFE1);            // APP1
  sdv.setUint16(4, size);             // big-endian length
  seg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6); // "Exif\0\0"
  seg.set(tiff, 12);
  return seg;
}

var r = parse(buildJpegWithExif());
assert.strictEqual(r.hasExif, true, 'should detect EXIF');
assert.strictEqual(r.exifBytes, 188, 'exif byte count');
assert.strictEqual(r.fields.Make, 'TestCam', 'Make');
assert.strictEqual(r.fields.Model, 'MX-1', 'Model');
assert.strictEqual(r.fields.Orientation, 1, 'Orientation');
assert.ok(r.gps, 'GPS present');
assert.strictEqual(r.gps.lat, 14.5, 'latitude');
assert.strictEqual(r.gps.lon, 121, 'longitude');

function checkFields(r, label) {
  assert.strictEqual(r.hasExif, true, label + ': should detect EXIF');
  assert.strictEqual(r.fields.Make, 'TestCam', label + ': Make');
  assert.strictEqual(r.fields.Model, 'MX-1', label + ': Model');
  assert.deepStrictEqual(r.gps, { lat: 14.5, lon: 121 }, label + ': GPS');
}

// PNG with an eXIf chunk (no "Exif\0\0" prefix, per the PNG spec).
function chunk(type, data) {
  var c = new Uint8Array(12 + data.length), dv = new DataView(c.buffer);
  dv.setUint32(0, data.length);
  for (var i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
  c.set(data, 8);
  return c; // CRC is not checked by the reader
}
function concat(parts) {
  var n = parts.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(n), o = 0;
  parts.forEach(function (p) { out.set(p, o); o += p.length; });
  return out;
}
var pngSig = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
var png = concat([pngSig, chunk('IHDR', new Uint8Array(13)), chunk('eXIf', buildTiff()), chunk('IDAT', new Uint8Array(4)), chunk('IEND', new Uint8Array(0))]);
var rp = parse(png);
checkFields(rp, 'png');
assert.strictEqual(rp.format, 'png');
assert.strictEqual(rp.exifBytes, 178 + 12, 'png exif byte count');
// eXIf written after the image data by an older encoder is still found.
checkFields(parse(concat([pngSig, chunk('IHDR', new Uint8Array(13)), chunk('IDAT', new Uint8Array(4)), chunk('eXIf', buildTiff()), chunk('IEND', new Uint8Array(0))])), 'png late eXIf');
var plainPng = parse(concat([pngSig, chunk('IHDR', new Uint8Array(13)), chunk('IEND', new Uint8Array(0))]));
assert.strictEqual(plainPng.hasExif, false, 'png without eXIf');
assert.strictEqual(plainPng.format, 'png');

// WebP with an EXIF chunk, with and without the JPEG-style prefix, and an odd-sized chunk before it.
function riffChunk(type, data) {
  var pad = data.length & 1, c = new Uint8Array(8 + data.length + pad), dv = new DataView(c.buffer);
  for (var i = 0; i < 4; i++) c[i] = type.charCodeAt(i);
  dv.setUint32(4, data.length, true);
  c.set(data, 8);
  return c;
}
function webp(exifData) {
  var body = concat([Uint8Array.from([0x57, 0x45, 0x42, 0x50]), riffChunk('VP8X', new Uint8Array(10)), riffChunk('ICCP', new Uint8Array(3)), riffChunk('EXIF', exifData)]);
  var head = new Uint8Array(8), dv = new DataView(head.buffer);
  head.set([0x52, 0x49, 0x46, 0x46]); dv.setUint32(4, body.length, true);
  return concat([head, body]);
}
var rw = parse(webp(buildTiff()));
checkFields(rw, 'webp');
assert.strictEqual(rw.format, 'webp');
assert.strictEqual(rw.exifBytes, 178 + 8, 'webp exif byte count');
checkFields(parse(webp(concat([Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), buildTiff()]))), 'webp with Exif prefix');

// Truncated files of every format degrade, never throw.
[buildJpegWithExif(), png, webp(buildTiff())].forEach(function (b) {
  for (var cut = 0; cut < b.length; cut += 7) assert.doesNotThrow(function () { parse(b.subarray(0, cut)); });
});

// Other metadata blocks: XMP, IPTC, colour profile, comment and data after the image.
function seg(marker, data) {
  var c = new Uint8Array(4 + data.length), dv = new DataView(c.buffer);
  dv.setUint16(0, 0xFF00 | marker); dv.setUint16(2, data.length + 2);
  c.set(data, 4);
  return c;
}
function bytesOf(str) { return Uint8Array.from(Buffer.from(str, 'utf8')); }
var xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description photoshop:City="Quezon City" xmp:CreatorTool="Lightroom">' +
  '<dc:creator><rdf:Seq><rdf:li>Juan dela Cruz</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>';
function iim(dataset, text) { var t = bytesOf(text); return concat([Uint8Array.from([0x1C, 2, dataset, t.length >> 8, t.length & 255]), t]); }
var records = concat([iim(80, 'J. Cruz'), iim(101, 'Philippines')]);
var res = new Uint8Array(12 + records.length + (records.length & 1)), rdv = new DataView(res.buffer);
res.set(bytesOf('8BIM')); rdv.setUint16(4, 0x0404); rdv.setUint32(8, records.length); res.set(records, 12); // empty name: 2 bytes
var scan = Uint8Array.from([0xFF, 0xDA, 0x00, 0x02, 0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD9]);
var video = concat([Uint8Array.from([0, 0, 0, 24]), bytesOf('ftypmp42'), new Uint8Array(200)]);
var full = concat([Uint8Array.from([0xFF, 0xD8]),
  seg(0xE1, concat([bytesOf('http://ns.adobe.com/xap/1.0/\0'), bytesOf(xmp)])),
  seg(0xED, concat([bytesOf('Photoshop 3.0\0'), res])),
  seg(0xE2, concat([bytesOf('ICC_PROFILE\0'), new Uint8Array(40)])),
  seg(0xFE, bytesOf('shot from my balcony')),
  scan, video]);
var rb = parse(full), kinds = rb.blocks.map(function (b) { return b.kind; });
assert.deepStrictEqual(kinds, ['xmp', 'iptc', 'icc', 'comment', 'trailer'], 'jpeg blocks');
assert.deepStrictEqual(rb.blocks[0].info, { Creator: 'Juan dela Cruz', City: 'Quezon City', 'Made with': 'Lightroom' });
assert.deepStrictEqual(rb.blocks[1].info, { 'By-line': 'J. Cruz', Country: 'Philippines' });
assert.strictEqual(rb.blocks[2].personal, false, 'colour profile is not personal');
assert.strictEqual(rb.blocks[3].info.Text, 'shot from my balcony');
assert.strictEqual(rb.blocks[4].bytes, video.length);
assert.strictEqual(rb.blocks[4].info.Contains, 'a video clip (motion photo)');
assert.strictEqual(rb.hasExif, false, 'no EXIF block in this file');

var aiPng = concat([pngSig, chunk('IHDR', new Uint8Array(13)),
  chunk('tEXt', bytesOf('parameters\0a cat on a roof, seed 42')),
  chunk('iTXt', concat([bytesOf('XML:com.adobe.xmp\0\0\0\0\0'), bytesOf(xmp)])),
  chunk('iCCP', new Uint8Array(10)), chunk('IDAT', new Uint8Array(4)), chunk('IEND', new Uint8Array(0))]);
var rpb = parse(aiPng).blocks;
assert.deepStrictEqual(rpb.map(function (b) { return b.label; }), ['Text: parameters', 'XMP (editing and library data)', 'Colour profile']);
assert.strictEqual(rpb[0].info.Text, 'a cat on a roof, seed 42');
assert.strictEqual(rpb[1].info.Creator, 'Juan dela Cruz');

var webpXmp = (function () {
  var body = concat([bytesOf('WEBP'), riffChunk('VP8X', new Uint8Array(10)), riffChunk('XMP ', bytesOf(xmp))]);
  var head = new Uint8Array(8); head.set(bytesOf('RIFF')); new DataView(head.buffer).setUint32(4, body.length, true);
  return concat([head, body]);
}());
assert.strictEqual(parse(webpXmp).blocks[0].info.City, 'Quezon City');
[full, aiPng, webpXmp].forEach(function (b) {
  for (var cut = 0; cut < b.length; cut += 5) assert.doesNotThrow(function () { parse(b.subarray(0, cut)); });
});
assert.deepStrictEqual(parse(buildJpegWithExif()).blocks, [], 'plain EXIF jpeg has no other blocks');

// A plain (non-JPEG) buffer must degrade, not throw.
var plain = parse(new Uint8Array([1, 2, 3, 4, 5, 6]));
assert.strictEqual(plain.hasExif, false, 'non-jpeg has no exif');

// A JPEG with no EXIF segment.
assert.strictEqual(parse(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])).hasExif, false, 'jpeg w/o exif');

console.log('ok, all EXIF parser checks passed');
