export class HIDConnection {
  constructor() {
    this.device = null;
    this.inputListener = null;
    this.pendingResolve = null;
    this.pendingTimer = null;
  }

  async requestDevices(vendorId, productIds) {
    const filters = productIds.map((pid) => ({ vendorId, productId: pid }));
    const requested = await navigator.hid.requestDevice({ filters });
    const granted = await navigator.hid.getDevices();
    const all = [];
    const seen = new Set();
    for (const d of [...requested, ...granted]) {
      if (d.vendorId !== vendorId) continue;
      if (!productIds.includes(d.productId)) continue;
      // 不按 productName 去重 — 同一物理设备的不同 HID 接口是不同对象
      const key = `${d.vendorId}:${d.productId}:${d.productName}:${d.collections.map((c) => `${c.usagePage}:${c.usage}`).join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(d);
      }
    }
    return all;
  }

  findCollection(device, usagePage, usage) {
    return (device.collections || []).find(
      (c) => c.usagePage === usagePage && c.usage === usage,
    );
  }

  open(device, reportId) {
    this.device = device;
    this.inputListener = (e) => {
      if (e.reportId !== reportId) return;
      const data = new Uint8Array(
        e.data.buffer,
        e.data.byteOffset,
        e.data.byteLength,
      );
      if (this.pendingResolve) {
        const r = this.pendingResolve;
        this.pendingResolve = null;
        clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
        r(data);
      }
    };
    device.addEventListener("inputreport", this.inputListener);
  }

  async close() {
    if (this.device) {
      if (this.inputListener) {
        this.device.removeEventListener("inputreport", this.inputListener);
      }
      try {
        await this.device.close();
      } catch (e) {}
    }
    this.device = null;
    this.inputListener = null;
    this.pendingResolve = null;
    clearTimeout(this.pendingTimer);
  }

  waitForResponse(timeout = 300) {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingTimer = setTimeout(() => {
        this.pendingResolve = null;
        reject(new Error("响应超时"));
      }, timeout);
    });
  }
}
