import { Service } from 'typedi';
import { writeFileSync } from 'fs';
import isEqual from 'lodash/isEqual';
import type { PushResult } from 'simple-git';
import { ApplicationError } from 'n8n-workflow';

import type { User } from '@db/entities/User';
import type { TagEntity } from '@db/entities/TagEntity';
import type { Variables } from '@db/entities/Variables';
import { TagRepository } from '@db/repositories/tag.repository';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalHooks } from '@/InternalHooks';
import { Logger } from '@/Logger';

import {
	SOURCE_CONTROL_DEFAULT_EMAIL,
	SOURCE_CONTROL_DEFAULT_NAME,
	SOURCE_CONTROL_README,
} from './constants';
import { SourceControlGitService } from './sourceControlGit.service.ee';
import { SourceControlBaseService } from './sourceControlBase.service';
import { SourceControlPreferencesService } from './sourceControlPreferences.service.ee';
import { SourceControlImportService } from './sourceControlImport.service.ee';
import { SourceControlExportService } from './sourceControlExport.service.ee';
import { SourceControlTrackingService } from './sourceControlTracking.service';
import type { SourceControlPreferences } from './types/sourceControlPreferences';
import type { ImportResult } from './types/importResult';
import type { SourceControlPushWorkFolder } from './types/sourceControlPushWorkFolder';
import type { SourceControlPullOptions } from './types/sourceControlPullWorkFolder';
import type { SourceControlledFile } from './types/sourceControlledFile';
import type { SourceControlWorkflowVersionId } from './types/sourceControlWorkflowVersionId';
import type { ExportableCredential } from './types/exportableCredential';
import type { SourceControlGetStatus } from './types/sourceControlGetStatus';

@Service()
export class SourceControlService extends SourceControlBaseService {
	constructor(
		logger: Logger,
		private readonly gitService: SourceControlGitService,
		private readonly preferencesService: SourceControlPreferencesService,
		private readonly exportService: SourceControlExportService,
		private readonly importService: SourceControlImportService,
		private readonly trackingService: SourceControlTrackingService,
		private readonly tagRepository: TagRepository,
		private readonly internalHooks: InternalHooks,
	) {
		super(logger);
	}

	async init(): Promise<void> {
		const { gitFolder, sshFolder } = this.preferencesService;
		this.gitService.resetService();
		this.checkIfFoldersExists([gitFolder, sshFolder]);
		await this.preferencesService.loadFromDbAndApplySourceControlPreferences();
		if (this.preferencesService.isSourceControlLicensedAndEnabled()) {
			await this.gitService.initService();
		}
	}

	async reInit(): Promise<void> {
		await this.init();
		const { preferences } = this.preferencesService;
		void this.internalHooks.onSourceControlSettingsUpdated({
			branch_name: preferences.branchName,
			connected: preferences.connected,
			read_only_instance: preferences.branchReadOnly,
			repo_type: this.getRepoType(preferences.repositoryUrl),
		});
	}

	getRepoType(repoUrl: string): 'github' | 'gitlab' | 'other' {
		if (repoUrl.includes('github.com')) {
			return 'github';
		} else if (repoUrl.includes('gitlab.com')) {
			return 'gitlab';
		}
		return 'other';
	}

	private async sanityCheck(): Promise<void> {
		const { gitFolder, sshFolder, preferences } = this.preferencesService;
		try {
			const foldersExisted = this.checkIfFoldersExists([gitFolder, sshFolder], false);
			if (!foldersExisted) {
				throw new ApplicationError('No folders exist');
			}
			if (!this.gitService.git) {
				await this.gitService.initService();
			}
			const branches = await this.gitService.getCurrentBranch();
			if (branches.current === '' || branches.current !== preferences.branchName) {
				throw new ApplicationError('Branch is not set up correctly');
			}
		} catch (error) {
			throw new BadRequestError(
				'Source control is not properly set up, please disconnect and reconnect.',
			);
		}
	}

