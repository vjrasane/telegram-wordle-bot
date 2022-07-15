import TelegramBot from 'node-telegram-bot-api';
import { Task } from 'nomads/task';
import { Tuple } from 'nomads/tuple';
import { Stream } from 'stream';

export type Response = Task<unknown>;

export type Message = (bot: TelegramBot) => Promise<unknown>

export const NoResponse: Response = Task.resolve(undefined);

export const TextResponse = (
  bot: TelegramBot, chat: TelegramBot.Chat, msg: string, options?: TelegramBot.SendMessageOptions
): Response => Task(() => bot.sendMessage(chat.id, msg, options));  

export const StickerResponse = (
  bot: TelegramBot, chat: TelegramBot.Chat, sticker: string | Stream | Buffer, options?: TelegramBot.SendStickerOptions, fileOptions?: TelegramBot.FileOptions
): Response => Task(() => bot.sendSticker(chat.id, sticker, options, fileOptions));

export const combine = (...responses: Array<Response>): Response => {
  const [first, ...rest] = responses;
  if (!first) return NoResponse;
  return first.chain(() => combine(...rest));
};

export const append = <T>(response: Response, ret: Return<T>): Return<T> => ret.mapSecond(r => combine(r, response));
export const prepend = <T>(response: Response, ret: Return<T>): Return<T> => ret.mapSecond(r => combine(response, r));

export type Return<T> = Tuple<T, Task<unknown>>;

export const _return = <T>(value: T): Return<T> => Tuple(value, NoResponse);