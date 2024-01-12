import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import axios from 'axios';

const regions = {
	'apjc.amp': 'Asia Pacific, Japan, and China',
	'eu.amp': 'Europe',
	amp: 'North America',
} as const;

type Region = keyof typeof regions;

export interface CiscoSecureEndpointApiCredential {
	clientId: string;
	clientSecret: string;
	region: Region;
}

export class CiscoSecureEndpointApi implements ICredentialType {
	name = 'ciscoSecureEndpointApi';

	displayName = 'Cisco Secure Endpoint (AMP) API';

	documentationUrl = 'ciscosecureendpoint';

	icon = 'file:icons/Cisco.svg';

	httpRequestNode = {
		name: 'Cisco Secure Endpoint',
		docsUrl: 'https://developer.cisco.com/docs/secure-endpoint/',
		apiBaseUrl: '',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: Object.entries(regions).map(([value, name]) => ({ name, value })),
			default: 'amp',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
	];

	async authenticate(
		credentials: CiscoSecureEndpointApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const { clientId, clientSecret, region } = credentials;
		const secureXToken = await axios({
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			auth: {
				username: clientId,
				password: clientSecret,
			},
			method: 'POST',
			data: new URLSearchParams({
				grant_type: 'client_credentials',
			}).toString(),
			url: `https://visibility.${region}.cisco.com/iroh/oauth2/token`,
		});

		const secureEndpointToken = await axios({
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
				Authorization: `Bearer ${secureXToken.data.access_token}`,
			},
			method: 'POST',
			data: new URLSearchParams({
				grant_type: 'client_credentials',
			}).toString(),
			url: `https://api.${region}.cisco.com/v3/access_tokens`,
		});

		const requestOptionsWithAuth: IHttpRequestOptions = {
			...requestOptions,
			headers: {
				...requestOptions.headers,
				Authorization: `Bearer ${secureEndpointToken.data.access_token}`,
			},
		};

		return requestOptionsWithAuth;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '=https://api.{{$credentials.region}}.cisco.com',
			url: '/v3/organizations',
			qs: {
				size: 10,
			},
		},
	};
}
