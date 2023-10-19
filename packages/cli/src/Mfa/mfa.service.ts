import { v4 as uuid } from 'uuid';
import { AES, enc } from 'crypto-js';
import { Inject, Service } from 'typedi';
import { UserRepository } from '@db/repositories';
import { ENCRYPTION_KEY_TOKEN } from '@/di-tokens';
import { TOTPService } from './totp.service';

@Service()
export class MfaService {
	@Inject(ENCRYPTION_KEY_TOKEN)
	private encryptionKey: string;

	constructor(
		private userRepository: UserRepository,
		public totp: TOTPService,
	) {}

	public generateRecoveryCodes(n = 10) {
		return Array.from(Array(n)).map(() => uuid());
	}

	public generateEncryptedRecoveryCodes() {
		return this.generateRecoveryCodes().map((code) =>
			AES.encrypt(code, this.encryptionKey).toString(),
		);
	}

	public async saveSecretAndRecoveryCodes(userId: string, secret: string, recoveryCodes: string[]) {
		const { encryptedSecret, encryptedRecoveryCodes } = this.encryptSecretAndRecoveryCodes(
			secret,
			recoveryCodes,
		);
		return this.userRepository.update(userId, {
			mfaSecret: encryptedSecret,
			mfaRecoveryCodes: encryptedRecoveryCodes,
		});
	}

	public encryptSecretAndRecoveryCodes(rawSecret: string, rawRecoveryCodes: string[]) {
		const encryptedSecret = AES.encrypt(rawSecret, this.encryptionKey).toString(),
			encryptedRecoveryCodes = rawRecoveryCodes.map((code) =>
				AES.encrypt(code, this.encryptionKey).toString(),
			);
		return {
			encryptedRecoveryCodes,
			encryptedSecret,
		};
	}

	private decryptSecretAndRecoveryCodes(mfaSecret: string, mfaRecoveryCodes: string[]) {
		return {
			decryptedSecret: AES.decrypt(mfaSecret, this.encryptionKey).toString(enc.Utf8),
			decryptedRecoveryCodes: mfaRecoveryCodes.map((code) =>
				AES.decrypt(code, this.encryptionKey).toString(enc.Utf8),
			),
		};
	}

	public async getSecretAndRecoveryCodes(userId: string) {
		const { mfaSecret, mfaRecoveryCodes } = await this.userRepository.findOneOrFail({
			where: { id: userId },
			select: ['id', 'mfaSecret', 'mfaRecoveryCodes'],
		});
		return this.decryptSecretAndRecoveryCodes(mfaSecret ?? '', mfaRecoveryCodes ?? []);
	}

	public async enableMfa(userId: string) {
		await this.userRepository.update(userId, { mfaEnabled: true });
	}

	public encryptRecoveryCodes(mfaRecoveryCodes: string[]) {
		return mfaRecoveryCodes.map((code) => AES.encrypt(code, this.encryptionKey).toString());
	}

	public async disableMfa(userId: string) {
		await this.userRepository.update(userId, {
			mfaEnabled: false,
			mfaSecret: null,
			mfaRecoveryCodes: [],
		});
	}
}
