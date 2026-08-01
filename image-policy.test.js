var assert = require('assert');
var policy = require('./image-policy');

var jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
var png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
var svg = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));

assert.deepStrictEqual(policy.inspect('image/jpeg', 1024, jpeg), { ok: true, kind: 'jpeg' });
assert.deepStrictEqual(policy.inspect('image/png', 1024, png), { ok: true, kind: 'png' });
assert.strictEqual(policy.inspect('image/svg+xml', 1024, svg).ok, false);
assert.strictEqual(policy.inspect('image/png', 1024, jpeg).ok, false);
assert.strictEqual(policy.inspect('image/jpeg', 31 * 1024 * 1024, jpeg).ok, false);
assert.strictEqual(policy.dimensionsAllowed(8000, 8000), true);
assert.strictEqual(policy.dimensionsAllowed(16001, 100), false);
assert.strictEqual(policy.dimensionsAllowed(12000, 12000), false);

console.log('Image file policy checks passed.');
