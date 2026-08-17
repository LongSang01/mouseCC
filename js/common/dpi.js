export function dpiToKey(v) {
  if (v <= 12800) return v / 50 - 1;
  if (v <= 25600) return 0x4400 + (v / 50 - 257);
  return 0x8800 + (v / 50 - 513);
}

export function keyToDpi(key) {
  if (key <= 255) return 50 * (key + 1);
  if (key >= 0x8800) return 50 * ((key & 0xff) + 513);
  return 50 * ((key & 0xff) + 257);
}

export function dpiBlockBytes(key) {
  const lo = key & 0xff;
  const hi = key >> 8;
  const cs = (85 - (lo + lo + hi)) & 0xff;
  return [lo, lo, hi, cs];
}

export function colorChecksum(r, g, b) {
  return (85 - ((r + g + b) & 0xff)) & 0xff;
}
