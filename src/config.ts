import { string, oneOf, maybe, optional, DecoderType } from 'decoders';
import { Maybe } from 'nomads/maybe';

const Mode = oneOf(['development', 'production', 'test'])

type Mode = DecoderType<typeof Mode>;

const LogLevel = oneOf(['none' , 'silly' , 'debug' , 'verbose' , 'http' , 'info' , 'warn' , 'error']);

export type LogLevel = DecoderType<typeof LogLevel>

const getModeLogLevel = (mode: Mode): LogLevel => {
  switch(mode) {
  case 'development':
    return 'debug';
  case 'production':
    return 'info';
  case 'test':
    return 'none';
  }
};

const stringToNumber = string.transform(s => parseInt(s))
const stringToBoolean = string.transform(s => s === "true");

const getConfig = (env: NodeJS.Dict<string>) => {
  const mode = maybe(Mode, "development").verify(env.NODE_ENV);
  return {
    mode,
    apiToken: string.verify(env.TELEGRAM_API_TOKEN),
    cacheDir: optional(string).transform(Maybe.fromOptional).verify(env.CACHE_DIR),
    tmpDir: maybe(string, '/tmp').verify(env.TMP_DIR),
    logLevel: maybe(LogLevel, getModeLogLevel(mode)).verify(env.LOG_LEVEL),
    game: {
      turnCooldownMilliseconds: maybe(stringToNumber, 0)
        .transform(n => n * 60 * 1000)
        .verify(env.WORDLE_TURN_COOLDOWN_MINUTES),
      gameCooldownMilliseconds: maybe(stringToNumber, 0)
        .transform(n => n * 60 * 60 * 1000)
        .verify(env.WORDLE_GAME_COOLDOWN_HOURS),
      shorthand: maybe(stringToBoolean, false).verify(env.WORDLE_SHORTHAND)
    }
  }
}

export type Config = ReturnType<typeof getConfig>

export default getConfig;
