
import { exec } from 'child_process';
import { maybe, number, string } from 'decoders';
import { sample, reverse, toUpper } from 'lodash/fp';
import TelegramBot from 'node-telegram-bot-api';
import { Maybe } from 'nomads/maybe';
import { Task } from 'nomads/task';
import { Tuple } from 'nomads/tuple';
import { join } from 'path';
import guesses from '../assets/guesses.json';
import words from '../assets/words.json';
import Cache from './cache';
import { formatDistanceToNow } from 'date-fns';
import { Return, Response, StickerResponse, TextResponse, append, prepend, _return } from './response';
import { promisify } from 'util';
import Result, { Err, Ok } from 'nomads/result';
import { Logger } from 'winston';
import { Config } from './config';

const MAX_GUESSES = 6;

const GAME_COOLDOWN_MILLIS = maybe(
  string.transform(str => parseInt(str, 10))
    .then(number.decode)
    .describe('Missing or invalid env variable WORDLE_GAME_COOLDOWN_HOURS'),
  0)
  .transform((hours) => hours * 60 * 60 * 1000)
  .verify(process.env.WORDLE_GAME_COOLDOWN_HOURS);
  
const TURN_COOLDOWN_MILLIS = maybe(
  string.transform(str => parseInt(str, 10))
    .then(number.decode)
    .describe('Missing or invalid env variable GAME_TURN_COOLDOWN_HOURS'),
  0)
  .transform((minutes) => minutes * 60 * 1000)
  .verify(process.env.WORDLE_TURN_COOLDOWN_MINUTES);

export type Guess = {
  word: string,
  userId: number,
  timestamp: number,
}

export type Game = {
	word: string,
	guesses: Array<Guess>
}

export type CharState = {
	char: string,
	state: 'correct' | 'almost' | 'wrong'
}

const countWordChars = (c: string, word: string): number => {
  return word.split('').filter(w => w === c).length;
};

const countCorrectChars = (c: string, word: string, guess: string): number => {
  return word.split('').filter((w, i) => w === c && guess.charAt(i) === c).length;
}; 

const countStateChars = (c: string, word: Array<CharState>): number => {
  return word.filter(s => s.state === 'almost' && s.char === c).length;
};

export const getGuessState = (guess: string, word: string): Array<CharState> => {
  return guess.split('').reduce(
    (acc: Array<CharState>, char, i) => {
      if (word.charAt(i) === char) 
        return [...acc, { char, state: 'correct' }];
      if (countCorrectChars(char, word, guess) + countStateChars(char, acc) <
         countWordChars(char, word)) 
        return [...acc, { char, state: 'almost'}];
      return [...acc, { char, state: 'wrong' }];
    }, []
  );
};

const formatCharacter = ({ char, state}: CharState): string => {
  switch(state) {
  case 'correct':
    return `[${char}]`;
  case 'almost':
    return  `(${char})`;
  default:
    return  ` ${char} `;
  }
};

// const gameCache = new Cache<Record<number, Game>>('wordle-games', );

const isOver = (game: Game): boolean => {
  if (game.guesses.length >= MAX_GUESSES) return true;
  return Maybe.last(game.guesses).filter(
    (guess) => guess.word === game.word
  ).tag === 'just';
};

