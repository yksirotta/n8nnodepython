import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface BambooHrApiCredential {
	subdomain: string;
	apiKey: string;
}

export class BambooHrApi implements ICredentialType {
	name = 'bambooHrApi';

	displayName = 'BambooHR API';

	documentationUrl = 'bambooHr';

	properties: INodeProperties[] = [
		{
			displayName: 'Subdomain',
			name: 'subdomain',
			type: 'string',
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
