# Send Voice Message Skill

Generate a voice message using edge-tts and upload it to a Slack channel.

## Text Preparation

Before generating audio, clean the text:
- Strip all markdown (bold, italic, code, headings, quotes)
- Remove emojis and Unicode symbols
- Remove special characters and URLs
- Use only standard punctuation
- Write naturally — text should sound spoken

## Generate Audio

```bash
edge-tts --voice en-GB-SoniaNeural --rate=+10% --text "CLEANED TEXT" --write-media /tmp/voice-message.mp3
```

Default voice: `en-GB-SoniaNeural`. See `docs/infrastructure/ec2-slam-bot.md` for other voices.

## Upload

Use `shared/slack/slack-upload.md` to upload the generated MP3 to the target channel.
