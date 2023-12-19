import type {
	ContextType,
	IContextObject,
	IExecuteData,
	IExecuteSingleFunctions,
	IGetNodeParameterOptions,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	ISourceData,
	ITaskDataConnections,
	IWorkflowDataProxyData,
	IWorkflowExecuteAdditionalData,
	NodeParameterValueType,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import {
	NodeHelpers,
	WorkflowDataProxy,
	createDeferredPromise,
	ApplicationError,
} from 'n8n-workflow';

import {
	assertBinaryData,
	getBinaryDataBuffer,
	getBinaryHelperFunctions,
} from './binaryData.helpers';
import {
	getCommonExecuteFunctions,
	getCommonFunctions,
	getExecutionCancellationFunctions,
} from './common.functions';
import { getNodeParameter } from './parameters.helpers';
import { getAdditionalKeys } from './expressions.helpers';
import { getRequestHelperFunctions } from './request.helpers';
import { getCredentials } from './credentials.helpers';

/** Returns the execute functions regular nodes have access to when single-function is defined */
export function getExecuteSingleFunctions(
	workflow: Workflow,
	runExecutionData: IRunExecutionData,
	runIndex: number,
	connectionInputData: INodeExecutionData[],
	inputData: ITaskDataConnections,
	node: INode,
	itemIndex: number,
	additionalData: IWorkflowExecuteAdditionalData,
	executeData: IExecuteData,
	mode: WorkflowExecuteMode,
	abortSignal?: AbortSignal,
): IExecuteSingleFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		...getCommonExecuteFunctions(node),
		...getExecutionCancellationFunctions(abortSignal),
		evaluateExpression: (expression: string, evaluateItemIndex: number | undefined) => {
			evaluateItemIndex = evaluateItemIndex ?? itemIndex;
			return workflow.expression.resolveSimpleParameterValue(
				`=${expression}`,
				{},
				runExecutionData,
				runIndex,
				evaluateItemIndex,
				node.name,
				connectionInputData,
				mode,
				getAdditionalKeys(additionalData, mode, runExecutionData),
				executeData,
			);
		},
		getContext(type: ContextType): IContextObject {
			return NodeHelpers.getContext(runExecutionData, type, node);
		},
		getCredentials: async (type) =>
			getCredentials(
				workflow,
				node,
				type,
				additionalData,
				mode,
				runExecutionData,
				runIndex,
				connectionInputData,
				itemIndex,
			),
		getInputData: (inputIndex = 0, inputName = 'main') => {
			if (!inputData.hasOwnProperty(inputName)) {
				// Return empty array because else it would throw error when nothing is connected to input
				return { json: {} };
			}

			// TODO: Check if nodeType has input with that index defined
			if (inputData[inputName].length < inputIndex) {
				throw new ApplicationError('Could not get input index', {
					extra: { inputIndex, inputName },
				});
			}

			const allItems = inputData[inputName][inputIndex];

			if (allItems === null) {
				throw new ApplicationError('Input index was not set', {
					extra: { inputIndex, inputName },
				});
			}

			if (allItems[itemIndex] === null) {
				throw new ApplicationError('Value of input with given index was not set', {
					extra: { inputIndex, inputName, itemIndex },
				});
			}

			return allItems[itemIndex];
		},
		getInputSourceData: (inputIndex = 0, inputName = 'main') => {
			if (executeData?.source === null) {
				// Should never happen as n8n sets it automatically
				throw new ApplicationError('Source data is missing');
			}
			return executeData.source[inputName][inputIndex] as ISourceData;
		},
		getItemIndex: () => itemIndex,
		getMode: () => mode,
		getExecuteData: () => executeData,
		getNodeParameter: (
			parameterName: string,
			fallbackValue?: unknown,
			options?: IGetNodeParameterOptions,
		): NodeParameterValueType | object => {
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
				executeData,
				fallbackValue,
				options,
			);
		},
		getWorkflowDataProxy: (): IWorkflowDataProxyData => {
			const dataProxy = new WorkflowDataProxy(
				workflow,
				runExecutionData,
				runIndex,
				itemIndex,
				node.name,
				connectionInputData,
				{},
				mode,
				getAdditionalKeys(additionalData, mode, runExecutionData),
				executeData,
			);
			return dataProxy.getDataProxy();
		},
		helpers: {
			createDeferredPromise,
			...getRequestHelperFunctions(workflow, node, additionalData),
			...getBinaryHelperFunctions(additionalData, workflow.id),

			assertBinaryData: (propertyName, inputIndex = 0) =>
				assertBinaryData(inputData, node, itemIndex, propertyName, inputIndex),
			getBinaryDataBuffer: async (propertyName, inputIndex = 0) =>
				getBinaryDataBuffer(inputData, itemIndex, propertyName, inputIndex),
		},
	};
}
