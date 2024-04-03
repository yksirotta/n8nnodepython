import { object, string, type Output, type ObjectSchema, type ObjectEntries } from 'valibot';
import type { ICredentialType, INodeProperties } from 'n8n-workflow';

const properties = object({
	user: string(),
	password: string(),
});
type HttpBasicAuthCredential = Output<typeof properties>;
const objToProps = <T extends ObjectSchema<U>, U extends ObjectEntries>(
	obj: T,
): INodeProperties[] => [];

export class HttpBasicAuth implements ICredentialType {
	name = 'httpBasicAuth';

	displayName = 'Basic Auth';

	documentationUrl = 'httpRequest';

	genericAuth = true;

	icon = 'node:n8n-nodes-base.httpRequest';

	properties = objToProps(properties);
	// properties: INodeProperties[] = [
	// 	{
	// 		displayName: 'User',
	// 		name: 'user',
	// 		type: 'string',
	// 		default: '',
	// 	},
	// 	{
	// 		displayName: 'Password',
	// 		name: 'password',
	// 		type: 'string',
	// 		typeOptions: {
	// 			password: true,
	// 		},
	// 		default: '',
	// 	},
	// ];
}
