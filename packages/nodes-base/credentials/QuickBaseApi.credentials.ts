import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class QuickBaseApi implements ICredentialType {
	name = 'quickbaseApi';

	displayName = 'Quick Base API';

	documentationUrl = 'quickbase';

	properties: INodeProperties[] = [
		{
			displayName: 'Hostname',
			name: 'hostname',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'demo.quickbase.com',
		},
		{
			displayName: 'User Token',
			name: 'userToken',
			type: 'string',
			default: '',
			required: true,
		},
	];
}
