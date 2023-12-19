import get from 'lodash/get';
import type {
	IGetNodeParameterOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	IWorkflowExecuteAdditionalData,
	NodeParameterValueType,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import { extractValue } from '../ExtractValue';
import { getCommonFunctions } from './common.functions';
import { getNodeParameter } from './parameters.helpers';
import { getAdditionalKeys } from './expressions.helpers';
import { getRequestHelperFunctions } from './request.helpers';
import { getCredentials } from './credentials.helpers';

/** Returns the execute functions regular nodes have access to in load-options-function */
export function getLoadOptionsFunctions(
	workflow: Workflow,
	node: INode,
	path: string,
	additionalData: IWorkflowExecuteAdditionalData,
): ILoadOptionsFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		getCredentials: async (type) =>
			getCredentials(workflow, node, type, additionalData, 'internal'),
		getCurrentNodeParameter: (
			parameterPath: string,
			options?: IGetNodeParameterOptions,
		): NodeParameterValueType | object | undefined => {
			const nodeParameters = additionalData.currentNodeParameters;

			if (parameterPath.charAt(0) === '&') {
				parameterPath = `${path.split('.').slice(1, -1).join('.')}.${parameterPath.slice(1)}`;
			}

			let returnData = get(nodeParameters, parameterPath);

			// This is outside the try/catch because it throws errors with proper messages
			if (options?.extractValue) {
				const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
				if (nodeType === undefined) {
					throw new ApplicationError('Node type is not known so cannot return parameter value', {
						tags: { nodeType: node.type },
					});
				}
				returnData = extractValue(
					returnData,
					parameterPath,
					node,
					nodeType,
				) as NodeParameterValueType;
			}

			return returnData;
		},
		getCurrentNodeParameters: () => additionalData.currentNodeParameters,
		getNodeParameter: (
			parameterName: string,
			fallbackValue?: unknown,
			options?: IGetNodeParameterOptions,
		): NodeParameterValueType | object => {
			const runExecutionData: IRunExecutionData | null = null;
			const itemIndex = 0;
			const runIndex = 0;
			const mode = 'internal' as WorkflowExecuteMode;
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
		helpers: getRequestHelperFunctions(workflow, node, additionalData),
	};
}
