import axios from "axios";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_DATA_DIR = "./browser-data";
const SCREENSHOTS_DIR = "./screenshots";

// Create necessary directories if they don't exist
if (!fs.existsSync(BROWSER_DATA_DIR)) {
  fs.mkdirSync(BROWSER_DATA_DIR);
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

function generateCredentials(instanceIndex) {
  // Generate phone number starting with +9607 or +9609
  const prefix = Math.random() < 0.5 ? "+9607" : "+9609";
  const remainingDigits = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  const phoneNumber = `${prefix}${remainingDigits}`;

  const randomname = Math.random()
    .toString(36)
    .replace(/[0-9]/g, "")
    .substring(2, 10);

  // Generate ID in format A[1-3]xxxxx (5 digits after the number)
  const idFirstDigit = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
  const remainingIdDigits = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  const idCard = `A${idFirstDigit}${remainingIdDigits}`;

  return {
    phoneNumber: phoneNumber,
    name: randomname,
    idCard: idCard,
    instanceId: instanceIndex + 1,
  };
}

const defaultReply = "Give me back my money.";

// Configuration constants
const CONFIG = {
  targetUrl: "https://www.bankofmaldives.com.mv",
  flareSolverUrl: "http://localhost:8191/v1",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  delays: {
    pageLoad: 120000,
    challenge: 60000,
    retry: 5000,
  },
  browserOptions: {
    headless: true,
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
    timeout: 120000,
    protocolTimeout: 120000,
    args: [
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--start-maximized",
      "--disable-extensions",
      "--no-zygote",
      "--single-process",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-infobars",
      "--disable-notifications",
    ],
    pipe: true,
  },
};

// Add this function to handle directory cleanup before launch
async function cleanupInstanceDirectory(instanceIndex) {
  const instanceDir = path.join(BROWSER_DATA_DIR, `instance-${instanceIndex}`);
  const lockFile = path.join(instanceDir, "SingletonLock");

  try {
    // Create instance directory if it doesn't exist
    if (!fs.existsSync(instanceDir)) {
      fs.mkdirSync(instanceDir, { recursive: true });
    }

    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.log(`Removed lock file for instance ${instanceIndex}`);
    }

    // Also remove any other lock files that might cause issues
    const lockFiles = [
      "SingletonLock",
      "SingletonCookie",
      "SingletonSocket",
      ".com.google.Chrome.*.lock",
    ];

    for (const pattern of lockFiles) {
      const files = fs.readdirSync(instanceDir).filter((f) => f.match(pattern));
      for (const file of files) {
        const filePath = path.join(instanceDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(
            `Removed lock file ${file} for instance ${instanceIndex}`
          );
        }
      }
    }
  } catch (error) {
    console.log(
      `Failed to cleanup lock files for instance ${instanceIndex}:`,
      error.message
    );
  }
}

