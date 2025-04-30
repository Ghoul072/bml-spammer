import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const responses = {
  Police: "I already went to the police and they said I should talk to you",
  "Were you satisfied with our live agent's help?": "Very Poor",
  "Now, can you tell me about your overall chat experience with me (Aaya)?":
    "Very Poor",
  "Shall I connect you to a live agent for further assistance?": "Yes",
  "Want me to connect you to them?": "Yes",
  "Would you like to ask any other question?": "Let me talk to a live agent",
  "mentiond multiple times":
    "You're not the only one mentioning things multiple times. I myself have mentioned multiple times that I will not be tolerating additional time taken for your sake. You're the one holding my money, and I'm here to collect my money",
  "Hi Yaseen, good morning! I'm Unoosha and how may I assist you?":
    "Hi BML, I'm yaseen, and I need you to give me my 500rf back that you've been holding from me for 40 days",
  "If you have no further queries, I will end this chat for now. Do re-initiate a new chat if you require further assistance. Have a good day, Yaseen!":
    "I do have a query, I need my 500rf back today",
  "It appears that you are currently away. We will end the chat session for now to give chance to customers that are currently in waiting. Do re-initiate a new chat if you require assistance. Have a great day!":
    "I'm literally in the middle of a conversation with you right now, you can't just end the chat",
  "Yaseen, hold on, our agents are bit busy now.�You're in the queue and we'll get back to you in no time.":
    "Hurryyyyy and give me my money",
  Sunday: "I am not waiting for a Sunday, I need my money today",
  Tomorrow:
    "I am not waiting for a tomorrow that didn't come in 40 previous days, I need my money today",
  "We will not be able to provide you with any updates today":
    "I will not be able to provide you with any additional time for resolving this case. Give me my money today",
  "Yaseen, I hope our conversation was helpful. 🤝": "",
};

const defaultReply = "Give me back my money."; // <== you can change this later or use Claude

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    let page;

    const authFile = "auth.json";
    try {
      if (fs.existsSync(authFile)) {
        const cookies = JSON.parse(fs.readFileSync(authFile, "utf8"));
        // Validate cookies format
        if (
          !Array.isArray(cookies) ||
          cookies.length === 0 ||
          !cookies[0].name ||
          !cookies[0].value
        ) {
          console.log("Invalid auth file, regenerating...");
          fs.unlinkSync(authFile);
          throw new Error("Invalid auth file");
        }

        page = await browser.newPage();
        await page.setCookie(...cookies);
      } else {
        throw new Error("No auth file");
      }
    } catch (err) {
      // If auth file is invalid or doesn't exist, create new one
      page = await browser.newPage();
      await page.goto("https://www.messenger.com/");

      console.log(
        "🚪 Log into Messenger and manually select the chat to automate."
      );
      console.log("✅ Press ENTER here once you're ready...");
      await new Promise((resolve) => process.stdin.once("data", resolve));

      const cookies = await page.cookies();
      fs.writeFileSync(authFile, JSON.stringify(cookies, null, 2));
      console.log("💾 Session saved to auth.json.");
    }

    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto("https://www.messenger.com/");

    console.log("👀 Watching for new messages...");

    let lastProcessedMessage = "";
    let lastMessageTime = Date.now();
    let inactivityTimer: NodeJS.Timeout | null = null;

    // Function to send default message
    const sendDefaultMessage = async (page: any) => {
      try {
        console.log(
          `💬 [Bot] Sending default message due to inactivity: "${defaultReply}"`
        );
        await page.waitForSelector('[aria-label="Message"]');
        await page.type('[aria-label="Message"]', defaultReply);
        await page.keyboard.press("Enter");
        lastMessageTime = Date.now(); // Reset timer after sending
      } catch (err) {
        console.error("Failed to send inactivity message:", err.message);
      }
    };

    // Function to reset/start inactivity timer
    const resetInactivityTimer = (page: any) => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(() => {
        sendDefaultMessage(page);
        resetInactivityTimer(page); // Set up next timer
      }, INACTIVITY_TIMEOUT);
    };

    while (true) {
      try {
        // Wait for message rows
        await page.waitForSelector('div[role="row"]', { timeout: 30000 });

        // Get all message rows
        const messages = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('div[role="row"]'));
          return rows
            .map((row) => {
              const isSent = Array.from(
                row.querySelectorAll('div[class*="x78zum5"] span')
              ).some((span) => span.textContent?.includes("You sent"));
              const textEl = row.querySelector(
                'div[class*="x78zum5"] span[dir="auto"] div[dir="auto"]'
              );
              return {
                text: textEl ? textEl.textContent?.trim() : null,
                isSent,
              };
            })
            .filter((msg) => msg.text && !msg.isSent);
        });

        const mostRecentMessage = messages[messages.length - 1]?.text;

        if (mostRecentMessage && mostRecentMessage !== lastProcessedMessage) {
          let reply = defaultReply;

          for (const [trigger, response] of Object.entries(responses)) {
            if (
              mostRecentMessage.toLowerCase().includes(trigger.toLowerCase())
            ) {
              reply = response;
              break;
            }
          }

          console.log(`💬 [Bot] "${mostRecentMessage}" → "${reply}"`);

          // Type and send message
          await page.waitForSelector('[aria-label="Message"]');
          await page.type('[aria-label="Message"]', reply);
          await page.keyboard.press("Enter");

          lastProcessedMessage = mostRecentMessage;
          lastMessageTime = Date.now(); // Update last message time
          resetInactivityTimer(page); // Reset inactivity timer after sending a message
        }

        await delay(5000);
      } catch (err) {
        console.error("⚠️ Error:", err.message);

        // Take error screenshot
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          await page.screenshot({
            path: `error-${timestamp}.png`,
            fullPage: true,
          });
        } catch (screenshotErr) {
          console.error(
            "Failed to take error screenshot:",
            screenshotErr.message
          );
        }

        await delay(5000);
      }
    }
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();
