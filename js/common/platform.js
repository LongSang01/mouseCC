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

export function showUdevHint(vids, logFn) {
  if (detectPlatform() !== "linux") return;
  logFn("如果提示 'Failed to open the device',请运行:");
  logFn("");
  logFn("cat <<'EOF' | sudo tee /etc/udev/rules.d/71-mouse-webhid.rules");
  for (const v of vids) {
    const vid = v.vid.toString(16).padStart(4, "0");
    const pid = v.pid.toString(16).padStart(4, "0");
    logFn(`ACTION!="remove", SUBSYSTEMS=="usb", ATTRS{idVendor}=="${vid}", ATTRS{idProduct}=="${pid}", MODE="0660", TAG+="uaccess"`);
  }
  logFn("EOF");
  logFn("");
  logFn("sudo udevadm control --reload-rules && sudo udevadm trigger");
  logFn("");
  logFn("然后重启 Chrome");
}
