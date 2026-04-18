# Attach Image — Upload & Embed in GitHub Issues/PRs

Upload an image file and embed it in a GitHub issue or PR body so it renders inline.

## Arguments

`$ARGUMENTS` — Path to the image file and target context. Examples:
- `/tmp/screenshot.png for issue #180`
- `/tmp/error.png for PR #42`

## Step 1: Ensure the upload branch exists

Images are uploaded to the `temp-image-upload` branch since main is protected.

```bash
# Check if branch exists remotely
gh api repos/{owner}/{repo}/branches/temp-image-upload --jq '.name' 2>/dev/null || \
  (git checkout -b temp-image-upload && git push origin temp-image-upload && git checkout -)
```

## Step 2: Upload the image

Use the GitHub Contents API. Base64 strings are too large for CLI args — always use `--input` with a JSON file.

```bash
BASE64_CONTENT=$(base64 -w 0 /tmp/screenshot.png)
cat > /tmp/upload_payload.json << JSONEOF
{
  "message": "Add screenshot for issue #NUMBER",
  "content": "$BASE64_CONTENT",
  "branch": "temp-image-upload"
}
JSONEOF
gh api --method PUT repos/{owner}/{repo}/contents/.github/images/<target>-<NUMBER>-<description>.png \
  --input /tmp/upload_payload.json --jq '.content.html_url'
```

Name the file descriptively, e.g. `issue-180-edit-member-error.png` or `pr-42-before-after.png`.

## Step 3: Generate the embed markup

Use an HTML `<img>` tag with a `width` attribute. **Never use bare `![](url)` markdown for large images** — they render at full resolution and can be taller than the page.

```html
<img src="https://github.com/shantamg/meet-without-fear/blob/temp-image-upload/.github/images/<filename>.png?raw=true" alt="description" width="300" />
```

### Width guidelines

| Image type | Width |
|------------|-------|
| Phone screenshot (portrait) | `300` |
| Tablet / landscape screenshot | `600` |
| Small UI detail / icon | `200` |
| Wide dashboard / full-screen capture | `800` |

## Output

Return the `<img>` tag ready to paste into an issue or PR body.
