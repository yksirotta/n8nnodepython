import type { IDataObject, JsonObject } from '../../Interfaces';
import { ApplicationError, ReportingOptions } from '../application.error';

export type ExecutionBaseErrorOptions = ReportingOptions & {
	cause?: Error | JsonObject;
};

export abstract class ExecutionBaseError extends ApplicationError {
	description: string | null | undefined;

	/**
	 * @tech_debt Ensure `cause` can only be `Error` or `undefined`
	 */
	cause: Error | JsonObject | undefined;

	timestamp: number;

	context: IDataObject = {};

	lineNumber: number | undefined;

	constructor(message: string, { cause }: ExecutionBaseErrorOptions) {
		const options = cause instanceof Error ? { cause } : {};
		super(message, options);

		this.name = this.constructor.name;
		this.timestamp = Date.now();

		if (cause instanceof ExecutionBaseError) {
			this.context = cause.context;
		} else if (cause && !(cause instanceof Error)) {
			this.cause = cause;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	toJSON?(): any {
		return {
			message: this.message,
			lineNumber: this.lineNumber,
			timestamp: this.timestamp,
			name: this.name,
			description: this.description,
			context: this.context,
			cause: this.cause,
		};
	}
}