	async disconnect(options: { keepKeyPair?: boolean } = {}) {
		try {
			await this.preferencesService.setPreferences({
				connected: false,
				branchName: '',
			});
			await this.exportService.deleteRepositoryFolder();
			if (!options.keepKeyPair) {
				await this.preferencesService.deleteKeyPairFiles();
			}
			this.gitService.resetService();
			return this.preferencesService.preferences;
		} catch (error) {
			throw new ApplicationError('Failed to disconnect from source control', { cause: error });
		}
	}

	async initializeRepository(preferences: SourceControlPreferences, user: User) {
		if (!this.gitService.git) {
			await this.gitService.initService();
		}
		this.logger.debug('Initializing repository...');
		await this.gitService.initRepository(preferences, user);
		let getBranchesResult;
		try {
			getBranchesResult = await this.getBranches();
		} catch (error) {
			if ((error as Error).message.includes('Warning: Permanently added')) {
				this.logger.debug('Added repository host to the list of known hosts. Retrying...');
				getBranchesResult = await this.getBranches();
			} else {
				throw error;
			}
		}
		if (getBranchesResult.branches.includes(preferences.branchName)) {
			await this.gitService.setBranch(preferences.branchName);
		} else {
			if (getBranchesResult.branches?.length === 0) {
				try {
					writeFileSync(this.preferencesService.readmeFile, SOURCE_CONTROL_README);

					await this.gitService.stage(new Set<string>(['README.md']));
					await this.gitService.commit('Initial commit');
					await this.gitService.push({
						branch: preferences.branchName,
						force: true,
					});
					getBranchesResult = await this.getBranches();
					await this.gitService.setBranch(preferences.branchName);
				} catch (fileError) {
					this.logger.error(`Failed to create initial commit: ${(fileError as Error).message}`);
				}
			}
		}
		await this.preferencesService.setPreferences({
			branchName: getBranchesResult.currentBranch,
			connected: true,
		});
		return getBranchesResult;
	}

	async getBranches(): Promise<{ branches: string[]; currentBranch: string }> {
		// fetch first to get include remote changes
		if (!this.gitService.git) {
			await this.gitService.initService();
		}
		await this.gitService.fetch();
		return await this.gitService.getBranches();
	}

	async setBranch(branch: string): Promise<{ branches: string[]; currentBranch: string }> {
		if (!this.gitService.git) {
			await this.gitService.initService();
		}
		await this.preferencesService.setPreferences({
			branchName: branch,
			connected: branch?.length > 0,
		});
		return await this.gitService.setBranch(branch);
	}

	// will reset the branch to the remote branch and pull
	// this will discard all local changes
	async resetWorkfolder(): Promise<ImportResult | undefined> {
		if (!this.gitService.git) {
			await this.gitService.initService();
		}
		try {
			await this.gitService.resetBranch();
			await this.gitService.pull();
		} catch (error) {
			this.logger.error(`Failed to reset workfolder: ${(error as Error).message}`);
			throw new ApplicationError(
				'Unable to fetch updates from git - your folder might be out of sync. Try reconnecting from the Source Control settings page.',
			);
		}
		return;
	}

