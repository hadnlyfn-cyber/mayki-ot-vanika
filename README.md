# MAYKI OT VANIKA

React + Vite storefront for custom T-shirt orders with:

- color selection
- front and back print editor
- RU/EN translation switch
- order summary card
- Telegram bot delivery to the seller's personal messages

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in:

- `VITE_API_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_ID`

3. Put your shirt PNG files into `public/assets` with these names:

- `black.png`
- `white.png`
- `red.png`
- `green.png`
- `black_back.png`
- `white_back.png`
- `red_back.png`
- `green_back.png`

4. Run frontend:

```bash
npm run dev
```

5. Run backend in a second terminal:

```bash
npm run server
```

## Telegram notes

The bot sends the order to your Telegram personal messages.  
The customer's `@username` is included inside the order as a contact field.

To get `TELEGRAM_ADMIN_CHAT_ID`, message your bot first and inspect updates with:

```bash
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```
