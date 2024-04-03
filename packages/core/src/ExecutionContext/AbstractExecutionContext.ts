import Container from 'typedi';
import { get } from 'lodash';
import {
	LoggerProxy as Logger,
	FunctionsBase,
	INode,
	IWorkflowExecuteAdditionalData,
	Workflow,
	deepCopy,
	NodeTypeAndVersion,
	getGlobalState,
	INodeExecutionData,
	HTTP_REQUEST_NODE_TYPE,
	ICredentialDataDecryptedObject,
	ICredentialsExpressionResolveValues,
	IExecuteData,
	INodeCredentialDescription,
	INodeCredentialsDetails,
	IRunExecutionData,
	NodeHelpers,
	NodeOperationError,
	WorkflowExecuteMode,
	ApplicationError,
	ExpressionError,
	IGetNodeParameterOptions,
	IWorkflowDataProxyAdditionalKeys,
	NodeParameterValueType,
} from 'n8n-workflow';
import { InstanceSettings } from '@/InstanceSettings';
import { extractValue } from '@/ExtractValue';
import { PLACEHOLDER_EMPTY_EXECUTION_ID } from '@/Constants';
import { getSecretsProxy } from '@/Secrets';
import {
	setWorkflowExecutionMetadata,
	setAllWorkflowExecutionMetadata,
	getWorkflowExecutionMetadata,
	getAllWorkflowExecutionMetadata,
} from '@/ExecutionMetadata';
import { cleanupParameterData, validateValueAgainstSchema } from '@/NodeExecuteFunctions';

export abstract class AbstractExecutionContext implements Omit<FunctionsBase, 'getCredentials'> {
	readonly logger = Logger;

	constructor(
		readonly workflow: Workflow,
		readonly node: INode,
		readonly additionalData: IWorkflowExecuteAdditionalData,
	) {}

	getExecutionId() {
		return this.additionalData.executionId!;
	}

	getNode() {
		return deepCopy(this.node);
	}

	getWorkflow() {
		const { id, name, active } = this.workflow;
		return { id, name, active };
	}

	getWorkflowStaticData(type: string) {
		return this.workflow.getStaticData(type, this.node);
	}

	getChildNodes(nodeName: string) {
		const output: NodeTypeAndVersion[] = [];
		const nodes = this.workflow.getChildNodes(nodeName);
		for (const nodeName of nodes) {
			const node = this.workflow.nodes[nodeName];
			output.push({
				name: node.name,
				type: node.type,
				typeVersion: node.typeVersion,
			});
		}
		return output;
	}

	getParentNodes(nodeName: string) {
		const output: NodeTypeAndVersion[] = [];
		const nodes = this.workflow.getParentNodes(nodeName);
		for (const nodeName of nodes) {
			const node = this.workflow.nodes[nodeName];
			output.push({
				name: node.name,
				type: node.type,
				typeVersion: node.typeVersion,
			});
		}
		return output;
	}

	getRestApiUrl() {
		return this.additionalData.restApiUrl;
	}

	getInstanceBaseUrl() {
		return this.additionalData.instanceBaseUrl;
	}

	getInstanceId() {
		return Container.get(InstanceSettings).instanceId;
	}

	getTimezone() {
		return this.workflow.settings.timezone ?? getGlobalState().defaultTimezone;
	}

	/** @deprecated */
	async prepareOutputData(outputData: INodeExecutionData[]) {
		return [outputData];
	}

	protected async _getCredentials(
		workflow: Workflow,
		node: INode,
		type: string,
		additionalData: IWorkflowExecuteAdditionalData,
		mode: WorkflowExecuteMode,
		executeData?: IExecuteData,
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

		return await this.additionalData.credentialsHelper.getDecrypted(
			additionalData,
			nodeCredentials,
			type,
			mode,
			executeData,
			false,
			expressionResolveValues,
		);
	}

	protected _getNodeParameter(
		workflow: Workflow,
		runExecutionData: IRunExecutionData | null,
		runIndex: number,
		connectionInputData: INodeExecutionData[],
		node: INode,
		parameterName: string,
		itemIndex: number,
		mode: WorkflowExecuteMode,
		additionalKeys: IWorkflowDataProxyAdditionalKeys,
		executeData?: IExecuteData,
		fallbackValue?: any,
		options?: IGetNodeParameterOptions,
	): NodeParameterValueType | object {
		const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
		if (nodeType === undefined) {
			throw new ApplicationError('Node type is unknown so cannot return parameter value', {
				tags: { nodeType: node.type },
			});
		}

		const value = get(node.parameters, parameterName, fallbackValue);

		if (value === undefined) {
			throw new ApplicationError('Could not get parameter', { extra: { parameterName } });
		}

		if (options?.rawExpressions) {
			return value;
		}

		let returnData;

		try {
			returnData = workflow.expression.getParameterValue(
				value,
				runExecutionData,
				runIndex,
				itemIndex,
				node.name,
				connectionInputData,
				mode,
				additionalKeys,
				executeData,
				false,
				{},
				options?.contextNode?.name,
			);
			cleanupParameterData(returnData);
		} catch (e) {
			if (
				e instanceof ExpressionError &&
				node.continueOnFail &&
				node.type === 'n8n-nodes-base.set'
			) {
				// https://linear.app/n8n/issue/PAY-684
				returnData = [{ name: undefined, value: undefined }];
			} else {
				if (e.context) e.context.parameter = parameterName;
				e.cause = value;
				throw e;
			}
		}

		// This is outside the try/catch because it throws errors with proper messages
		if (options?.extractValue) {
			returnData = extractValue(returnData, parameterName, node, nodeType, itemIndex);
		}

		// Validate parameter value if it has a schema defined(RMC) or validateType defined
		returnData = validateValueAgainstSchema(
			node,
			nodeType,
			returnData,
			parameterName,
			runIndex,
			itemIndex,
		);

		return returnData;
	}

	protected _getAdditionalKeys(
		additionalData: IWorkflowExecuteAdditionalData,
		mode: WorkflowExecuteMode,
		runExecutionData: IRunExecutionData | null,
		options?: { secretsEnabled?: boolean },
	): IWorkflowDataProxyAdditionalKeys {
		const executionId = additionalData.executionId || PLACEHOLDER_EMPTY_EXECUTION_ID;
		const resumeUrl = `${additionalData.webhookWaitingBaseUrl}/${executionId}`;
		const resumeFormUrl = `${additionalData.formWaitingBaseUrl}/${executionId}`;
		return {
			$execution: {
				id: executionId,
				mode: mode === 'manual' ? 'test' : 'production',
				resumeUrl,
				resumeFormUrl,
				customData: runExecutionData
					? {
							set(key: string, value: string): void {
								try {
									setWorkflowExecutionMetadata(runExecutionData, key, value);
								} catch (e) {
									if (mode === 'manual') {
										throw e;
									}
									Logger.verbose(e.message);
								}
							},
							setAll(obj: Record<string, string>): void {
								try {
									setAllWorkflowExecutionMetadata(runExecutionData, obj);
								} catch (e) {
									if (mode === 'manual') {
										throw e;
									}
									Logger.verbose(e.message);
								}
							},
							get(key: string): string {
								return getWorkflowExecutionMetadata(runExecutionData, key);
							},
							getAll(): Record<string, string> {
								return getAllWorkflowExecutionMetadata(runExecutionData);
							},
						}
					: undefined,
			},
			$vars: additionalData.variables,
			$secrets: options?.secretsEnabled ? getSecretsProxy(additionalData) : undefined,

			// deprecated
			$executionId: executionId,
			$resumeWebhookUrl: resumeUrl,
		};
	}
}
