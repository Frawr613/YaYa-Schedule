# 鸦鸦日程 iOS 2.0 Xcode 工程

这是鸦鸦日程 iOS 2.0 的 Xcode 工程包，不内置个人课表数据。工程以当前十层 Web 架构为核心界面，外层使用 iOS 原生 Swift + WKWebView 承载，并接入 iOS 通知、小组件、教务导入和前端平台桥。

## 已包含

- 主 App：`YayaScheduleClean`
- iOS 小组件扩展：`YayaScheduleWidget`
- 当前 Web 资源：十层结构、模板/主题桥接、内置输入组件、DDL 分页、特殊变更等
- iOS 平台桥：`YayaNative`
  - `savePortalAccount`
  - `openAcademicPortal`
  - `takeImportedPage`
  - `getReminderPermissionStatus`
  - `requestReminderPermissions`
  - `requestNotificationPermission`
  - `scheduleReminderNotifications`
  - `scheduleDdlNotifications`（兼容旧入口）
  - `updateHomeWidget`
- 教务导入页浮层按钮：导入课表、导入考试、返回鸦鸦；浮层从 Web 主题桥读取当前主题、模板和内置输入控件令牌，保持与主界面一致
- 教务导入页强制在当前 WebView 内跳转，避免门户/教务系统开出第二层网页；自动登录会跟随门户跳转和 iframe 登录框重试
- 课表导入：分页采集后用主题同步的视窗内确认控件手动选择开学日期、学年和学期，再写入本地课表库
- 通知：DDL/日程提醒统一调度，新增/修改后会重新挂载完整提醒队列，最多保留最近 64 条待触发提醒，并请求/使用系统默认提示音
- 特殊变更：移动/取消拆成浮窗标题下方分页 chip，切换复用概览页平滑翻页，卡片操作通过滑动露出
- 小组件：最近 DDL + 最近课程/日程，读取 App Group 本地缓存，配色跟随当前主题/自定义主题变化，进行中日程显示进度

## 在 Mac 上打开

1. 解压工程包。
2. 用 Xcode 打开 `YayaScheduleClean.xcodeproj`。
3. 在 Signing & Capabilities 里选择你的 Apple Team。
4. 主 App 和 `YayaScheduleWidget` 都启用 App Groups，组名使用：
   `group.com.xuyunfan.yayaschedule`
5. 连接 iPhone 后可直接运行到设备。
6. 需要 `.ipa` 时，使用 `Product > Archive`，再 `Distribute App` 导出。

## Bundle

- 主 App Bundle ID：`com.xuyunfan.yayaschedule.clean`
- 小组件 Bundle ID：`com.xuyunfan.yayaschedule.clean.widget`
- 版本：`2.0`
