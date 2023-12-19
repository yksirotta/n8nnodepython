import type {
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
import { createDeferredPromise, ApplicationError } from 'n8n-workflow';

import { getBinaryHelperFunctions } from './binaryData.helpers';
import { getCommonFunctions } from './common.functions';
import { getCredentials } from './credentials.helpers';
import { getNodeParameter } from './parameters.helpers';
import { getAdditionalKeys } from './expressions.helpers';
import { getRequestHelperFunctions, returnJsonArray } from './request.helpers';

/**
 * Returns the execute functions the poll nodes have access to.
 */
// TODO: Check if I can get rid of: additionalData, and so then maybe also at ActiveWorkflowRunner.add
export function getExecutePollFunctions(
	workflow: Workflow,
	node: INode,
	additionalData: IWorkflowExecuteAdditionalData,
	mode: WorkflowExecuteMode,
	activation: WorkflowActivateMode,
): IPollFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		__emit: (): void => {
			throw new ApplicationError(
				'Overwrite NodeExecuteFunctions.getExecutePollFunctions.__emit function!',
			);
		},
		__emitError() {
			throw new ApplicationError(
				'Overwrite NodeExecuteFunctions.getExecutePollFunctions.__emitError function!',
			);
		},
		getMode: () => mode,
		getActivationMode: () => activation,
		getCredentials: async (type) => getCredentials(workflow, node, type, additionalData, mode),
		getNodeParameter: (
			parameterName: string,
			fallbackValue?: unknown,
			options?: IGetNodeParameterOptions,
		): NodeParameterValueType | object => {
			const runExecutionData: IRunExecutionData | null = null;
			const itemIndex = 0;
			const runIndex = 0;
			const connectionInputData: INodeExecutionData[] = [];

			return getNodeParameter(
				workflow,
				runExecutionData,
				runIndex,
				connectionInputData,
				node,
				parameterName,
				itemIndex,
				mode,
				getAdditionalKeys(additionalData, mode, runExecutionData),
				undefined,
				fallbackValue,
				options,
			);
		},
		helpers: {
			createDeferredPromise,
			...getRequestHelperFunctions(workflow, node, additionalData),
			...getBinaryHelperFunctions(additionalData, workflow.id),
			returnJsonArray,
		},
	};
}
