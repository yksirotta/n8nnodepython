import { Container } from 'typedi';
import get from 'lodash/get';
import type {
	ConnectionTypes,
	ContextType,
	IContextObject,
	IDataObject,
	IExecuteData,
	IExecuteFunctions,
	IExecuteResponsePromiseData,
	IExecuteWorkflowInfo,
	IGetNodeParameterOptions,
	INode,
	INodeExecutionData,
	INodeInputConfiguration,
	INodeOutputConfiguration,
	IPairedItemData,
	IRunExecutionData,
	ITaskData,
	ITaskDataConnections,
	IWorkflowDataProxyData,
	IWorkflowExecuteAdditionalData,
	NodeExecutionWithMetadata,
	NodeParameterValueType,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import {
	LoggerProxy as Logger,
	NodeHelpers,
	NodeOperationError,
	WorkflowDataProxy,
	createDeferredPromise,
	deepCopy,
	ExecutionBaseError,
	ApplicationError,
} from 'n8n-workflow';
import type { Readable } from 'stream';

import { BinaryDataService } from '../BinaryData/BinaryData.service';
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
import { getRequestHelperFunctions, returnJsonArray } from './request.helpers';
import { getCredentials } from './credentials.helpers';
import { getNodeHelperFunctions } from './node.helpers';
import { getFileSystemHelperFunctions } from './filesystem.helpers';

/** Takes generic input data and brings it into the new json, pairedItem format n8n uses */
export const constructExecutionMetaData = (
	inputData: INodeExecutionData[],
	options: { itemData: IPairedItemData | IPairedItemData[] },
): NodeExecutionWithMetadata[] => {
	const { itemData } = options;
	return inputData.map((data: INodeExecutionData) => {
		const { json, ...rest } = data;
		return { json, pairedItem: itemData, ...rest } as NodeExecutionWithMetadata;
	});
};

// TODO: Change options to an object
const addExecutionDataFunctions = async (
	type: 'input' | 'output',
	nodeName: string,
	data: INodeExecutionData[][] | ExecutionBaseError,
	runExecutionData: IRunExecutionData,
	connectionType: ConnectionTypes,
	additionalData: IWorkflowExecuteAdditionalData,
	sourceNodeName: string,
	sourceNodeRunIndex: number,
	currentNodeRunIndex: number,
): Promise<void> => {
	if (connectionType === 'main') {
		throw new ApplicationError('Setting type is not supported for main connection', {
			extra: { type },
		});
	}

	let taskData: ITaskData | undefined;
	if (type === 'input') {
		taskData = {
			startTime: new Date().getTime(),
			executionTime: 0,
			executionStatus: 'running',
			source: [null],
		};
	} else {
		// At the moment we expect that there is always an input sent before the output
		taskData = get(
			runExecutionData,
			['resultData', 'runData', nodeName, currentNodeRunIndex],
			undefined,
		);
		if (taskData === undefined) {
			return;
		}
	}
	taskData = taskData!;

	if (data instanceof Error) {
		// TODO: Or "failed", what is the difference
		taskData.executionStatus = 'error';
		taskData.error = data;
	} else {
		if (type === 'output') {
			taskData.executionStatus = 'success';
		}
		taskData.data = {
			[connectionType]: data,
		} as ITaskDataConnections;
	}

	if (type === 'input') {
		if (!(data instanceof Error)) {
			taskData.inputOverride = {
				[connectionType]: data,
			} as ITaskDataConnections;
		}

		if (!runExecutionData.resultData.runData.hasOwnProperty(nodeName)) {
			runExecutionData.resultData.runData[nodeName] = [];
		}

		runExecutionData.resultData.runData[nodeName][currentNodeRunIndex] = taskData;
		if (additionalData.sendDataToUI) {
			additionalData.sendDataToUI('nodeExecuteBefore', {
				executionId: additionalData.executionId,
				nodeName,
			});
		}
	} else {
		// Outputs
		taskData.executionTime = new Date().getTime() - taskData.startTime;

		if (additionalData.sendDataToUI) {
			additionalData.sendDataToUI('nodeExecuteAfter', {
				executionId: additionalData.executionId,
				nodeName,
				data: taskData,
			});
		}

		if (get(runExecutionData, 'executionData.metadata', undefined) === undefined) {
			runExecutionData.executionData!.metadata = {};
		}

		let sourceTaskData = get(runExecutionData, `executionData.metadata[${sourceNodeName}]`);

		if (!sourceTaskData) {
			runExecutionData.executionData!.metadata[sourceNodeName] = [];
			sourceTaskData = runExecutionData.executionData!.metadata[sourceNodeName];
		}

		if (!sourceTaskData[sourceNodeRunIndex]) {
			sourceTaskData[sourceNodeRunIndex] = {
				subRun: [],
			};
		}

		sourceTaskData[sourceNodeRunIndex]!.subRun!.push({
			node: nodeName,
			runIndex: currentNodeRunIndex,
		});
	}
};

/**
 * Automatically put the objects under a 'json' key and don't error,
 * if some objects contain json/binary keys and others don't, throws error 'Inconsistent item format'
 */
export function normalizeItems(
	executionData: INodeExecutionData | INodeExecutionData[],
): INodeExecutionData[] {
	if (typeof executionData === 'object' && !Array.isArray(executionData)) {
		executionData = executionData.json ? [executionData] : [{ json: executionData as IDataObject }];
	}

	if (executionData.every((item) => typeof item === 'object' && 'json' in item))
		return executionData;

	if (executionData.some((item) => typeof item === 'object' && 'json' in item)) {
		throw new ApplicationError('Inconsistent item format');
	}

	if (executionData.every((item) => typeof item === 'object' && 'binary' in item)) {
		const normalizedItems: INodeExecutionData[] = [];
		executionData.forEach((item) => {
			const json = Object.keys(item).reduce((acc, key) => {
				if (key === 'binary') return acc;
				return { ...acc, [key]: item[key] };
			}, {});

			normalizedItems.push({
				json,
				binary: item.binary,
			});
		});
		return normalizedItems;
	}

	if (executionData.some((item) => typeof item === 'object' && 'binary' in item)) {
		throw new ApplicationError('Inconsistent item format');
	}

	return executionData.map((item) => {
		return { json: item };
	});
}

/**
 * Returns a copy of the items which only contains the json data and
 * of that only the defined properties
 */
export function copyInputItems(items: INodeExecutionData[], properties: string[]): IDataObject[] {
	return items.map((item) => {
		const newItem: IDataObject = {};
		for (const property of properties) {
			if (item.json[property] === undefined) {
				newItem[property] = null;
			} else {
				newItem[property] = deepCopy(item.json[property]);
			}
		}
		return newItem;
	});
}

/** Returns the execute functions regular nodes have access to */
export function getExecuteFunctions(
	workflow: Workflow,
	runExecutionData: IRunExecutionData,
	runIndex: number,
	connectionInputData: INodeExecutionData[],
	inputData: ITaskDataConnections,
	node: INode,
	additionalData: IWorkflowExecuteAdditionalData,
	executeData: IExecuteData,
	mode: WorkflowExecuteMode,
	abortSignal?: AbortSignal,
): IExecuteFunctions {
	return {
		...getCommonFunctions(workflow, node, additionalData),
		...getCommonExecuteFunctions(node),
		...getExecutionCancellationFunctions(abortSignal),
		getMode: () => mode,
		getCredentials: async (type, itemIndex) =>
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
		getExecuteData: () => executeData,
		evaluateExpression: (expression: string, itemIndex: number) => {
			return workflow.expression.resolveSimpleParameterValue(
				`=${expression}`,
				{},
				runExecutionData,
				runIndex,
				itemIndex,
				node.name,
				connectionInputData,
				mode,
				getAdditionalKeys(additionalData, mode, runExecutionData),
				executeData,
			);
		},
		async executeWorkflow(
			workflowInfo: IExecuteWorkflowInfo,
			newInputData?: INodeExecutionData[],
		): Promise<INodeExecutionData[][]> {
			const result = await additionalData.executeWorkflow(workflowInfo, additionalData, {
				parentWorkflowId: workflow.id?.toString(),
				inputData: newInputData,
				parentWorkflowSettings: workflow.settings,
				node,
			});
			await Container.get(BinaryDataService).duplicateBinaryData(
				workflow.id,
				additionalData.executionId!,
				result,
			);
			return result;
		},
		getContext(type: ContextType): IContextObject {
			return NodeHelpers.getContext(runExecutionData, type, node);
		},
		async getInputConnectionData(
			inputName: ConnectionTypes,
			itemIndex: number,
			// TODO: Not implemented yet, and maybe also not needed
			// inputIndex?: number,
		): Promise<unknown> {
			const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);

			const inputs = NodeHelpers.getNodeInputs(workflow, node, nodeType.description);

			let inputConfiguration = inputs.find((input) => {
				if (typeof input === 'string') {
					return input === inputName;
				}
				return input.type === inputName;
			});

			if (inputConfiguration === undefined) {
				throw new ApplicationError('Node does not have input of type', {
					extra: { nodeName: node.name, inputName },
				});
			}

			if (typeof inputConfiguration === 'string') {
				inputConfiguration = {
					type: inputConfiguration,
				} as INodeInputConfiguration;
			}

			const parentNodes = workflow.getParentNodes(node.name, inputName, 1);
			if (parentNodes.length === 0) {
				return inputConfiguration.maxConnections === 1 ? undefined : [];
			}

			const constParentNodes = parentNodes
				.map((nodeName) => {
					return workflow.getNode(nodeName) as INode;
				})
				.filter((connectedNode) => connectedNode.disabled !== true)
				.map(async (connectedNode) => {
					const connectedNodeType = workflow.nodeTypes.getByNameAndVersion(
						connectedNode.type,
						connectedNode.typeVersion,
					);

					if (!connectedNodeType.supplyData) {
						throw new ApplicationError('Node does not have a `supplyData` method defined', {
							extra: { nodeName: connectedNode.name },
						});
					}

					const context = Object.assign({}, this);

					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					context.getNodeParameter = (
						parameterName: string,
						newItemIndex: number,
						fallbackValue?: unknown,
						options?: IGetNodeParameterOptions,
					) => {
						return getNodeParameter(
							workflow,
							runExecutionData,
							runIndex,
							connectionInputData,
							connectedNode,
							parameterName,
							newItemIndex,
							mode,
							getAdditionalKeys(additionalData, mode, runExecutionData),
							executeData,
							fallbackValue,
							{ ...(options ?? {}), contextNode: node },
						);
					};

					// TODO: Check what else should be overwritten
					context.getNode = () => {
						return deepCopy(connectedNode);
					};

					context.getCredentials = async (key: string) => {
						try {
							return await getCredentials(
								workflow,
								connectedNode,
								key,
								additionalData,
								mode,
								runExecutionData,
								runIndex,
								connectionInputData,
								itemIndex,
							);
						} catch (error) {
							// Display the error on the node which is causing it

							let currentNodeRunIndex = 0;
							if (runExecutionData.resultData.runData.hasOwnProperty(node.name)) {
								currentNodeRunIndex = runExecutionData.resultData.runData[node.name].length;
							}

							await addExecutionDataFunctions(
								'input',
								connectedNode.name,
								error as ExecutionBaseError,
								runExecutionData,
								inputName,
								additionalData,
								node.name,
								runIndex,
								currentNodeRunIndex,
							);

							throw error;
						}
					};

					try {
						return await connectedNodeType.supplyData.call(context, itemIndex);
					} catch (error) {
						// Propagate errors from sub-nodes
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						if (error.functionality === 'configuration-node') throw error;
						if (!(error instanceof ExecutionBaseError)) {
							error = new NodeOperationError(connectedNode, error as Error, {
								itemIndex,
							});
						}

						let currentNodeRunIndex = 0;
						if (runExecutionData.resultData.runData.hasOwnProperty(node.name)) {
							currentNodeRunIndex = runExecutionData.resultData.runData[node.name].length;
						}

						// Display the error on the node which is causing it
						await addExecutionDataFunctions(
							'input',
							connectedNode.name,
							error as ExecutionBaseError,
							runExecutionData,
							inputName,
							additionalData,
							node.name,
							runIndex,
							currentNodeRunIndex,
						);

						// Display on the calling node which node has the error
						throw new NodeOperationError(connectedNode, `Error in sub-node ${connectedNode.name}`, {
							itemIndex,
							functionality: 'configuration-node',
							description: (error as Error).message,
						});
					}
				});

			// Validate the inputs
			const nodes = await Promise.all(constParentNodes);

			if (inputConfiguration.required && nodes.length === 0) {
				throw new NodeOperationError(node, `A ${inputName} processor node must be connected!`);
			}
			if (
				inputConfiguration.maxConnections !== undefined &&
				nodes.length > inputConfiguration.maxConnections
			) {
				throw new NodeOperationError(
					node,
					`Only ${inputConfiguration.maxConnections} ${inputName} processor nodes are/is allowed to be connected!`,
				);
			}

			return inputConfiguration.maxConnections === 1
				? (nodes || [])[0]?.response
				: nodes.map(({ response }) => response);
		},
		getNodeOutputs(): INodeOutputConfiguration[] {
			const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
			return NodeHelpers.getNodeOutputs(workflow, node, nodeType.description).map((output) => {
				if (typeof output === 'string') {
					return {
						type: output,
					};
				}
				return output;
			});
		},
		getInputData: (inputIndex = 0, inputName = 'main') => {
			if (!inputData.hasOwnProperty(inputName)) {
				// Return empty array because else it would throw error when nothing is connected to input
				return [];
			}

			// TODO: Check if nodeType has input with that index defined
			if (inputData[inputName].length < inputIndex) {
				throw new ApplicationError('Could not get input with given index', {
					extra: { inputIndex, inputName },
				});
			}

			if (inputData[inputName][inputIndex] === null) {
				throw new ApplicationError('Value of input was not set', {
					extra: { inputIndex, inputName },
				});
			}

			return inputData[inputName][inputIndex] as INodeExecutionData[];
		},
		getInputSourceData: (inputIndex = 0, inputName = 'main') => {
			if (executeData?.source === null) {
				// Should never happen as n8n sets it automatically
				throw new ApplicationError('Source data is missing');
			}
			return executeData.source[inputName][inputIndex]!;
		},
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		//@ts-ignore
		getNodeParameter: (
			parameterName: string,
			itemIndex: number,
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
		getWorkflowDataProxy: (itemIndex: number): IWorkflowDataProxyData => {
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
		binaryToBuffer: async (body: Buffer | Readable) =>
			Container.get(BinaryDataService).toBuffer(body),
		async putExecutionToWait(waitTill: Date): Promise<void> {
			runExecutionData.waitTill = waitTill;
			if (additionalData.setExecutionStatus) {
				additionalData.setExecutionStatus('waiting');
			}
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		sendMessageToUI(...args: any[]): void {
			if (mode !== 'manual') {
				return;
			}
			try {
				if (additionalData.sendDataToUI) {
					args = args.map((arg) => {
						// prevent invalid dates from being logged as null
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
						if (arg.isLuxonDateTime && arg.invalidReason) return { ...arg };

						// log valid dates in human readable format, as in browser
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
						if (arg.isLuxonDateTime) return new Date(arg.ts).toString();
						if (arg instanceof Date) return arg.toString();

						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return arg;
					});

					additionalData.sendDataToUI('sendConsoleMessage', {
						source: `[Node: "${node.name}"]`,
						messages: args,
					});
				}
			} catch (error) {
				Logger.warn(`There was a problem sending message to UI: ${(error as Error).message}`);
			}
		},
		async sendResponse(response: IExecuteResponsePromiseData): Promise<void> {
			await additionalData.hooks?.executeHookFunctions('sendResponse', [response]);
		},

		addInputData(
			connectionType: ConnectionTypes,
			data: INodeExecutionData[][] | ExecutionBaseError,
		): { index: number } {
			const nodeName = this.getNode().name;
			let currentNodeRunIndex = 0;
			if (runExecutionData.resultData.runData.hasOwnProperty(nodeName)) {
				currentNodeRunIndex = runExecutionData.resultData.runData[nodeName].length;
			}

			addExecutionDataFunctions(
				'input',
				this.getNode().name,
				data,
				runExecutionData,
				connectionType,
				additionalData,
				node.name,
				runIndex,
				currentNodeRunIndex,
			).catch((error) => {
				Logger.warn(
					`There was a problem logging input data of node "${this.getNode().name}": ${
						(error as Error).message
					}`,
				);
			});

			return { index: currentNodeRunIndex };
		},
		addOutputData(
			connectionType: ConnectionTypes,
			currentNodeRunIndex: number,
			data: INodeExecutionData[][] | ExecutionBaseError,
		): void {
			addExecutionDataFunctions(
				'output',
				this.getNode().name,
				data,
				runExecutionData,
				connectionType,
				additionalData,
				node.name,
				runIndex,
				currentNodeRunIndex,
			).catch((error) => {
				Logger.warn(
					`There was a problem logging output data of node "${this.getNode().name}": ${
						(error as Error).message
					}`,
				);
			});
		},
		helpers: {
			createDeferredPromise,
			copyInputItems,
			...getRequestHelperFunctions(workflow, node, additionalData),
			...getFileSystemHelperFunctions(node),
			...getBinaryHelperFunctions(additionalData, workflow.id),
			assertBinaryData: (itemIndex, propertyName) =>
				assertBinaryData(inputData, node, itemIndex, propertyName, 0),
			getBinaryDataBuffer: async (itemIndex, propertyName) =>
				getBinaryDataBuffer(inputData, itemIndex, propertyName, 0),

			returnJsonArray,
			normalizeItems,
			constructExecutionMetaData,
		},
		nodeHelpers: getNodeHelperFunctions(additionalData, workflow.id),
	};
}
