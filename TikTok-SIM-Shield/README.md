# TikTok SIM Shield

### 面向 TikTok 的 LSPosed（LSP）隐私防护模块

用于限制 TikTok 通过相关电话服务接口读取手机号码、SIM 卡及运营商信息。适合希望减少应用获取 SIM 相关隐私信息的用户。

> 本项目发布原始模块 APK。模块的设计目标是通过 Hook 限制相关接口读取，并不等同于撤销 Android 系统权限，也不承诺阻断所有信息获取途径。尚未完成真机兼容性与效果验证。

## 下载

**[下载 TikTok-SIM-Shield-Universal-v8.apk](./TikTok-SIM-Shield-Universal-v8.apk?raw=1)**

[文件校验信息](./SHA256SUMS.txt) · [发布说明](./RELEASE_NOTES.md)

| 项目 | 信息 |
| --- | --- |
| 发布文件标识 | universal-v8 |
| 模块类型 | LSPosed / Xposed APK |
| 模块包名 | `local.privacy.tiktoksimshield` |
| 使用对象 | TikTok |
| 文件大小 | 33,627 字节（约 32.84 KiB） |
| APK 内原生库架构 | arm64-v8a、armeabi-v7a、x86_64、x86 |
| 发布内容 | 原始 APK、使用说明及 SHA-256 校验值 |

## 使用方法

1. 确保设备上的 LSPosed 环境可以正常工作，然后安装本 APK。
2. 在 LSPosed 管理器中启用 **TikTok SIM Shield**，在作用域中选择已安装的 TikTok。
3. 强制停止并重新启动 TikTok；框架提示需要重启设备时，按提示操作。
4. 检查 LSPosed 日志，并在自己的设备上确认模块是否加载、相关功能是否生效。

这是模块安装包，不是 TikTok 客户端，也不是 Magisk ZIP。仅安装 APK、不在框架中启用模块，并不代表保护已经生效。

## 使用边界

模块仅针对其覆盖的接口，不能据此认定账号已绑定的信息、主动填写的号码或其他来源的信息也会被屏蔽。不同 Android、框架和 TikTok 版本可能存在兼容性差异；遇到异常可先停用模块，再重启 TikTok 排查。

本目录仅提供二进制发布文件，未包含源码或开源许可证，不将其表述为已开源项目。当前发布保留原始 APK 的完整字节内容，未重新打包或重新签名。

## 文件校验

SHA-256：

```text
48a086c56650dc6fd635db1d2326acfe84b58b1d64aa16492a461c83182352f2
```

将 APK 与 `SHA256SUMS.txt` 下载到同一目录后，可执行：

```sh
sha256sum -c SHA256SUMS.txt
```

## English

**TikTok SIM Shield** is an LSPosed/Xposed module intended to restrict TikTok's access to phone-number, SIM and carrier information through the interfaces covered by its hooks.

Install the APK, enable the module in LSPosed, select the installed TikTok app as its scope, and restart TikTok. Check framework logs and verify behavior on your device.

This is a binary-only distribution of the original APK. It does not directly revoke Android permissions, cannot guarantee that every information source is blocked, and has not been independently tested on-device for compatibility or effectiveness. Source code and an open-source license are not included.
