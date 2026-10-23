# Changelog

## Unreleased

### Added

- WebP photos are accepted. Rinse reads their EXIF chunk (GPS, camera, dates) and the clean copy is re-encoded as WebP, or as PNG in a browser that can't write WebP.
- PNGs with an `eXIf` chunk now get the same readout as JPEGs instead of "No EXIF metadata found".

## 2026-08-23

JPEG and PNG input, a readout of GPS (with a map link), camera, timestamps and editing software, and a clean copy re-encoded from pixels. Licence, CI and README.
