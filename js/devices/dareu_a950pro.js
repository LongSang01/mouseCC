import { DeviceBase } from "../common/device-base.js";
import { JmProtocol } from "../common/protocol.js";
import {
  dpiToKey,
  keyToDpi,
  dpiBlockBytes,
  colorChecksum,
} from "../common/dpi.js";
import { log, $, setConnected } from "../common/ui.js";
import { HIDConnection } from "../common/hid.js";

const INFO = {
  name: "DAREU A950 Pro",
  vendorId: 0x260d,
  productIds: [0x1112, 0x1115],
  jmCollection: { usagePage: 0xff02, usage: 2 },
  maxStages: 7,
  maxDpi: 26000,
  defaultColors: [
    "#ff0000",
    "#0000ff",
    "#00ff00",
    "#ffff00",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ],
  defaultFill: [400, 1300, 1600, 3200, 6400, 9600, 12800],
  pollRates: { 1: 1000, 2: 500, 4: 250, 8: 125 },
  pollRateToByte: { 1000: 1, 500: 2, 250: 4, 125: 8 },
  readyHint: "点击「连接设备」开始。",
};

const cssColor = (...rgb) =>
  `#${rgb.map((v) => (v & 0xff).toString(16).padStart(2, "0")).join("")}`;

export class DareuA950Pro extends DeviceBase {
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

    const candidates = devices.filter((d) =>
      this.hid.findCollection(
        d,
        this.info.jmCollection.usagePage,
        this.info.jmCollection.usage,
      ),
    );
    if (!candidates.length) {
      log(`枚举到 ${devices.length} 个接口,均无 Jm 控制集合`);
      return false;
    }

    for (const d of candidates) {
      try {
        log(`  尝试 ${d.productName}(0x${d.productId.toString(16)})`);
        if (!d.opened) await d.open();
        this.hid.open(d, 8);
        this.proto = new JmProtocol(this.hid);

        const info = await this.proto.sendCommand(0x01, 0, 8);
        if (info[10] !== 10 || info[11] !== 1) {
          await this.hid.close();
          continue;
        }

        const type =
          info[12] === 0
            ? "2.4G 接收器"
            : info[12] === 2
              ? "有线鼠标"
              : `type=${info[12]}`;
        log(`已连接: ${d.productName} (${type})`);
        setConnected(true, d);

        if ((await this.proto.sendCommand(0x03))[6] !== 1) {
          log("⚠️ 2.4G 鼠标未连接到接收器,点「刷新状态」重试");
          return true;
        }
        log("设备激活 (CheckActive=1)");
        const fw = await this.proto.sendCommand(0x12);
        log(`固件版本 v${fw[6]}.${fw[7].toString(16).toUpperCase()}`);
        await this.refreshStatus();
        return true;
      } catch (e) {
        log(`  尝试 ${d.productName}: ${e.message}`);
        await this.hid.close();
      }
    }
    log("未找到可用接口");
    return false;
  }

  async _getBuffer(addr, len) {
    if (len <= this.proto.DATA_LEN) {
      const r = await this.proto.sendCommand(0x08, addr, len);
      return Array.from(r.slice(6, 6 + len));
    }
    const chunks = [];
    for (let off = 0; off < len; off += this.proto.DATA_LEN)
      chunks.push(
        ...(await this._getBuffer(
          addr + off,
          Math.min(this.proto.DATA_LEN, len - off),
        )),
      );
    return chunks;
  }

  async _setBuffer(addr, data) {
    for (let off = 0; off < data.length; off += this.proto.DATA_LEN) {
      const part = data.slice(off, off + this.proto.DATA_LEN);
      await this.proto.sendCommand(0x07, addr + off, part.length, part);
    }
  }

  async getBattery() {
    const r = await this.proto.sendCommand(0x04);
    const level = r[6],
      status = r[7];
    $("battVal").textContent = level > 0 ? `${level}%` : "--";
    $("chargeVal").textContent =
      status === 1 || status === 2 ? "是" : status === 0 ? "否" : "--";
    log(`电量 = ${level}% (status=0x${status.toString(16)})`);
  }

  async getDpiStages() {
    const head = await this._getBuffer(0, 10);
    const rateByte = head[0],
      count = head[2],
      active = head[4] + 1;

    const stageKeys = [];
    if (count > 0) {
      const bytes = await this._getBuffer(12, count * 4);
      for (let i = 0; i < count; i++)
        stageKeys.push(bytes[i * 4 + 1] | (bytes[i * 4 + 2] << 8));
    }

    const stageColors = [...this.info.defaultColors];
    if (count > 0) {
      const cb = await this._getBuffer(44, count * 4);
      for (let i = 0; i < count; i++) {
        const o = i * 4;
        stageColors[i] = cssColor(cb[o], cb[o + 1], cb[o + 2]);
      }
    }

    for (let i = 0; i < this.info.maxStages; i++) {
      this.stages.enBoxes[i].checked = i < count;
      this.stages.dpiBoxes[i].value =
        i < count ? keyToDpi(stageKeys[i]) : this.info.defaultFill[i];
      this.stages.setStageColor(i, stageColors[i]);
    }
    this.stages.updateSummary();
    if (active >= 1 && active <= count) {
      $("activeStage").value = String(active);
      $("dpiVal").textContent = keyToDpi(stageKeys[active - 1]);
    }
    $("pollVal").textContent = this.info.pollRates[rateByte]
      ? `${this.info.pollRates[rateByte]} Hz`
      : "--";
  }

  async setDpiStages() {
    const enabled = this.stages.enabledStages();
    if (!enabled.length) {
      log("⚠️ 至少启用 1 个档位");
      return;
    }
    const count = enabled.length;
    const active = Math.min(parseInt($("activeStage").value) || 1, count);

    await this._setBuffer(2, [
      count,
      (85 - count) & 0xff,
      active - 1,
      (85 - (active - 1)) & 0xff,
    ]);
    const blocks = [];
    for (const i of enabled)
      blocks.push(...dpiBlockBytes(dpiToKey(this.stages.getStageDpi(i))));
    await this._setBuffer(12, blocks);

    const colorBlocks = [];
    for (const i of enabled) {
      const hex = this.stages.getStageColor(i) || "#ffffff";
      const rgb = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
      colorBlocks.push(...rgb, colorChecksum(...rgb));
    }
    await this._setBuffer(44, colorBlocks);
    log(`档位写入: ${count}档, 当前第${active}档`);
    await this.getDpiStages();
  }

  async getPollRate() {
    const b = await this._getBuffer(0, 1);
    const rate = this.info.pollRates[b[0]];
    $("pollVal").textContent = rate ? `${rate} Hz` : "--";
    log(`回报率 = ${rate || "未知"}Hz`);
  }

  async setPollRate(hz) {
    const byte = this.info.pollRateToByte[hz];
    if (byte === undefined) {
      log(`⚠️ ${hz}Hz 超出范围`);
      return;
    }
    await this._setBuffer(0, [byte, (85 - byte) & 0xff]);
    log(`回报率设置: ${hz}Hz`);
    await this.getPollRate();
  }
}
