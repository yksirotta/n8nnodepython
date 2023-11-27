import type { INode } from '../Interfaces';
import { ExecutionBaseError } from './abstract/execution-base.error';
import { ApplicationErrorOptions } from './application.error';

type WorkflowActivationErrorOptions = ApplicationErrorOptions & {
	node?: INode;
	workflowId?: string;
};

/**
 * Class for instantiating an workflow activation error
 */
export class WorkflowActivationError extends ExecutionBaseError {
	node: INode | undefined;

	workflowId: string | undefined;

	constructor(
		message: string,
		{ cause, node, level, workflowId }: WorkflowActivationErrorOptions = {},
	) {
		let error = cause as Error;
		if (cause instanceof ExecutionBaseError) {
			error = new Error(cause.message);
			error.constructor = cause.constructor;
			error.name = cause.name;
			error.stack = cause.stack;
		}
		super(message, { cause: error, level });
		this.node = node;
		this.workflowId = workflowId;
		this.message = message;
	}
}
