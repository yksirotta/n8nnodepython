import type { Request, Response } from 'express';
import { type IncomingHttpHeaders } from 'http';
import type {
	IDataObject,
	IGetNodeParameterOptions,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	IWebhookData,
	IWebhookFunctions,
	IWorkflowExecuteAdditionalData,
	NodeParameterValueType,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { createDeferredPromise, ApplicationError } from 'n8n-workflow';

import { getBinaryHelperFunctions } from './binaryData.helpers';
import { getCommonFunctions } from './common.functions';
import { getNodeParameter } from './parameters.helpers';
import { getAdditionalKeys } from './expressions.helpers';
import { getRequestHelperFunctions, returnJsonArray } from './request.helpers';
import { getCredentials } from './credentials.helpers';
import { getNodeWebhookUrl } from './webhook.helpers';
import { getNodeHelperFunctions } from './node.helpers';

/** Returns the execute functions regular nodes have access to when webhook-function is defined */
export function getExecuteWebhookFunctions(
	workflow: Workflow,
	node: INode,
	additionalData: IWorkflowExecuteAdditionalData,
	mode: WorkflowExecuteMode,
	webhookData: IWebhookData,
): IWebhookFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		getBodyData(): IDataObject {
			if (additionalData.httpRequest === undefined) {
				throw new ApplicationError('Request is missing');
			}
			return additionalData.httpRequest.body as IDataObject;
		},
		getCredentials: async (type) => getCredentials(workflow, node, type, additionalData, mode),
		getHeaderData(): IncomingHttpHeaders {
			if (additionalData.httpRequest === undefined) {
				throw new ApplicationError('Request is missing');
			}
			return additionalData.httpRequest.headers;
		},
		getMode: () => mode,
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
				getAdditionalKeys(additionalData, mode, null),
				undefined,
				fallbackValue,
				options,
			);
		},
		getParamsData(): object {
			if (additionalData.httpRequest === undefined) {
				throw new ApplicationError('Request is missing');
			}
			return additionalData.httpRequest.params;
		},
		getQueryData(): object {
			if (additionalData.httpRequest === undefined) {
				throw new ApplicationError('Request is missing');
			}
			return additionalData.httpRequest.query;
		},
		getRequestObject(): Request {
			if (additionalData.httpRequest === undefined) {
				throw new ApplicationError('Request is missing');
			}
			return additionalData.httpRequest;
		},
		getResponseObject(): Response {
			if (additionalData.httpResponse === undefined) {
				throw new ApplicationError('Response is missing');
			}
			return additionalData.httpResponse;
		},
		getNodeWebhookUrl: (name: string): string | undefined =>
			getNodeWebhookUrl(
				name,
				workflow,
				node,
				additionalData,
				mode,
				getAdditionalKeys(additionalData, mode, null),
			),
		getWebhookName: () => webhookData.webhookDescription.name,
		helpers: {
			createDeferredPromise,
			...getRequestHelperFunctions(workflow, node, additionalData),
			...getBinaryHelperFunctions(additionalData, workflow.id),
			returnJsonArray,
		},
		nodeHelpers: getNodeHelperFunctions(additionalData, workflow.id),
	};
}
