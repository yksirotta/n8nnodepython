import { Service } from 'typedi';
import { In } from 'typeorm';
import glob from 'fast-glob';
import { readFile as fsReadFile } from 'fs/promises';
import { ApplicationError, jsonParse } from 'n8n-workflow';
import { Credentials } from 'n8n-core';

import { ActiveWorkflowRunner } from '@/ActiveWorkflowRunner';
import type { Variables } from '@db/entities/Variables';
import { SharedCredentials } from '@db/entities/SharedCredentials';
import type { WorkflowTagMapping } from '@db/entities/WorkflowTagMapping';
import type { TagEntity } from '@db/entities/TagEntity';
import { TagRepository } from '@db/repositories/tag.repository';
import { WorkflowRepository } from '@db/repositories/workflow.repository';
import { UserRepository } from '@db/repositories/user.repository';
import { CredentialsRepository } from '@db/repositories/credentials.repository';
import { SharedCredentialsRepository } from '@db/repositories/sharedCredentials.repository';
import { SharedWorkflowRepository } from '@db/repositories/sharedWorkflow.repository';
import { WorkflowTagMappingRepository } from '@db/repositories/workflowTagMapping.repository';
import { VariablesRepository } from '@db/repositories/variables.repository';
import type { IWorkflowToImport } from '@/Interfaces';
import { Logger } from '@/Logger';
import { isUniqueConstraintError } from '@/ResponseHelper';

import type { ExportableCredential } from './types/exportableCredential';
import type { SourceControlledFile } from './types/sourceControlledFile';
import type { SourceControlWorkflowVersionId } from './types/sourceControlWorkflowVersionId';
import { SourceControlPreferencesService } from './sourceControlPreferences.service.ee';
import { SourceControlBaseService } from './sourceControlBase.service';
import { VariablesService } from '../variables/variables.service.ee';

@Service()
export class SourceControlImportService extends SourceControlBaseService {
	constructor(
		logger: Logger,
		private readonly variablesService: VariablesService,
		private readonly activeWorkflowRunner: ActiveWorkflowRunner,
		private readonly credentialsRepository: CredentialsRepository,
		private readonly sharedCredentialsRepository: SharedCredentialsRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly tagRepository: TagRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly workflowTagMappingRepository: WorkflowTagMappingRepository,
		private readonly userRepository: UserRepository,
		private readonly variablesRepository: VariablesRepository,
		private readonly preferencesService: SourceControlPreferencesService,
	) {
		super(logger);
	}

	public async getRemoteVersionIdsFromFiles(): Promise<SourceControlWorkflowVersionId[]> {
		const remoteWorkflowFiles = await glob('*.json', {
			cwd: this.preferencesService.workflowExportFolder,
			absolute: true,
		});
		const remoteWorkflowFilesParsed = await Promise.all(
			remoteWorkflowFiles.map(async (file) => {
				this.logger.debug(`Parsing workflow file ${file}`);
				const remote = jsonParse<IWorkflowToImport>(await fsReadFile(file, { encoding: 'utf8' }));
				if (!remote?.id) {
					return undefined;
				}
				return {
					id: remote.id,
					versionId: remote.versionId,
					name: remote.name,
					remoteId: remote.id,
					filename: this.preferencesService.getWorkflowPath(remote.id),
				} as SourceControlWorkflowVersionId;
			}),
		);
		return remoteWorkflowFilesParsed.filter(
			(e) => e !== undefined,
		) as SourceControlWorkflowVersionId[];
	}

	public async getLocalVersionIdsFromDb(): Promise<SourceControlWorkflowVersionId[]> {
		const localWorkflows = await this.workflowRepository.find({
			select: ['id', 'name', 'versionId', 'updatedAt'],
		});
		return localWorkflows.map((local) => ({
			id: local.id,
			versionId: local.versionId,
			name: local.name,
			localId: local.id,
			filename: this.preferencesService.getWorkflowPath(local.id),
			updatedAt: local.updatedAt.toISOString(),
		})) as SourceControlWorkflowVersionId[];
	}

	public async getRemoteCredentialsFromFiles(): Promise<
		Array<ExportableCredential & { filename: string }>
	> {
		const remoteCredentialFiles = await glob('*.json', {
			cwd: this.preferencesService.credentialExportFolder,
			absolute: true,
		});
		const remoteCredentialFilesParsed = await Promise.all(
			remoteCredentialFiles.map(async (file) => {
				this.logger.debug(`Parsing credential file ${file}`);
				const remote = jsonParse<ExportableCredential>(
					await fsReadFile(file, { encoding: 'utf8' }),
				);
				if (!remote?.id) {
					return undefined;
				}
				return {
					...remote,
					filename: this.preferencesService.getCredentialPath(remote.id),
				};
			}),
		);
		return remoteCredentialFilesParsed.filter((e) => e !== undefined) as Array<
			ExportableCredential & { filename: string }
		>;
	}

