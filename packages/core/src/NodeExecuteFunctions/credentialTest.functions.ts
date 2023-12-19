import type { ICredentialTestFunctions } from 'n8n-workflow';
import { proxyRequestToAxios } from './request.helpers';

export function getCredentialTestFunctions(): ICredentialTestFunctions {
	return {
		helpers: {
			request: async (uriOrObject: string | object, options?: object) => {
				return proxyRequestToAxios(undefined, undefined, undefined, uriOrObject, options);
			},
		},
	};
}
