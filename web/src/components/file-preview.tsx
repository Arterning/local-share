import { useEffect, useRef, useState } from "react"
import { Download, X, Copy } from "lucide-react"
import { contentUrl, fileKind, formatSize, type FileEntry } from "@/lib/files"
import { FileIcon } from "./file-icon"
export function FilePreview({
  file,
  onClose,
}: {
  file: FileEntry
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(true)
  const kind = fileKind(file),
    url = contentUrl(file)
  useEffect(() => {
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])
  useEffect(() => {
    if (kind !== "text") return
    const controller = new AbortController()
    fetch(`${url}&text=1`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text())
        return response.text()
      })
      .then(setText)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message)
      })
    return () => controller.abort()
  }, [kind, url])
  return (
    <dialog
      ref={dialog}
      className="preview-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="preview-shell">
        <header className="preview-header">
          <FileIcon file={file} />
          <div className="preview-title">
            <strong>{file.name}</strong>
            <span>{formatSize(file.size)}</span>
          </div>
          <a
            className="icon-button"
            href={contentUrl(file, true)}
            aria-label="下载文件"
          >
            <Download size={20} />
          </a>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X size={20} />
          </button>
        </header>
        <div className={`preview-body preview-${kind}`}>
          {error && (
            <p role="alert" className="error-banner">
              {error}。可以下载文件后查看。
            </p>
          )}
          {kind === "text" && (
            <>
              <div className="text-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={wrap}
                    onChange={(e) => setWrap(e.target.checked)}
                  />{" "}
                  自动换行
                </label>
                <button
                  className="quiet-button"
                  disabled={text === null}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text ?? "")
                      setCopied(true)
                    } catch {
                      setError("当前浏览器不支持直接复制，请手动选择文本复制")
                    }
                  }}
                >
                  <Copy size={15} />
                  {copied ? "已复制" : "复制内容"}
                </button>
              </div>
              {file.size > 1024 * 1024 && (
                <p className="muted">仅预览前 1 MB 内容</p>
              )}
              <pre style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}>
                {text ?? (error ? "" : "正在读取…")}
              </pre>
            </>
          )}
          {kind === "image" && (
            <img
              src={url}
              alt={file.name}
              onError={() => setError("图片无法预览")}
            />
          )}
          {kind === "video" && (
            <video
              autoPlay
              controls
              playsInline
              preload="metadata"
              src={url}
              onError={() => setError("浏览器不支持此视频格式或文件无法读取")}
            />
          )}
          {kind === "audio" && (
            <div className="audio-preview">
              <FileIcon file={file} />
              <h2>{file.name}</h2>
              <audio
                controls
                preload="metadata"
                src={url}
                onError={() => setError("浏览器不支持此音频格式或文件无法读取")}
              />
            </div>
          )}
          {kind === "other" && (
            <div className="empty-state">
              <FileIcon file={file} />
              <h2>此文件暂不支持预览</h2>
              <p>下载到设备后，使用对应应用打开。</p>
              <a className="primary-button" href={contentUrl(file, true)}>
                <Download size={17} />
                下载文件
              </a>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
