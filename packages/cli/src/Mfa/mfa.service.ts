import { v4 as uuid } from 'uuid';
import { AES, enc } from 'crypto-js';
import { Service } from 'typedi';
import { UserRepository } from '@db/repositories';
import { type UserWithMFA } from '@db/entities/User';
import { TOTPService } from './totp.service';

@Service()
export class MfaService {
	constructor(
		private userRepository: UserRepository,
		public totp: TOTPService,
		private encryptionKey: string,
	) {}

	generateRecoveryCodes(n = 10) {
		return Array.from(Array(n)).map(() => uuid());
	}

	generateEncryptedRecoveryCodes() {
		return this.generateRecoveryCodes().map((code) =>
			AES.encrypt(code, this.encryptionKey).toString(),
		);
	}

	async saveSecretAndRecoveryCodes(userId: string, secret: string, recoveryCodes: string[]) {
		const { encryptedSecret, encryptedRecoveryCodes } = this.encryptSecretAndRecoveryCodes(
			secret,
			recoveryCodes,
		);
		return this.userRepository.updateSecretAndRecoveryCodes(
			userId,
			encryptedSecret,
			encryptedRecoveryCodes,
		);
	}

	encryptSecretAndRecoveryCodes(rawSecret: string, rawRecoveryCodes: string[]) {
		const encryptedSecret = AES.encrypt(rawSecret, this.encryptionKey).toString(),
			encryptedRecoveryCodes = rawRecoveryCodes.map((code) =>
				AES.encrypt(code, this.encryptionKey).toString(),
			);
		return {
			encryptedRecoveryCodes,
			encryptedSecret,
		};
	}

	async getSecretAndRecoveryCodes(userId: string) {
		const { mfaSecret, mfaRecoveryCodes } =
			await this.userRepository.getSecretAndRecoveryCodes(userId);
		return {
			decryptedSecret: AES.decrypt(mfaSecret, this.encryptionKey).toString(enc.Utf8),
			decryptedRecoveryCodes: mfaRecoveryCodes.map((code) =>
				AES.decrypt(code, this.encryptionKey).toString(enc.Utf8),
			),
		};
	}

	async enableMfa(userId: string): Promise<void> {
		await this.userRepository.enableMFA(userId);
	}

	async validateMfaToken(user: UserWithMFA, token?: string): Promise<boolean> {
		if (!!!token) return false;
		return this.totp.verifySecret({
			secret: user.mfaSecret ?? '',
			token,
		});
	}

	async validateMfaRecoveryCode(user: UserWithMFA, mfaRecoveryCode?: string) {
		if (!!!mfaRecoveryCode) return false;
		const index = user.mfaRecoveryCodes.indexOf(mfaRecoveryCode);
		if (index === -1) return false;

		// remove used recovery code
		user.mfaRecoveryCodes.splice(index, 1);

		const mfaRecoveryCodes = user.mfaRecoveryCodes.map((code) =>
			AES.encrypt(code, this.encryptionKey).toString(),
		);
		await this.userRepository.updateRecoveryCodes(user.id, mfaRecoveryCodes);
		return true;
	}

	async disableMfa(userId: string): Promise<void> {
		await this.userRepository.disableMfa(userId);
	}
}
