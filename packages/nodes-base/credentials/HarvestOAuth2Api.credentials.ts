import type { ICredentialType, INodeProperties } from 'n8n-workflow';
import type { OAuth2ApiCredential } from './OAuth2Api.credentials';

export interface HarvestOAuth2ApiCredential extends OAuth2ApiCredential {}

export class HarvestOAuth2Api implements ICredentialType {
	name = 'harvestOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Harvest OAuth2 API';

	documentationUrl = 'harvest';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://id.getharvest.com/oauth2/authorize',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://id.getharvest.com/api/v2/oauth2/token',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'all',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
