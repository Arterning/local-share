export type FileEntry = {
  name: string
  path: string
  size: number
  directory: boolean
  modified: string
}
export type FileKind = "folder" | "text" | "image" | "video" | "audio" | "other"
export function fileKind(file: FileEntry): FileKind {
  if (file.directory) return "folder"
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (
    [
      "txt",
      "md",
      "json",
      "csv",
      "log",
      "yaml",
      "yml",
      "xml",
      "go",
      "js",
      "ts",
      "tsx",
      "css",
      "html",
      "ini",
      "toml",
      "sql",
      "sh",
    ].includes(ext)
  )
    return "text"
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"].includes(ext))
    return "image"
  if (["mp4", "webm", "mov", "m4v", "mkv", "avi"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext)) return "audio"
  return "other"
}
export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3)
  return `${(size / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB"][index]}`
}
export function contentUrl(file: FileEntry, download = false) {
  return `/api/content?${new URLSearchParams({ path: file.path, ...(download ? { download: "1" } : {}) })}`
}
export async function listFiles(
  path: string,
  signal: AbortSignal
): Promise<FileEntry[]> {
  const response = await fetch(`/api/files?${new URLSearchParams({ path })}`, {
    signal,
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
export function uploadFile(
  file: File,
  progress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/upload")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300)
        resolve(JSON.parse(xhr.responseText).name)
      else reject(new Error(xhr.responseText || "上传失败"))
    }
    xhr.onerror = () => reject(new Error("网络连接中断，请重试"))
    const data = new FormData()
    data.append("file", file)
    xhr.send(data)
  })
}
