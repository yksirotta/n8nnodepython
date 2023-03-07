import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class MessageBirdApi implements ICredentialType {
	name = 'messageBirdApi';

	displayName = 'MessageBird API';

	documentationUrl = 'messageBird';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'accessKey',
			type: 'string',
			default: '',
		},
	];
}
