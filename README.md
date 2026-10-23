# Rinse

Shows you the metadata hiding in a photo, then hands back a copy with none of
it. Runs entirely in your browser tab.

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/rinse/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/rinse/actions)

Phones write a lot into a photo file. GPS coordinates, camera make and model,
the exact time it was taken, often the app that edited it. All of that travels
with the file when you post it somewhere.

Most of the "remove EXIF online" tools upload your photo to a server to strip
it, which means handing a stranger the exact file you were worried about. Rinse
does the whole thing locally. Open the Network tab and watch: it never opens a
connection.

It also shows you the data before wiping it. You get the actual coordinates with
a link to that spot on a map, the camera, and the timestamps. Seeing it is
usually what convinces people to bother.

## Use it

Open [`index.html`](index.html) in a browser, or host the folder on any static
server. No build step and no dependencies. It's a page, a small metadata reader,
and nothing else.

Drop a photo in, read what it was leaking, click Download clean copy. Your
original on disk is never touched.

## How the wipe works

The clean copy gets redrawn from pixels onto a fresh canvas and re-encoded.
Metadata lives in the file's headers rather than the pixels, so a new encode
simply has none. No EXIF, no GPS, no embedded thumbnail, no maker notes.

The tradeoff is that a JPEG or WebP gets recompressed once, at quality 0.95,
and the embedded colour profile is dropped along with everything else. For a
photo you're about to post that's fine. PNGs re-encode losslessly. A browser
that can't encode WebP (older Safari) hands back a PNG, and the file is named
to match.

## What it reads

`exif.js` is a small EXIF reader for JPEG, PNG (`eXIf` chunk) and WebP
(`EXIF` chunk) that pulls only the fields that actually expose you.

| Field | Why it matters |
|---|---|
| GPS latitude / longitude | Where the photo was taken, often someone's home |
| Camera make / model | Ties separate photos to the same device |
| Date taken / modified | When you were there |
| Editing software | What you used, sometimes your OS |
| XMP and IPTC | Your name as creator or by-line, city and country, set by Lightroom, Photoshop and photo libraries |
| PNG text | Comments, and the full prompt and settings that AI image tools write into their PNGs |
| Data after the image | The video clip in a motion photo, or the depth map or HDR gain map a phone appends |

Colour profiles and similar blocks are listed too, marked harmless, so the size
of what gets removed adds up.

It isn't a full EXIF library. A malformed file degrades to "metadata present"
rather than crashing, since a privacy tool falling over on the file you were
worried about is the worst possible failure.

## Files

```
index.html      the whole app plus landing page, inline
exif.js         the EXIF reader, works in browser and Node
exif.test.js    node exif.test.js, builds a JPEG, PNG and WebP with GPS and reads them back
image-policy.js validates file signatures, MIME types, size and dimensions
image-policy.test.js covers JPEG, PNG, WebP, spoofed files and safety limits
```

```bash
node exif.test.js
node image-policy.test.js
```

## Limits

Reads EXIF from JPEG, PNG and WebP. HEIC photos straight off an iPhone aren't
accepted, because most browsers can't decode them. Export them as JPEG first,
or set the iPhone camera format to Most Compatible.

The wipe re-encodes. That's the mechanism, which also means it isn't a lossless
metadata edit.

It reads the fields that matter, not all 400 EXIF tags, and shows compressed
PNG text only by its name. The download strips everything regardless.

## More tools

- [Carryover](https://github.com/cig13zs/carryover), AI chat context transfer for ChatGPT, DeepSeek and Grok
- [Invisibles](https://github.com/cig13zs/invisibles), reveal and strip hidden Unicode from text
- [Search Restore](https://github.com/cig13zs/search-restore), add archive links and load more Google results on demand

MIT licensed. [Ko-fi](https://ko-fi.com/jju1s) if it was useful.
