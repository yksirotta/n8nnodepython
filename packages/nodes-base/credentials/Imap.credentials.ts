import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface ImapCredential {
	host: string;
	port: number;
	user: string;
	password: string;
	secure: boolean;
	allowUnauthorizedCerts: boolean;
}

export class Imap implements ICredentialType {
	name = 'imap';

	displayName = 'IMAP';

	documentationUrl = 'imap';

	properties: INodeProperties[] = [
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
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 993,
		},
		{
			displayName: 'SSL/TLS',
			name: 'secure',
			type: 'boolean',
			default: true,
		},
		{
			displayName: 'Allow Self-Signed Certificates',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			description: 'Whether to connect even if SSL certificate validation is not possible',
			default: false,
		},
	];
}

export function isCredentialsDataImap(candidate: unknown): candidate is ImapCredential {
	const o = candidate as ImapCredential;
	return (
		o.host !== undefined &&
		o.password !== undefined &&
		o.port !== undefined &&
		o.secure !== undefined &&
		o.user !== undefined
	);
}
