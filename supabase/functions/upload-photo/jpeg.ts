// Small JPEG helpers with no dependencies.

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/**
 * Returns a copy of a JPEG with metadata segments removed: APP1 (EXIF, including GPS location,
 * and XMP), APP12–APP15 and comments. Image data is untouched. APP0 (JFIF) and APP2 (ICC colour
 * profile) are kept so colours still look right. Anything it doesn't understand is returned as-is
 * from that point on, so a malformed file never becomes larger or loses image data.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) return b;
  const out: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;                       // not a marker: give up and copy the rest
    const marker = b[i + 1];
    if (marker === 0xda) break;                     // SOS: compressed image data follows
    if (marker === 0xd9) break;                     // EOI
    const len = (b[i + 2] << 8) | b[i + 3];         // includes the two length bytes
    if (len < 2 || i + 2 + len > b.length) break;
    const drop = marker === 0xe1 || (marker >= 0xec && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  out.push(b.subarray(i));
  const total = out.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const p of out) { result.set(p, o); o += p.length; }
  return result;
}
