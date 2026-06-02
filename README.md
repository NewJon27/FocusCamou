# FocusCamou

一个用于控制页面切屏检测伪装行为的浏览器扩展。

## 安装 [Release](https://github.com/NewJon27/FocusCamou/releases)

### Chrome

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载未打包的扩展程序”。
5. 选择 `chrome/` 对应的扩展文件夹。

### Microsoft Edge

1. 打开 Microsoft Edge。
2. 进入 `edge://extensions/`。
3. 打开左下角“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择 `chrome/` 对应的扩展文件夹。

### Firefox

1. 打开 Firefox。
2. 进入 `about:debugging#/runtime/this-firefox`。
3. 点击 `Load Temporary Add-on...`。
4. 选择 `firefox/` 版本里的 `manifest.json`。

**如果网页已经打开，刷新一下即可。**

## 功能

- `Visibility 检测`
  - `屏蔽`：直接阻止页面监听可见性变化
  - `伪装`：允许监听存在，但页面读到的状态会被伪装成可见

- `Focus / Blur 事件`
  - `屏蔽`：直接阻止相关焦点事件监听
  - `伪装`：尽量让页面看起来像仍然保持浏览状态

- `鼠标活动模拟`
  - 只在页面真实失焦时才会模拟移动

- `网络上报拦截`
  - 开启后会拦截 `/rrweb/` 和 `hiddenVisible` 相关请求

- `WindowSwitch 库`
  - 对页面里的 `windowSwitch.js` / `WindowSwitch` 检测逻辑做处理
