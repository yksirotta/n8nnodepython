import { Service } from 'typedi';
import { loadClassInIsolation } from 'n8n-core';
import {
	ApplicationError,
	type ICredentialType,
	type ICredentialTypes,
	type LoadedClass,
} from 'n8n-workflow';
import { RESPONSE_ERROR_MESSAGES } from '@/constants';
import { LoadNodesAndCredentials } from '@/LoadNodesAndCredentials';

@Service()
export class CredentialTypes implements ICredentialTypes {
	constructor(private loadNodesAndCredentials: LoadNodesAndCredentials) {}

	recognizes(type: string) {
		const { loadedCredentials, knownCredentials } = this.loadNodesAndCredentials;
		return type in knownCredentials || type in loadedCredentials;
	}

	getByName<T = object>(credentialType: string): ICredentialType<T> {
		return this.getCredential<T>(credentialType).type;
	}

	getSupportedNodes(type: string): string[] {
		return this.loadNodesAndCredentials.knownCredentials[type]?.supportedNodes ?? [];
	}

	/**
	 * Returns all parent types of the given credential type
	 */
	getParentTypes(typeName: string): string[] {
		const extendsArr = this.loadNodesAndCredentials.knownCredentials[typeName]?.extends ?? [];
		if (extendsArr.length) {
			extendsArr.forEach((type) => {
				extendsArr.push(...this.getParentTypes(type));
			});
		}
		return extendsArr;
	}

	private getCredential<T>(type: string): LoadedClass<ICredentialType<T>> {
		const { loadedCredentials, knownCredentials } = this.loadNodesAndCredentials;
		if (type in loadedCredentials) {
			return loadedCredentials[type] as LoadedClass<ICredentialType<T>>;
		}

		if (type in knownCredentials) {
			const { className, sourcePath } = knownCredentials[type];
			const loaded: ICredentialType = loadClassInIsolation(sourcePath, className);
			loadedCredentials[type] = { sourcePath, type: loaded };
			return loadedCredentials[type] as LoadedClass<ICredentialType<T>>;
		}
		throw new ApplicationError(RESPONSE_ERROR_MESSAGES.NO_CREDENTIAL, {
			tags: { credentialType: type },
		});
	}
}
