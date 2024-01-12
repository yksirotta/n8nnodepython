import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface AcuitySchedulingApiCredential {
	userId: string;
	apiKey: string;
}

export class AcuitySchedulingApi implements ICredentialType {
	name = 'acuitySchedulingApi';

	displayName = 'Acuity Scheduling API';

	documentationUrl = 'acuityScheduling';

	properties: INodeProperties[] = [
		{
			displayName: 'User ID',
			name: 'userId',
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
