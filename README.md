# BML Spammer

A Node.js bot that automates interactions with Bank of Maldives customer service chat system.
The bot has 3 scripts, one for automating Facebook Messenger chat, one for www.bankofmaldives.com chat interface by Yellow.ai, and one to run both of them together.
The messenger bot can be launched multiple times with a new login for each, but web bot is programmed to run concurrent headless instances.

## Features

- Automated chat interactions with BML's customer service
- Multiple concurrent bot instances
- Cloudflare bypass using FlareSolverr
- Random credential generation (phone numbers, names, ID cards)
- Automatic message response system
- Instance lifecycle management with variable-defined timeframes
- Error handling and automatic retries

## Prerequisites

- Node.js (v16 or higher)
- [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) running on port 8191 (Only required for BML Website bot)
- Chrome/Chromium browser

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Ghoul072/bml-spammer.git
cd bml-spammer
```

2. Install dependencies:

```bash
npm install
```

3. Make sure FlareSolverr is running (Only for website):

```bash
docker run -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```

## Configuration

The web bot is configured to:

- Run 100 concurrent instances
- Rotate instances every 100 minutes
- Wait 3 minutes between instance launches
- Use randomly generated credentials:
  - Phone numbers (format: +9607xxxxxx or +9609xxxxxx)
  - Names (random alphabetical strings)
  - ID Cards (format: A[1-3]xxxxx)

## Usage

Start the bots:

```bash
# To run only messenger
npm run messenger

# To run only website bot
npm run web

# To run both messenger and web
npm run start
```

Note: Messenger requires manual initial login, and also requires you to manually open the BML Chat at https://www.facebook.com/messages

The bot will:

1. Launch browser instances
2. Handle Cloudflare challenges automatically
3. Connect to the chat system
4. Respond to messages based on predefined patterns
5. Rotate instances periodically

## Error Handling

The system includes:

- Automatic retries for failed instances
- Cloudflare bypass mechanism
- Browser launch failure recovery
- Progressive cooldown periods for failed attempts
- Instance failure tracking

## Monitoring

The bot provides console output for:

- Instance starts and stops
- Chat interactions
- Error messages
- Cloudflare challenge status
- Browser launch status

## Important Notes

- Ensure FlareSolverr is running before starting the bot
- The bot requires a stable internet connection
- Multiple instances may require significant system resources
- Some antivirus software might interfere with browser automation

## Troubleshooting

If you encounter issues:

1. Check FlareSolverr is running (`http://localhost:8191`)
2. Ensure no other Chrome instances are running
3. Check system resources (CPU/Memory usage)
4. Verify internet connectivity
5. Check console output for specific error messages

## Legal Disclaimer

This tool is for educational purposes only. Users are responsible for compliance with applicable laws and terms of service.
