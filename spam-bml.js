import { startBot } from "./bml-bot.js";

const NUM_CONCURRENT_INSTANCES = 100;
const INSTANCE_LIFETIME = 100 * 60 * 1000;
const DELAY_BETWEEN_INSTANCES = 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 60000;

class InstanceManager {
  constructor() {
    this.runningInstances = new Set();
    this.instanceCounter = 0;
    this.failedAttempts = new Map();
  }

  async startInstanceWithRetry(retryCount = 0) {
    const instanceId = ++this.instanceCounter;

    try {
      console.log(
        `Starting bot instance ${instanceId} (Attempt ${
          retryCount + 1
        }/${MAX_RETRIES})`
      );
      this.runningInstances.add(instanceId);

      // Add cooldown if this instance has failed before
      const failCount = this.failedAttempts.get(instanceId) || 0;
      if (failCount > 0) {
        const cooldownTime = failCount * RETRY_DELAY;
        console.log(
          `Cooling down instance ${instanceId} for ${
            cooldownTime / 1000
          } seconds...`
        );
        await delay(cooldownTime);
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Instance lifetime exceeded"));
        }, INSTANCE_LIFETIME);
      });

      await Promise.race([startBot(instanceId - 1), timeoutPromise]);

      // Reset failed attempts on success
      this.failedAttempts.delete(instanceId);
    } catch (error) {
      console.error(`Error in bot instance ${instanceId}:`, error);

      // Increment failed attempts
      const failCount = (this.failedAttempts.get(instanceId) || 0) + 1;
      this.failedAttempts.set(instanceId, failCount);

      if (retryCount < MAX_RETRIES - 1) {
        const retryDelay = RETRY_DELAY * (retryCount + 1);
        console.log(
          `Retrying instance ${instanceId} in ${retryDelay / 1000} seconds...`
        );
        await delay(retryDelay);
        return this.startInstanceWithRetry(retryCount + 1);
      }
    } finally {
      this.runningInstances.delete(instanceId);
      await delay(DELAY_BETWEEN_INSTANCES);
      this.scheduleNewInstance();
    }
  }

  async scheduleNewInstance() {
    if (this.runningInstances.size < NUM_CONCURRENT_INSTANCES) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_INSTANCES)
      );
      this.startInstanceWithRetry();
    }
  }

  async initialize() {
    console.log(
      `Starting initial batch of ${NUM_CONCURRENT_INSTANCES} instances...`
    );
    for (let i = 0; i < NUM_CONCURRENT_INSTANCES; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, i * DELAY_BETWEEN_INSTANCES)
      );
      this.startInstanceWithRetry();
    }
  }
}

const manager = new InstanceManager();
manager.initialize().catch((error) => {
  console.error("Error initializing instance manager:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  process.exit();
});
