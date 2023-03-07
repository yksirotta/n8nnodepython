import type { INodeProperties } from '@n8n_io/nodes-sdk';

export const tagFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		displayOptions: {
			show: {
				operation: ['tag'],
			},
		},
		default: '',
		description: 'The name of the tag to create',
		required: true,
	},
];
