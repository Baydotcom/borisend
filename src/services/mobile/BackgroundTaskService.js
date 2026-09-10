/**
 * BackgroundTaskService — Background Execution Abstraction
 *
 * Manages background tasks for scheduled message generation and delivery.
 *
 * Sprint 8: Implemented foreground fallback using setInterval.
 * Native background execution (WorkManager/BGTaskScheduler) requires
 * platform-specific Capacitor plugins not yet installed.
 *
 * PLATFORM SUPPORT:
 *   Android: WorkManager / JobScheduler (via Capacitor plugin — future)
 *   iOS:     BackgroundTasks framework (limited — future)
 *   Web/PWA: setInterval-based polling (current implementation)
 *
 * TASKS REGISTERED:
 *   message_check     — Poll for pending/due messages
 *   notification_refresh — Refresh notification center
 *   retry_queue       — Process failed send retries
 *   connectivity_restore — Re-sync on network restored
 */

import PlatformService from "./PlatformService";

const _registeredTasks = new Map();
const _activeIntervals = new Map();

// Default polling interval (30 seconds — short enough for responsiveness,
// long enough to avoid battery drain)
const POLL_INTERVAL_MS = 30000;

const TASK_CONFIGS = {
  message_check: {
    label: "Message Check",
    interval: POLL_INTERVAL_MS,
  },
  notification_refresh: {
    label: "Notification Refresh",
    interval: POLL_INTERVAL_MS,
  },
  retry_queue: {
    label: "Retry Queue",
    interval: 60000, // 1 minute
  },
  connectivity_restore: {
    label: "Connectivity Restore",
    interval: null, // Event-driven, not polled
  },
};

const BackgroundTaskService = {
  _initialized: false,

  /**
   * Check if background tasks are supported on this platform.
   * Web/PWA: true (via setInterval fallback)
   * Native: true (via setInterval until native plugin is added)
   */
  isSupported() {
    return true;
  },

  /**
   * Check if native background execution is available.
   * This requires platform-specific Capacitor plugins.
   */
  isNativeBackgroundAvailable() {
    return false; // Will be true when native plugin is installed
  },

  /**
   * Register a background task.
   *
   * @param {string} name — unique task identifier (e.g. 'message_check')
   * @param {Function} callback — function to execute when task runs
   * @param {object} options — { interval?: number } custom interval override
   * @returns {Promise<boolean>} — true if registered successfully
   */
  async registerTask(name, callback, options = {}) {
    if (!this.isSupported()) {
      console.info(`[BackgroundTask] "${name}" not registered — not supported on ${PlatformService.getPlatform()}`);
      return false;
    }

    const config = TASK_CONFIGS[name] || { interval: POLL_INTERVAL_MS };
    const interval = options.interval || config.interval;

    _registeredTasks.set(name, { callback, interval, config });

    // If task has an interval, start polling
    if (interval && !_activeIntervals.has(name)) {
      const timer = setInterval(() => {
        try {
          callback();
        } catch (err) {
          console.error(`[BackgroundTask] "${name}" execution error:`, err);
        }
      }, interval);
      _activeIntervals.set(name, timer);
      console.info(`[BackgroundTask] "${name}" registered with ${interval}ms interval`);
    } else if (!interval) {
      console.info(`[BackgroundTask] "${name}" registered (event-driven)`);
    }

    return true;
  },

  /**
   * Schedule a one-time background task after a delay.
   * Uses setTimeout as a foreground fallback.
   *
   * @param {string} name — task identifier
   * @param {number} delayMs — delay in milliseconds
   */
  async schedule(name, delayMs) {
    if (!this.isSupported()) return false;

    const task = _registeredTasks.get(name);
    if (!task) {
      console.warn(`[BackgroundTask] Cannot schedule unknown task "${name}"`);
      return false;
    }

    setTimeout(() => {
      try {
        task.callback();
      } catch (err) {
        console.error(`[BackgroundTask] "${name}" scheduled execution error:`, err);
      }
    }, delayMs);

    console.info(`[BackgroundTask] "${name}" scheduled for +${delayMs}ms`);
    return true;
  },

  /**
   * Execute a task immediately (manual trigger).
   * @param {string} name — task identifier
   */
  async runNow(name) {
    const task = _registeredTasks.get(name);
    if (!task) return false;

    try {
      await task.callback();
      return true;
    } catch (err) {
      console.error(`[BackgroundTask] "${name}" manual run error:`, err);
      return false;
    }
  },

  /**
   * Unregister a background task.
   */
  async unregister(name) {
    const timer = _activeIntervals.get(name);
    if (timer) {
      clearInterval(timer);
      _activeIntervals.delete(name);
    }
    _registeredTasks.delete(name);
    console.info(`[BackgroundTask] "${name}" unregistered`);
    return true;
  },

  /**
   * Unregister all background tasks.
   */
  unregisterAll() {
    _activeIntervals.forEach((timer) => clearInterval(timer));
    _activeIntervals.clear();
    _registeredTasks.clear();
  },

  /**
   * Get list of registered task names.
   */
  getRegisteredTasks() {
    return Array.from(_registeredTasks.keys());
  },

  /**
   * Get task configuration by name.
   */
  getTaskConfig(name) {
    return TASK_CONFIGS[name] || null;
  },
};

export default BackgroundTaskService;