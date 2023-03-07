import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class OneSimpleApi implements ICredentialType {
	name = 'oneSimpleApi';

	displayName = 'One Simple API';

	documentationUrl = 'oneSimpleApi';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			default: '',
		},
	];
}
