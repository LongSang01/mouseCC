import { log, $, setConnected, bindAction, buildStageRows } from "./ui.js";

export class DeviceBase {
  constructor(info) {
    this.info = info;
    this.stages = null;
  }

  async connect(devices) {
    throw new Error("子类必须实现 connect");
  }
  async getBattery() {
    throw new Error("子类必须实现 getBattery");
  }
  async getDpiStages() {
    throw new Error("子类必须实现 getDpiStages");
  }
  async setDpiStages() {
    throw new Error("子类必须实现 setDpiStages");
  }
  async getPollRate() {
    throw new Error("子类必须实现 getPollRate");
  }
  async setPollRate(hz) {
    throw new Error("子类必须实现 setPollRate");
  }

  async disconnect(hid) {
    await hid.close();
    setConnected(false, null);
    log("设备已断开");
  }

  async refreshStatus() {
    try {
      await this.getBattery();
      await this.getDpiStages();
    } catch (e) {
      log(`刷新失败: ${e.message}`);
    }
  }

  initUI(hid) {
    this.stages = buildStageRows(
      $("stages"),
      this.info.maxStages,
      this.info.defaultColors,
      this.info.defaultFill,
      this.info.maxDpi,
    );
    bindAction("btnConnect", () => this.connect(), "连接失败");
    bindAction("btnDisconnect", () => this.disconnect(hid), "断开失败");
    bindAction("btnReadAll", () => this.refreshStatus(), "刷新失败");
    bindAction("btnSetStages", () => this.setDpiStages(), "写入档位失败");
    bindAction("btnGetStages", () => this.getDpiStages(), "读取档位失败");
    bindAction("btnGetPoll", () => this.getPollRate(), "读取回报率失败");
    bindAction(
      "btnSetPoll",
      () => this.setPollRate(parseInt($("pollRate").value)),
      "设置回报率失败",
    );
    $("btnClearLog")?.addEventListener("click", () => {
      $("log").textContent = "";
    });
    log(`就绪。${this.info.readyHint || "点击「连接设备」开始。"}`);
  }
}
