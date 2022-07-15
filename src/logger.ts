import { createLogger, format as formatLog, transports } from 'winston';
import moment from 'moment';
import { LogLevel } from './config';
import { cyan } from 'chalk';

const { combine, timestamp, printf, colorize } = formatLog;

const formatTime = (stamp: number) => moment(stamp).format('MMMM Do YYYY, h:mm:ss a');

const format = printf(
  ({ level, message, timestamp }) =>
    `[${cyan(formatTime(timestamp))}] ${level}: ${message}`
);

/**
 * Application wide logger instance
 *
 * @see https://github.com/winstonjs/winston
 */
export default (logLevel: LogLevel) => createLogger({
  level: logLevel,
  format: combine(timestamp(), colorize(), format),
  defaultMeta: { service: 'silakka' },
  transports: [new transports.Console()]
});
