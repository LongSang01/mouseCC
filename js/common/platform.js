export function detectPlatform() {
  const ua = navigator.userAgent;
  if (ua.includes("Linux")) return "linux";
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Mac")) return "macos";
  return "unknown";
}

export function isWebHIDSupported() {
  return "hid" in navigator;
}
