import TelegramBot from 'node-telegram-bot-api';
import { Logger } from 'winston';
import { Config } from "./config";
import Cache from "./cache";
import { Game } from './game';
import createHandler from './handler';

/**
 * Starts the bot with given config and token, initializing
 * submodules.
 *
 * @see https://github.com/yagop/node-telegram-bot-api
 *
 * @param {string} token
 * @param {TelegramBot.ConstructorOptions} config
 *
 * @returns {Bot}
 */
export default async (
  config: Config,
  cache: Cache<Record<number, Game>>,
  logger: Logger
): Promise<TelegramBot> => {
  const bot = new TelegramBot(config.apiToken, { polling: true });

  bot.on('polling_error', error => {
    logger.error(`Polling error: ${error.message}: ${error.stack}`);
  });

  logger.info('Bot started');

  const handler = createHandler(bot, cache, config, logger);

  bot.onText(/\/echo (.+)/, async (msg, match) => {
    const { chat, from } = msg;
    const [, resp] = match ?? [];
    const user = from?.username ?? 'unknown';
    const id = from?.id ?? NaN;

    logger.debug(`Echo message from ${user} (${id}) received: "${resp}"`);
    bot.sendMessage(chat.id, resp);
  });

  bot.onText(/\/wordle (.+)/, async (msg, match) => {
    return handler(msg, match);
  });

  bot.onText(/\/w (.+)/, async (msg, match) => {
    if (msg.chat.type !== "private" 
      && !config.game.shorthand) return;
    return handler(msg, match);
  });

  return bot;
};
