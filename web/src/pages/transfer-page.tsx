import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ArrowDown,
  Check,
  Copy,
  Download,
  FileUp,
  MessageSquare,
  Monitor,
  Paperclip,
  Send,
  Smartphone,
} from "lucide-react"
import { FileIcon } from "@/components/file-icon"
import { FilePreview } from "@/components/file-preview"
import { contentUrl, formatSize, type FileEntry } from "@/lib/files"
import {
  copyText,
  getIdentity,
  getMessages,
  messageFile,
  requestId,
  sendFile,
  sendText,
  type Message,
} from "@/lib/messages"
import "./transfer.css"

type Pending = {
  id: string
  text?: string
  file?: File
  state: "sending" | "failed"
  progress: number
  error?: string
}
function mergeMessages(old: Message[], incoming: Message[]) {
  return Array.from(
    new Map(
      [...old, ...incoming].map((message) => [message.id, message])
    ).values()
  ).sort((a, b) => a.id - b.id)
}
function TextContent({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  )
}
export function TransferPage() {
  const [identity] = useState(getIdentity)
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState(
    () => sessionStorage.getItem("localshare-draft") ?? ""
  )
  const [ready, setReady] = useState(false)
  const [connectionError, setConnectionError] = useState("")
  const [notice, setNotice] = useState("")
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [preview, setPreview] = useState<FileEntry | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [newMessages, setNewMessages] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nearBottom = useRef(true)
  const olderHeight = useRef<number | null>(null)
  const activeRequests = useRef(new Set<string>())

  useEffect(() => {
    sessionStorage.setItem("localshare-draft", draft)
  }, [draft])
  useEffect(() => {
    let stopped = false,
      cursor = 0,
      initialized = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function sync() {
      let delay = 2000
      try {
        const incoming = await getMessages(
          cursor ? { after: cursor } : {},
          controller.signal
        )
        if (stopped) return
        if (!initialized) {
          setHasOlder(incoming.length === 100)
          initialized = true
        }
        if (incoming.length) {
          cursor = incoming[incoming.length - 1].id
          setMessages((old) => mergeMessages(old, incoming))
          setPending((old) =>
            old.filter(
              (item) =>
                !incoming.some(
                  (message) =>
                    message.senderId === identity.senderId &&
                    message.requestId === item.id
                )
            )
          )
          if (!nearBottom.current) setNewMessages(true)
          if (incoming.length === 100) delay = 50
        }
        setReady(true)
        setConnectionError("")
      } catch {
        if (!stopped) setConnectionError("暂时无法同步消息，正在尝试重新连接")
      }
      if (!stopped) timer = setTimeout(sync, delay)
    }
    void sync()
    return () => {
      stopped = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [identity.senderId])
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    if (olderHeight.current !== null) {
      element.scrollTop += element.scrollHeight - olderHeight.current
      olderHeight.current = null
    } else if (nearBottom.current) element.scrollTop = element.scrollHeight
  }, [messages, pending, ready])
  function toBottom() {
    nearBottom.current = true
    setNewMessages(false)
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }
  async function loadOlder() {
    if (!messages.length || loadingOlder) return
    setLoadingOlder(true)
    try {
      const incoming = await getMessages({ before: messages[0].id })
      olderHeight.current = list.current?.scrollHeight ?? null
      setMessages((old) => mergeMessages(old, incoming))
      setHasOlder(incoming.length === 100)
    } catch {
      setNotice("历史消息加载失败，请重试")
    } finally {
      setLoadingOlder(false)
    }
  }
  async function transmit(item: Pending) {
    if (activeRequests.current.has(item.id)) return
    activeRequests.current.add(item.id)
    setPending((old) =>
      old.map((value) =>
        value.id === item.id ? { ...value, state: "sending", error: "" } : value
      )
    )
    try {
      const saved = item.file
        ? await sendFile(identity, item.id, item.file, (progress) =>
            setPending((old) =>
              old.map((value) =>
                value.id === item.id ? { ...value, progress } : value
              )
            )
          )
        : await sendText(identity, item.id, item.text ?? "")
      setMessages((old) => mergeMessages(old, [saved]))
      setPending((old) => old.filter((value) => value.id !== item.id))
    } catch (error) {
      setPending((old) =>
        old.map((value) =>
          value.id === item.id
            ? {
                ...value,
                state: "failed",
                error: error instanceof Error ? error.message : "发送失败",
              }
            : value
        )
      )
    } finally {
      activeRequests.current.delete(item.id)
    }
  }
  function submitText() {
    if (!draft.trim()) return
    if (new TextEncoder().encode(draft).length > 65536) {
      setNotice("文本不能超过 64 KB，请作为文件发送")
      return
    }
    const item: Pending = {
      id: requestId(),
      text: draft,
      state: "sending",
      progress: 0,
    }
    nearBottom.current = true
    setPending((old) => [...old, item])
    setDraft("")
    void transmit(item)
  }
  async function attach(files: File[]) {
    const items: Pending[] = files.map((file) => ({
      id: requestId(),
      file,
      state: "sending",
      progress: 0,
    }))
    nearBottom.current = true
    setPending((old) => [...old, ...items])
    for (const item of items) await transmit(item)
  }
  return (
    <section
      className="transfer-page"
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
        void attach(Array.from(event.dataTransfer.files))
      }}
    >
      <header className="chat-heading">
        <span className="assistant-avatar">
          <MessageSquare size={24} />
        </span>
        <div>
          <h1>文件传输助手</h1>
          <p>随手发送，在另一台设备接着用</p>
        </div>
        <span className={`chat-status ${connectionError ? "offline" : ""}`}>
          <i />
          {connectionError ? "重新连接中" : ready ? "自动同步" : "连接中"}
        </span>
      </header>
      <div className="chat-info">消息自动保留 · 文件保存到电脑共享目录</div>
      {connectionError && (
        <div className="chat-warning" role="status">
          {connectionError}
        </div>
      )}
      <div
        ref={list}
        className="message-list"
        role="region"
        aria-label="消息记录"
        onScroll={() => {
          const element = list.current
          if (element) {
            nearBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              90
            if (nearBottom.current) setNewMessages(false)
          }
        }}
      >
        {hasOlder && (
          <button
            className="history-button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
          >
            {loadingOlder ? "加载中…" : "加载更早的消息"}
          </button>
        )}
        {!ready && !connectionError && (
          <p className="chat-empty">正在读取消息…</p>
        )}
        {ready && messages.length === 0 && pending.length === 0 && (
          <div className="chat-welcome">
            <MessageSquare size={38} />
            <h2>你的跨设备收件箱</h2>
            <p>
              发一段文字，或拖入一个文件。
              <br />
              手机和电脑打开此页面，即可相互查看。
            </p>
            <span>消息保存在这台电脑，重启后依然在。</span>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.senderId === identity.senderId
          const file = message.kind === "file" ? messageFile(message) : null
          const showTime =
            index === 0 ||
            Date.parse(message.createdAt) -
              Date.parse(messages[index - 1].createdAt) >
              5 * 60 * 1000
          return (
            <div key={message.id}>
              {showTime && (
                <div className="message-time">
                  {new Date(message.createdAt).toLocaleString("zh-CN", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
              <article className={`message-row ${mine ? "mine" : ""}`}>
                <span className="device-avatar">
                  {message.senderName === "手机" ? (
                    <Smartphone size={21} />
                  ) : (
                    <Monitor size={21} />
                  )}
                </span>
                <div className="message-content">
                  <div className="message-sender">
                    {mine
                      ? `本机 · ${message.senderName}`
                      : `${message.senderName} · ${message.senderId.slice(0, 4)}`}
                  </div>
                  {file ? (
                    <div className="message-bubble file-bubble">
                      <button
                        className="message-file"
                        onClick={() => setPreview(file)}
                      >
                        <FileIcon file={file} />
                        <span>
                          <strong>{file.name}</strong>
                          <small>{formatSize(file.size)} · 点击预览</small>
                        </span>
                      </button>
                      <a
                        href={contentUrl(file, true)}
                        className="message-download"
                      >
                        <Download size={14} />
                        下载到此设备
                      </a>
                    </div>
                  ) : (
                    <div className="message-bubble text-bubble">
                      <TextContent text={message.text} />
                    </div>
                  )}
                  <div className="message-tools">
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {!file && (
                      <button
                        onClick={async () => {
                          try {
                            await copyText(message.text)
                            setCopied(message.id)
                          } catch (error) {
                            setNotice(
                              error instanceof Error
                                ? error.message
                                : "复制失败"
                            )
                          }
                        }}
                      >
                        {copied === message.id ? (
                          <Check size={13} />
                        ) : (
                          <Copy size={13} />
                        )}
                        {copied === message.id ? "已复制" : "复制"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            </div>
          )
        })}
        {pending.map((item) => (
          <article className="message-row mine" key={item.id}>
            <span className="device-avatar">
              <Monitor size={21} />
            </span>
            <div className="message-content">
              <div className="message-sender">本机</div>
              <div className="message-bubble">
                {item.file ? (
                  <div className="pending-file">
                    <FileUp size={22} />
                    <span>
                      {item.file.name}
                      <small>{formatSize(item.file.size)}</small>
                    </span>
                  </div>
                ) : (
                  item.text
                )}
              </div>
              <div className="pending-status" role="status">
                {item.state === "failed" ? (
                  <>
                    <span>{item.error}</span>
                    <button onClick={() => void transmit(item)}>重试</button>
                    <button
                      onClick={() => {
                        if (item.text)
                          setDraft((old) =>
                            old ? `${old}\n${item.text}` : (item.text ?? "")
                          )
                        setPending((old) =>
                          old.filter((value) => value.id !== item.id)
                        )
                      }}
                    >
                      {item.text ? "移回草稿" : "移除"}
                    </button>
                  </>
                ) : item.file ? (
                  `上传中 ${item.progress}%${item.progress === 100 ? " · 正在保存" : ""}`
                ) : (
                  "发送中…"
                )}
              </div>
              {item.file && item.state === "sending" && (
                <progress value={item.progress} max={100} />
              )}
            </div>
          </article>
        ))}
      </div>
      {newMessages && (
        <button className="new-message-button" onClick={toBottom}>
          <ArrowDown size={14} />
          有新消息
        </button>
      )}
      <div className="chat-composer">
        {notice && (
          <div className="composer-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>关闭</button>
          </div>
        )}
        <div className="composer-toolbar">
          <button
            className="quiet-button"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={18} />
            添加文件
          </button>
          <span>本机：{identity.senderName}</span>
          <input
            hidden
            ref={fileInput}
            type="file"
            multiple
            onChange={(event) => {
              void attach(Array.from(event.target.files ?? []))
              event.target.value = ""
            }}
          />
        </div>
        <textarea
          aria-label="消息内容"
          placeholder="输入文字，或粘贴你想传送的内容…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              submitText()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length) {
              event.preventDefault()
              void attach(files)
            }
          }}
        />
        <div className="composer-footer">
          <span>Enter 换行 · Ctrl / ⌘ + Enter 发送</span>
          <button
            className="primary-button"
            disabled={!draft.trim()}
            onClick={submitText}
          >
            <Send size={16} />
            发送
          </button>
        </div>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <FileUp size={40} />
          <h2>松开发送文件</h2>
        </div>
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
