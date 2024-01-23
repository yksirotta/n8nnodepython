import { Service } from 'typedi';
import type { ValidationError } from 'class-validator';
import { validate } from 'class-validator';
import { generateKeyPairSync } from 'crypto';
import path from 'path';
import { readFileSync as fsReadFileSync, existsSync as fsExistsSync } from 'fs';
import { writeFile as fsWriteFile, rm as fsRm } from 'fs/promises';
import { InstanceSettings } from 'n8n-core';
import { ApplicationError, jsonParse } from 'n8n-workflow';

import config from '@/config';
import { SettingsRepository } from '@db/repositories/settings.repository';
import { License } from '@/License';
import { Logger } from '@/Logger';

import {
	SOURCE_CONTROL_CREDENTIAL_EXPORT_FOLDER,
	SOURCE_CONTROL_GIT_FOLDER,
	SOURCE_CONTROL_GIT_KEY_COMMENT,
	SOURCE_CONTROL_PREFERENCES_DB_KEY,
	SOURCE_CONTROL_SSH_FOLDER,
	SOURCE_CONTROL_SSH_KEY_NAME,
	SOURCE_CONTROL_TAGS_EXPORT_FILE,
	SOURCE_CONTROL_VARIABLES_EXPORT_FILE,
	SOURCE_CONTROL_WORKFLOW_EXPORT_FOLDER,
} from './constants';
import type { KeyPair } from './types/keyPair';
import type { KeyPairType } from './types/keyPairType';
import { SourceControlPreferences } from './types/sourceControlPreferences';
import { SourceControlBaseService } from './sourceControlBase.service';

@Service()
export class SourceControlPreferencesService extends SourceControlBaseService {
	private _preferences = new SourceControlPreferences();

	readonly sshKeyName: string;

	readonly sshFolder: string;

	readonly gitFolder: string;

	readonly workflowExportFolder: string;

	readonly credentialExportFolder: string;

	readonly tagsExportFile: string;

	readonly variablesExportFile: string;

	readonly readmeFile: string;

	constructor(
		logger: Logger,
		private readonly settingsRepository: SettingsRepository,
		private readonly license: License,
		instanceSettings: InstanceSettings,
	) {
		super(logger);

		const { n8nFolder } = instanceSettings;
		this.sshFolder = path.join(n8nFolder, SOURCE_CONTROL_SSH_FOLDER);
		this.gitFolder = path.join(n8nFolder, SOURCE_CONTROL_GIT_FOLDER);
		this.sshKeyName = path.join(this.sshFolder, SOURCE_CONTROL_SSH_KEY_NAME);
		this.workflowExportFolder = path.join(this.gitFolder, SOURCE_CONTROL_WORKFLOW_EXPORT_FOLDER);
		this.credentialExportFolder = path.join(
			this.gitFolder,
			SOURCE_CONTROL_CREDENTIAL_EXPORT_FOLDER,
		);
		this.tagsExportFile = path.join(this.gitFolder, SOURCE_CONTROL_TAGS_EXPORT_FILE);
		this.variablesExportFile = path.join(this.gitFolder, SOURCE_CONTROL_VARIABLES_EXPORT_FILE);
		this.readmeFile = path.join(this.gitFolder, 'README.md');
	}

	getWorkflowPath(workflowId: string): string {
		return path.join(this.workflowExportFolder, `${workflowId}.json`);
	}

	getCredentialPath(credentialId: string): string {
		return path.join(this.credentialExportFolder, `${credentialId}.json`);
	}

	public get preferences(): SourceControlPreferences {
		return {
			...this._preferences,
			connected: this._preferences.connected ?? false,
			publicKey: this.getPublicKey(),
		};
	}

	public isSourceControlSetup() {
		const { repositoryUrl, branchName } = this._preferences;
		return this.isSourceControlLicensedAndEnabled() && repositoryUrl && branchName;
	}

	getPublicKey(): string {
		try {
			return fsReadFileSync(this.sshKeyName + '.pub', { encoding: 'utf8' });
		} catch (error) {
			this.logger.error(`Failed to read public key: ${(error as Error).message}`);
		}
		return '';
	}

	hasKeyPairFiles(): boolean {
		return fsExistsSync(this.sshKeyName) && fsExistsSync(this.sshKeyName + '.pub');
	}

	async deleteKeyPairFiles(): Promise<void> {
		try {
			await fsRm(this.sshFolder, { recursive: true });
		} catch (error) {
			this.logger.error(`Failed to delete ssh folder: ${(error as Error).message}`);
		}
	}

