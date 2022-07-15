import { dict, unknown } from 'decoders';
import { existsSync, mkdir, readFileSync, writeFile } from 'fs';
import { set } from 'lodash/fp';
import { Maybe, Nothing } from 'nomads/maybe';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { Logger } from 'winston';
import { Config } from './config';
import createLogger from './logger';

export abstract class Cache<C extends Record<string, unknown>> {	
	abstract get<K extends keyof C>(property: K): Maybe<C[K]>;
	
	abstract set<K extends keyof C>(property: K, value: C[K]): C[K];
	
	abstract delete<K extends keyof C>(property: K): Maybe<C[K]>;
}

export class MemoryCache<C extends Record<string, unknown>> extends Cache<C> {
	protected cache: Partial<C> = {};

	constructor(
	  protected readonly name: string,
	  protected readonly logger: Logger = createLogger("none")
	) {
	  super();
	  logger.info(`Created cache for '${name}'`);
	}

	get = <K extends keyof C>(property: K): Maybe<C[K]> => {
		const value = this.cache[property] as C[K];
		this.logger.debug(`Got '${String(property)}' value from '${this.name}' cache: ${value}`);
		return Maybe.fromOptional(value);
	  };
	
  set = <K extends keyof C>(property: K, value: C[K]): C[K] => {
    this.cache = set(property, value, this.cache);
    this.logger.debug(`Set '${String(property)}' value to '${this.name}' cache: ${value}`);
    return value;
  };
	
  delete = <K extends keyof C>(property: K): Maybe<C[K]> => {
    const value = this.get(property);
    delete this.cache[property];
    this.logger.debug(`Deleted '${String(property)}' from '${this.name}' cache`);
    return value;
  };
}

export class FileCache<C extends Record<string, unknown>> extends MemoryCache<C> {
  constructor(
  	name: string,
    private readonly config: Config,
    logger: Logger = createLogger("none")
  ) {
	super(name);
    this.cache = this.loadCache().getOrElse({});
    logger.info(`Created cache for '${name}'`);
  }

  private get cacheFile(): Maybe<string> {
    return this.config.cacheDir.map((dir) => join(dir, this.name));
  }

  private loadCache = (): Maybe<Partial<C>> => {
    try {
      const cache = this.cacheFile
        .filter(file => existsSync(file))
        .map(file => readFileSync(file, 'utf-8'))
        .map(contents => JSON.parse(contents))
        .map(parsed =>  dict(unknown).verify(parsed) as Partial<C>);
      this.logger.debug(cache.fold({
        just:  () => `Cache for '${this.name}' loaded from disk`,
        nothing: () => `Disk cache for '${this.name}' not available`
      }));
      return cache;
    } catch (err) {
      this.logger.error(`Failed to load cache for '${this.name}': ${(err as Error).message}`);
      return Nothing();
    }
  };

  private saveCache = async (cache: Record<string, unknown>) => {
    try {
      const data = JSON.stringify(cache);
      switch(this.cacheFile.tag) {
      case 'just':
        await promisify(mkdir)(dirname(this.cacheFile.value), { recursive: true });
        await promisify(writeFile)(this.cacheFile.value, data);
        this.logger.debug(`Cache for '${this.name}' saved on disk`);
        return;
      default:
        this.logger.debug(`No cache saving for '${this.name}' available`); 
      }
    } catch (err) {
      this.logger.error(`Failed to write cache for '${this.name}': ${(err as Error).message}`);	
    }
  };

  set = <K extends keyof C>(property: K, value: C[K]): C[K] => {
    this.cache = set(property, value, this.cache);
    this.logger.debug(`Set '${String(property)}' value to '${this.name}' cache: ${value}`);
    this.saveCache(this.cache);
    return value;
  };

  delete = <K extends keyof C>(property: K): Maybe<C[K]> => {
    const value = this.get(property);
    delete this.cache[property];
    this.logger.debug(`Deleted '${String(property)}' from '${this.name}' cache`);
    this.saveCache(this.cache);
    return value;
  };
}

export default Cache;