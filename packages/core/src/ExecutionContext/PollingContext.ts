import {
	ApplicationError,
	IGetNodeParameterOptions,
	INode,
	INodeExecutionData,
	IPollFunctions,
	IRunExecutionData,
	IWorkflowExecuteAdditionalData,
	NodeParameterValueType,
	Workflow,
	WorkflowActivateMode,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { AbstractExecutionContext } from './AbstractExecutionContext';

export class PollingContext extends AbstractExecutionContext implements IPollFunctions {
	constructor(
		workflow: Workflow,
		node: INode,
		additionalData: IWorkflowExecuteAdditionalData,
		readonly mode: WorkflowExecuteMode,
		readonly activation: WorkflowActivateMode,
	) {
		super(workflow, node, additionalData);
	}

	__emit() {
		throw new ApplicationError(
			'Overwrite NodeExecuteFunctions.getExecutePollFunctions.__emit function!',
		);
	}

	__emitError() {
		throw new ApplicationError(
			'Overwrite NodeExecuteFunctions.getExecutePollFunctions.__emitError function!',
		);
	}

	getMode() {
		return this.mode;
	}

	getActivationMode() {
		return this.activation;
	}

	async getCredentials(type: string) {
		return await super._getCredentials(
			this.workflow,
			this.node,
			type,
			this.additionalData,
			this.mode,
		);
	}

	getNodeParameter(
		parameterName: string,
		fallbackValue?: any,
		options?: IGetNodeParameterOptions,
	): NodeParameterValueType | object {
		const runExecutionData: IRunExecutionData | null = null;
		const itemIndex = 0;
		const runIndex = 0;
		const connectionInputData: INodeExecutionData[] = [];

		return super._getNodeParameter(
			this.workflow,
			runExecutionData,
			runIndex,
			connectionInputData,
			this.node,
			parameterName,
			itemIndex,
			this.mode,
			super._getAdditionalKeys(this.additionalData, this.mode, runExecutionData),
			undefined,
			fallbackValue,
			options,
		);
	}

	get helpers() {
		// TODO: fix this
		return {} as IPollFunctions['helpers'];
	}
}