	async pushWorkfolder(options: SourceControlPushWorkFolder): Promise<{
		statusCode: number;
		pushResult: PushResult | undefined;
		statusResult: SourceControlledFile[];
	}> {
		await this.sanityCheck();

		if (this.preferencesService.isBranchReadOnly()) {
			throw new BadRequestError('Cannot push onto read-only branch.');
		}

		// only determine file status if not provided by the frontend
		let statusResult: SourceControlledFile[] = options.fileNames;
		if (statusResult.length === 0) {
			statusResult = (await this.getStatus({
				direction: 'push',
				verbose: false,
				preferLocalVersion: true,
			})) as SourceControlledFile[];
		}

		if (!options.force) {
			const possibleConflicts = statusResult?.filter((file) => file.conflict);
			if (possibleConflicts?.length > 0) {
				return {
					statusCode: 409,
					pushResult: undefined,
					statusResult,
				};
			}
		}

		const filesToBePushed = new Set<string>();
		const filesToBeDeleted = new Set<string>();
		options.fileNames.forEach((e) => {
			if (e.status !== 'deleted') {
				filesToBePushed.add(e.file);
			} else {
				filesToBeDeleted.add(e.file);
			}
		});

		this.exportService.rmFilesFromExportFolder(filesToBeDeleted);

		const workflowsToBeExported = options.fileNames.filter(
			(e) => e.type === 'workflow' && e.status !== 'deleted',
		);
		await this.exportService.exportWorkflowsToWorkFolder(workflowsToBeExported);

		const credentialsToBeExported = options.fileNames.filter(
			(e) => e.type === 'credential' && e.status !== 'deleted',
		);
		const credentialExportResult =
			await this.exportService.exportCredentialsToWorkFolder(credentialsToBeExported);
		if (credentialExportResult.missingIds && credentialExportResult.missingIds.length > 0) {
			credentialExportResult.missingIds.forEach((id) => {
				filesToBePushed.delete(this.preferencesService.getCredentialPath(id));
				statusResult = statusResult.filter(
					(e) => e.file !== this.preferencesService.getCredentialPath(id),
				);
			});
		}

		if (options.fileNames.find((e) => e.type === 'tags')) {
			await this.exportService.exportTagsToWorkFolder();
		}

		if (options.fileNames.find((e) => e.type === 'variables')) {
			await this.exportService.exportVariablesToWorkFolder();
		}

		await this.gitService.stage(filesToBePushed, filesToBeDeleted);

		for (let i = 0; i < statusResult.length; i++) {
			// eslint-disable-next-line @typescript-eslint/no-loop-func
			if (options.fileNames.find((file) => file.file === statusResult[i].file)) {
				statusResult[i].pushed = true;
			}
		}

		await this.gitService.commit(options.message ?? 'Updated Workfolder');

		const pushResult = await this.gitService.push({
			branch: this.preferencesService.getBranchName(),
			force: options.force ?? false,
		});

		// #region Tracking Information
		void this.internalHooks.onSourceControlUserFinishedPushUI(
			this.trackingService.getTrackingInformationFromPostPushResult(statusResult),
		);
		// #endregion

		return {
			statusCode: 200,
			pushResult,
			statusResult,
		};
	}

	async pullWorkfolder(
		options: SourceControlPullOptions,
	): Promise<{ statusCode: number; statusResult: SourceControlledFile[] }> {
		await this.sanityCheck();

		const statusResult = (await this.getStatus({
			direction: 'pull',
			verbose: false,
			preferLocalVersion: false,
		})) as SourceControlledFile[];

		// filter out items that will not effect a local change and thus should not
		// trigger a conflict warning in the frontend
		const filteredResult = statusResult.filter((e) => {
			// locally created credentials will not create a conflict on pull
			if (e.status === 'created' && e.location === 'local') {
				return false;
			}
			// remotely deleted credentials will not delete local credentials
			if (e.type === 'credential' && e.status === 'deleted') {
				return false;
			}
			return true;
		});

		if (options.force !== true) {
			const possibleConflicts = filteredResult?.filter(
				(file) => (file.conflict || file.status === 'modified') && file.type === 'workflow',
			);
			if (possibleConflicts?.length > 0) {
				await this.gitService.resetBranch();
				return {
					statusCode: 409,
					statusResult: filteredResult,
				};
			}
		}

		const workflowsToBeImported = statusResult.filter(
			(e) => e.type === 'workflow' && e.status !== 'deleted',
		);
		await this.importService.importWorkflowFromWorkFolder(workflowsToBeImported, options.userId);

		const credentialsToBeImported = statusResult.filter(
			(e) => e.type === 'credential' && e.status !== 'deleted',
		);
		await this.importService.importCredentialsFromWorkFolder(
			credentialsToBeImported,
			options.userId,
		);

		const tagsToBeImported = statusResult.find((e) => e.type === 'tags');
		if (tagsToBeImported) {
			await this.importService.importTagsFromWorkFolder(tagsToBeImported);
		}

		const variablesToBeImported = statusResult.find((e) => e.type === 'variables');
		if (variablesToBeImported) {
			await this.importService.importVariablesFromWorkFolder(variablesToBeImported);
		}

		// #region Tracking Information
		void this.internalHooks.onSourceControlUserFinishedPullUI(
			this.trackingService.getTrackingInformationFromPullResult(statusResult),
		);
		// #endregion

		return {
			statusCode: 200,
			statusResult: filteredResult,
		};
	}

