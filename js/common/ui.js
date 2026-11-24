export function $(id) {
  return document.getElementById(id);
}

export function log(msg) {
  const logBox = $("log");
  if (!logBox) return;
  const t = new Date().toLocaleTimeString();
  logBox.textContent += `[${t}] ${msg}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

export function logRaw(msg) {
  const logBox = $("log");
  if (!logBox) return;
  logBox.textContent += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

export function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

const STATUS_FIELDS = ["battVal", "chargeVal", "dpiVal", "pollVal"];

/** '#rrggbb' / 'rgb(r, g, b)' -> '#rrggbb',解析失败返回 null */
export function toHexColor(css) {
  if (!css) return null;
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(css);
  if (rgb)
    return `#${rgb
      .slice(1, 4)
      .map((v) => (+v).toString(16).padStart(2, "0"))
      .join("")}`;
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  return hex ? `#${hex[1].toLowerCase()}` : null;
}

/** 清空状态面板,避免断开后还显示上一台设备的数据 */
export function resetStatusUI() {
  for (const id of STATUS_FIELDS) {
    const el = $(id);
    if (el) el.textContent = "--";
  }
}

export function setConnected(connected, device) {
  const dot = $("statusDot");
  const text = $("statusText");
  if (dot) dot.classList.toggle("on", connected);
  if (text) {
    text.textContent = connected
      ? `已连接: ${device.productName || "HID Device"} (PID 0x${device.productId.toString(16).padStart(4, "0")})`
      : "未连接";
  }
  if (!connected) resetStatusUI();
  const btnConnect = $("btnConnect");
  const btnDisconnect = $("btnDisconnect");
  if (btnConnect) btnConnect.disabled = connected;
  if (btnDisconnect) btnDisconnect.disabled = !connected;
  [
    "btnReadAll",
    "btnSetPoll",
    "btnGetPoll",
    "btnSetStages",
    "btnGetStages",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !connected;
  });
}

/**
 * 绑定点击事件:同一元素重复绑定会替换旧处理器,
 * 这样即使驱动实例被重建也不会出现一次点击触发多次请求。
 */
export function bindClick(id, handler) {
  const el = $(id);
  if (!el) return;
  if (el._clickHandler) el.removeEventListener("click", el._clickHandler);
  el._clickHandler = handler;
  el.addEventListener("click", handler);
}

export function bindAction(id, action, failMsg) {
  bindClick(id, async () => {
    try {
      await action();
    } catch (e) {
      log(`${failMsg}: ${e.message}`);
    }
  });
}

export function buildStageRows(
  stagesEl,
  count,
  stageColors,
  stageFill,
  maxDpi = 30000,
) {
  // 重复连接时会重新构建,必须先清空旧档位行,
  // 否则新旧两套 .stage-color[data-stage] 会同时存在,选色/高亮会串到旧行上
  stagesEl.replaceChildren();

  const enBoxes = [];
  const dpiBoxes = [];
  const nameSpans = [];
  const colorDots = [];

  function buildRow(i) {
    const row = document.createElement("div");
    row.className = "stage-row";
    row.innerHTML = `
      <label class="stage-label"><input type="checkbox" class="stage-en">${i + 1}</label>
      <span class="dpi-wrap">
        <input type="number" class="stage-dpi" min="50" max="${maxDpi}" step="50" value="${stageFill[i] || 1600}">
        <button type="button" class="spin up" title="+50">▲</button>
        <button type="button" class="spin down" title="-50">▼</button>
      </span>
      <span class="stage-color" data-stage="${i}" style="background:${stageColors[i] || "#888"};"></span>
      <span class="stage-name"></span>`;
    const en = row.querySelector(".stage-en");
    const dpi = row.querySelector(".stage-dpi");
    enBoxes.push(en);
    dpiBoxes.push(dpi);
    nameSpans.push(row.querySelector(".stage-name"));
    colorDots.push(row.querySelector(".stage-color"));
    dpi.addEventListener("change", () => clampDpi(i));
    dpi.addEventListener("blur", () => clampDpi(i));
    en.addEventListener("change", updateSummary);
    row.querySelector(".spin.up").addEventListener("click", () => {
      dpi.value = clampDpi(i) + 50;
      clampDpi(i);
    });
    row.querySelector(".spin.down").addEventListener("click", () => {
      dpi.value = clampDpi(i) - 50;
      clampDpi(i);
    });
    stagesEl.appendChild(row);
  }

  function clampDpi(i) {
    const input = dpiBoxes[i];
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 50;
    v = Math.min(maxDpi, Math.max(50, v));
    if (String(input.value) !== String(v)) input.value = v;
    return v;
  }

  function enabledStages() {
    const out = [];
    for (let i = 0; i < count; i++) if (enBoxes[i].checked) out.push(i);
    return out;
  }

  function updateSummary() {
    const enabled = enabledStages();
    for (let i = 0; i < count; i++) {
      const on = enabled.includes(i);
      dpiBoxes[i].disabled = !on;
      nameSpans[i].textContent = on ? "" : "(跳过)";
    }
    const summary = $("stageSummary");
    if (summary) summary.textContent = `共 ${enabled.length} 挡参与`;
    const sel = $("activeStage");
    if (sel) {
      const cur = parseInt(sel.value, 10) || 1;
      sel.replaceChildren(
        ...Array.from({ length: enabled.length }, (_, s) =>
          Object.assign(document.createElement("option"), {
            value: String(s + 1),
            textContent: `${s + 1}`,
          }),
        ),
      );
      if (cur <= enabled.length) sel.value = String(cur);
    }
  }

  function setStageColor(i, color) {
    const dot = colorDots[i];
    if (dot && color) dot.style.background = color;
  }

  function getStageColor(i) {
    return toHexColor(colorDots[i]?.style.background);
  }

  /** 恢复默认值(断开连接时用),避免下次连接看到上一台设备的档位 */
  function reset() {
    for (let i = 0; i < count; i++) {
      enBoxes[i].checked = false;
      dpiBoxes[i].value = stageFill[i] || 1600;
      setStageColor(i, stageColors[i] || "#888");
    }
    updateSummary();
  }

  for (let i = 0; i < count; i++) buildRow(i);
  updateSummary();

  return {
    enBoxes,
    dpiBoxes,
    nameSpans,
    clampDpi,
    enabledStages,
    updateSummary,
    setStageColor,
    getStageColor,
    reset,
    getStageDpi(i) {
      return clampDpi(i);
    },
  };
}
