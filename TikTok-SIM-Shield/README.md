# TikTok SIM Shield — LSPosed 模块

面向 TikTok 的 Android SIM / 手机号码相关信息隐私防护模块（**APK 发布版**）。

> 本模块旨在通过 LSPosed/Xposed Hook 限制 TikTok 从部分 Android 电话服务接口读取 SIM、运营商及订阅等相关信息。Android 并不存在一个统一的“手机号码读取权限”开关；本模块并非系统权限撤销，也无法保证屏蔽 TikTok 的全部识别途径。

## 下载

**[TikTok-SIM-Shield-Universal-v8.apk](./TikTok-SIM-Shield-Universal-v8.apk)**

- 发布标识：universal-v8
- APK 版本名：1.1-universal
- 模块包名：`local.privacy.tiktoksimshield`
- 目标应用：TikTok (`com.zhiliaoapp.musically`)
- ABI：`arm64-v8a`、`armeabi-v7a`、`x86_64`、`x86`
- 类型：LSPosed / Xposed APK（**不是** Magisk ZIP）

## 作用范围（静态检查）

该 APK 包含对 `TelephonyManager`、`SubscriptionManager`、部分电话系统属性及相关本地接口的 Hook 代码。上述结论来自 APK 静态结构检查，**没有做设备端实测，也不保证对所有 TikTok 及 Android 版本生效**。

## 安装方法

1. 准备好可正常使用的 LSPosed/Xposed 环境。
2. 安装本 APK。
3. 在 LSPosed 管理器中启用 TikTok SIM Shield。
4. 将作用域设为 TikTok（`com.zhiliaoapp.musically`）。
5. 强制停止并重新打开 TikTok；必要时按照框架提示重启设备。
6. 查看 LSPosed 日志并进行实际测试，确认 Hook 是否加载和生效。

## 注意事项

- 此模块不能保证阻止账户资料、缓存、网络、其他系统 API 或服务器侧推断。
- 不代表适配 TikTok Lite、抖音等其他包名。
- 仅提供原始二进制 APK，**未附源码和开源许可证**；公开发布不代表自动授予修改/再分发许可。
- 安装前自行备份数据；使用效果、兼容性和安全性尚未得到独立验证。

## SHA-256

```text
48a086c56650dc6fd635db1d2326acfe84b58b1d64aa16492a461c83182352f2  TikTok-SIM-Shield-Universal-v8.apk
```

---

## English

**TikTok SIM Shield** is a binary APK for LSPosed/Xposed intended to reduce TikTok's access to SIM, subscriber, carrier and phone-number-related information via selected Android telephony API hooks.

**Target package:** `com.zhiliaoapp.musically`. Install the APK, enable the module in LSPosed, select TikTok as its scope, and restart TikTok. Verify its operation in logs and on-device tests.

It does **not** revoke a universal phone-number permission and cannot guarantee protection against every possible detection method. Compatibility and effectiveness have not been independently tested. The source code and an open-source license are not included.
