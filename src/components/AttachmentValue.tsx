import { useEffect, useState } from 'react'
import { Download, FileText, Image as ImageIcon, LoaderCircle } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import type { Entities } from '@uipath/uipath-typescript/entities'
import { TICKETS_ENTITY_ID, TICKETS_FOLDER_KEY } from '../data/tickets'

interface AttachmentValueProps {
  entities: Entities
  recordId: string
  fieldName: string
  value: unknown
}

interface FileMetadata {
  id?: string
  name?: string
  size?: number
  contentType?: string
}

function formatBytes(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function detectMime(blob: Blob) {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf'
  return blob.type || 'application/octet-stream'
}

export function AttachmentValue({ entities, recordId, fieldName, value }: AttachmentValueProps) {
  const metadata = (value && typeof value === 'object' ? value : {}) as FileMetadata
  const [url, setUrl] = useState<string | null>(null)
  const [mime, setMime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void entities
      .downloadAttachment({ id: TICKETS_ENTITY_ID }, recordId, fieldName, { folderKey: TICKETS_FOLDER_KEY })
      .then(async (blob) => {
        const detected = await detectMime(blob)
        if (!active) return
        setMime(detected)
        setUrl(URL.createObjectURL(blob))
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load attachment')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    }
  }, [entities, fieldName, recordId])

  const label = metadata.name ?? 'Attached file'
  const isImage = mime?.startsWith('image/')

  return (
    <div className="attachment-value">
      <div className="attachment-meta">
        {isImage ? <ImageIcon size={15} /> : <FileText size={15} />}
        <span className="attachment-name" title={label}>{label}</span>
        {metadata.size ? <span className="muted">{formatBytes(metadata.size)}</span> : null}
      </div>
      {loading ? <LoaderCircle className="spin" size={15} /> : null}
      {error ? <span className="attachment-error">{error}</span> : null}
      {url && isImage ? <img className="attachment-preview" src={url} alt={label} /> : null}
      {url && !isImage ? (
        <Button asChild variant="outline" size="xs">
          <a href={url} download={label} target="_blank" rel="noreferrer">
            <Download size={14} /> View file
          </a>
        </Button>
      ) : null}
    </div>
  )
}
