import type { ICredentialType } from 'n8n-workflow';
import { string, secret, type InferProps } from '@utils/dsl';

const properties = [string('user', 'User'), secret('password', 'Password')];

export type HttpBasicAuthCredential = InferProps<typeof properties>;

export class HttpBasicAuth implements ICredentialType {
	name = 'httpBasicAuth';

	displayName = 'Basic Auth';

	documentationUrl = 'httpRequest';

	genericAuth = true;

	icon = 'node:n8n-nodes-base.httpRequest';

	properties = properties.map((p) => p.toNodeProperty());
}
