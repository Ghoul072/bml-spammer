import { chromium } from "playwright";
import fs from "fs";

const responses = {
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
  "Yaseen, hold on, our agents are bit busy now.�You’re in the queue and we’ll get back to you in no time.":
    "Hurryyyyy and give me my money",
  Sunday: "I am not waiting for a Sunday, I need my money today",
  Tomorrow:
    "I am not waiting for a tomorrow that didn't come in 40 previous days, I need my money today",
  "We will not be able to provide you with any updates today":
    "I will not be able to provide you with any additional time for resolving this case. Give me my money today",
  "If you have no further queries, I will end this chat for now. Do re-initiate a new chat if you require further assistance. Have a good day, Yaseen!":
    "",
  "Yaseen, I hope our conversation was helpful. 🤝": "",
};

const defaultReply = "Give me back my money."; // <== you can change this later or use Claude

(async () => {
  const browser = await chromium.launch({ headless: false });
  let context;

  const authFile = "auth.json";
  if (fs.existsSync(authFile)) {
    context = await browser.newContext({ storageState: authFile });
  } else {
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://www.messenger.com/");

    console.log(
      "🚪 Log into Messenger and manually select the chat to automate."
    );
    console.log("✅ Press ENTER here once you're ready...");
    await new Promise((resolve) => process.stdin.once("data", resolve));

    await context.storageState({ path: authFile });
    console.log("💾 Session saved to auth.json.");
  }

  const page = await context.newPage();
  await page.goto("https://www.messenger.com/");

  console.log("👀 Watching for new messages...");

  let lastProcessedMessage = "";

  while (true) {
    try {
      // Wait for message rows to be present
      await page.waitForSelector('div[role="row"]');

      const rows = await page.locator('div[role="row"]').elementHandles();
      let mostRecentMessage = null;

      // Find the most recent non-sent message
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];

        // Skip sent messages
        const sentIndicator = await row.$(
          'div[class*="x78zum5"] span:has-text("You sent")'
        );
        if (sentIndicator) continue;

        // Get message text
        const textEl = await row.$(
          'div[class*="x78zum5"] span[dir="auto"] div[dir="auto"]'
        );
        const text = textEl ? (await textEl.textContent())?.trim() : null;

        if (text) {
          mostRecentMessage = text;
          break;
        }
      }

      // Process the most recent message if it's new
      if (mostRecentMessage && mostRecentMessage !== lastProcessedMessage) {
        let reply = defaultReply;

        // Check if message includes any of our triggers
        for (const [trigger, response] of Object.entries(responses)) {
          if (mostRecentMessage.toLowerCase().includes(trigger.toLowerCase())) {
            reply = response;
            break;
          }
        }

        console.log(`💬 [Bot] "${mostRecentMessage}" → "${reply}"`);

        const inputBox = await page.locator('[aria-label="Message"]');
        await inputBox.fill(reply);
        await inputBox.press("Enter");

        lastProcessedMessage = mostRecentMessage;
      }

      await page.waitForTimeout(5000); // Small delay between checks
    } catch (err) {
      console.error("⚠️ Error:", err.message);
      await page.waitForTimeout(5000);
    }
  }
})();
