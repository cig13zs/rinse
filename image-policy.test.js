var assert = require('assert');
var policy = require('./image-policy');

var jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
var png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
var webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
var wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
var svg = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));

assert.deepStrictEqual(policy.inspect('image/jpeg', 1024, jpeg), { ok: true, kind: 'jpeg' });
assert.deepStrictEqual(policy.inspect('image/png', 1024, png), { ok: true, kind: 'png' });
assert.deepStrictEqual(policy.inspect('image/webp', 1024, webp), { ok: true, kind: 'webp' });
assert.deepStrictEqual(policy.inspect('', 1024, webp), { ok: true, kind: 'webp' });
assert.strictEqual(policy.inspect('audio/wav', 1024, wav).ok, false);
assert.strictEqual(policy.inspect('image/jpeg', 1024, webp).ok, false);
assert.strictEqual(policy.inspect('image/webp', 1024, webp.subarray(0, 8)).ok, false);
assert.strictEqual(policy.inspect('image/svg+xml', 1024, svg).ok, false);
assert.strictEqual(policy.inspect('image/png', 1024, jpeg).ok, false);
assert.strictEqual(policy.inspect('image/jpeg', 31 * 1024 * 1024, jpeg).ok, false);
assert.strictEqual(policy.dimensionsAllowed(8000, 8000), true);
assert.strictEqual(policy.dimensionsAllowed(16001, 100), false);
assert.strictEqual(policy.dimensionsAllowed(12000, 12000), false);

console.log('Image file policy checks passed.');
