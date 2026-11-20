import { Check, Copy, ExternalLink, X } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useRef, useState } from "react"
import { copyText } from "@/lib/messages"

type AccessResponse = { addresses: string[] }

export function ShareQrDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [image, setImage] = useState("")
  const [addresses, setAddresses] = useState<string[]>([])
  const [selectedAddress, setSelectedAddress] = useState("")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const url = selectedAddress ? new URL(pagePath, selectedAddress).href : ""

  useEffect(() => {
    dialog.current?.showModal()
    const controller = new AbortController()
    fetch("/api/access", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法获取局域网访问地址")
        return (await response.json()) as AccessResponse
      })
      .then(({ addresses: availableAddresses }) => {
        if (!availableAddresses.length) {
          throw new Error("未检测到可用的局域网 IPv4 地址")
        }
        setAddresses(availableAddresses)
        setSelectedAddress(availableAddresses[0])
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!url) return
    setImage("")
    setError("")
    void QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    })
      .then(setImage)
      .catch(() => setError("二维码生成失败，请复制链接后在手机上打开。"))
  }, [url])

  async function copyUrl() {
    try {
      await copyText(url)
      setCopied(true)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "复制失败")
    }
  }

  return (
    <dialog
      ref={dialog}
      className="share-qr-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="share-qr-shell">
        <header className="share-qr-header">
          <div>
            <strong>手机扫码访问</strong>
            <span>请确保手机和电脑连接同一局域网</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        <div className="share-qr-body">
          {image ? (
            <img className="share-qr-image" src={image} alt="局域网访问二维码" />
          ) : (
            <div className="share-qr-loading">
              {error ? "无法生成二维码" : "正在获取局域网地址…"}
            </div>
          )}
          <p>使用手机相机或扫码工具扫描，即可打开此页面。</p>
          {addresses.length > 1 && (
            <label className="share-qr-address">
              局域网地址
              <select
                value={selectedAddress}
                onChange={(event) => {
                  setSelectedAddress(event.target.value)
                  setCopied(false)
                }}
              >
                {addresses.map((address) => (
                  <option key={address} value={address}>
                    {address}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="share-qr-link">
            <span title={url || error}>{url || error || "正在读取地址…"}</span>
            <button disabled={!url} onClick={() => void copyUrl()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "已复制" : "复制链接"}
            </button>
          </div>
          {error && <p className="share-qr-error" role="alert">{error}</p>}
          {url && (
            <a className="share-qr-open" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> 在新标签页打开
            </a>
          )}
        </div>
      </div>
    </dialog>
  )
}
