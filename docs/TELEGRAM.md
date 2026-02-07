# Telegram Setup

This guide walks you through setting up Pandora with Telegram.

## Step 1: Create a Telegram bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name for your bot (e.g., "My AI Assistant")
4. Choose a username ending in `bot` (e.g., "myai_assistant_bot")
5. BotFather will give you a **token** — save this!

Example token: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

## Step 2: Get your user ID

The bot only responds to you (the owner). You need your Telegram user ID:

1. Open Telegram and search for [@userinfobot](https://t.me/userinfobot)
2. Send any message
3. It will reply with your **user ID** — save this!

Example user ID: `123456789`

## Step 3: Configure Pandora

Edit `config.jsonc`:

```jsonc
"channels": {
  "telegram": {
    "enabled": true,
    "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "ownerId": "123456789"
  }
}
```

## Step 4: Start the bot

```bash
bun run start
```

You should see:
```
Telegram channel started (long polling mode)
```

Now message your bot!

## How the bot works

### Starting a conversation

Send `/start` to your bot to begin. This also **clears the conversation history** — useful when you want to start fresh.

### Message types

The bot accepts:
- **Text** — Regular messages
- **Photos** — Images with optional captions
- **Documents** — Files
- **Voice** — Voice messages
- **Audio** — Audio files
- **Video** — Video files

Media is included in the message context but processing depends on your AI model's capabilities.

### Responses

- **Typing indicator** — Shows "typing..." while the AI thinks
- **HTML formatting** — Responses use Telegram's HTML (bold, italic, code, etc.)
- **Long messages** — Automatically split at 4096 characters (Telegram's limit)
- **Reply threading** — Multi-part responses reply to the first chunk

### Owner-only access

The bot only responds to the configured `ownerId`. Other users:
- Get "Sorry, this bot is private." when they send `/start`
- Are silently ignored for other messages

This keeps your AI assistant private and your API costs under control.

## Optional: Bot settings in BotFather

You can customize your bot through BotFather:

### Set a description

```
/setdescription
```

This shows when users first open your bot.

### Set commands

```
/setcommands
```

Then send:
```
start - Start a new conversation
```

### Set a profile picture

```
/setuserpic
```

Upload an image for your bot's avatar.

## Troubleshooting

### Bot doesn't respond

1. **Check the token** — Make sure it's copied correctly from BotFather
2. **Check your user ID** — Must match exactly
3. **Check logs** — Run with `"logLevel": "verbose"` to see what's happening
4. **Restart** — Stop and start Pandora again

### "Telegram channel started" but no response

- Make sure you're messaging from the account matching `ownerId`
- Try sending `/start` first
- Check if there are any error messages in the console

### "401 Unauthorized" error

Your bot token is invalid. Get a new one from BotFather.

### Messages are slow

- AI model response time varies
- Try a faster model like `anthropic/claude-haiku` or `openai/gpt-4o-mini`
- Check your internet connection

### Want to allow multiple users?

Currently, Pandora is designed for single-owner use. For multi-user support, you'd need to modify the channel code to handle authorization differently.

## Security notes

- **Keep your token secret** — Anyone with it can control your bot
- **Keep your config private** — Don't commit `config.jsonc` to public repos
- **Owner-only by design** — This prevents unauthorized use and unexpected API costs
