import type { FileEntry } from "./files"
export type Message = {
  id: number
  requestId: string
  senderId: string
  senderName: string
  kind: "text" | "file"
  text: string
  fileName: string
  fileSize: number
  createdAt: string
}
export type Identity = { senderId: string; senderName: string }
export function requestId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  )
}
export function getIdentity(): Identity {
  let id = localStorage.getItem("localshare-device-id")
  if (!id) {
    id = requestId()
    localStorage.setItem("localshare-device-id", id)
  }
  return {
    senderId: id,
    senderName: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      ? "手机"
      : "电脑",
  }
}
export async function getMessages(
  cursor: { after?: number; before?: number } = {},
  signal?: AbortSignal
): Promise<Message[]> {
  const query = new URLSearchParams(
    Object.entries(cursor).map(([key, value]) => [key, String(value)])
  )
  const response = await fetch(`/api/messages?${query}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    cache: "no-store",
  })
  if (!response.ok) throw new Error("暂时无法同步消息，正在尝试重新连接")
  return response.json()
}
export async function sendText(
  identity: Identity,
  id: string,
  text: string
): Promise<Message> {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...identity, requestId: id, text }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
export function sendFile(
  identity: Identity,
  id: string,
  file: File,
  progress: (value: number) => void
): Promise<Message> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      "POST",
      `/api/upload?${new URLSearchParams({ chat: "1", ...identity, requestId: id })}`
    )
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error("服务器响应异常，请重试"))
        }
      } else reject(new Error(xhr.responseText || "文件发送失败"))
    }
    xhr.onerror = () => reject(new Error("网络中断，请重试"))
    xhr.onabort = () => reject(new Error("上传已取消"))
    const data = new FormData()
    data.append("file", file)
    xhr.send(data)
  })
}
export function messageFile(message: Message): FileEntry {
  return {
    name: message.fileName,
    path: message.fileName,
    size: message.fileSize,
    directory: false,
    modified: message.createdAt,
  }
}
export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  // LAN HTTP pages lack the Clipboard API; retain copy support with a user gesture.
  const active = document.activeElement as HTMLElement | null
  const field = document.createElement("textarea")
  field.value = text
  field.style.position = "fixed"
  field.style.opacity = "0"
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  active?.focus()
  if (!copied) throw new Error("复制失败，请长按或选中文本手动复制")
}