	/**
	 * Will generate an ed25519 key pair and save it to the database and the file system
	 * Note: this will overwrite any existing key pair
	 */
	async generateAndSaveKeyPair(keyPairType?: KeyPairType): Promise<SourceControlPreferences> {
		this.checkIfFoldersExists([this.gitFolder, this.sshFolder]);
		const { keyGeneratorType } = this.preferences;
		if (!keyPairType) {
			keyPairType =
				keyGeneratorType ??
				(config.get('sourceControl.defaultKeyPairType') as KeyPairType) ??
				'ed25519';
		}
		const keyPair = await this.generateSshKeyPair(keyPairType);
		if (keyPair.publicKey && keyPair.privateKey) {
			try {
				await fsWriteFile(this.sshKeyName + '.pub', keyPair.publicKey, {
					encoding: 'utf8',
					mode: 0o666,
				});
				await fsWriteFile(this.sshKeyName, keyPair.privateKey, { encoding: 'utf8', mode: 0o600 });
			} catch (error) {
				throw new ApplicationError('Failed to save key pair', { cause: error });
			}
		}
		// update preferences only after generating key pair to prevent endless loop
		if (keyPairType !== keyGeneratorType) {
			await this.setPreferences({ keyGeneratorType: keyPairType });
		}
		return this.preferences;
	}

	isBranchReadOnly(): boolean {
		return this._preferences.branchReadOnly;
	}

	isSourceControlConnected(): boolean {
		return this.preferences.connected;
	}

	isSourceControlLicensedAndEnabled(): boolean {
		return this.isSourceControlConnected() && this.license.isSourceControlLicensed();
	}

	getBranchName(): string {
		return this.preferences.branchName;
	}

	async validateSourceControlPreferences(
		preferences: Partial<SourceControlPreferences>,
		allowMissingProperties = true,
	): Promise<ValidationError[]> {
		const preferencesObject = new SourceControlPreferences(preferences);
		const validationResult = await validate(preferencesObject, {
			forbidUnknownValues: false,
			skipMissingProperties: allowMissingProperties,
			stopAtFirstError: false,
			validationError: { target: false },
		});
		if (validationResult.length > 0) {
			throw new ApplicationError('Invalid source control preferences', {
				extra: { preferences: validationResult },
			});
		}
		return validationResult;
	}

	async setPreferences(
		preferences: Partial<SourceControlPreferences>,
		saveToDb = true,
	): Promise<SourceControlPreferences> {
		this.checkIfFoldersExists([this.gitFolder, this.sshFolder]);
		if (!this.hasKeyPairFiles()) {
			const keyPairType =
				preferences.keyGeneratorType ??
				(config.get('sourceControl.defaultKeyPairType') as KeyPairType);
			this.logger.debug(`No key pair files found, generating new pair using type: ${keyPairType}`);
			await this.generateAndSaveKeyPair(keyPairType);
		}
		// merge the new preferences with the existing preferences when setting
		this._preferences = SourceControlPreferences.merge(preferences, this._preferences);
		if (saveToDb) {
			const settingsValue = JSON.stringify(this._preferences);
			try {
				await this.settingsRepository.save({
					key: SOURCE_CONTROL_PREFERENCES_DB_KEY,
					value: settingsValue,
					loadOnStartup: true,
				});
			} catch (error) {
				throw new ApplicationError('Failed to save source control preferences', { cause: error });
			}
		}
		return this.preferences;
	}

	async loadFromDbAndApplySourceControlPreferences(): Promise<
		SourceControlPreferences | undefined
	> {
		const loadedPreferences = await this.settingsRepository.findOne({
			where: { key: SOURCE_CONTROL_PREFERENCES_DB_KEY },
		});
		if (loadedPreferences) {
			try {
				const preferences = jsonParse<SourceControlPreferences>(loadedPreferences.value);
				if (preferences) {
					// set local preferences but don't write back to db
					await this.setPreferences(preferences, false);
					return preferences;
				}
			} catch (error) {
				this.logger.warn(
					`Could not parse Source Control settings from database: ${(error as Error).message}`,
				);
			}
		}
		await this.setPreferences(new SourceControlPreferences());
		return this.preferences;
	}

	async generateSshKeyPair(keyType: KeyPairType) {
		const sshpk = await import('sshpk');
		const keyPair: KeyPair = {
			publicKey: '',
			privateKey: '',
		};
		let generatedKeyPair: KeyPair;
		switch (keyType) {
			case 'ed25519':
				generatedKeyPair = generateKeyPairSync('ed25519', {
					privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
					publicKeyEncoding: { format: 'pem', type: 'spki' },
				});
				break;
			case 'rsa':
				generatedKeyPair = generateKeyPairSync('rsa', {
					modulusLength: 4096,
					publicKeyEncoding: {
						type: 'spki',
						format: 'pem',
					},
					privateKeyEncoding: {
						type: 'pkcs8',
						format: 'pem',
					},
				});
				break;
		}
		const keyPublic = sshpk.parseKey(generatedKeyPair.publicKey, 'pem');
		keyPublic.comment = SOURCE_CONTROL_GIT_KEY_COMMENT;
		keyPair.publicKey = keyPublic.toString('ssh');
		const keyPrivate = sshpk.parsePrivateKey(generatedKeyPair.privateKey, 'pem');
		keyPrivate.comment = SOURCE_CONTROL_GIT_KEY_COMMENT;
		keyPair.privateKey = keyPrivate.toString('ssh-private');
		return {
			privateKey: keyPair.privateKey,
			publicKey: keyPair.publicKey,
		};
	}
}
