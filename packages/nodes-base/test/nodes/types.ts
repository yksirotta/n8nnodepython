import { INode, IConnections } from '@n8n_io/nodes-sdk';

export interface WorkflowTestData {
	description: string;
	input: {
		workflowData: {
			nodes: INode[];
			connections: IConnections;
		};
	};
	output: {
		nodeExecutionOrder?: string[];
		nodeData: {
			[key: string]: any[][];
		};
	};
}
