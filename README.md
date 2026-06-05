# MyReader — Premium Translation E-Reader

A high-end, AI-powered translation e-reader built with React and Claude. Upload books, read in any language, and translate on-the-fly with a beautiful, distraction-free interface.

Inspired by [ZEReader](https://github.com/Allegra42/ZEReader)'s modular architecture and modern e-reader best practices.

## Features

- **📖 Reading Engine** — Premium typography with Literata, Merriweather, or Inter fonts. Adjustable font size, line height, and reader width.
- **🌐 AI Translation** — Powered by Claude. Select text, paragraphs, or translate entire documents between 20+ languages.
- **📑 Bilingual View** — Side-by-side original and translated text for language learning.
- **📝 Vocabulary Tracker** — Save words and phrases with translations and context.
- **📚 Library** — Upload TXT, MD, or EPUB files. Paste text directly. All stored locally.
- **🎨 Themes** — Dark, Light, and Sepia modes with smooth transitions.
- **⚡ Credits** — Stripe-powered credit system for translation API usage.
- **🔐 Auth** — Supabase authentication with email/password.

## Tech Stack

- **Frontend**: React 19 (Create React App)
- **Backend**: Express.js
- **AI**: Anthropic Claude Sonnet 4
- **Auth**: Supabase
- **Payments**: Stripe
- **EPUB Parsing**: epub.js

## Quick Start

### Prerequisites
- Node.js >= 20
- Anthropic API key
- Supabase project (for auth + credits)
- Stripe account (for payments, optional in FREE_MODE)

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start dev server
npm start
```

### Environment Variables

```
ANTHROPIC_API_KEY=        # Required — Claude API key
SUPABASE_URL=             # Required — Supabase project URL
SUPABASE_ANON_KEY=        # Required — Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=# Required — Supabase service role key
STRIPE_SECRET_KEY=        # Optional — Stripe secret key
STRIPE_WEBHOOK_SECRET=    # Optional — Stripe webhook signing secret
FREE_MODE=true            # Set to 'true' to bypass credits (dev/testing)
```

### Production Build

```bash
npm run build
node server.js
```

## Architecture

```
MyReader
├── public/               # Static assets, index.html
├── src/
│   ├── index.js          # Entry point
│   ├── index.css         # Design system (tokens, themes, animations)
│   ├── App.js            # Main MyReader component
│   ├── App.css           # Component styles
│   └── supabaseClient.js # Supabase connection
├── server.js             # Express API (translate, auth, credits, checkout)
└── package.json
```

## Design Philosophy

Inspired by ZEReader's approach:
1. **Modular** — Components are isolated and swappable
2. **Calm** — Content-first, controls hidden until needed
3. **Efficient** — Lightweight frontend, no bloat
4. **Customizable** — Every aspect of the reading experience is configurable
5. **Open** — Multiple file format support (TXT, EPUB)

## License

Private project.
