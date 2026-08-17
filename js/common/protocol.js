import { log, toHex } from "./ui.js";

export class Protocol {
  constructor(hid) {
    this.hid = hid;
  }
}

export class RazerProtocol extends Protocol {
  constructor(hid) {
    super(hid);
    this.transactionId = 0x1f;
  }

  buildFrame(commandClass, commandId, data = []) {
    const report = new Uint8Array(90);
    report[1] = this.transactionId;
    report[5] = data.length;
    report[6] = commandClass;
    report[7] = commandId;
    report.set(data, 8);
    let crc = 0;
    for (let i = 2; i < 88; i++) crc ^= report[i];
    report[88] = crc;
    return report;
  }

  normalizeResponse(dv) {
    const bytes = Array.from(
      new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength),
    );
    if (bytes.length === 91 && bytes[0] === 0x00) bytes.shift();
    return bytes;
  }

  async sendAndReceive(commandClass, commandId, data = [], waitMs = 90) {
    if (!this.hid.device) throw new Error("设备未连接");
    const report = this.buildFrame(commandClass, commandId, data);

    log(
      `TX class=0x${commandClass.toString(16)} id=0x${commandId.toString(16)} data=[${toHex(data)}]`,
    );
    log(`  raw: ${toHex(report)}`);
    await this.hid.device.sendFeatureReport(0, report);
    await new Promise((r) => setTimeout(r, waitMs));

    let bytes = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const dv = await this.hid.device.receiveFeatureReport(0);
        bytes = this.normalizeResponse(dv);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    log(`  收到(${bytes.length}B): ${toHex(bytes)}`);

    if (bytes.length < 8) throw new Error("响应过短");
    if (bytes[6] !== commandClass || bytes[7] !== commandId)
      throw new Error("class/id 不匹配");
    if (bytes[0] === 0x03) throw new Error("Command Failure");
    if (bytes[0] === 0x05) throw new Error("Not Supported");
    return { bytes, good: true };
  }
}

export class JmProtocol extends Protocol {
  constructor(hid) {
    super(hid);
    this.REPORT_ID = 8;
    this.FRAME_SIZE = 17;
    this.DATA_LEN = 10;
  }

  checksum(frame) {
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += frame[i];
    return (85 - (sum & 0xff)) & 0xff;
  }

  buildFrame(cmd, addr = 0, len = 0, data = []) {
    const a = new Uint8Array(this.FRAME_SIZE);
    a[0] = this.REPORT_ID;
    a[1] = cmd;
    a[3] = (addr >> 8) & 0xff;
    a[4] = addr & 0xff;
    a[5] = len & 0xff;
    a.set(data, 6);
    a[16] = this.checksum(a);
    return a;
  }

  async sendAndReceive(cmd, addr = 0, len = 0, data = [], waitMs = 300) {
    if (!this.hid.device) throw new Error("设备未连接");
    const frame = this.buildFrame(cmd, addr, len, data);

    log(
      `TX cmd=0x${cmd.toString(16)} addr=0x${addr.toString(16).padStart(4, "0")} len=${len}`,
    );
    log(`  raw: ${toHex(frame)}`);

    try {
      await this.hid.device.sendReport(this.REPORT_ID, frame.slice(1));
    } catch (e1) {
      try {
        await this.hid.device.sendFeatureReport(0, frame);
      } catch (e2) {
        throw new Error(`发送失败: ${e1.message} / ${e2.message}`);
      }
    }

    const raw = await this.hid.waitForResponse(waitMs);

    const bytes = new Uint8Array(this.FRAME_SIZE);
    bytes[0] = this.REPORT_ID;
    bytes.set(raw.slice(0, 16), 1);

    log(`  收到(${raw.length}B): ${toHex(raw)}`);

    if (bytes[1] !== cmd) {
      throw new Error(
        `回显不符: expect 0x${cmd.toString(16)}, got 0x${bytes[1].toString(16)}`,
      );
    }
    return bytes;
  }

  async sendCommand(cmd, addr = 0, len = 0, data = []) {
    return this.sendAndReceive(cmd, addr, len, data);
  }
}
