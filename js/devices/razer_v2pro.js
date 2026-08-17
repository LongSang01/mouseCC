import { DeviceBase } from "../common/device-base.js";
import { RazerProtocol } from "../common/protocol.js";
import { log, $, setConnected } from "../common/ui.js";
import { HIDConnection } from "../common/hid.js";

const INFO = {
  name: "Razer Viper V2 Pro",
  vendorId: 0x1532,
  productIds: [0x00a5, 0x00a6],
  maxStages: 5,
  maxDpi: 30000,
  defaultColors: ["#f0625a", "#39d353", "#58a6ff", "#39c5cf", "#e3b341"],
  defaultFill: [400, 800, 1600, 3200, 6400],
  pollRates: { 0x08: 125, 0x02: 500, 0x01: 1000 },
  pollRateToByte: { 125: 0x08, 500: 0x02, 1000: 0x01 },
  readyHint: "退出 Razer Synapse 后点击「连接设备」。",
};

export class RazerV2Pro extends DeviceBase {
  constructor() {
    super(INFO);
    this.hid = new HIDConnection();
    this.proto = null;
  }

  async connect(devices = null) {
    if (!devices)
      devices = await this.hid.requestDevices(
        this.info.vendorId,
        this.info.productIds,
      );
    if (!devices.length) {
      log("未获得任何接口授权");
      return false;
    }

    log(`枚举到 ${devices.length} 个 HID device`);
    for (const d of devices) {
      try {
        if (!d.opened) await d.open();
        this.hid.open(d, 0);
        this.proto = new RazerProtocol(this.hid);
        if (await this._testProbe()) {
          log(`已连接: ${d.productName} (PID 0x${d.productId.toString(16)})`);
          setConnected(true, d);
          await this.refreshStatus();
          return true;
        }
      } catch (e) {}
    }

    log("未找到可用接口");
    for (const d of devices)
      try {
        if (d.opened) await d.close();
      } catch (e) {}
    return false;
  }

  async disconnect() {
    await super.disconnect(this.hid);
  }

  async refreshStatus() {
    try {
      await this.getBattery();
      await this.getCharging();
      await this.getDpiStages();
      await this.getPollRate();
    } catch (e) {
      log(`刷新失败: ${e.message}`);
    }
  }

  async _testProbe() {
    try {
      const { bytes: r } = await this.proto.sendAndReceive(
        0x07,
        0x80,
        [0x00, 0x00],
      );
      return r.length > 9 && r[6] === 0x07 && r[7] === 0x80 && r[9] !== 0;
    } catch (e) {
      return false;
    }
  }

  _stageXY(r, i) {
    const base = 12 + i * 7;
    return {
      x: (r[base] << 8) | r[base + 1],
      y: (r[base + 2] << 8) | r[base + 3],
    };
  }

  async getBattery() {
    const { bytes: r } = await this.proto.sendAndReceive(
      0x07,
      0x80,
      [0x00, 0x00],
    );
    const raw = r.length > 9 ? r[9] : -1;
    const pct = raw <= 100 ? raw : Math.round((raw / 255) * 100);
    $("battVal").textContent = raw >= 0 ? `${pct}%` : "--";
    log(`电量 = ${pct}%`);
  }

  async getCharging() {
    const { bytes: r } = await this.proto.sendAndReceive(
      0x07,
      0x84,
      [0x00, 0x00],
    );
    let v = r.length > 9 ? r[9] : -1;
    if (v !== 0 && v !== 1 && r.length > 11) v = r[11];
    $("chargeVal").textContent = v === 1 ? "是" : v === 0 ? "否" : "--";
    log(`充电 = ${v === 1 ? "充电中" : v === 0 ? "未充电" : "未知"}`);
  }

  async getDpiStages() {
    const { bytes: r } = await this.proto.sendAndReceive(
      0x04,
      0x86,
      new Array(0x26).fill(0x00),
    );
    if (r.length <= 10) {
      log("⚠️ 档位响应过短");
      return;
    }

    const active = r[9],
      count = r[10];
    for (let i = 0; i < this.info.maxStages; i++) {
      this.stages.enBoxes[i].checked = i < count;
      this.stages.dpiBoxes[i].value =
        i < count ? this._stageXY(r, i).x : this.info.defaultFill[i];
    }
    this.stages.updateSummary();
    if (active >= 1 && active <= count) {
      $("activeStage").value = String(active);
      $("dpiVal").textContent = this._stageXY(r, active - 1).x;
    }
  }

  async setDpiStages() {
    const enabled = this.stages.enabledStages();
    if (!enabled.length) {
      log("⚠️ 至少需要启用 1 个档位");
      return;
    }
    const active = Math.min(
      parseInt($("activeStage").value) || 1,
      enabled.length,
    );
    const args = new Array(0x26).fill(0x00);
    args[0] = 0x00;
    args[1] = active;
    args[2] = enabled.length;
    for (let i = 0; i < enabled.length; i++) {
      const dpi = this.stages.getStageDpi(enabled[i]);
      const o = 3 + i * 7;
      args[o] = i;
      args[o + 1] = (dpi >> 8) & 0xff;
      args[o + 2] = dpi & 0xff;
      args[o + 3] = (dpi >> 8) & 0xff;
      args[o + 4] = dpi & 0xff;
    }
    await this.proto.sendAndReceive(0x04, 0x06, args);
    log(`档位写入: ${enabled.length}档, 当前第${active}档`);
  }

  async getPollRate() {
    const { bytes: r } = await this.proto.sendAndReceive(0x00, 0x85, [0x00]);
    const byte = r.length > 8 ? r[8] : -1;
    const rate = this.info.pollRates[byte];
    $("pollVal").textContent = rate ? `${rate} Hz` : "--";
    log(`回报率 = ${rate || "未知"}Hz`);
  }

  async setPollRate(hz) {
    const byte = this.info.pollRateToByte[hz];
    if (byte === undefined) {
      log(`⚠️ ${hz}Hz 超出范围`);
      return;
    }
    await this.proto.sendAndReceive(0x00, 0x05, [byte]);
    log(`回报率设置: ${hz}Hz`);
  }

  initUI() {
    super.initUI(this.hid);
  }
}