	public async getLocalCredentialsFromDb(): Promise<
		Array<ExportableCredential & { filename: string }>
	> {
		const localCredentials = await this.credentialsRepository.find({
			select: ['id', 'name', 'type', 'nodesAccess'],
		});
		return localCredentials.map((local) => ({
			id: local.id,
			name: local.name,
			type: local.type,
			nodesAccess: local.nodesAccess,
			filename: this.preferencesService.getCredentialPath(local.id),
		})) as Array<ExportableCredential & { filename: string }>;
	}

	public async getRemoteVariablesFromFile(): Promise<Variables[]> {
		const variablesFile = this.preferencesService.variablesExportFile;
		if (variablesFile.length > 0) {
			this.logger.debug(`Importing variables from file ${variablesFile[0]}`);
			return jsonParse<Variables[]>(await fsReadFile(variablesFile[0], { encoding: 'utf8' }), {
				fallbackValue: [],
			});
		}
		return [];
	}

	public async getLocalVariablesFromDb(): Promise<Variables[]> {
		return await this.variablesService.getAllCached();
	}

	public async getRemoteTagsAndMappingsFromFile(): Promise<{
		tags: TagEntity[];
		mappings: WorkflowTagMapping[];
	}> {
		const tagsFile = this.preferencesService.tagsExportFile;
		if (tagsFile.length > 0) {
			this.logger.debug(`Importing tags from file ${tagsFile[0]}`);
			const mappedTags = jsonParse<{ tags: TagEntity[]; mappings: WorkflowTagMapping[] }>(
				await fsReadFile(tagsFile[0], { encoding: 'utf8' }),
				{ fallbackValue: { tags: [], mappings: [] } },
			);
			return mappedTags;
		}
		return { tags: [], mappings: [] };
	}

	public async getLocalTagsAndMappingsFromDb(): Promise<{
		tags: TagEntity[];
		mappings: WorkflowTagMapping[];
	}> {
		const localTags = await this.tagRepository.find({
			select: ['id', 'name'],
		});
		const localMappings = await this.workflowTagMappingRepository.find({
			select: ['workflowId', 'tagId'],
		});
		return { tags: localTags, mappings: localMappings };
	}

