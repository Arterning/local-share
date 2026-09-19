# LocalShare

Go + React 局域网文件共享工具。前端使用 React Router 按页面维护，构建产物通过 Go embed 打进一个 exe。

## 构建与运行

需要 Go 1.25+、Node.js 和 pnpm。在项目根目录执行：

```powershell
pnpm --dir web install
pnpm --dir web build
go build -o localshare.exe .
.\localshare.exe
```

电脑打开 `http://localhost:8080`。手机连接同一局域网后，打开控制台打印的手机访问地址；Windows 如提示防火墙权限，允许专用网络访问。

默认共享目录是 **exe 所在目录**，不受启动时工作目录影响。上传始终保存到共享根目录，重名自动添加序号，不覆盖现有文件。共享范围供同一局域网内可连接此服务的设备访问。

```powershell
.\localshare.exe -addr :8080 -dir D:\Share
```

## 开发

首次先构建前端，让 embed 有可嵌入的文件；在项目根目录运行后端：

```powershell
pnpm --dir web build
go run . -dir .
```

另开终端执行 `pnpm --dir web dev`。Vite 将 `/api` 转发至 `localhost:8080`。修改前端后，需要重新构建前端并重新编译 exe 才会更新嵌入资源。

## 页面和接口

- `web/src/pages/files-page.tsx`：文件列表、目录导航、筛选搜索、排序、上传。
- `web/src/pages/transfer-page.tsx`：互传入口占位，文本互传尚未实现。
- `web/src/components/file-preview.tsx`：文本、图片、音视频预览。
- `web/src/components/app-layout.tsx`：响应式导航和主题切换。
- `api/server.go`：目录列表、下载、媒体分段读取、上传和静态页面服务。

接口：`GET /api/files?path=`、`GET /api/content?path=`、`POST /api/upload`（单文件 multipart，字段 `file`）。文本预览加 `text=1`，下载加 `download=1`。单次上传请求上限 10 GiB，文本预览截取前 1 MiB；视频和音频依赖浏览器支持的编码，不做转码。隐藏文件和符号链接不在列表展示，路径访问限制在共享目录内。

验证：`pnpm --dir web build`、`pnpm --dir web lint`、`go test ./...`。
