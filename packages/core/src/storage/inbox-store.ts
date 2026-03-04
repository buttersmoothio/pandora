export type DeliveryStatus = 'pending' | 'sent' | 'failed'

export interface InboxMessage {
  id: string
  subject: string
  body: string
  threadId: string | null
  destination: string
  status: DeliveryStatus
  read: boolean
  createdAt: string
  archivedAt: string | null
}

export interface InboxStore {
  init?(): Promise<void>
  add(
    message: Omit<InboxMessage, 'id' | 'read' | 'createdAt' | 'archivedAt'>,
  ): Promise<InboxMessage>
  list(filter?: { archived?: boolean }): Promise<InboxMessage[]>
  get(id: string): Promise<InboxMessage | null>
  markRead(id: string): Promise<void>
  updateStatus(id: string, status: DeliveryStatus): Promise<void>
  archive(id: string): Promise<void>
  unarchive(id: string): Promise<void>
  delete(id: string): Promise<void>
  close?(): Promise<void>
}
