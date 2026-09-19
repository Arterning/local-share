import { ArrowLeftRight } from "lucide-react"
import { Link } from "react-router"
export function TransferPage() {
  return (
    <section className="empty-state transfer-placeholder">
      <ArrowLeftRight size={36} />
      <h1>互传</h1>
      <p>文本消息与设备互传将在下一步接入。</p>
      <p>现在可以在「文件」页面上传文件，文件会直接保存到电脑的共享根目录。</p>
      <Link className="primary-button" to="/files">
        前往文件
      </Link>
    </section>
  )
}