	/**
	 * Does a comparison between the local and remote workfolder based on NOT the git status,
	 * but certain parameters within the items being synced.
	 * For workflows, it compares the versionIds
	 * For credentials, it compares the name, type and nodeAccess
	 * For variables, it compares the name
	 * For tags, it compares the name and mapping
	 * @returns either SourceControlledFile[] if verbose is false,
	 * or multiple SourceControlledFile[] with all determined differences for debugging purposes
	 */
	async getStatus(options: SourceControlGetStatus) {
		await this.sanityCheck();

		const sourceControlledFiles: SourceControlledFile[] = [];

		// fetch and reset hard first
		await this.resetWorkfolder();

		const {
			wfRemoteVersionIds,
			wfLocalVersionIds,
			wfMissingInLocal,
			wfMissingInRemote,
			wfModifiedInEither,
		} = await this.getStatusWorkflows(options, sourceControlledFiles);

		const { credMissingInLocal, credMissingInRemote, credModifiedInEither } =
			await this.getStatusCredentials(options, sourceControlledFiles);

		const { varMissingInLocal, varMissingInRemote, varModifiedInEither } =
			await this.getStatusVariables(options, sourceControlledFiles);

		const {
			tagsMissingInLocal,
			tagsMissingInRemote,
			tagsModifiedInEither,
			mappingsMissingInLocal,
			mappingsMissingInRemote,
		} = await this.getStatusTagsMappings(options, sourceControlledFiles);

		// #region Tracking Information
		if (options.direction === 'push') {
			void this.internalHooks.onSourceControlUserStartedPushUI(
				this.trackingService.getTrackingInformationFromPrePushResult(sourceControlledFiles),
			);
		} else if (options.direction === 'pull') {
			void this.internalHooks.onSourceControlUserStartedPullUI(
				this.trackingService.getTrackingInformationFromPullResult(sourceControlledFiles),
			);
		}
		// #endregion

		if (options?.verbose) {
			return {
				wfRemoteVersionIds,
				wfLocalVersionIds,
				wfMissingInLocal,
				wfMissingInRemote,
				wfModifiedInEither,
				credMissingInLocal,
				credMissingInRemote,
				credModifiedInEither,
				varMissingInLocal,
				varMissingInRemote,
				varModifiedInEither,
				tagsMissingInLocal,
				tagsMissingInRemote,
				tagsModifiedInEither,
				mappingsMissingInLocal,
				mappingsMissingInRemote,
				sourceControlledFiles,
			};
		} else {
			return sourceControlledFiles;
		}
	}

