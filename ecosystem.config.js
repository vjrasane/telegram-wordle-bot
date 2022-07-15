module.exports = {
  apps : [{
    name   : "telegram-wordle-bot",
    script : "yarn",
    args: "start",
    env: {
      NODE_ENV: "production",
      CACHE_DIR: "/tmp/cache",
      LOG_LEVEL: "info",
      TMP_DIR: "/tmp",
      WORDLE_GAME_COOLDOWN_HOURS: 0,
      WORDLE_TURN_COOLDOWN_MINUTES: 15,
      WORDLE_SHORTHAND: "true"
   },
  }]
}