async function launchBrowserWithRetry(instanceIndex, retryCount = 0) {
  const MAX_BROWSER_RETRIES = 3;
  const debugPort = 9222 + instanceIndex;
  const instanceDir = path.join(BROWSER_DATA_DIR, `instance-${instanceIndex}`);

  try {
    // Clean up any existing lock files
    await cleanupInstanceDirectory(instanceIndex);

    // Ensure instance directory exists
    if (!fs.existsSync(instanceDir)) {
      fs.mkdirSync(instanceDir, { recursive: true });
    }

    const browserOptions = {
      ...CONFIG.browserOptions,
      args: [
        ...CONFIG.browserOptions.args,
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${instanceDir}`,
        `--disk-cache-dir=${path.join(instanceDir, "cache")}`,
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-restore-session-state",
        "--disable-session-crashed-bubble",
        "--disable-infobars",
        "--disable-notifications",
        "--disable-features=TranslateUI",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--metrics-recording-only",
        "--disable-default-apps",
        "--mute-audio",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        `--user-agent=${CONFIG.userAgent}`,
      ],
      pipe: true,
    };

    console.log(
      `Instance ${instanceIndex + 1}: Attempting to launch browser (Attempt ${
        retryCount + 1
      }/${MAX_BROWSER_RETRIES})`
    );

    return await puppeteer.launch(browserOptions);
  } catch (error) {
    console.error(`Launch error for instance ${instanceIndex}:`, error.message);
    if (retryCount < MAX_BROWSER_RETRIES - 1) {
      console.log(
        `Instance ${
          instanceIndex + 1
        }: Browser launch failed, retrying in 5 seconds...`
      );
      await delay(5000);
      return launchBrowserWithRetry(instanceIndex, retryCount + 1);
    }
    throw error;
  }
}

async function takeErrorScreenshot(page, prefix) {
  try {
    // Check if page is still valid
    if (!page || page.isClosed()) {
      console.log(
        `Cannot take screenshot: page is ${page ? "closed" : "undefined"}`
      );
      return false;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = path.join(SCREENSHOTS_DIR, `${prefix}-${timestamp}.png`);

    // Try to take screenshot
    try {
      await page.screenshot({
        path: filename,
        fullPage: true,
      });

      // Verify the file was actually created and has content
      if (fs.existsSync(filename) && fs.statSync(filename).size > 0) {
        console.log(`Screenshot successfully saved: ${filename}`);
        return true;
      } else {
        console.log(`Screenshot file empty or not created: ${filename}`);
        return false;
      }
    } catch (screenshotError) {
      console.log(
        `Screenshot capture failed (${prefix}): ${screenshotError.message}`
      );

      // Try a fallback screenshot method if the page is still valid
      try {
        if (!page.isClosed()) {
          const fallbackFilename = path.join(
            SCREENSHOTS_DIR,
            `fallback-${prefix}-${timestamp}.png`
          );
          await page
            .evaluate(() => {
              return new Promise((resolve) => {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                context.fillStyle = "white";
                context.fillRect(0, 0, canvas.width, canvas.height);
                // Draw the page content
                const image = new Image();
                image.onload = () => {
                  context.drawImage(image, 0, 0);
                  resolve(canvas.toDataURL());
                };
                image.src =
                  "data:image/svg+xml," +
                  encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' +
                      document.documentElement.innerHTML +
                      "</div></foreignObject></svg>"
                  );
              });
            })
            .then((dataUrl) => {
              const base64Data = dataUrl.replace(
                /^data:image\/\w+;base64,/,
                ""
              );
              fs.writeFileSync(
                fallbackFilename,
                Buffer.from(base64Data, "base64")
              );
              console.log(`Fallback screenshot saved: ${fallbackFilename}`);
              return true;
            });
        }
      } catch (fallbackError) {
        console.log(`Fallback screenshot failed: ${fallbackError.message}`);
      }
      return false;
    }
  } catch (e) {
    console.error(`Failed to take screenshot (${prefix}):`, e.message);
    return false;
  }
}

async function getNewChatFrame(page, instanceId) {
  try {
    // Check if page is still valid
    if (!page || page.isClosed()) {
      console.log("Page is no longer valid");
      return null;
    }

    // Wait for network idle first
    try {
      await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
    } catch (e) {
      // Ignore network idle timeout
    }

    // Check if chat is minimized by looking for the chat button
    const isChatMinimized = await page.evaluate(() => {
      const chatButton = document.getElementById("ymDivBar");
      // Check if the button is visible
      return (
        chatButton &&
        window.getComputedStyle(chatButton).display !== "none" &&
        window.getComputedStyle(chatButton).visibility !== "hidden"
      );
    });

    if (isChatMinimized) {
      console.log("Chat appears to be minimized, attempting to reopen...");
      try {
        // Click the chat button to reopen
        await page.click("#ymDivBar");
        // Wait a moment for animation
        await delay(1000);
      } catch (error) {
        console.log("Failed to click chat button to reopen:", error.message);
        await takeErrorScreenshot(page, "reopen-click-failed");
        return null;
      }
    }

    // Wait for frame with better error handling
    try {
      const frameHandle = await page.waitForSelector('iframe[id*="ymIframe"]', {
        timeout: 30000,
        visible: true, // Make sure frame is visible
      });

      if (!frameHandle) {
        console.log("Frame handle is null, taking screenshot...");
        await takeErrorScreenshot(page, "frame-null");
        return null;
      }

      const frame = await frameHandle.contentFrame();

      // Verify frame is actually accessible and set up monitoring
      if (frame) {
        try {
          // Try to access something in the frame to verify it's working
          await frame.evaluate(() => {
            // Add event listeners to detect minimize/close actions
            document.addEventListener(
              "click",
              (e) => {
                if (
                  e.target.matches(
                    ".minimize-button, .close-button, .ym-minimize, .ym-close"
                  )
                ) {
                  console.log("Chat minimize/close button clicked");
                }
              },
              true
            );
            return document.body !== null;
          });

          // Set up a MutationObserver to watch for frame visibility changes
          await page.evaluate(() => {
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (
                  mutation.type === "attributes" &&
                  (mutation.attributeName === "style" ||
                    mutation.attributeName === "class")
                ) {
                  const frame = document.querySelector(
                    'iframe[id*="ymIframe"]'
                  );
                  if (
                    frame &&
                    (frame.style.display === "none" ||
                      frame.style.visibility === "hidden")
                  ) {
                    console.log("Chat frame was hidden");
                  }
                }
              });
            });

            const frame = document.querySelector('iframe[id*="ymIframe"]');
            if (frame) {
              observer.observe(frame, {
                attributes: true,
                attributeFilter: ["style", "class"],
              });
            }
          });

          return frame;
        } catch (error) {
          if (error.message.includes("detached")) {
            console.log("Frame was detached during verification");
            await takeErrorScreenshot(page, "frame-detached-during-verify");
            return null;
          }
          console.log("Frame verification failed, taking screenshot...");
          await takeErrorScreenshot(page, "frame-verification-failed");
          return null;
        }
      }

      console.log("Frame not accessible, taking screenshot...");
      await takeErrorScreenshot(page, "frame-not-accessible");
      return null;
    } catch (error) {
      if (error.message.includes("detached")) {
        console.log("Frame was detached while waiting");
        await takeErrorScreenshot(page, "frame-detached-while-waiting");
        return null;
      }
      console.log(`Frame wait failed: ${error.message}, taking screenshot...`);
      await takeErrorScreenshot(page, "frame-wait-failed");
      return null;
    }
  } catch (error) {
    console.log(`General frame error: ${error.message}`);
    await takeErrorScreenshot(page, "frame-general-error");
    return null;
  }
}

async function isPageValid(page) {
  try {
    if (!page || page.isClosed()) return false;
    await page.evaluate(() => document.readyState);
    return true;
  } catch (e) {
    return false;
  }
}

async function startChat(page, responses, instanceId) {
  try {
    console.log("Waiting for chat widget to load...");

    // Wait for initial widget load
    await page.waitForFunction(
      () => {
        return (
          typeof window.YellowMessengerPlugin !== "undefined" &&
          document.getElementById("ymDivBar") !== null
        );
      },
      { timeout: 30000 }
    );

    await delay(10000);

    // Pass page to getNewChatFrame
    let chatFrame = await getNewChatFrame(page, instanceId);
    console.log("Watching for messages...");
    let lastProcessedMessage = "";
    let frameErrorCount = 0;

    while (true) {
      try {
        // Check if frame is still valid
        if (!chatFrame) {
          console.log("Chat frame lost, attempting to recover...");

          // Verify page is still valid before attempting recovery
          if (await isPageValid(page)) {
            await takeErrorScreenshot(
              page,
              `frame-recovery-attempt-${frameErrorCount + 1}`
            );

            // Check if chat was minimized
            const isChatMinimized = await page.evaluate(() => {
              const chatButton = document.getElementById("ymDivBar");
              return (
                chatButton &&
                window.getComputedStyle(chatButton).display !== "none" &&
                window.getComputedStyle(chatButton).visibility !== "hidden"
              );
            });

            if (isChatMinimized) {
              console.log("Chat was minimized, attempting to restore...");
              // Add a delay before clicking to restore
              await delay(2000);
            }

            chatFrame = await getNewChatFrame(page, instanceId);

            if (!chatFrame) {
              frameErrorCount++;
              console.log(`Frame recovery attempt ${frameErrorCount}/3 failed`);
              if (frameErrorCount > 3) {
                const screenshotTaken = await takeErrorScreenshot(
                  page,
                  "frame-recovery-final-failure"
                );
                if (!screenshotTaken) {
                  console.log(
                    "Could not take final failure screenshot - page may be invalid"
                  );
                }
                throw new Error(
                  "Failed to recover chat frame after 3 attempts"
                );
              }
              // Progressive delay between attempts
              await delay(2000 + 3000 * frameErrorCount);
              continue;
            }
            frameErrorCount = 0;
            console.log("Successfully recovered chat frame");
          } else {
            console.log("Page is no longer valid during recovery attempt");
            throw new Error("Page became invalid during recovery");
          }
        }

        // Try to find messages
        const messages = await chatFrame
          .evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".chat-message"));
            return rows
              .filter((row) => row.classList.contains("from-them"))
              .map((row) => ({
                text: row.innerText.trim(),
                isBot: row.classList.contains("from-them"),
              }))
              .reverse();
          })
          .catch(async (error) => {
            if (error.message.includes("detached")) {
              chatFrame = null;
              return [];
            }
            throw error;
          });

        const mostRecentMessage = messages.find((m) => m.isBot)?.text;

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

          // Send message with proper timing and error handling
          await chatFrame
            .evaluate(async (text) => {
              const input = document.querySelector("input#ymMsgInput");
              if (input) {
                input.value = "";
                input.focus();
                input.value = text;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 500));

                const sendButton = document.querySelector(
                  'button[type="submit"], button.send-button, button[aria-label="Send"], button.ym-send-button'
                );
                if (sendButton) {
                  sendButton.click();
                }
              }
            }, reply)
            .catch(async (error) => {
              if (error.message.includes("detached")) {
                chatFrame = null;
                return;
              }
              throw error;
            });

          if (chatFrame) {
            // Only update if frame is still valid
            await delay(2000);
            lastProcessedMessage = mostRecentMessage;
          }
        }

        await delay(5000);
      } catch (err) {
        if (err.message.includes("timeout")) {
          continue;
        }
        if (err.message.includes("detached")) {
          chatFrame = null;
          continue;
        }
        console.error("⚠️ Error:", err.message);
        await delay(5000);
      }
    }
  } catch (error) {
    console.error("Error in chat interaction:", error);
    throw error;
  }
}

async function startBot(instanceIndex = 0) {
  const credentials = generateCredentials(instanceIndex);
  const instanceId = credentials.instanceId;
  console.log(`Starting bot ${instanceId} with:`, {
    phone: credentials.phoneNumber,
    name: credentials.name,
    id: credentials.idCard,
  });

  const responses = {
    "I'm Aaya": "Let me talk to a live agent",
    "Aaya here": "Let me talk to a live agent",
    "phone number": credentials.phoneNumber,
    "what should I call you?": credentials.name,
    "Can I have your ID Card": credentials.idCard,
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
    "Yaseen, hold on, our agents are bit busy now.You're in the queue and we'll get back to you in no time.":
      "Hurryyyyy and give me my money",
    Sunday: "I am not waiting for a Sunday, I need my money today",
    Tomorrow:
      "I am not waiting for a tomorrow that didn't come in 40 previous days, I need my money today",
    "We will not be able to provide you with any updates today":
      "I will not be able to provide you with any additional time for resolving this case. Give me my money today",
  };

  let browser;
  let page;

  try {
    browser = await launchBrowserWithRetry(instanceIndex);
    page = await browser.newPage();
    await page.setUserAgent(CONFIG.userAgent);

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      Connection: "keep-alive",
    });

    console.log("Loading website...");
    try {
      // First attempt with a basic timeout
      await Promise.race([
        page.goto(CONFIG.targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: CONFIG.delays.pageLoad,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Initial navigation timeout")),
            CONFIG.delays.pageLoad
          )
        ),
      ]);

      // Wait for the page to be actually usable
      await Promise.race([
        Promise.all([
          page.waitForFunction(() => document.readyState === "complete", {
            timeout: CONFIG.delays.pageLoad,
          }),
          page.waitForFunction(
            () => {
              const loader = document.querySelector("#loading");
              return !loader || loader.style.display === "none";
            },
            { timeout: CONFIG.delays.pageLoad }
          ),
        ]),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Page readiness timeout")),
            CONFIG.delays.pageLoad
          )
        ),
      ]);

      // Add a small delay to ensure dynamic content starts loading
      await delay(5000);
    } catch (error) {
      console.error("Navigation error:", error.message);
      // Take a screenshot for debugging if needed
      try {
        await page.screenshot({ path: `error-${Date.now()}.png` });
      } catch (e) {
        console.error("Failed to take error screenshot:", e.message);
      }
      throw error;
    }

    await delay(2000);

    const initialStatus = await page.evaluate(() => {
      const title = document.title;
      return {
        isCloudflare: title === "Just a moment...",
        isMainSite: title.includes("Bank of Maldives"),
        title: title,
      };
    });

    console.log("Initial page status:", initialStatus);

    if (initialStatus.isCloudflare) {
      console.log("Cloudflare challenge detected, using FlareSolverr...");
      try {
        const flareSolverResponse = await axios.post(CONFIG.flareSolverUrl, {
          cmd: "request.get",
          url: CONFIG.targetUrl,
          maxTimeout: 60000, // Reduced timeout to 60 seconds
        });

        if (flareSolverResponse.data.solution.cookies) {
          console.log("Applying FlareSolverr cookies...");
          for (const cookie of flareSolverResponse.data.solution.cookies) {
            await page.setCookie(cookie);
          }

          console.log("Reloading page with cookies...");
          await page.reload({
            waitUntil: "networkidle0",
            timeout: CONFIG.delays.pageLoad,
          });
        }
      } catch (error) {
        console.error("FlareSolverr error:", error.message);
        throw new Error("Failed to bypass Cloudflare");
      }
    }

    // Final check
    const finalStatus = await page.evaluate(() => {
      const title = document.title;
      return {
        isMainSite: title.includes("Bank of Maldives"),
        title: title,
      };
    });

    if (!finalStatus.isMainSite) {
      throw new Error(
        `Failed to reach main site. Current title: ${finalStatus.title}`
      );
    }

    console.log("Successfully reached main site");
    await startChat(page, responses, instanceId);

    return { browser, page };
  } catch (error) {
    console.error("Error:", error);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Handle cleanup
async function cleanup() {
  // Any cleanup code if needed
}

process.on("SIGINT", async () => {
  console.log("Cleaning up...");
  await cleanup();
  process.exit();
});

process.on("SIGTERM", async () => {
  console.log("Cleaning up...");
  await cleanup();
  process.exit();
});

export { startBot, cleanup };
