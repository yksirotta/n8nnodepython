import type { ICredentialType } from 'n8n-workflow';
import { object, string, type InferProps } from '@utils/dsl';

const properties = object({
	user: string().displayName('User'),
	password: string().displayName('Password').typeOptions({ password: true }),
});

export type HttpBasicAuthCredential = InferProps<typeof properties>;

export class HttpBasicAuth implements ICredentialType {
	name = 'httpBasicAuth';

	displayName = 'Basic Auth';

	documentationUrl = 'httpRequest';

	genericAuth = true;

	icon = 'node:n8n-nodes-base.httpRequest';

	get properties() {
		return properties.toNodeProperties();
	}
}
