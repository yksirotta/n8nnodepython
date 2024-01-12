import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface DhlApiCredential {
	apiKey: string;
}

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
