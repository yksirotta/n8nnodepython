import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class PagerDutyApi implements ICredentialType {
	name = 'pagerDutyApi';

	displayName = 'PagerDuty API';

	documentationUrl = 'pagerDuty';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			default: '',
		},
	];
}