	public async importWorkflowFromWorkFolder(candidates: SourceControlledFile[], userId: string) {
		const workflowRunner = this.activeWorkflowRunner;
		const candidateIds = candidates.map((c) => c.id);
		const existingWorkflows = await this.workflowRepository.findByIds(candidateIds, {
			select: ['id', 'name', 'versionId', 'active'],
		});
		const allSharedWorkflows = await this.sharedWorkflowRepository.findWithFields(candidateIds, {
			select: ['workflowId', 'role', 'userId'],
		});
		const cachedOwnerIds = new Map<string, string>();
		const importWorkflowsResult = await Promise.all(
			candidates.map(async (candidate) => {
				this.logger.debug(`Parsing workflow file ${candidate.file}`);
				const importedWorkflow = jsonParse<IWorkflowToImport & { owner: string }>(
					await fsReadFile(candidate.file, { encoding: 'utf8' }),
				);
				if (!importedWorkflow?.id) {
					return;
				}
				const existingWorkflow = existingWorkflows.find((e) => e.id === importedWorkflow.id);
				importedWorkflow.active = existingWorkflow?.active ?? false;
				this.logger.debug(`Updating workflow id ${importedWorkflow.id ?? 'new'}`);
				const upsertResult = await this.workflowRepository.upsert({ ...importedWorkflow }, ['id']);
				if (upsertResult?.identifiers?.length !== 1) {
					throw new ApplicationError('Failed to upsert workflow', {
						extra: { workflowId: importedWorkflow.id ?? 'new' },
					});
				}
				// Update workflow owner to the user who exported the workflow, if that user exists
				// in the instance, and the workflow doesn't already have an owner
				let workflowOwnerId = userId;
				if (cachedOwnerIds.has(importedWorkflow.owner)) {
					workflowOwnerId = cachedOwnerIds.get(importedWorkflow.owner) ?? userId;
				} else {
					const foundUser = await this.userRepository.findOne({
						where: {
							email: importedWorkflow.owner,
						},
						select: ['id'],
					});
					if (foundUser) {
						cachedOwnerIds.set(importedWorkflow.owner, foundUser.id);
						workflowOwnerId = foundUser.id;
					}
				}

				const existingSharedWorkflowOwnerByRoleId = allSharedWorkflows.find(
					(e) => e.workflowId === importedWorkflow.id && e.role === 'workflow:owner',
				);
				const existingSharedWorkflowOwnerByUserId = allSharedWorkflows.find(
					(e) => e.workflowId === importedWorkflow.id && e.role === 'workflow:owner',
				);
				if (!existingSharedWorkflowOwnerByUserId && !existingSharedWorkflowOwnerByRoleId) {
					// no owner exists yet, so create one
					await this.sharedWorkflowRepository.insert({
						workflowId: importedWorkflow.id,
						userId: workflowOwnerId,
						role: 'workflow:owner',
					});
				} else if (existingSharedWorkflowOwnerByRoleId) {
					// skip, because the workflow already has a global owner
				} else if (existingSharedWorkflowOwnerByUserId && !existingSharedWorkflowOwnerByRoleId) {
					// if the workflow has a non-global owner that is referenced by the owner file,
					// and no existing global owner, update the owner to the user referenced in the owner file
					await this.sharedWorkflowRepository.update(
						{
							workflowId: importedWorkflow.id,
							userId: workflowOwnerId,
						},
						{ role: 'workflow:owner' },
					);
				}
				if (existingWorkflow?.active) {
					try {
						// remove active pre-import workflow
						this.logger.debug(`Deactivating workflow id ${existingWorkflow.id}`);
						await workflowRunner.remove(existingWorkflow.id);
						// try activating the imported workflow
						this.logger.debug(`Reactivating workflow id ${existingWorkflow.id}`);
						await workflowRunner.add(existingWorkflow.id, 'activate');
						// update the versionId of the workflow to match the imported workflow
					} catch (error) {
						this.logger.error(`Failed to activate workflow ${existingWorkflow.id}`, error as Error);
					} finally {
						await this.workflowRepository.update(
							{ id: existingWorkflow.id },
							{ versionId: importedWorkflow.versionId },
						);
					}
				}

				return {
					id: importedWorkflow.id ?? 'unknown',
					name: candidate.file,
				};
			}),
		);
		return importWorkflowsResult.filter((e) => e !== undefined) as Array<{
			id: string;
			name: string;
		}>;
	}

	public async importCredentialsFromWorkFolder(candidates: SourceControlledFile[], userId: string) {
		const candidateIds = candidates.map((c) => c.id);
		const existingCredentials = await this.credentialsRepository.find({
			where: {
				id: In(candidateIds),
			},
			select: ['id', 'name', 'type', 'data'],
		});
		const existingSharedCredentials = await this.sharedCredentialsRepository.find({
			select: ['userId', 'credentialsId', 'role'],
			where: {
				credentialsId: In(candidateIds),
				role: 'credential:owner',
			},
		});
		let importCredentialsResult: Array<{ id: string; name: string; type: string }> = [];
		importCredentialsResult = await Promise.all(
			candidates.map(async (candidate) => {
				this.logger.debug(`Importing credentials file ${candidate.file}`);
				const credential = jsonParse<ExportableCredential>(
					await fsReadFile(candidate.file, { encoding: 'utf8' }),
				);
				const existingCredential = existingCredentials.find(
					(e) => e.id === credential.id && e.type === credential.type,
				);
				const sharedOwner = existingSharedCredentials.find(
					(e) => e.credentialsId === credential.id,
				);

				const { name, type, data, id, nodesAccess } = credential;
				const newCredentialObject = new Credentials({ id, name }, type, []);
				if (existingCredential?.data) {
					newCredentialObject.data = existingCredential.data;
				} else {
					newCredentialObject.setData(data);
				}
				newCredentialObject.nodesAccess = nodesAccess || existingCredential?.nodesAccess || [];

				this.logger.debug(`Updating credential id ${newCredentialObject.id as string}`);
				await this.credentialsRepository.upsert(newCredentialObject, ['id']);

				if (!sharedOwner) {
					const newSharedCredential = new SharedCredentials();
					newSharedCredential.credentialsId = newCredentialObject.id as string;
					newSharedCredential.userId = userId;
					newSharedCredential.role = 'credential:owner';

					await this.sharedCredentialsRepository.upsert({ ...newSharedCredential }, [
						'credentialsId',
						'userId',
					]);
				}

				return {
					id: newCredentialObject.id as string,
					name: newCredentialObject.name,
					type: newCredentialObject.type,
				};
			}),
		);
		return importCredentialsResult.filter((e) => e !== undefined);
	}

