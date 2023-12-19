import { Container } from 'typedi';
import get from 'lodash/get';
import type {
	FunctionsBase,
	IExecuteFunctions,
	INode,
	IWorkflowExecuteAdditionalData,
	Workflow,
} from 'n8n-workflow';
import { LoggerProxy as Logger, deepCopy, getGlobalState } from 'n8n-workflow';
import { InstanceSettings } from '../InstanceSettings';

export const getCommonFunctions = (
	workflow: Workflow,
	node: INode,
	additionalData: IWorkflowExecuteAdditionalData,
): Omit<FunctionsBase, 'getCredentials'> => ({
	logger: Logger,
	getExecutionId: () => additionalData.executionId!,
	getNode: () => deepCopy(node),
	getWorkflow: () => ({
		id: workflow.id,
		name: workflow.name,
		active: workflow.active,
	}),
	getWorkflowStaticData: (type) => workflow.getStaticData(type, node),

	getRestApiUrl: () => additionalData.restApiUrl,
	getInstanceBaseUrl: () => additionalData.instanceBaseUrl,
	getInstanceId: () => Container.get(InstanceSettings).instanceId,
	getTimezone: () => workflow.settings.timezone ?? getGlobalState().defaultTimezone,

	prepareOutputData: async (outputData) => [outputData],
});

const continueOnFail = (node: INode): boolean => {
	const onError = get(node, 'onError', undefined);
	if (onError === undefined) {
		return get(node, 'continueOnFail', false);
	}
	return ['continueRegularOutput', 'continueErrorOutput'].includes(onError);
};

export const getCommonExecuteFunctions = (node: INode) => ({
	continueOnFail: () => continueOnFail(node),
});

export const getExecutionCancellationFunctions = (
	abortSignal?: AbortSignal,
): Pick<IExecuteFunctions, 'onExecutionCancellation' | 'getExecutionCancelSignal'> => ({
	getExecutionCancelSignal: () => abortSignal,
	onExecutionCancellation: (handler) => {
		const fn = () => {
			abortSignal?.removeEventListener('abort', fn);
			handler();
		};
		abortSignal?.addEventListener('abort', fn);
	},
});
