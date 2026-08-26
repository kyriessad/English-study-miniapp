# English Study Mini Program

WeChat Mini Program client for English cards, local AI analysis and streaming,
Piper pronunciation, and review history. It uses the
[English Analyzer Backend](https://github.com/kyriessad/English-analyzer-backend)
for authentication and persisted data.

## Features

- Real wx.login followed by backend JWT authentication
- Card creation, editing, deletion, and backend synchronization
- Direct and NDJSON-streaming English analysis
- Lexical information and Piper pronunciation playback
- Daily, new-card, and free review sessions, feedback, and history
- Local cache for temporary network failures

## Requirements

- WeChat Developer Tools
- Your own Mini Program AppID
- A running English Analyzer Backend
- Node.js LTS only when running the repository test

For a new Windows computer, follow the backend repository's single complete
[Windows Setup Guide](https://github.com/kyriessad/English-analyzer-backend/blob/main/docs/setup-windows.md).
It includes PostgreSQL, Python, Ollama, Piper, real WeChat login, phone HTTPS,
tests, and shutdown. This README intentionally does not duplicate that guide.

## Quick Start

Clone this repository after the backend is configured and running:

    git clone https://github.com/kyriessad/English-study-miniapp.git
    cd English-study-miniapp

Create your ignored local backend configuration from the tracked template:

    Copy-Item .\utils\localBackendConfig.example.js .\utils\localBackendConfig.js

For WeChat DevTools on this computer, keep `http://127.0.0.1:8000`. For a
phone, replace it with your own HTTPS ngrok or production URL. Do not commit
`utils/localBackendConfig.js`.

For a phone, use the HTTPS ngrok URL or future production domain instead of
127.0.0.1. The backend must include that host in ALLOWED_HOSTS.

In WeChat Developer Tools:

1. Import this repository directory as a Mini Program project.
2. Select your own AppID. It must match backend WECHAT_APPID; the AppSecret
   belongs only in backend .env.
3. For local simulator debugging, enable the option that skips legal-domain,
   web-view, TLS, and HTTPS certificate checks.
4. Compile, open the home page, and trigger a backend request. The client calls
   wx.login, then POST /api/auth/wechat-login.

Success: the project compiles without a blocking error and a backend token is
obtained, allowing cards and review data to load. The debug option and an HTTP
localhost URL are not valid production settings.

## Testing

The repository uses Node's built-in test runner for the current streaming
regression test:

    node --test .\tests\stream-provisional.test.js

Success: Node reports all subtests passing. No npm install is required for this
test file.

## Project Layout

    app.js                    application startup and backend auth restoration
    pages/                    card, review, history, settings, and other screens
    utils/apiClient.js        backend API, wx.login, JWT, and streaming client
    utils/pronunciation.js    pronunciation behavior
    utils/recordStorage.js    local card/review cache and backend synchronization
    tests/                    Node streaming regression test

## Security

Do not commit a real AppSecret, backend JWT/session secret, database password,
token, cookie, or private key. project.config.json contains an AppID but never
an AppSecret. utils/localBackendConfig.js is environment-specific and ignored;
do not publish private LAN addresses or temporary tunnel URLs.