	public async importTagsFromWorkFolder(candidate: SourceControlledFile) {
		let mappedTags;
		try {
			this.logger.debug(`Importing tags from file ${candidate.file}`);
			mappedTags = jsonParse<{ tags: TagEntity[]; mappings: WorkflowTagMapping[] }>(
				await fsReadFile(candidate.file, { encoding: 'utf8' }),
				{ fallbackValue: { tags: [], mappings: [] } },
			);
		} catch (error) {
			this.logger.error(`Failed to import tags from file ${candidate.file}`, error as Error);
			return;
		}

		if (mappedTags.mappings.length === 0 && mappedTags.tags.length === 0) {
			return;
		}

		const existingWorkflowIds = new Set(
			(
				await this.workflowRepository.find({
					select: ['id'],
				})
			).map((e) => e.id),
		);

		await Promise.all(
			mappedTags.tags.map(async (tag) => {
				const findByName = await this.tagRepository.findOne({
					where: { name: tag.name },
					select: ['id'],
				});
				if (findByName && findByName.id !== tag.id) {
					throw new ApplicationError(
						`A tag with the name <strong>${tag.name}</strong> already exists locally.<br />Please either rename the local tag, or the remote one with the id <strong>${tag.id}</strong> in the tags.json file.`,
					);
				}

				const tagCopy = this.tagRepository.create(tag);
				await this.tagRepository.upsert(tagCopy, {
					skipUpdateIfNoValuesChanged: true,
					conflictPaths: { id: true },
				});
			}),
		);

		await Promise.all(
			mappedTags.mappings.map(async (mapping) => {
				if (!existingWorkflowIds.has(String(mapping.workflowId))) return;
				await this.workflowTagMappingRepository.upsert(
					{ tagId: String(mapping.tagId), workflowId: String(mapping.workflowId) },
					{
						skipUpdateIfNoValuesChanged: true,
						conflictPaths: { tagId: true, workflowId: true },
					},
				);
			}),
		);

		return mappedTags;
	}

	public async importVariablesFromWorkFolder(
		candidate: SourceControlledFile,
		valueOverrides?: {
			[key: string]: string;
		},
	) {
		const result: { imported: string[] } = { imported: [] };
		let importedVariables;
		try {
			this.logger.debug(`Importing variables from file ${candidate.file}`);
			importedVariables = jsonParse<Array<Partial<Variables>>>(
				await fsReadFile(candidate.file, { encoding: 'utf8' }),
				{ fallbackValue: [] },
			);
		} catch (error) {
			this.logger.error(`Failed to import tags from file ${candidate.file}`, error as Error);
			return;
		}
		const overriddenKeys = Object.keys(valueOverrides ?? {});

		for (const variable of importedVariables) {
			if (!variable.key) {
				continue;
			}
			// by default no value is stored remotely, so an empty string is retuned
			// it must be changed to undefined so as to not overwrite existing values!
			if (variable.value === '') {
				variable.value = undefined;
			}
			if (overriddenKeys.includes(variable.key) && valueOverrides) {
				variable.value = valueOverrides[variable.key];
				overriddenKeys.splice(overriddenKeys.indexOf(variable.key), 1);
			}
			try {
				await this.variablesRepository.upsert({ ...variable }, ['id']);
			} catch (errorUpsert) {
				if (isUniqueConstraintError(errorUpsert as Error)) {
					this.logger.debug(`Variable ${variable.key} already exists, updating instead`);
					try {
						await this.variablesRepository.update({ key: variable.key }, { ...variable });
					} catch (errorUpdate) {
						this.logger.debug(`Failed to update variable ${variable.key}, skipping`);
						this.logger.debug((errorUpdate as Error).message);
					}
				}
			} finally {
				result.imported.push(variable.key);
			}
		}

		// add remaining overrides as new variables
		if (overriddenKeys.length > 0 && valueOverrides) {
			for (const key of overriddenKeys) {
				result.imported.push(key);
				const newVariable = this.variablesRepository.create({
					key,
					value: valueOverrides[key],
				});
				await this.variablesRepository.save(newVariable);
			}
		}

		await this.variablesService.updateCache();

		return result;
	}
}
