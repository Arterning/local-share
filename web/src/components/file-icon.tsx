import { File, FileText, Folder, Image, Music2, Video } from "lucide-react"
import { fileKind, type FileEntry } from "@/lib/files"
export function FileIcon({ file }: { file: FileEntry }) {
  const kind = fileKind(file)
  const Icon = {
    folder: Folder,
    text: FileText,
    image: Image,
    video: Video,
    audio: Music2,
    other: File,
  }[kind]
  return (
    <span className={`file-icon kind-${kind}`}>
      <Icon size={21} />
    </span>
  )
}
