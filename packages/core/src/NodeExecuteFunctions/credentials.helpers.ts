import type {
	ICredentialDataDecryptedObject,
	ICredentialsExpressionResolveValues,
	INode,
	INodeCredentialDescription,
	INodeCredentialsDetails,
	INodeExecutionData,
	IRunExecutionData,
	IWorkflowExecuteAdditionalData,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { NodeHelpers, NodeOperationError } from 'n8n-workflow';

import { HTTP_REQUEST_NODE_TYPE } from '../Constants';

/** Returns the requested decrypted credentials if the node has access to them */
export async function getCredentials(
	workflow: Workflow,
	node: INode,
	type: string,
	additionalData: IWorkflowExecuteAdditionalData,
	mode: WorkflowExecuteMode,
	runExecutionData?: IRunExecutionData | null,
	runIndex?: number,
	connectionInputData?: INodeExecutionData[],
	itemIndex?: number,
): Promise<ICredentialDataDecryptedObject> {
	// Get the NodeType as it has the information if the credentials are required
	const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
	if (nodeType === undefined) {
		throw new NodeOperationError(
			node,
			`Node type "${node.type}" is not known so can not get credentials!`,
		);
	}

	// Hardcode for now for security reasons that only a single node can access
	// all credentials
	const fullAccess = [HTTP_REQUEST_NODE_TYPE].includes(node.type);

	let nodeCredentialDescription: INodeCredentialDescription | undefined;
	if (!fullAccess) {
		if (nodeType.description.credentials === undefined) {
			throw new NodeOperationError(
				node,
				`Node type "${node.type}" does not have any credentials defined!`,
				{ level: 'warning' },
			);
		}

		nodeCredentialDescription = nodeType.description.credentials.find(
			(credentialTypeDescription) => credentialTypeDescription.name === type,
		);
		if (nodeCredentialDescription === undefined) {
			throw new NodeOperationError(
				node,
				`Node type "${node.type}" does not have any credentials of type "${type}" defined!`,
				{ level: 'warning' },
			);
		}

		if (
			!NodeHelpers.displayParameter(
				additionalData.currentNodeParameters || node.parameters,
				nodeCredentialDescription,
				node,
				node.parameters,
			)
		) {
			// Credentials should not be displayed even if they would be defined
			throw new NodeOperationError(node, 'Credentials not found');
		}
	}

	// Check if node has any credentials defined
	if (!fullAccess && !node.credentials?.[type]) {
		// If none are defined check if the credentials are required or not

		if (nodeCredentialDescription?.required === true) {
			// Credentials are required so error
			if (!node.credentials) {
				throw new NodeOperationError(node, 'Node does not have any credentials set!', {
					level: 'warning',
				});
			}
			if (!node.credentials[type]) {
				throw new NodeOperationError(
					node,
					`Node does not have any credentials set for "${type}"!`,
					{ level: 'warning' },
				);
			}
		} else {
			// Credentials are not required
			throw new NodeOperationError(node, 'Node does not require credentials');
		}
	}

	if (fullAccess && !node.credentials?.[type]) {
		// Make sure that fullAccess nodes still behave like before that if they
		// request access to credentials that are currently not set it returns undefined
		throw new NodeOperationError(node, 'Credentials not found');
	}

	let expressionResolveValues: ICredentialsExpressionResolveValues | undefined;
	if (connectionInputData && runExecutionData && runIndex !== undefined) {
		expressionResolveValues = {
			connectionInputData,
			itemIndex: itemIndex || 0,
			node,
			runExecutionData,
			runIndex,
			workflow,
		} as ICredentialsExpressionResolveValues;
	}

	const nodeCredentials = node.credentials
		? node.credentials[type]
		: ({} as INodeCredentialsDetails);

	// TODO: solve using credentials via expression
	// if (name.charAt(0) === '=') {
	// 	// If the credential name is an expression resolve it
	// 	const additionalKeys = getAdditionalKeys(additionalData, mode);
	// 	name = workflow.expression.getParameterValue(
	// 		name,
	// 		runExecutionData || null,
	// 		runIndex || 0,
	// 		itemIndex || 0,
	// 		node.name,
	// 		connectionInputData || [],
	// 		mode,
	// 		additionalKeys,
	// 	) as string;
	// }

	const decryptedDataObject = await additionalData.credentialsHelper.getDecrypted(
		additionalData,
		nodeCredentials,
		type,
		mode,
		false,
		expressionResolveValues,
	);

	return decryptedDataObject;
}
