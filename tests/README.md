# Tests

## `npm test`

Runs `smoke.js`, which:
- runs **every subcommand of every command** with fake input (as an admin, so
  admin paths are tested too),
- starts all background jobs once,
- sends a fake message through the message handler.

It reports anything that crashes, like a typo in a variable name or a missing
import. These are mistakes that otherwise only show up as "Error executing
this command" in Discord.

```
✅ All 118 subcommands, events and background jobs ran without errors.
```

It uses its own temporary data folder (`NESTBOT_DATA_DIR`) and never talks to
Discord or Gemini, so it's safe to run anywhere, even on the server next to
the running bot.

**What it doesn't check:** whether the replies are *correct* (right amount of
coins, right text). It only checks that nothing crashes. Test new features in
Discord too.

Run it before every push.

## Scenario tests

`tests/scenarios/` plays whole features through with a small fake Discord
(`fakes.js`: one server, channels, members, roles; data in a temporary
folder, never the real `nestbot.json`). `npm test` runs them after the smoke
test via `run.js`.

- `holidays.test.js`: Christmas (advent calendar, vouchers, snowballs, the
  tree, Secret Santa from sign-up to reveal), New Year, Easter (egg hunt,
  Bunny Girl outfit, bunny party, painting) using the holiday test mode

- `birthdays.test.js`: typed dates, the list, the daily card, 🎉 wishes,
  coins, the birthday role and the reminder
- `suggestions.test.js`: ideas, 👍/👎 votes, admin status, DM to the author

- `reminders.test.js`: DMs only for unfinished puzzle / NestWord / daily coins, once a day

New features should get a `*.test.js` here too.
