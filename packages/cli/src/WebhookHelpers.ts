import type {
	IExecuteResponsePromiseData,
	IWebhookData,
	IWorkflowExecuteAdditionalData,
	Workflow,
} from 'n8n-workflow';
import { BINARY_ENCODING, NodeHelpers } from 'n8n-workflow';

/**
 * Returns all the webhooks which should be created for the given workflow
 */
export function getWorkflowWebhooks(
	workflow: Workflow,
	additionalData: IWorkflowExecuteAdditionalData,
	destinationNode?: string,
	ignoreRestartWebhooks = false,
): IWebhookData[] {
	// Check all the nodes in the workflow if they have webhooks

	const returnData: IWebhookData[] = [];

	let parentNodes: string[] | undefined;
	if (destinationNode !== undefined) {
		parentNodes = workflow.getParentNodes(destinationNode);
		// Also add the destination node in case it itself is a webhook node
		parentNodes.push(destinationNode);
	}

	for (const node of Object.values(workflow.nodes)) {
		if (parentNodes !== undefined && !parentNodes.includes(node.name)) {
			// If parentNodes are given check only them if they have webhooks
			// and no other ones

			continue;
		}
		// eslint-disable-next-line prefer-spread
		returnData.push.apply(
			returnData,
			NodeHelpers.getNodeWebhooks(workflow, node, additionalData, ignoreRestartWebhooks),
		);
	}

	return returnData;
}

export function encodeWebhookResponse(
	response: IExecuteResponsePromiseData,
): IExecuteResponsePromiseData {
	if (typeof response === 'object' && Buffer.isBuffer(response.body)) {
		response.body = {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'__@N8nEncodedBuffer@__': response.body.toString(BINARY_ENCODING),
		};
	}

	return response;
}
