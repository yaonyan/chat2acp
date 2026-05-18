---
name: weixin-login
description: WeChat Bot QR code login — fetches WEIXIN_BOT_TOKEN / WEIXIN_BASE_URL / WEIXIN_BOT_USER_ID and writes them into the project .env
allowed-tools: Bash, Read, Write, Edit
---

You are helping the user log in a WeChat Bot via QR code and persist the credentials into the project's `.env` file.

## Steps

### 1. Check dependencies

```bash
ls node_modules/@yaonyan/chat-adapter-weixin 2>/dev/null || pnpm install
```

### 2. Run the login script

```bash
node ${CODEBUDDY_SKILL_DIR}/weixin-login.mjs
```

The script prints the QR code URL to stderr — show it to the user and tell them to scan it with WeChat. The script waits for the user to press Enter, then polls for the result and prints JSON to stdout on success.

Use `AskUserQuestion` to tell the user to scan the URL, then run the script (it will block until they confirm in the terminal prompt inside the script, so just let it run).

On success, stdout will be:
```json
{ "ok": true, "botToken": "...", "baseUrl": "...", "userId": "..." }
```

### 3. Write credentials to .env

Parse the JSON output and write into the project's `.env`:

- If `.env` does not exist, copy from `.env.example` first
- If the key already exists, replace the line using the `Edit` tool
- If it does not exist, append to the end of the file
- Keys to write: `WEIXIN_BOT_TOKEN`, `WEIXIN_BASE_URL`, `WEIXIN_BOT_USER_ID`

## Notes

- `userId` may be empty — leave `WEIXIN_BOT_USER_ID` blank in that case
- Do not print the full token value in your output
