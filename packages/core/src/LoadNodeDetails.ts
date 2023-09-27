import type {
	ILoadOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	INodeListSearchResult,
	INodeProperties,
	INodePropertyOptions,
	INodeType,
	IRunExecutionData,
	ITaskDataConnections,
	IWorkflowExecuteAdditionalData,
	ResourceMapperFields,
} from 'n8n-workflow';
import {
	Workflow,
	RoutingNode,
	INodeCredentials,
	INodeParameters,
	INodeTypeNameVersion,
	INodeTypes,
} from 'n8n-workflow';
import * as NodeExecuteFunctions from './NodeExecuteFunctions';

export class LoadNodeDetails {
	protected node: INode;

	protected nodeType: INodeType;

	protected workflow: Workflow;

	constructor(
		nodeTypeNameAndVersion: INodeTypeNameVersion,
		nodeTypes: INodeTypes,
		currentNodeParameters: INodeParameters,
		credentials?: INodeCredentials,
	) {
		this.nodeType = nodeTypes.getByNameAndVersion(
			nodeTypeNameAndVersion.name,
			nodeTypeNameAndVersion.version,
		);

		this.node = {
			parameters: currentNodeParameters,
			id: 'uuid-1234',
			name: 'Temp-Node',
			type: nodeTypeNameAndVersion.name,
			typeVersion: nodeTypeNameAndVersion.version,
			position: [0, 0],
		};

		if (credentials) {
			this.node.credentials = credentials;
		}

		this.workflow = new Workflow({
			nodes: [this.node],
			connections: {},
			active: false,
			nodeTypes,
		});
	}

	/** Returns the available options via a predefined method */
	async getParamOptionsViaMethodName(
		methodName: string,
		path: string,
		additionalData: IWorkflowExecuteAdditionalData,
	): Promise<INodePropertyOptions[]> {
		const method = this.getMethod('loadOptions', methodName);
		const thisArgs = this.getThisArg(path, additionalData);
		return method.call(thisArgs);
	}

	/** Returns the available options via a loadOptions param */
	async getParamOptionsViaLoadOptions(
		loadOptions: ILoadOptions,
		additionalData: IWorkflowExecuteAdditionalData,
	): Promise<INodePropertyOptions[]> {
		const node = this.node;

		if (!this.nodeType.description?.requestDefaults?.baseURL) {
			// This in in here for now for security reasons.
			// Background: As the full data for the request to make does get send, and the auth data
			// will then be applied, would it be possible to retrieve that data like that. By at least
			// requiring a baseURL to be defined can at least not a random server be called.
			// In the future this code has to get improved that it does not use the request information from
			// the request rather resolves it via the parameter-path and nodeType data.
			throw new Error(
				`The node-type "${node.type}" does not exist or does not have "requestDefaults.baseURL" defined!`,
			);
		}

		const mode = 'internal';
		const runIndex = 0;
		const connectionInputData: INodeExecutionData[] = [];
		const runExecutionData: IRunExecutionData = { resultData: { runData: {} } };

		const routingNode = new RoutingNode(
			this.workflow,
			node,
			connectionInputData,
			runExecutionData ?? null,
			additionalData,
			mode,
		);

		// Create copy of node-type with the single property we want to get the data off
		const tempNode: INodeType = {
			...this.nodeType,
			...{
				description: {
					...this.nodeType.description,
					properties: [
						{
							displayName: '',
							type: 'string',
							name: '',
							default: '',
							routing: loadOptions.routing,
						} as INodeProperties,
					],
				},
			},
		};

		const inputData: ITaskDataConnections = {
			main: [[{ json: {} }]],
		};

		const optionsData = await routingNode.runNode(
			inputData,
			runIndex,
			tempNode,
			{ node, source: null, data: {} },
			NodeExecuteFunctions,
		);

		if (optionsData?.length === 0) {
			return [];
		}

		if (!Array.isArray(optionsData)) {
			throw new Error('The returned data is not an array!');
		}

		return optionsData[0].map((item) => item.json) as unknown as INodePropertyOptions[];
	}

	async getNodeListSearchResult(
		methodName: string,
		path: string,
		additionalData: IWorkflowExecuteAdditionalData,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		const method = this.getMethod('listSearch', methodName);
		const thisArgs = this.getThisArg(path, additionalData);
		return method.call(thisArgs, filter, paginationToken);
	}

	/** Returns the available mapping fields for the ResourceMapper component */
	async getMapperFields(
		methodName: string,
		path: string,
		additionalData: IWorkflowExecuteAdditionalData,
	): Promise<ResourceMapperFields> {
		const method = this.getMethod('resourceMapping', methodName);
		const thisArgs = this.getThisArg(path, additionalData);
		return method.call(thisArgs);
	}

	protected getMethod(
		type: 'resourceMapping',
		methodName: string,
	): (this: ILoadOptionsFunctions) => Promise<ResourceMapperFields>;
	protected getMethod(
		type: 'listSearch',
		methodName: string,
	): (
		this: ILoadOptionsFunctions,
		filter?: string | undefined,
		paginationToken?: string | undefined,
	) => Promise<INodeListSearchResult>;
	protected getMethod(
		type: 'loadOptions',
		methodName: string,
	): (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;

	protected getMethod(type: 'resourceMapping' | 'listSearch' | 'loadOptions', methodName: string) {
		const method = this.nodeType.methods?.[type]?.[methodName];
		if (typeof method !== 'function') {
			throw new Error(
				`The node-type "${this.node.type}" does not have the method "${methodName}" defined!`,
			);
		}
		return method;
	}

	protected getThisArg(path: string, additionalData: IWorkflowExecuteAdditionalData) {
		return NodeExecuteFunctions.getLoadOptionsFunctions(
			this.workflow,
			this.node,
			path,
			additionalData,
		);
	}
}
