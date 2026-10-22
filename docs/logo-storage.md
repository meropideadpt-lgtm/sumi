# Custom logos: compression, storage and recovery

Phase 6 accepts static PNG, JPEG and WebP uploads up to **12 MiB**, **8192 pixels per edge**, and **40 million pixels**. These input bounds protect browser memory, while permitting ordinary phone photos that exceeded the former 500 KB limit. SVG, GIF, APNG, animated WebP, misleading MIME types, invalid headers and truncated images remain rejected. Browser decoding must also succeed before an upload is accepted.

Every newly uploaded image is decoded and re-encoded on a canvas, preserving its aspect ratio and transparency and removing source metadata. The maximum stored dimension is 512 pixels. WebP at quality 0.86 is preferred; browsers without WebP encoding fall back to PNG. If necessary, smaller dimensions are tried until the encoded image fits within 300,000 bytes. Compression failure is reported and does not replace the selected image. A small image is not enlarged. Existing embedded logos are not recompressed or migrated automatically.

## Storage order and compatibility

`logo-store.js` uses IndexedDB database `sumi-logo-assets-v1`, object store `logos`. Each record contains a Blob, a version, a creation timestamp and a SHA-256 content ID. A subscription references the asset using `sumi-logo:` followed by exactly 64 lowercase hexadecimal digits. The reference is returned **only after the write transaction completes**, not merely after the put request succeeds.

If IndexedDB is disabled, blocked, unavailable, full or times out—or hashing is unavailable—the compressed data URL is returned instead. The application then uses its existing guarded localStorage save path. Failure to save that subscription still leaves the original subscription and payment history unchanged. Inline fallback requires sufficient localStorage space, and storage errors remain visible.

Legacy inline images, allowed HTTPS image URLs and local catalogue assets continue to work unchanged. Uploading an image does not rewrite old subscriptions, payments, preferences or exchange rates. New asset storage has no dependency on the service worker cache. Removing or replacing a selected logo does not eagerly delete assets: another tab, another subscription or a cancelled edit may still need them. Unused images can consequently remain in IndexedDB; a future maintenance feature would need an explicit, safe retention policy.

## Display, export and import

Asset reads verify the stored content hash. Unavailable or corrupted assets resolve to a neutral placeholder. Up to 12 resolved images are cached in memory, concurrent reads of an asset are deduplicated, and no persistent object URLs are created.

Normal JSON backup export hydrates asset references into portable data URLs. It reads durable storage rather than trusting the display cache. If any referenced image cannot be read, export stops with an explanation instead of silently producing an incomplete backup. The input records and arbitrary user notes are not mutated. Import accepts these embedded images through the ordinary data validator and does not require the source device's IndexedDB. After the user confirms the import, `prepareImport(data)` stores eligible subscription images in IndexedDB before returning subscription references. This keeps a backup with many images from unnecessarily expanding localStorage. Repeated images are deduplicated, original image bytes are preserved, and larger legacy images remain inline without recompression. If IndexedDB is unavailable, all affected images remain inline and the normal transactional localStorage save must still succeed. The preparation step copies its input and only updates known `subscriptions[].logo` fields; payments, unknown extensions and notes remain unchanged. Existing asset references must resolve against durable storage before preparation can succeed. Foreign unresolved asset references cannot become a successful portable import.

Browser storage can still be removed by the user, private browsing policies, device cleanup or storage eviction. Neither IndexedDB nor a PWA guarantees permanent storage. Keep exported backups for portability and recovery. This phase does not request persistence permission or automatically purge existing storage.

## Validation and device limits

Unit tests cover bounded image validation, raster normalization, compression errors, durable transaction ordering, IndexedDB fallback, deduplicated reads, legacy image compatibility, portable backups, many-image import round trips, inline fallback and missing/corrupted assets. Browser regression tests exercise actual canvas encoding, IndexedDB storage, reloads and export.

Chromium automation is not a real iPadOS/Safari test. Safari image orientation, camera photo decoding, available memory, private browsing storage behavior, installation and device storage eviction still need real-device acceptance. HEIC/HEIF images are not accepted; export or select a PNG, JPEG or WebP image first.
