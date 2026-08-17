# Mouse WebHID CC

通过 `WebHID` 直接在浏览器内实现鼠标简易驱动

## 支持设备

| 设备               | 状态读取 | DPI及档位调节 | 回报率修改 |
| ------------------ | -------- | ------------- | ---------- |
| DAREU A950 Pro     | ✅       | ✅            | ✅         |
| Razer Viper V2 Pro | ✅       | ✅            | ✅         |

## 项目结构

```
mouseCC/
├── index.html                 # 入口页面
├── css/style.css              # 全局样式
├── js/
│   ├── common/
│   │   ├── device-base.js     # 设备基类
│   │   ├── hid.js             # WebHID 连接管理
│   │   ├── protocol.js        # 协议实现 (Razer / Jm)
│   │   ├── dpi.js             # DPI 编解码
│   │   ├── platform.js        # 平台检测
│   │   └── ui.js              # UI
│   └── devices/
│       ├── dareu_a950pro.js   # 达尔优 A950 Pro 驱动
│       └── razer_v2pro.js     # 雷蛇 Viper V2 Pro 驱动
└── README.md
```
