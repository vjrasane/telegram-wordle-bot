
import chalk from 'chalk';
import start from './src/start';
import createLogger from './src/logger';
import getConfig from './src/config';
import {FileCache} from "./src/cache";
import { Game } from './src/game';

const config = getConfig(process.env);
const logger = createLogger(config.logLevel);

logger.debug(`Options: ${JSON.stringify(config.game, undefined, 2)}`);

const cache = new FileCache<Record<number, Game>>(
  "wordle-game-cache", config, logger
)

logger.info(chalk.magenta("#######################")),
logger.info(chalk.magenta("# ") + chalk.cyan("telegram-wordle-bot") + chalk.magenta(" #")),
logger.info(chalk.magenta("#######################")),

logger.info(`Starting in ${config.mode} mode`);

start(config, cache, logger);
