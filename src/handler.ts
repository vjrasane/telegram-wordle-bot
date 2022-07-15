import TelegramBot from "node-telegram-bot-api";
import { Config } from './config';
import Cache from './cache';
import playGame, { Game, Success, Failure } from "./game";
import { Logger } from "winston";
import { join } from "path";
import { execSync } from "child_process";
import { toUpper } from "lodash/fp";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { rmSync } from "fs";


const renderGame = async (chat: TelegramBot.Chat, game: Game, config: Config): Promise<string> => {
    const output = join(config.tmpDir, `wordle-output-image-${chat.id}.png`);
    execSync([
      'letters-in-squares',
      'wordle', '--word', game.word,
      ...game.guesses.flatMap(
        (g) => ['--guess', g.word],
      ),
      '--size', 100,
      '--gap', 10,
      '--padding', 10,
      '--format', 'png',
      '--output', output
    ].join(' '));
	return output;
};

const displayGame = async (bot: TelegramBot, chat: TelegramBot.Chat, game: Game, config: Config, logger: Logger): Promise<unknown> => {
	try {
		const output = await renderGame(chat, game, config);
		logger.debug(`Rendered wordle output image: '${output}'`);
		await bot.sendSticker(chat.id, output, {}, { contentType: "application/octet-stream" });
		rmSync(output);
	} catch (err) {
		logger.warn(`Could not render wordle output image: ${(err as Error).message}`);
    	return bot.sendMessage(chat.id, "Something went wrong!");
	}
}

const handleSuccess = async (
	bot: TelegramBot,
	chat: TelegramBot.Chat,
	config: Config,
	logger: Logger,
	result: Success
): Promise<unknown> => {
	const { game } = result;
	switch(result.tag) {
		case "start": {
			await bot.sendMessage(chat.id, "New game started!");
			return displayGame(bot, chat, game, config, logger);
		}
		case "end": {
			await displayGame(bot, chat, game, config, logger);
			return bot.sendMessage(chat.id, 
				result.success 
					? "You guessed the word!"	
					: `Game over! The word was: ${toUpper(game.word)}`
			)
		}
		case "continue":
			return displayGame(bot, chat, game, config, logger);
	}
}

const handleFailure = (
	bot: TelegramBot,
	chat: TelegramBot.Chat,
	result: Failure
) => {
	switch(result.tag) {
		case "game cooldown":
			return bot.sendMessage(chat.id, `You need to wait ${formatDistanceToNow(Date.now() + result.milliseconds)}!`)
		case "turn cooldown":
			return bot.sendMessage(chat.id, `You need to wait ${formatDistanceToNow(Date.now() + result.milliseconds)} for your turn!`)
		case "invalid word":
			return bot.sendMessage(chat.id, "That's not a word!")
	}
}

export default (
	bot: TelegramBot,
	cache: Cache<Record<number, Game>>,
	config: Config,
	logger: Logger) => async (msg: TelegramBot.Message, match: RegExpMatchArray | null): Promise<unknown> => {
	const { chat, from } = msg;
	const [, arg] = match ?? [];
	const user = from?.username ?? 'unknown';
	const id = from?.id ?? NaN;
	const word = arg.toLowerCase();
    logger.debug(`Wordle guess from ${user} (${id}) received: "${word}"`);
    if (!from?.id) return;
	
    const cached = cache.get(chat.id);
	const result = playGame({ word, userId: from?.id, timestamp: Date.now() }, cached, config.game);

	switch(result.tag) {
		case "ok":
			cache.set(chat.id, result.value.game);
			return handleSuccess(bot, chat, config, logger, result.value);
		case "err":
			return handleFailure(bot, chat, result.error);
	}
}