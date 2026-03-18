'use client'

import { useAuth } from '@pandorakit/react-sdk'
import { Loader2Icon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function ChangePasswordSection(): React.JSX.Element {
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsPending(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <h2 className="display-heading-medium font-display text-base">Change Password</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Update your account password. All other sessions will be invalidated.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="current-password">Current Password</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCurrentPassword(e.target.value)
            }
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New Password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Confirm New Password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfirmPassword(e.target.value)
            }
            required
            minLength={8}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="self-end" disabled={isPending}>
          {isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Change Password'}
        </Button>
      </form>
    </div>
  )
}

function SessionsSection(): React.JSX.Element {
  const { logout, sessions, revokeSession, revokeAllSessions } = useAuth()
  const { data: sessionList, isLoading, error } = sessions
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; current?: boolean } | null>(null)

  async function handleRevokeAll(): Promise<void> {
    setIsRevoking(true)
    try {
      await revokeAllSessions()
      setDialogOpen(false)
      toast.success('All sessions revoked')
      await logout()
    } catch {
      toast.error('Failed to revoke sessions')
    } finally {
      setIsRevoking(false)
    }
  }

  async function handleRevokeOne(): Promise<void> {
    if (!revokeTarget) {
      return
    }
    setRevokingId(revokeTarget.id)
    try {
      await revokeSession(revokeTarget.id)
      setRevokeTarget(null)
      toast.success('Session revoked')
      if (revokeTarget.current) {
        await logout()
      }
    } catch {
      toast.error('Failed to revoke session')
    } finally {
      setRevokingId(null)
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display-heading-medium font-display text-base">Active Sessions</h2>
          <p className="mt-1 text-muted-foreground text-sm">Manage your active login sessions.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={!sessionList?.length}>
              Revoke All
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke all sessions?</DialogTitle>
              <DialogDescription>
                This will invalidate all active sessions, including your current one. You will be
                logged out immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button variant="destructive" disabled={isRevoking} onClick={handleRevokeAll}>
                {isRevoking ? <Loader2Icon className="size-4 animate-spin" /> : 'Revoke All'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">Failed to load sessions: {error.message}</p>
        )}
        {sessionList && sessionList.length === 0 && (
          <p className="text-muted-foreground text-sm">No active sessions.</p>
        )}
        {sessionList && sessionList.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessionList.map((session) => (
              <div key={session.id} className="flex items-center gap-3 rounded-lg bg-card p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">
                      {session.userAgent || 'Unknown client'}
                    </span>
                    {session.current && <Badge>Current</Badge>}
                    {session.ip && <Badge variant="secondary">{session.ip}</Badge>}
                  </div>
                  <div className="flex gap-4 text-muted-foreground text-xs">
                    <span>Created: {formatDate(session.createdAt)}</span>
                    <span>Expires: {formatDate(session.expiresAt)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  disabled={revokingId === session.id}
                  onClick={() => setRevokeTarget({ id: session.id, current: session.current })}
                >
                  {revokingId === session.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    'Revoke'
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open: boolean) => !open && setRevokeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session?</DialogTitle>
            <DialogDescription>
              {revokeTarget?.current
                ? 'This is your current session. You will be logged out immediately.'
                : 'This session will be invalidated and the device will need to log in again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!revokingId} onClick={handleRevokeOne}>
              {revokingId ? <Loader2Icon className="size-4 animate-spin" /> : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SecurityPage(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-6">
      <h1 className="display-heading-medium font-display text-2xl">Security</h1>
      <ChangePasswordSection />
      <SessionsSection />
    </div>
  )
}
