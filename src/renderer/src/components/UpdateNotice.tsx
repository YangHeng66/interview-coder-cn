import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function UpdateNotice() {
  const [status, setStatus] = useState<'available' | 'downloaded' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void window.api.getUpdateStatus().then(setStatus)
    return window.api.onUpdateStatus(setStatus)
  }, [])
  return (
    <Dialog
      open={status !== null}
      onOpenChange={(open) => {
        if (!open) setStatus(null)
      }}
    >
      <DialogContent>
        <DialogTitle>{status === 'downloaded' ? '更新已就绪' : '发现新版本'}</DialogTitle>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setStatus(null)}>
            稍后
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                if (status === 'downloaded') await window.api.installAppUpdate()
                else {
                  await window.api.downloadAppUpdate()
                  setStatus('downloaded')
                }
              } catch (error) {
                setError(String(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '处理中' : status === 'downloaded' ? '重启并安装' : '下载更新'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
