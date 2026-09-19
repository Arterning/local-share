import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import {
  ArrowUp,
  ChevronRight,
  Download,
  FolderOpen,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react"
import { FileIcon } from "@/components/file-icon"
import { FilePreview } from "@/components/file-preview"
import {
  contentUrl,
  fileKind,
  formatSize,
  listFiles,
  uploadFile,
  type FileEntry,
} from "@/lib/files"

const filters = [
  ["all", "全部文件"],
  ["text", "文本"],
  ["pdf", "PDF"],
  ["image", "图片"],
  ["video", "视频"],
  ["audio", "音频"],
] as const
type UploadItem = {
  file: File
  progress: number
  status: "waiting" | "uploading" | "done" | "failed"
  error?: string
  savedName?: string
}
export function FilesPage() {
  const [params, setParams] = useSearchParams()
  const path = params.get("path") ?? ""
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [sort, setSort] = useState("name")
  const [preview, setPreview] = useState<FileEntry | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    listFiles(path, controller.signal)
      .then((data) => {
        setFiles(data)
        setError("")
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setError(err.message || "无法连接服务")
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [path, refresh])
  function reload() {
    setLoading(true)
    setError("")
    setRefresh((value) => value + 1)
  }
  function navigate(next: string) {
    if (next !== path) {
      setLoading(true)
      setError("")
      setQuery("")
      setFilter("all")
      setParams(next ? { path: next } : {})
    }
  }
  async function upload(selected: File[]) {
    if (busy.current || !selected.length) return
    busy.current = true
    setUploads(
      selected.map((file) => ({ file, progress: 0, status: "waiting" }))
    )
    for (let index = 0; index < selected.length; index++) {
      const update = (patch: Partial<UploadItem>) =>
        setUploads((items) =>
          items.map((item, i) => (i === index ? { ...item, ...patch } : item))
        )
      update({ status: "uploading" })
      try {
        const savedName = await uploadFile(selected[index], (progress) =>
          update({ progress })
        )
        update({ status: "done", savedName, progress: 100 })
      } catch (err) {
        update({
          status: "failed",
          error: err instanceof Error ? err.message : "上传失败",
        })
      }
    }
    busy.current = false
    reload()
  }
  const visible = files
    .filter(
      (file) =>
        file.name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" || fileKind(file) === filter)
    )
    .sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        (sort === "size"
          ? b.size - a.size
          : sort === "modified"
            ? Date.parse(b.modified) - Date.parse(a.modified)
            : a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
    )
  const parts = path.split("/").filter(Boolean)
  const uploading = uploads.some(
    (item) => item.status === "waiting" || item.status === "uploading"
  )
  return (
    <section
      className="files-page"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void upload(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR FILES, WITHIN REACH</div>
          <h1>文件</h1>
          <p>在电脑与手机之间，让文件触手可及。</p>
        </div>
        <button
          className="primary-button"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          上传文件
        </button>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
        />
      </div>
      <div className="directory-banner">
        <span className="directory-icon">
          <FolderOpen size={23} />
        </span>
        <div>
          <strong>共享目录</strong>
          <p>浏览电脑共享的文件 · 上传文件保存至共享根目录</p>
        </div>
        <span className="directory-tag">本地存储</span>
      </div>
      <div className="file-panel">
        <div className="file-toolbar">
          <div className="filter-tabs" role="group" aria-label="文件类型">
            {filters.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="搜索当前目录…"
              aria-label="搜索当前目录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
        </div>
        <div className="directory-toolbar">
          <nav className="breadcrumbs" aria-label="目录位置">
            <button onClick={() => navigate("")}>共享目录</button>
            {parts.map((part, index) => (
              <span key={index}>
                <ChevronRight size={14} />
                <button
                  onClick={() => navigate(parts.slice(0, index + 1).join("/"))}
                >
                  {part}
                </button>
              </span>
            ))}
          </nav>
          <div className="directory-actions">
            {path && (
              <button
                className="icon-button"
                title="上一级"
                aria-label="上一级"
                onClick={() => navigate(parts.slice(0, -1).join("/"))}
              >
                <ArrowUp size={17} />
              </button>
            )}
            <select
              aria-label="文件排序"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="name">名称排序</option>
              <option value="modified">最近修改</option>
              <option value="size">大小排序</option>
            </select>
            <button
              className="icon-button"
              aria-label="刷新目录"
              title="刷新目录"
              disabled={loading}
              onClick={reload}
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            <RefreshCw size={25} className="animate-spin" />
            <p>正在读取文件…</p>
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <FolderOpen size={34} />
            <h2>暂时无法读取文件</h2>
            <p>{error}</p>
            <button className="secondary-button" onClick={reload}>
              重新加载
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={38} />
            <h2>
              {query || filter !== "all"
                ? "没有找到匹配的文件"
                : "这个目录还是空的"}
            </h2>
            <p>
              {query || filter !== "all"
                ? "试试其他关键词或文件类型。"
                : "上传文件，或将文件放到 exe 所在目录。"}
            </p>
          </div>
        ) : (
          <div className="file-table">
            <div className="table-heading">
              <span>文件名</span>
              <span>大小</span>
              <span>修改时间</span>
              <span />
            </div>
            {visible.map((file) => (
              <div className="file-row" key={file.path}>
                <button
                  className="file-name"
                  onClick={() =>
                    file.directory ? navigate(file.path) : setPreview(file)
                  }
                >
                  <FileIcon file={file} />
                  <span>
                    <strong>{file.name}</strong>
                    <small>
                      {file.directory ? "文件夹" : formatSize(file.size)}
                    </small>
                  </span>
                </button>
                <span className="file-size">
                  {file.directory ? "—" : formatSize(file.size)}
                </span>
                <time>
                  {new Date(file.modified).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {file.directory ? (
                  <button
                    className="icon-button"
                    aria-label={`打开 ${file.name}`}
                    onClick={() => navigate(file.path)}
                  >
                    <ChevronRight size={17} />
                  </button>
                ) : (
                  <a
                    className="icon-button"
                    title="下载"
                    aria-label={`下载 ${file.name}`}
                    href={contentUrl(file, true)}
                  >
                    <Download size={17} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <footer className="file-panel-footer">
          <span>{loading || error ? "—" : `${visible.length} 个项目`}</span>
          <span>支持文本、图片与音视频预览</span>
        </footer>
      </div>
      <div className="drop-hint">
        <Upload size={16} />
        <span>也可以拖拽文件到这里上传</span>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>{uploading ? "请等待当前上传完成" : "松开即可上传到共享目录"}</h2>
        </div>
      )}
      {uploads.length > 0 && (
        <aside className="upload-panel" aria-label="上传任务">
          <header>
            <strong>{uploading ? "正在上传" : "上传任务"}</strong>
            {!uploading && (
              <button
                className="icon-button"
                aria-label="关闭上传任务"
                onClick={() => setUploads([])}
              >
                <X size={17} />
              </button>
            )}
          </header>
          {uploads.map((item, index) => (
            <div className="upload-item" key={index}>
              <div>
                <span>{item.savedName ?? item.file.name}</span>
                <small>
                  {item.status === "done"
                    ? "已保存"
                    : item.status === "failed"
                      ? "失败"
                      : item.status === "waiting"
                        ? "等待中"
                        : item.progress === 100
                          ? "正在保存…"
                          : `${item.progress}%`}
                </small>
              </div>
              <progress value={item.progress} max={100} />
              {item.error && <p role="alert">{item.error}</p>}
            </div>
          ))}
          {!uploading && uploads.some((item) => item.status === "failed") && (
            <button
              className="secondary-button"
              onClick={() =>
                void upload(
                  uploads
                    .filter((item) => item.status === "failed")
                    .map((item) => item.file)
                )
              }
            >
              重试失败文件
            </button>
          )}
        </aside>
      )}
      {preview && (
        <FilePreview
          key={preview.path}
          file={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  )
}