const renderGame = async (chat: TelegramBot.Chat, game: Game, config: Config): Promise<string> => {
  const output = join(config.tmpDir, `wordle-output-image-${chat.id}.png`);
  await promisify(exec)([
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

const displayGame = (
    bot: TelegramBot, 
    chat: TelegramBot.Chat, 
    game: Game, 
    logger: Logger,
    config: Config,
  ): Response => 
  Task(
    (): Promise<Result<unknown, string>> => renderGame(chat, game, config).then(Ok).catch(Err)
  ).chain(
    (result) => {
      switch(result.tag) {
      case 'ok':
        return StickerResponse(bot, chat, result.value, {}, { contentType: 'application/octet-stream' });
      default: {
        logger.warn(`Could not render wordle output image: ${result.error}`);
        const text = game.guesses.map(
          (g) => '`' + getGuessState(g.word, game.word).map(formatCharacter).join('') + '`'
        ).join('\n');
        return TextResponse(bot, chat, text,  { parse_mode: 'MarkdownV2'});
      }}
    }
  );


const isValidGuess = (word: string): boolean => {
  if (word.length !== 5) return false;
  if (words.includes(word)) return true;
  if (guesses.includes(word)) return true;
  return false;
};

const getTurnCooldown = (userId: number, chat: TelegramBot.Chat, game: Game): number => {
  if (chat.type === 'private') return 0;
  return Maybe.find(
    (g) => g.userId === userId,
    game.guesses.reverse()
  )
    .map((g) => Date.now() - g.timestamp)
    .map((elapsed) => TURN_COOLDOWN_MILLIS - elapsed)
    .getOrElse(0);
};

const getGameCooldown = (chat: TelegramBot.Chat, game: Game): number => {
  if (chat.type === 'private') return 0;
  return Maybe.last(game.guesses)
    .map((guess) => Date.now() - guess.timestamp)
    .map((elapsed) => GAME_COOLDOWN_MILLIS - elapsed)
    .getOrElse(GAME_COOLDOWN_MILLIS);
};

const makeGuess = (
  bot: TelegramBot, chat: TelegramBot.Chat, game: Game, guess: Guess, logger: Logger, config: Config
): Return<Game> => {
  const guesses: Array<Guess> = [...game.guesses, guess];
  const guessed: Game = { ...game, guesses };
  const ret: Return<Game> = Tuple(guessed, displayGame(bot, chat, guessed, logger, config));
  if (guess.word === game.word) {
    return append(TextResponse(bot, chat, 'You guessed the word!'), ret);
  } else if(guesses.length >= MAX_GUESSES) {
    return append(TextResponse(bot, chat, `Game over! The word was: ${toUpper(game.word)}`), ret);
  } else {
    return ret;
  }
};

const startGame = (bot: TelegramBot, chat: TelegramBot.Chat): Return<Game> => Tuple(
  { word: sample(words) as string, guesses: [] },
  TextResponse(bot, chat, 'New game started!')
);

const playGame = (
  bot: TelegramBot, chat: TelegramBot.Chat, cached: Maybe<Game>, guess: Guess, logger: Logger, config: Config
): Return<Game> => {
  const ret: Return<Game> = cached.fold({ just: _return, nothing: () => startGame(bot, chat) });
  const turnCooldown = getTurnCooldown(guess.userId, chat, ret.first);
  if (turnCooldown > 0)
    return append(TextResponse(bot, chat, `You need to wait ${formatDistanceToNow(Date.now() + turnCooldown)} for your turn!`), ret);
  if (!isValidGuess(guess.word))
    return append(TextResponse(bot, chat, 'That\'s not a word!'), ret);
  if (!isOver(ret.first))
    return ret
      .mapFirst(game => makeGuess(bot, chat, game, guess, logger, config))
      .fold((ret, res) => prepend(res, ret));
  const gameCooldown = getGameCooldown(chat, ret.first);
  if (gameCooldown > 0)
    return append(TextResponse(bot, chat, `You need to wait ${formatDistanceToNow(Date.now() + gameCooldown)}!`), ret);
  return startGame(bot, chat)
    .mapFirst(game => makeGuess(bot, chat, game, guess, logger, config))
    .fold((ret, res) => prepend(res, ret));
};

export default (
  bot: TelegramBot, 
  cache: Cache<Record<number, Game>>,
  config: Config,
  logger: Logger) => {
  bot.onText(/\/wordle (.+)/, async (msg, match) => {
    const { chat, from } = msg;
    const [, arg] = match ?? [];
    const user = from?.username ?? 'unknown';
    const id = from?.id ?? NaN;

    const word = arg.toLowerCase();
    logger.debug(`Wordle guess from ${user} (${id}) received: "${word}"`);
    if (!from?.id) return;

    const cached = cache.get(chat.id);
    const [game, respond] = playGame(
      bot, chat, cached, { word, userId: from?.id, timestamp: Date.now() }, logger, config
    ).toArray();
    if (cached.map(c => c !== game).getOrElse(true)) 
      cache.set(chat.id, game);
    return respond.fork();
  });
};

