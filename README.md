# 🔑 WhatsApp creds.json Generator

Generate WhatsApp credentials for OpenClaw by scanning a QR code.

## Usage

```bash
npm start
```

1. QR code appears in terminal
2. Open WhatsApp → Settings → Linked Devices → Link a Device
3. Scan the QR code
4. `creds.json` is saved to `./session/creds.json`
5. Copy it to your OpenClaw config and restart

## Structure

```
whatsapp_auth/
├── src/index.js    # The entire app
├── session/        # Auto-created, contains creds.json
├── package.json
└── .env
```
