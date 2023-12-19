import type {
	IGetNodeParameterOptions,
	IHookFunctions,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	IWebhookData,
	IWorkflowExecuteAdditionalData,
	NodeParameterValueType,
	Workflow,
	WorkflowActivateMode,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import { getCommonFunctions } from './common.functions';
import { getNodeParameter } from './parameters.helpers';
import { getAdditionalKeys } from './expressions.helpers';
import { getRequestHelperFunctions } from './request.helpers';
import { getCredentials } from './credentials.helpers';
import { getNodeWebhookUrl, getWebhookDescription } from './webhook.helpers';

/** Returns the execute functions regular nodes have access to in hook-function */
export function getExecuteHookFunctions(
	workflow: Workflow,
	node: INode,
	additionalData: IWorkflowExecuteAdditionalData,
	mode: WorkflowExecuteMode,
	activation: WorkflowActivateMode,
	webhookData?: IWebhookData,
): IHookFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		getCredentials: async (type) => getCredentials(workflow, node, type, additionalData, mode),
		getMode: () => mode,
		getActivationMode: () => activation,
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
		getNodeWebhookUrl: (name: string): string | undefined =>
			getNodeWebhookUrl(
				name,
				workflow,
				node,
				additionalData,
				mode,
				getAdditionalKeys(additionalData, mode, null),
				webhookData?.isTest,
			),
		getWebhookName(): string {
			if (webhookData === undefined) {
				throw new ApplicationError('Only supported in webhook functions');
			}
			return webhookData.webhookDescription.name;
		},
		getWebhookDescription: (name) => getWebhookDescription(name, workflow, node),
		helpers: getRequestHelperFunctions(workflow, node, additionalData),
	};
}
