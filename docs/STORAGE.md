# Storage Guide

Storage backends persist conversation history so your AI remembers previous messages.

## Quick start

**SQLite (recommended)** — Persistent storage:

```jsonc
"storage": {
  "type": "sqlite",
  "path": "data/pandora.db"
}
```

**Memory** — Temporary storage (for testing):

```jsonc
"storage": {
  "type": "memory"
}
```

## Choosing a backend

| Backend | Persistence | Best for |
|---------|-------------|----------|
| **SQLite** | Survives restarts | Production use, daily driver |
| **Memory** | Lost on restart | Testing, development, demos |

**Use SQLite when:**
- You want conversations to persist
- You're running Pandora as your daily assistant
- You need reliability

**Use Memory when:**
- You're testing or developing
- You don't need history persistence
- You want a clean slate every restart

---

## SQLite Storage

File-based database that persists conversations across restarts.

### Configuration

```jsonc
"storage": {
  "type": "sqlite",
  "path": "data/pandora.db"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `type` | `"sqlite"` | Storage backend type |
| `path` | `"data/pandora.db"` | Path to database file |

### How it works

- Creates the database file automatically on first run
- Uses WAL mode for better performance
- Each conversation is stored by its ID
- Messages are stored with role (user/assistant) and content

### Database location

By default, the database is created at `data/pandora.db` relative to where you run Pandora.

**Custom location:**

```jsonc
"storage": {
  "type": "sqlite",
  "path": "/home/user/pandora-data/conversations.db"
}
```

### Backup and restore

The database is a single file. To backup:

```bash
cp data/pandora.db data/pandora.db.backup
```

To restore:

```bash
cp data/pandora.db.backup data/pandora.db
```

### Database schema

The SQLite store uses this schema:

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

You can query it directly if needed:

```bash
sqlite3 data/pandora.db "SELECT * FROM messages LIMIT 10;"
```

---

## Memory Storage

In-memory storage that resets when Pandora restarts.

### Configuration

```jsonc
"storage": {
  "type": "memory"
}
```

### When to use

- **Development:** Test without accumulating history
- **Demos:** Start fresh for each demo
- **Privacy:** No persistent storage of conversations
- **Testing:** Predictable clean state

### Limitations

- All conversations lost when Pandora stops
- No way to recover history after restart
- Not suitable for production use

---

## Clearing conversation history

### In Telegram

Send `/start` to clear history and begin fresh.

### Manually (SQLite)

Clear a specific conversation:

```bash
sqlite3 data/pandora.db "DELETE FROM messages WHERE conversation_id = 'your-conversation-id';"
```

Clear all conversations:

```bash
sqlite3 data/pandora.db "DELETE FROM messages;"
```

Or just delete the database file:

```bash
rm data/pandora.db
```

### Programmatically

The storage interface provides `clearHistory(conversationId)` which channels can call.

---

## Full configuration examples

### Production setup (SQLite with custom path)

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-key" },
    "agents": {
      "operator": { "model": "anthropic/claude-sonnet-4.5" }
    }
  },
  "storage": {
    "type": "sqlite",
    "path": "/var/lib/pandora/conversations.db"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "your-bot-token",
      "ownerId": "your-user-id"
    }
  }
}
```

### Development setup (Memory)

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-key" },
    "agents": {
      "operator": { "model": "anthropic/claude-haiku" }
    }
  },
  "storage": {
    "type": "memory"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "your-bot-token",
      "ownerId": "your-user-id"
    }
  },
  "logLevel": "verbose"
}
```

---

## Adding custom storage backends

Want to use Postgres, Redis, or another database?

See [Customization → Storage backends](CUSTOMIZATION.md#storage-backends) for how to create your own.

---

## Troubleshooting

### "Unknown store type"

The storage type doesn't match a registered backend:

```
Unknown store type: postgres
```

**Fix:** Use `sqlite` or `memory`, or [create a custom backend](CUSTOMIZATION.md#storage-backends).

### Database file not created

Check that:
1. The parent directory exists
2. Pandora has write permissions
3. The path is valid

```bash
# Create the directory if needed
mkdir -p data
```

### "Database is locked"

SQLite can have locking issues if accessed by multiple processes:
1. Make sure only one Pandora instance is running
2. Check for zombie processes: `ps aux | grep pandora`
3. Delete any `.db-wal` or `.db-shm` files and restart

### Conversations not persisting

1. Check you're using `sqlite`, not `memory`
2. Check the database path is correct
3. Verify the database file exists after sending messages

### Large database file

Over time, the database can grow. To compact it:

```bash
sqlite3 data/pandora.db "VACUUM;"
```

To clear old conversations while keeping recent ones:

```bash
sqlite3 data/pandora.db "DELETE FROM messages WHERE created_at < datetime('now', '-30 days');"
sqlite3 data/pandora.db "VACUUM;"
```
