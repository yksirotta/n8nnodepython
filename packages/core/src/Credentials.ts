import { Container } from 'typedi';
import type { ICredentialsEncrypted } from 'n8n-workflow';
import { ApplicationError, ICredentials, jsonParse } from 'n8n-workflow';
import { Cipher } from './Cipher';

export class Credentials<T extends object> extends ICredentials<T> {
	private readonly cipher = Container.get(Cipher);

	/**
	 * Sets new credential object
	 */
	setData(data: T): void {
		this.data = this.cipher.encrypt(data);
	}

	/**
	 * Returns the decrypted credential object
	 */
	getData() {
		if (this.data === undefined) {
			throw new ApplicationError('No data is set so nothing can be returned.');
		}

		try {
			const decryptedData = this.cipher.decrypt(this.data);

			return jsonParse<T>(decryptedData);
		} catch (e) {
			throw new ApplicationError(
				'Credentials could not be decrypted. The likely reason is that a different "encryptionKey" was used to encrypt the data.',
			);
		}
	}

	/**
	 * Returns the encrypted credentials to be saved
	 */
	getDataToSave(): ICredentialsEncrypted {
		if (this.data === undefined) {
			throw new ApplicationError('No credentials were set to save.');
		}

		return {
			id: this.id,
			name: this.name,
			type: this.type,
			data: this.data,
		};
	}
}
