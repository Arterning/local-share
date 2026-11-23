# LocalShare

Go + React 局域网文件共享工具。前端使用 React Router，服务端和 Wails 桌面端共用同一套 HTTP 服务。

## 构建与运行

需要 Go 1.26+、Node.js 和 pnpm。在项目根目录执行：

```powershell
pnpm --dir web install
.\build.bat
.\dist\localshare.exe
```

Linux：

```bash
pnpm --dir web install
bash build.sh
./dist/localshare
```

两个构建脚本均可从任意工作目录调用，会自动定位到项目根目录：先构建前端，再将 `web/dist` 复制到 `api/internal/server/dist`，最后分别编译 server 和 desktop。Windows 输出 `dist/localshare.exe`（服务端）与 `dist/localshare-desktop.exe`（桌面窗口）；Linux 输出 `dist/localshare` 与 `dist/localshare-desktop`。首次构建前端前需安装依赖；Go 模块文件位于 `api` 目录。

最终程序位于项目根目录的 `dist` 文件夹，默认上传文件和消息数据库也保存在该文件夹。构建脚本只更新程序文件，不清理已有共享文件和数据库。`api/internal/server/dist` 存放供 embed 使用的前端构建资源。

服务默认申请一个空闲端口，并在控制台打印访问地址。设置环境变量 `LOCALSHARE_PORT` 可指定端口；手机连接同一局域网后，打开控制台打印的手机访问地址。Windows 如提示防火墙权限，允许专用网络访问。桌面版在本机启动 Wails 窗口，窗口前端通过 HTTP 访问本地服务。

默认共享目录是 **exe 所在目录**，不受启动时工作目录影响。上传始终保存到共享根目录，重名自动添加序号，不覆盖现有文件。共享范围供同一局域网内可连接此服务的设备访问。

```powershell
.\dist\localshare.exe -addr :8080 -dir D:\Share
```

## 开发

首次先构建前端，让 embed 有可嵌入的文件。在项目根目录用 `dev.bat` 启动 server 开发入口（监听 8080，共享目录为 `dist`）：

```powershell
.\build.bat
.\dev.bat
```

另开终端执行 `pnpm --dir web dev`。Vite 将 `/api` 转发至 `localhost:8080`。修改前端后，需要重新构建前端并重新编译 exe 才会更新嵌入资源。

桌面版开发启动命令为 `go -C api run -tags desktop,dev ./cmd/desktop -dir ../dist`。`LOCALSHARE_PORT` 可为 server 或 desktop 指定端口；未设置时自动申请空闲端口。

## 页面和接口

- `web/src/pages/files-page.tsx`：文件列表、目录导航、筛选搜索、排序、上传。
- `web/src/pages/transfer-page.tsx`：文件传输助手式会话，支持文本、文件消息、复制、预览与下载。
- `web/src/components/file-preview.tsx`：文本、图片、音视频预览。
- `web/src/components/app-layout.tsx`：响应式导航和主题切换。
- `api/internal/server/`：共享 HTTP 服务、目录与文件接口、消息存储和静态资源嵌入。
- `api/cmd/server/main.go`：命令行服务入口。
- `api/cmd/desktop/main.go`：Wails 桌面入口，通过本地 HTTP 服务提供前后端交互。
- `build/appicon.svg`：桌面应用图标源文件；Windows 图标资源由 `api/tools/iconresource` 生成并链接进桌面 exe。
- `api/internal/server/messages.go`：SQLite 消息存储和历史分页接口。

## 互传

电脑和手机进入「互传」，即可在同一个会话中发送文本和文件。本机消息显示在右侧，其他设备消息显示在左侧。每两秒增量同步新消息，断网恢复后自动补齐；初次加载最近 100 条，支持加载更早记录。

消息保存在共享目录下的 `.localshare.db`（默认 exe 同目录）。重启程序不会丢失消息。SQLite 使用 WAL 模式，运行时可能出现同名的 `-wal`、`-shm` 文件；备份或搬迁时请先正常关闭程序，并保留数据库及旁边的这些文件。数据库不在「文件」列表显示，也不能通过文件接口下载。使用 `-dir` 时，数据库随共享目录存放。

文件内容保存到共享根目录，数据库只保存消息和文件信息。文件在电脑上被移动或删除后，历史消息仍保留，但不能继续预览或下载。文本上限 64 KiB；Enter 换行，Ctrl / Command + Enter 发送。支持多文件选择、拖拽与粘贴截图上传。失败可重试，同一请求自动去重。输入草稿在当前浏览器标签页保留；未完成上传的文件和失败待重试任务仅保留在当前页面，离开或刷新前请等待发送完成。

设备标识保存在浏览器 localStorage，用于区分消息归属，不是账号或身份验证；同一服务内所有接入设备共享会话。

消息接口：`GET /api/messages`，通过 `after` 获取增量、`before` 加载历史（每次最多 100 条）；`POST /api/messages` 发送文本；`DELETE /api/messages` 清空消息记录；`POST /api/upload?chat=1&senderId=...&senderName=...&requestId=...` 上传并创建文件消息。普通「文件」页上传不生成聊天消息。

接口：`GET /api/access` 返回局域网访问地址；`GET /api/files?path=`、`GET /api/content?path=`、`POST /api/upload`（单文件 multipart，字段 `file`）。文本预览加 `text=1`，下载加 `download=1`。单次上传请求上限 10 GiB，文本预览截取前 1 MiB；视频和音频依赖浏览器支持的编码，不做转码。隐藏文件和符号链接不在列表展示，路径访问限制在共享目录内。

Linux 开发时先执行 `bash build.sh`，然后运行 `go -C api run ./cmd/server -dir ../dist`。

验证：先运行对应平台构建脚本，再执行 `pnpm --dir web lint`、`go -C api test ./...`。
