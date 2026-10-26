// Run a background job now and then every few minutes.
// Jobs decide themselves whether there's anything to do (e.g. "already posted
// today?"), so they never drift, survive restarts and handle daylight saving.

/**
 * @param {string} name   Shown in error logs, e.g. 'Birthdays'
 * @param {number} minutes How often to run
 * @param {Function} job  May be async; errors are logged, never crash the bot
 */
function runEvery(name, minutes, job) {
  const run = async () => {
    try {
      await job();
    } catch (e) {
      console.error(`[${name}] Job failed:`, e);
    }
  };
  run();
  return setInterval(run, minutes * 60 * 1000);
}

module.exports = { runEvery };