	private async getStatusWorkflows(
		options: SourceControlGetStatus,
		sourceControlledFiles: SourceControlledFile[],
	) {
		const wfRemoteVersionIds = await this.importService.getRemoteVersionIdsFromFiles();
		const wfLocalVersionIds = await this.importService.getLocalVersionIdsFromDb();

		const wfMissingInLocal = wfRemoteVersionIds.filter(
			(remote) => wfLocalVersionIds.findIndex((local) => local.id === remote.id) === -1,
		);

		const wfMissingInRemote = wfLocalVersionIds.filter(
			(local) => wfRemoteVersionIds.findIndex((remote) => remote.id === local.id) === -1,
		);

		const wfModifiedInEither: SourceControlWorkflowVersionId[] = [];
		wfLocalVersionIds.forEach((local) => {
			const mismatchingIds = wfRemoteVersionIds.find(
				(remote) => remote.id === local.id && remote.versionId !== local.versionId,
			);
			let name = (options?.preferLocalVersion ? local?.name : mismatchingIds?.name) ?? 'Workflow';
			if (local.name && mismatchingIds?.name && local.name !== mismatchingIds.name) {
				name = options?.preferLocalVersion
					? `${local.name} (Remote: ${mismatchingIds.name})`
					: (name = `${mismatchingIds.name} (Local: ${local.name})`);
			}
			if (mismatchingIds) {
				wfModifiedInEither.push({
					...local,
					name,
					versionId: options.preferLocalVersion ? local.versionId : mismatchingIds.versionId,
					localId: local.versionId,
					remoteId: mismatchingIds.versionId,
				});
			}
		});

		wfMissingInLocal.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Workflow',
				type: 'workflow',
				status: options.direction === 'push' ? 'deleted' : 'created',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: false,
				file: item.filename,
				updatedAt: item.updatedAt ?? new Date().toISOString(),
			});
		});

		wfMissingInRemote.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Workflow',
				type: 'workflow',
				status: options.direction === 'push' ? 'created' : 'deleted',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: false,
				file: item.filename,
				updatedAt: item.updatedAt ?? new Date().toISOString(),
			});
		});

		wfModifiedInEither.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Workflow',
				type: 'workflow',
				status: 'modified',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: true,
				file: item.filename,
				updatedAt: item.updatedAt ?? new Date().toISOString(),
			});
		});

		return {
			wfRemoteVersionIds,
			wfLocalVersionIds,
			wfMissingInLocal,
			wfMissingInRemote,
			wfModifiedInEither,
		};
	}

	private async getStatusCredentials(
		options: SourceControlGetStatus,
		sourceControlledFiles: SourceControlledFile[],
	) {
		const credRemoteIds = await this.importService.getRemoteCredentialsFromFiles();
		const credLocalIds = await this.importService.getLocalCredentialsFromDb();

		const credMissingInLocal = credRemoteIds.filter(
			(remote) => credLocalIds.findIndex((local) => local.id === remote.id) === -1,
		);

		const credMissingInRemote = credLocalIds.filter(
			(local) => credRemoteIds.findIndex((remote) => remote.id === local.id) === -1,
		);

		// only compares the name, since that is the only change synced for credentials
		const credModifiedInEither: Array<
			ExportableCredential & {
				filename: string;
			}
		> = [];
		credLocalIds.forEach((local) => {
			const mismatchingCreds = credRemoteIds.find((remote) => {
				return (
					remote.id === local.id &&
					(remote.name !== local.name ||
						remote.type !== local.type ||
						!isEqual(remote.nodesAccess, local.nodesAccess))
				);
			});
			if (mismatchingCreds) {
				credModifiedInEither.push({
					...local,
					name: options?.preferLocalVersion ? local.name : mismatchingCreds.name,
				});
			}
		});

		credMissingInLocal.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Credential',
				type: 'credential',
				status: options.direction === 'push' ? 'deleted' : 'created',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: false,
				file: item.filename,
				updatedAt: new Date().toISOString(),
			});
		});

		credMissingInRemote.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Credential',
				type: 'credential',
				status: options.direction === 'push' ? 'created' : 'deleted',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: false,
				file: item.filename,
				updatedAt: new Date().toISOString(),
			});
		});

		credModifiedInEither.forEach((item) => {
			sourceControlledFiles.push({
				id: item.id,
				name: item.name ?? 'Credential',
				type: 'credential',
				status: 'modified',
				location: options.direction === 'push' ? 'local' : 'remote',
				conflict: true,
				file: item.filename,
				updatedAt: new Date().toISOString(),
			});
		});
		return {
			credMissingInLocal,
			credMissingInRemote,
			credModifiedInEither,
		};
	}

	private async getStatusVariables(
		options: SourceControlGetStatus,
		sourceControlledFiles: SourceControlledFile[],
	) {
		const varRemoteIds = await this.importService.getRemoteVariablesFromFile();
		const varLocalIds = await this.importService.getLocalVariablesFromDb();

		const varMissingInLocal = varRemoteIds.filter(
			(remote) => varLocalIds.findIndex((local) => local.id === remote.id) === -1,
		);

		const varMissingInRemote = varLocalIds.filter(
			(local) => varRemoteIds.findIndex((remote) => remote.id === local.id) === -1,
		);

		const varModifiedInEither: Variables[] = [];
		varLocalIds.forEach((local) => {
			const mismatchingIds = varRemoteIds.find(
				(remote) =>
					(remote.id === local.id && remote.key !== local.key) ||
					(remote.id !== local.id && remote.key === local.key),
			);
			if (mismatchingIds) {
				varModifiedInEither.push(options.preferLocalVersion ? local : mismatchingIds);
			}
		});

		if (
			varMissingInLocal.length > 0 ||
			varMissingInRemote.length > 0 ||
			varModifiedInEither.length > 0
		) {
			if (options.direction === 'pull' && varRemoteIds.length === 0) {
				// if there's nothing to pull, don't show difference as modified
			} else {
				sourceControlledFiles.push({
					id: 'variables',
					name: 'variables',
					type: 'variables',
					status: 'modified',
					location: options.direction === 'push' ? 'local' : 'remote',
					conflict: false,
					file: this.preferencesService.variablesExportFile,
					updatedAt: new Date().toISOString(),
				});
			}
		}
		return {
			varMissingInLocal,
			varMissingInRemote,
			varModifiedInEither,
		};
	}

	private async getStatusTagsMappings(
		options: SourceControlGetStatus,
		sourceControlledFiles: SourceControlledFile[],
	) {
		const lastUpdatedTag = await this.tagRepository.find({
			order: { updatedAt: 'DESC' },
			take: 1,
			select: ['updatedAt'],
		});

		const tagMappingsRemote = await this.importService.getRemoteTagsAndMappingsFromFile();
		const tagMappingsLocal = await this.importService.getLocalTagsAndMappingsFromDb();

		const tagsMissingInLocal = tagMappingsRemote.tags.filter(
			(remote) => tagMappingsLocal.tags.findIndex((local) => local.id === remote.id) === -1,
		);

		const tagsMissingInRemote = tagMappingsLocal.tags.filter(
			(local) => tagMappingsRemote.tags.findIndex((remote) => remote.id === local.id) === -1,
		);

		const tagsModifiedInEither: TagEntity[] = [];
		tagMappingsLocal.tags.forEach((local) => {
			const mismatchingIds = tagMappingsRemote.tags.find(
				(remote) => remote.id === local.id && remote.name !== local.name,
			);
			if (!mismatchingIds) {
				return;
			}
			tagsModifiedInEither.push(options.preferLocalVersion ? local : mismatchingIds);
		});

		const mappingsMissingInLocal = tagMappingsRemote.mappings.filter(
			(remote) =>
				tagMappingsLocal.mappings.findIndex(
					(local) => local.tagId === remote.tagId && local.workflowId === remote.workflowId,
				) === -1,
		);

		const mappingsMissingInRemote = tagMappingsLocal.mappings.filter(
			(local) =>
				tagMappingsRemote.mappings.findIndex(
					(remote) => remote.tagId === local.tagId && remote.workflowId === remote.workflowId,
				) === -1,
		);

		if (
			tagsMissingInLocal.length > 0 ||
			tagsMissingInRemote.length > 0 ||
			tagsModifiedInEither.length > 0 ||
			mappingsMissingInLocal.length > 0 ||
			mappingsMissingInRemote.length > 0
		) {
			if (
				options.direction === 'pull' &&
				tagMappingsRemote.tags.length === 0 &&
				tagMappingsRemote.mappings.length === 0
			) {
				// if there's nothing to pull, don't show difference as modified
			} else {
				sourceControlledFiles.push({
					id: 'mappings',
					name: 'tags',
					type: 'tags',
					status: 'modified',
					location: options.direction === 'push' ? 'local' : 'remote',
					conflict: false,
					file: this.preferencesService.tagsExportFile,
					updatedAt: lastUpdatedTag[0]?.updatedAt.toISOString(),
				});
			}
		}
		return {
			tagsMissingInLocal,
			tagsMissingInRemote,
			tagsModifiedInEither,
			mappingsMissingInLocal,
			mappingsMissingInRemote,
		};
	}

	async setGitUserDetails(
		name = SOURCE_CONTROL_DEFAULT_NAME,
		email = SOURCE_CONTROL_DEFAULT_EMAIL,
	): Promise<void> {
		await this.sanityCheck();
		await this.gitService.setGitUserDetails(name, email);
	}
}
