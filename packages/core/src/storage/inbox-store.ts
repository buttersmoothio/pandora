export interface InboxMessage {
  id: string
  subject: string
  body: string
  threadId: string | null
  read: boolean
  createdAt: string
}

export interface InboxStore {
  init?(): Promise<void>
  add(message: Omit<InboxMessage, 'id' | 'read' | 'createdAt'>): Promise<InboxMessage>
  list(): Promise<InboxMessage[]>
  get(id: string): Promise<InboxMessage | null>
  markRead(id: string): Promise<void>
  delete(id: string): Promise<void>
  close?(): Promise<void>
}
