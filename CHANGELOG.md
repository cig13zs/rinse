# Changelog

## Unreleased

### Added

- Rinse now lists every metadata block, not only EXIF: XMP and IPTC (creator name, city, country, editing app), JPEG comments, PNG text chunks (including AI prompts), colour profiles, and data stored after the image, such as the video in a motion photo or a phone's depth or HDR gain map. A city or country in XMP or IPTC counts as a location in the verdict, and the readout totals what the clean copy removes.
- WebP photos are accepted. Rinse reads their EXIF chunk (GPS, camera, dates) and the clean copy is re-encoded as WebP, or as PNG in a browser that can't write WebP.
- PNGs with an `eXIf` chunk now get the same readout as JPEGs instead of "No EXIF metadata found".

## 2026-08-23

JPEG and PNG input, a readout of GPS (with a map link), camera, timestamps and editing software, and a clean copy re-encoded from pixels. Licence, CI and README.
