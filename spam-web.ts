import { startBot } from "./web.ts";
import fs from "fs";
import path from "path";

const RESTART_INSTANCES = false; // New control variable
const NUM_CONCURRENT_INSTANCES = 5;
const INSTANCE_LIFETIME = 5 * 60 * 1000;
const DELAY_BETWEEN_INSTANCES = 60 * 1000; // Reduced to 2 seconds since we're using separate browsers
const MAX_RETRIES = 3;
const RETRY_DELAY = 60000;
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");

// Create directory for browser data if it doesn't exist
const BROWSER_DATA_DIR = "./browser-data";
if (!fs.existsSync(BROWSER_DATA_DIR)) {
  fs.mkdirSync(BROWSER_DATA_DIR);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class InstanceManager {
  private instances: Map<number, any>;
  private instanceCounter: number;

  constructor() {
    this.instances = new Map();
    this.instanceCounter = 0;
    this.setupDirectories();
  }

  setupDirectories() {
    // Ensure screenshots directory exists and is empty
    if (fs.existsSync(SCREENSHOTS_DIR)) {
      try {
        fs.rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
      } catch (error) {
        console.error("Failed to clean screenshots directory:", error);
      }
    }
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    // Setup browser data directory
    if (fs.existsSync(BROWSER_DATA_DIR)) {
      try {
        fs.rmSync(BROWSER_DATA_DIR, { recursive: true, force: true });
      } catch (error) {
        console.error("Failed to clean browser data directory:", error);
      }
    }
    fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
  }

  async startInstance(instanceIndex) {
    const instanceId = instanceIndex + 1;

    try {
      console.log(`Starting instance ${instanceId}`);

      const instanceDir = path.join(
        BROWSER_DATA_DIR,
        `instance-${instanceIndex}`
      );
      if (!fs.existsSync(instanceDir)) {
        fs.mkdirSync(instanceDir, { recursive: true });
      }

      // Only create timeout promise if RESTART_INSTANCES is true
      const timeoutPromise = RESTART_INSTANCES
        ? new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Instance ${instanceId} lifetime exceeded`));
            }, INSTANCE_LIFETIME);
          })
        : new Promise(() => {}); // Never resolves if RESTART_INSTANCES is false

      const botPromise = startBot(instanceIndex);

      this.instances.set(instanceId, {
        startTime: Date.now(),
        status: "running",
        retryCount: 0,
      });

      // Only race against timeout if RESTART_INSTANCES is true
      if (RESTART_INSTANCES) {
        await Promise.race([botPromise, timeoutPromise]);
      } else {
        await botPromise; // Just wait for the bot if no restarts
      }
    } catch (error) {
      console.error(`Instance ${instanceId} error:`, error.message);

      if (error.page) {
        await captureErrorState(
          error.page,
          "instance-startup-error",
          instanceId,
          error
        );
      }

      const instance = this.instances.get(instanceId);
      if (instance && instance.retryCount < MAX_RETRIES) {
        instance.retryCount++;
        instance.status = "retrying";
        console.log(
          `Retrying instance ${instanceId} (Attempt ${instance.retryCount}/${MAX_RETRIES})`
        );

        try {
          const instanceDir = path.join(
            BROWSER_DATA_DIR,
            `instance-${instanceIndex}`
          );
          if (fs.existsSync(instanceDir)) {
            fs.rmSync(instanceDir, { recursive: true, force: true });
          }
        } catch (cleanupError) {
          console.error(
            `Failed to cleanup instance ${instanceId} directory:`,
            cleanupError
          );
        }

        await delay(RETRY_DELAY);
        return this.startInstance(instanceIndex);
      }
    } finally {
      // Only cleanup and start new instance if RESTART_INSTANCES is true
      if (RESTART_INSTANCES) {
        this.instances.delete(instanceId);
        this.startNewInstanceIfNeeded();
      }
    }
  }

  async startNewInstanceIfNeeded() {
    if (this.instances.size < NUM_CONCURRENT_INSTANCES) {
      const nextIndex = this.instanceCounter++;
      this.startInstance(nextIndex);
      await delay(DELAY_BETWEEN_INSTANCES);
    }
  }

  async initialize() {
    console.log(
      `Starting initial batch of ${NUM_CONCURRENT_INSTANCES} instances...`
    );

    // Start instances with slight delays
    for (let i = 0; i < NUM_CONCURRENT_INSTANCES; i++) {
      this.startInstance(i);
      await delay(DELAY_BETWEEN_INSTANCES);
    }
  }

  async cleanup() {
    console.log("Cleaning up all instances...");

    // Remove all browser data directories
    try {
      if (fs.existsSync(BROWSER_DATA_DIR)) {
        fs.rmSync(BROWSER_DATA_DIR, { recursive: true, force: true });
      }
    } catch (error) {
      console.error("Failed to cleanup browser data:", error);
    }
  }
}

const manager = new InstanceManager();

// Handle cleanup on exit
async function handleExit() {
  console.log("Shutting down...");
  await manager.cleanup();
  process.exit();
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);

// Start the manager
manager.initialize().catch((error) => {
  console.error("Error initializing instance manager:", error);
  handleExit();
});

async function captureErrorState(
  page: any,
  prefix: string,
  instanceId: number,
  error: Error
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotFile = path.join(
    SCREENSHOTS_DIR,
    `instance-${instanceId}-${prefix}-${timestamp}.png`
  );
  await page.screenshot({ path: screenshotFile, fullPage: true });
}
