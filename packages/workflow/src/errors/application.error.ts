import type { Event } from '@sentry/node';

export type Level = 'warning' | 'error' | 'fatal';

export type ReportingOptions = {
	level?: Level;
} & Pick<Event, 'tags' | 'extra'>;

export type ApplicationErrorOptions = ErrorOptions & ReportingOptions;

export class ApplicationError extends Error {
	level: Level = 'error';

	readonly tags?: Event['tags'];

	readonly extra?: Event['extra'];

	constructor(message: string, { level, tags, extra, ...rest }: ApplicationErrorOptions = {}) {
		super(message, rest);
		this.level = level ?? 'error';
		this.tags = tags;
		this.extra = extra;
	}
}
