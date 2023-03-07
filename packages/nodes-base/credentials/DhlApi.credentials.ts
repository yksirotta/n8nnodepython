import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class DhlApi implements ICredentialType {
	name = 'dhlApi';

	displayName = 'DHL API';

	documentationUrl = 'dhl';

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
