import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class KitemakerApi implements ICredentialType {
	name = 'kitemakerApi';

	displayName = 'Kitemaker API';

	documentationUrl = 'kitemaker';

	properties: INodeProperties[] = [
		{
			displayName: 'Personal Access Token',
			name: 'personalAccessToken',
			type: 'string',
			default: '',
		},
	];
}
