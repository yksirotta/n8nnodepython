import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export interface NextCloudApiCredential {
	webDavUrl: string;
	user: string;
	password: string;
}

export class NextCloudApi implements ICredentialType {
	name = 'nextCloudApi';

	displayName = 'NextCloud API';

	documentationUrl = 'nextCloud';

	properties: INodeProperties[] = [
		{
			displayName: 'Web DAV URL',
			name: 'webDavUrl',
			type: 'string',
			placeholder: 'https://nextcloud.example.com/remote.php/webdav',
			default: '',
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	async authenticate(
		{ user, password }: NextCloudApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		requestOptions.auth = {
			username: user,
			password,
		};
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: "={{$credentials.webDavUrl.replace('/remote.php/webdav', '')}}",
			url: '/ocs/v1.php/cloud/capabilities',
			headers: { 'OCS-APIRequest': true },
		},
	};
}
