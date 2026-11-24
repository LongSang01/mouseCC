import { log, $, setConnected, bindAction, bindClick, buildStageRows } from "./ui.js";

export class DeviceBase {
  /** 子类须在构造函数里创建 this.hid (HIDConnection) */
  constructor(info) {
    this.info = info;
    this.stages = null;
    this.hid = null;
    this._refreshing = false;
    this._uiBound = false;
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

  async disconnect() {
    const wasConnected = !!this.hid?.device;
    await this.hid?.close();
    setConnected(false, null);
    this.stages?.reset();
    if (wasConnected) log("设备已断开");
  }

  /** 刷新时要执行的读取步骤,子类可覆写 */
  refreshTasks() {
    return [() => this.getBattery(), () => this.getDpiStages()];
  }

  /** 刷新状态:重入保护,避免并发刷新抢同一个响应槽位 */
  async refreshStatus() {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      for (const task of this.refreshTasks()) await task();
    } catch (e) {
      // 断开导致的失败不必再提示
      if (this.hid?.device) log(`刷新失败: ${e.message}`);
    } finally {
      this._refreshing = false;
    }
  }

  initUI() {
    if (this._uiBound) return;
    this._uiBound = true;

    this.stages = buildStageRows(
      $("stages"),
      this.info.maxStages,
      this.info.defaultColors,
      this.info.defaultFill,
      this.info.maxDpi,
    );
    // 连接/断开由页面统一管理,避免同一按钮被重复绑定
    bindAction("btnReadAll", () => this.refreshStatus(), "刷新失败");
    bindAction("btnSetStages", () => this.setDpiStages(), "写入档位失败");
    bindAction("btnGetStages", () => this.getDpiStages(), "读取档位失败");
    bindAction("btnGetPoll", () => this.getPollRate(), "读取回报率失败");
    bindAction(
      "btnSetPoll",
      () => this.setPollRate(parseInt($("pollRate").value)),
      "设置回报率失败",
    );
    bindClick("btnClearLog", () => {
      $("log").textContent = "";
    });
    log(`就绪。${this.info.readyHint || "点击「连接设备」开始。"}`);
  }
}
