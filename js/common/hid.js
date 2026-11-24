export class HIDConnection {
  constructor() {
    this.device = null;
    this.inputListener = null;
    /** 当前等待响应的请求(同一时刻只允许一个) */
    this.waiter = null;
    /** 请求串行队列 */
    this.chain = Promise.resolve();
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

  /**
   * 串行化「发送 + 等待响应」。
   * 只有一个响应槽位,若两个请求并发就会互相覆盖:先到的等待者被丢掉,
   * 它的超时定时器还会把后一个等待者的槽位清空,表现为假超时。
   * 所有收发都必须经过这里。
   */
  lock(fn) {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  open(device, reportId) {
    this._detachListener();
    this.device = device;
    this.inputListener = (e) => {
      if (e.reportId !== reportId) return;
      const waiter = this.waiter;
      if (!waiter) return;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.resolve(
        new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength),
      );
    };
    device.addEventListener("inputreport", this.inputListener);
  }

  _detachListener() {
    if (this.device && this.inputListener) {
      this.device.removeEventListener("inputreport", this.inputListener);
    }
    this.inputListener = null;
  }

  _cancelWaiter(message) {
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }

  async close() {
    this._cancelWaiter("连接已关闭");
    this._detachListener();
    if (this.device) {
      try {
        await this.device.close();
      } catch (e) {}
    }
    this.device = null;
  }

  waitForResponse(timeout = 300) {
    this._cancelWaiter("请求被新的请求覆盖");
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        // 只清理自己的槽位,不能动后来者的等待
        if (this.waiter === waiter) this.waiter = null;
        reject(new Error("响应超时"));
      }, timeout);
      this.waiter = waiter;
    });
  }
}
