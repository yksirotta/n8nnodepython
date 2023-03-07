import type { INodeProperties } from '@n8n_io/nodes-sdk';

export const organizationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'get',
		options: [
			{
				name: 'Get',
				value: 'get',
				description: "Retrieve data on the logged-in user's organization",
				action: "Get the logged-in user's organization",
			},
		],
		displayOptions: {
			show: {
				resource: ['organization'],
			},
		},
	},
];
