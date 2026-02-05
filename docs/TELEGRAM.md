# Telegram channel

Owner-only bot: only the configured `ownerId` can use it. Other users get “Sorry, this bot is private.” for `/start`; other messages are ignored.

## Setup

Set `channels.telegram.enabled: true`, `token` (from [@BotFather](https://t.me/BotFather)), and `ownerId` (from [@userinfobot](https://t.me/userinfobot)). See [Configuration](CONFIGURATION.md).

## Behavior

- **/start** — Clears conversation history for that chat and sends a welcome message.
- **Message types** — Text, photo, document, voice, audio, video (content/caption sent to agent; attachments in `Message`).
- **Replies** — Typing indicator while processing; HTML formatting; reply-to first chunk; split at 4096 chars.

Implementation and method docs: `src/channels/telegram.ts` (JSDoc).
