# Send Voice Message

Generate a voice message using edge-tts and upload it to a Slack channel.

## Arguments

`$ARGUMENTS` — The message text and target channel. Examples:
- `"Hey team, the deploy just finished successfully!" to #slam-paws`
- `"Quick update on the recording pipeline fix." to C0AM2J47R4L`

## Text preparation

Before generating audio, clean the text:

1. **Strip all markdown** — no `**bold**`, `_italic_`, `` `code` ``, `#` headings, or `> quotes`
2. **Remove emojis and Unicode symbols** — these get spoken literally (e.g. `:white_check_mark:` becomes "colon white check mark colon")
3. **Remove special characters** — no `*`, `~`, `|`, backticks, or angle brackets
4. **No URLs** — describe links instead of including them
5. **Use only standard punctuation** — periods, commas, exclamation points, question marks, colons, semicolons, dashes, and apostrophes
6. **Write naturally** — the text should sound like something a person would say out loud

## Generate the audio

```bash
edge-tts --voice en-GB-SoniaNeural --rate=+10% --text "THE CLEANED TEXT HERE" --write-media /tmp/voice-message.mp3
```

Default voice is `en-GB-SoniaNeural`. To list other available voices:

```bash
edge-tts --list-voices | grep -iE "en-(US|GB|AU)"
```

## Upload to Slack

Use the `/slack-upload` skill to upload the generated MP3:

```
/slack-upload /tmp/voice-message.mp3 to TARGET_CHANNEL_ID
```

Replace `TARGET_CHANNEL_ID` with the actual channel or DM ID from `$ARGUMENTS`.

## Output

Confirm the voice message was sent with the channel and a brief summary of what was said.
