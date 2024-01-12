import type {
	IExecuteFunctions,
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';

import { versionDescription } from './actions/versionDescription';
import { loadOptions } from './methods';
import { router } from './actions/router';
import { validateCredentials } from './transport';
import type { SyncroMspApiCredential } from '@credentials/SyncroMspApi.credentials';

export class SyncroMspV1 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			...versionDescription,
		};
	}

	methods = {
		loadOptions,
		credentialTest: {
			async syncroMspApiCredentialTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted<SyncroMspApiCredential>,
			): Promise<INodeCredentialTestResult> {
				try {
					await validateCredentials.call(this, credential.data);
				} catch (error) {
					if (error.statusCode === 401) {
						return {
							status: 'Error',
							message: 'The API Key included in the request is invalid',
						};
					}
				}

				return {
					status: 'OK',
					message: 'Connection successful!',
				};
			},
		},
	};

	async execute(this: IExecuteFunctions) {
		return await router.call(this);
	}
}
