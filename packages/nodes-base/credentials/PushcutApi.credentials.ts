import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class PushcutApi implements ICredentialType {
	name = 'pushcutApi';

	displayName = 'Pushcut API';

	documentationUrl = 'pushcut';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
