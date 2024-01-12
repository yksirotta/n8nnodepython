import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface DemioApiCredential {
	apiKey: string;
	apiSecret: string;
}

export class DemioApi implements ICredentialType {
	name = 'demioApi';

	displayName = 'Demio API';

	documentationUrl = 'demio';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
