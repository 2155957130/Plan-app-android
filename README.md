# Plan

简约的安卓离线计划应用，当前版本 **1.5.0**，支持 **Android 8.0 及以上**。使用带狗爪的小旗子图标，底部导航依次为待办、打卡、日历、我的。

## 功能

- **待办**：可选截止日期、时间、标签、备注及提醒；完成后移入「已完成」，撤销后移回待办。
- **打卡**：支持每天、工作日、自选星期、间隔天数、每月指定日和每年指定月日；显示连续记录和狗爪脚印进度。
- **日历**：点选日期查看当天时间线，自动合并待办与习惯，按时间先后排列。
- **我的**：待办完成率、习惯坚持记录，以及今日待办、习惯打卡两款桌面小组件。
- **设置**：右上角管理通知、准时提醒和本地 JSON 备份。导入会覆盖当前记录。

无需账号，应用未申请网络权限，记录保存在本机。卸载或清除应用数据会删除记录，请先导出备份。提醒受系统权限及省电策略影响。

循环按公历计算：不存在的月日跳过，不自动替换到月末；2 月 29 日仅在闰年安排。休息日不打断连续记录，月度、年度习惯按计划次数统计；修改频率从当天生效，保留历史规则。

## 源码结构

```text
android/
  assets/                 HTML、CSS、JavaScript 和图标
  src/com/plan/paw/       Android 容器、存储、提醒与桌面小组件
  res/                    安卓资源
  AndroidManifest.xml
scripts/                  编译、测试、应用预览和源码打包脚本
tests/                    JavaScript 与 JVM 测试
package.json
README.md
.gitignore
.gitattributes
```

这是 App 源码仓库，不包含官网或自动发布配置。`android/assets/` 是应用内的界面资源，编译 APK 时必需，不能作为官网文件删除。

## 开发与验证

浏览器预览及 JavaScript 测试需要 Node.js 22 或更新版本，无需安装 npm 依赖。

```powershell
npm start
npm test
```

预览地址为 http://localhost:5173 。浏览器数据与安卓应用相互独立，浏览器不发送后台提醒，也不能添加手机桌面小组件。

JVM 测试需要 JDK 17 或更新版本：

```powershell
npm run test:native
```

JDK 按参数、`JAVA_HOME`、本地 `local.properties` 中的 `jdk.dir`、PATH 中的 `javac.exe` 依次查找。也可显式指定：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-native.ps1 -JdkPath "$env:JAVA_HOME"
```

现有检查覆盖日期与标签、完成归档、备份数据校验、日/周/间隔/月/年循环、频率历史、闰日、连续记录、时间线及小组件内容。尚未完成安卓真机上对所有厂商通知策略、桌面组件及文件选择器的验证。

## 编译安卓安装包

在 Windows 上安装 JDK 17+、Android SDK Platform 35 和 Build Tools 35.0.1。设置 `JAVA_HOME` 后执行：

```powershell
npm run build:android
```

SDK 默认使用当前用户的 Android SDK 目录。可按需指定 SDK 和 JDK：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -SdkPath "$env:LOCALAPPDATA\Android\Sdk" -JdkPath "$env:JAVA_HOME"
```

构建使用 SDK 工具直接编译，无需 Gradle 下载或云账号。输出为根目录的 `Plan.apk`，会执行对齐、签名及签名验证；编译中间文件保存在 `build/`。

首次构建生成本地开发签名 `build/plan-local.keystore`，之后重复使用。请自行备份密钥，以支持覆盖升级；不要上传密钥。使用不同密钥编译的 APK 无法覆盖原签名安装包。APK 和密钥均已被 Git 忽略。

## 整理并手动上传源码

```powershell
npm run package:source
```

生成根目录的 `Plan-source.zip`，仅打包上述源码、脚本、测试和项目说明，不包含官网、APK、签名密钥、构建缓存、个人记录、环境文件或 Git 历史。

手动上传时，解压 `Plan-source.zip`，把其中 `Plan` 目录里的文件上传到你自己创建的 GitHub 仓库。不要只上传整个 ZIP 作为仓库的唯一文件。创建仓库时无需添加 Pages 或部署配置。

工作目录中如有 `local-only/`，它只保存本地的官网和旧历史备份，不属于上传内容。请保留本地 `build/plan-local.keystore` 与 `build/acl-recovery/`；其他编译输出可以重新生成。
