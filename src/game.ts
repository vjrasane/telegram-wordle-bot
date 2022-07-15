
import { findLast, sample } from 'lodash/fp';
import { Maybe } from 'nomads/maybe';
import guesses from '../assets/guesses.json';
import words from '../assets/words.json';
import Result, { Err, Ok } from 'nomads/result';
import { Config } from './config';

const MAX_GUESSES = 6;

type Guess = {
  word: string,
  userId: number,
  timestamp: number,
}

export type Game = {
	word: string,
	guesses: Array<Guess>
}

export type Failure = {
	tag: "invalid word"
} | {
	tag: "turn cooldown" | "game cooldown",
	milliseconds: number
}

export type Success = {
	readonly tag: "start" | "continue",
	readonly game: Game
} | {
	readonly tag: "end",
	readonly game: Game
	readonly success: boolean
}

const isValidGuess = (word: string): boolean => {
  if (word.length !== 5) return false;
  if (words.includes(word)) return true;
  if (guesses.includes(word)) return true;
  return false;
};

const getTurnCooldown = (game: Game, userId: number, config: Config["game"]): number => {
	return Maybe.fromOptional(
	findLast(
		(g) => g.userId === userId,
		game.guesses
	))
	  .map((g) => Date.now() - g.timestamp)
	  .map((elapsed) => config.turnCooldownMilliseconds - elapsed)
	  .getOrElse(0);
  };

const getGameCooldown = (game: Game, config: Config["game"]): number => {
  return Maybe.last(game.guesses)
    .map((guess) => Date.now() - guess.timestamp)
    .map((elapsed) => config.gameCooldownMilliseconds - elapsed)
    .getOrElse(config.gameCooldownMilliseconds);
};

const isOver = (game: Game): boolean => {
  if (game.guesses.length >= MAX_GUESSES) return true;
  return Maybe.last(game.guesses).filter(
    (guess) => guess.word === game.word
  ).tag === 'just';
};

const makeGuess = (game: Game, guess: Guess): Success  => {
	const guesses = [...game.guesses, guess];
	const guessed = { ...game, guesses };
	if (guess.word === game.word) {
	  return { tag: "end", game: guessed , success: true };
	} else if(guesses.length >= MAX_GUESSES) {
		return { tag: "end", game: guessed, success: false };
	}
	return { tag: "continue", game: guessed };
  };

const startGame = (guess: Guess): Game => {
	return { word: sample(words) as string, guesses: [guess] };
}

export default (guess: Guess, cached: Maybe<Game>, config: Config["game"]): Result<Failure, Success> => {
	const game = cached.get();
	if (!game) 
		return Ok<Failure, Success>({ tag: "start", game: startGame(guess) });

	const turnCooldown = getTurnCooldown(game, guess.userId, config)
	if (turnCooldown > 0) 
		return Err<Failure, Success>({ tag: "turn cooldown", milliseconds: turnCooldown })
	if(!isValidGuess(guess.word))
		return Err<Failure, Success>({tag: "invalid word"})
	if (!isOver(game))
		return Ok(makeGuess(game, guess));
	const gameCooldown = getGameCooldown(game, config);
	if (gameCooldown > 0) 
		return Err<Failure, Success>({ tag: "game cooldown", milliseconds: gameCooldown })
	
	return Ok<Failure, Success>({ tag: "start", game: startGame(guess) });
}

