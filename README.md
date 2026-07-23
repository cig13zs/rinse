# Rinse

See the hidden data in a photo — including where it was taken — then wash it off.
It never leaves your browser.

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/rinse/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/rinse/actions)

Every photo your phone takes carries metadata: GPS coordinates, the camera, the
exact time, sometimes the editing app. Post it anywhere and that rides along.
Rinse reads it, shows it to you plainly, and hands back a clean copy with all of
it removed.

**It makes no network requests. There is nothing to upload and nothing to sign up for.**

## Why not one of the hundred other EXIF removers

Most "remove EXIF online" tools upload your photo to a server to strip it — a
privacy tool that asks you to hand a stranger the exact photo you were worried
about. Rinse does the whole thing in your own browser tab. Open the Network tab
and watch: it never opens a connection.

And it shows you first. Before you wipe anything you see the actual GPS
coordinates with a link to that spot on a map, the camera make and model, and the
timestamps. The scary part is what convinces people to bother.

## How the wipe works

The clean copy is re-drawn from pixels onto a fresh canvas and re-encoded.
Metadata lives in the file's headers, not in the pixels, so a new encode simply
has none — no EXIF, no GPS, no embedded thumbnail, no maker notes. Not hidden,
gone.

The one honest tradeoff: a JPEG is re-compressed once (quality kept high at 0.95),
and the embedded colour profile is dropped along with everything else. For a
photo you're about to post online, that is exactly what you want. PNGs re-encode
losslessly.

## Use it

Open [`index.html`](index.html) in a browser, or host the folder anywhere static.
There is no build step and no dependency — it's a page, a 200-line EXIF reader,
and nothing else.

Drop a photo in, read what it was leaking, click **Download clean copy**. Your
original on disk is never touched.

## What it reads

`exif.js` is a deliberately small JPEG EXIF reader. It pulls only the fields that
actually expose you:

| Field | Why it matters |
|---|---|
| GPS latitude / longitude | Where the photo was taken — often someone's home |
| Camera make / model | Ties separate photos to the same device |
| Date taken / modified | When you were there |
| Editing software | What you used, sometimes your OS |

It is not a full EXIF library on purpose. If a file is malformed it degrades to
"metadata present" rather than crashing — a privacy tool should never fall over
on the file you were worried about.

## Develop

```
index.html      the whole app + landing page, inline
exif.js         the EXIF reader (works in browser and Node)
exif.test.js    node exif.test.js  — builds a JPEG with GPS and reads it back
```

```bash
node exif.test.js
```

## Limits, stated up front

- **Reads EXIF from JPEG.** PNGs rarely carry EXIF; they're still fully wiped on
  download, you just won't see a "here's what was in it" readout.
- **The wipe re-encodes.** That's the mechanism, not a bug — it's why nothing
  survives. It also means it is not a lossless metadata edit; it's a clean
  reprint.
- **It reads the scary fields, not all 400 EXIF tags.** The download strips
  everything regardless; the on-screen readout just covers what matters.

MIT licensed. Do what you like with it.
