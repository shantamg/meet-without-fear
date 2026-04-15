# Attach Image Utility

Upload an image file and embed it in a GitHub issue or PR body.

## Workflow

1. Ensure `temp-image-upload` branch exists remotely
2. Base64-encode the image and upload via GitHub Contents API (use `--input` with JSON file — base64 strings are too large for CLI args)
3. Name files descriptively: `issue-180-edit-member-error.png`

## Embed Markup

Use HTML `<img>` tag with width attribute (never bare `![](url)` for large images):

```html
<img src="https://github.com/shantamg/meet-without-fear/blob/temp-image-upload/.github/images/<filename>.png?raw=true" alt="description" width="300" />
```

## Width Guidelines

| Image type | Width |
|---|---|
| Phone screenshot (portrait) | `300` |
| Tablet / landscape | `600` |
| Small UI detail | `200` |
| Wide dashboard | `800` |
