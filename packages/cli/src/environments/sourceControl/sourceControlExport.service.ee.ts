import { Service } from 'typedi';
import { writeFile as fsWriteFile, rm as fsRm } from 'fs/promises';
import { rmSync } from 'fs';
import { ApplicationError, type ICredentialDataDecryptedObject } from 'n8n-workflow';
import { Credentials } from 'n8n-core';

import type { WorkflowEntity } from '@db/entities/WorkflowEntity';
import { TagRepository } from '@db/repositories/tag.repository';
import { WorkflowRepository } from '@db/repositories/workflow.repository';
import { SharedCredentialsRepository } from '@db/repositories/sharedCredentials.repository';
import { SharedWorkflowRepository } from '@db/repositories/sharedWorkflow.repository';
import { WorkflowTagMappingRepository } from '@db/repositories/workflowTagMapping.repository';
import { Logger } from '@/Logger';

import type { SourceControlledFile } from './types/sourceControlledFile';
import type { ExportableWorkflow } from './types/exportableWorkflow';
import type { ExportableCredential } from './types/exportableCredential';
import type { ExportResult } from './types/exportResult';
import { SourceControlPreferencesService } from './sourceControlPreferences.service.ee';
import { SourceControlBaseService } from './sourceControlBase.service';
import { VariablesService } from '../variables/variables.service.ee';

@Service()
export class SourceControlExportService extends SourceControlBaseService {
	constructor(
		logger: Logger,
		private readonly variablesService: VariablesService,
		private readonly tagRepository: TagRepository,
		private readonly sharedCredentialsRepository: SharedCredentialsRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly workflowTagMappingRepository: WorkflowTagMappingRepository,
		private readonly preferencesService: SourceControlPreferencesService,
	) {
		super(logger);
	}

	async deleteRepositoryFolder() {
		try {
			await fsRm(this.preferencesService.gitFolder, { recursive: true });
		} catch (error) {
			this.logger.error(`Failed to delete work folder: ${(error as Error).message}`);
		}
	}

	public rmFilesFromExportFolder(filesToBeDeleted: Set<string>): Set<string> {
		try {
			filesToBeDeleted.forEach((e) => rmSync(e));
		} catch (error) {
			this.logger.error(`Failed to delete workflows from work folder: ${(error as Error).message}`);
		}
		return filesToBeDeleted;
	}

	private async writeExportableWorkflowsToExportFolder(
		workflowsToBeExported: WorkflowEntity[],
		owners: Record<string, string>,
	) {
		await Promise.all(
			workflowsToBeExported.map(async (e) => {
				const fileName = this.preferencesService.getWorkflowPath(e.id);
				const sanitizedWorkflow: ExportableWorkflow = {
					id: e.id,
					name: e.name,
					nodes: e.nodes,
					connections: e.connections,
					settings: e.settings,
					triggerCount: e.triggerCount,
					versionId: e.versionId,
					owner: owners[e.id],
				};
				this.logger.debug(`Writing workflow ${e.id} to ${fileName}`);
				return await fsWriteFile(fileName, JSON.stringify(sanitizedWorkflow, null, 2));
			}),
		);
	}

	async exportWorkflowsToWorkFolder(candidates: SourceControlledFile[]): Promise<ExportResult> {
		try {
			const { workflowExportFolder } = this.preferencesService;
			this.checkIfFoldersExists([workflowExportFolder]);
			const workflowIds = candidates.map((e) => e.id);
			const sharedWorkflows = await this.sharedWorkflowRepository.findByWorkflowIds(workflowIds);
			const workflows = await this.workflowRepository.findByIds(workflowIds);

			// determine owner of each workflow to be exported
			const owners: Record<string, string> = {};
			sharedWorkflows.forEach((e) => (owners[e.workflowId] = e.user.email));

			// write the workflows to the export folder as json files
			await this.writeExportableWorkflowsToExportFolder(workflows, owners);

			// await fsWriteFile(ownersFileName, JSON.stringify(owners, null, 2));
			return {
				count: sharedWorkflows.length,
				folder: workflowExportFolder,
				files: workflows.map((e) => ({
					id: e?.id,
					name: this.preferencesService.getWorkflowPath(e?.name),
				})),
			};
		} catch (error) {
			throw new ApplicationError('Failed to export workflows to work folder', { cause: error });
		}
	}

	async exportVariablesToWorkFolder(): Promise<ExportResult> {
		try {
			const { gitFolder } = this.preferencesService;
			this.checkIfFoldersExists([gitFolder]);
			const variables = await this.variablesService.getAllCached();
			// do not export empty variables
			if (variables.length === 0) {
				return {
					count: 0,
					folder: gitFolder,
					files: [],
				};
			}
			const fileName = this.preferencesService.variablesExportFile;
			const sanitizedVariables = variables.map((e) => ({ ...e, value: '' }));
			await fsWriteFile(fileName, JSON.stringify(sanitizedVariables, null, 2));
			return {
				count: sanitizedVariables.length,
				folder: gitFolder,
				files: [
					{
						id: '',
						name: fileName,
					},
				],
			};
		} catch (error) {
			throw new ApplicationError('Failed to export variables to work folder', {
				cause: error,
			});
		}
	}

	async exportTagsToWorkFolder(): Promise<ExportResult> {
		try {
			const { gitFolder, tagsExportFile } = this.preferencesService;
			this.checkIfFoldersExists([gitFolder]);
			const tags = await this.tagRepository.find();
			// do not export empty tags
			if (tags.length === 0) {
				return {
					count: 0,
					folder: gitFolder,
					files: [],
				};
			}
			const mappings = await this.workflowTagMappingRepository.find();
			const fileName = tagsExportFile;
			await fsWriteFile(
				fileName,
				JSON.stringify(
					{
						tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
						mappings,
					},
					null,
					2,
				),
			);
			return {
				count: tags.length,
				folder: gitFolder,
				files: [
					{
						id: '',
						name: fileName,
					},
				],
			};
		} catch (error) {
			throw new ApplicationError('Failed to export variables to work folder', { cause: error });
		}
	}

	private replaceCredentialData(
		data: ICredentialDataDecryptedObject,
	): ICredentialDataDecryptedObject {
		for (const [key] of Object.entries(data)) {
			try {
				if (data[key] === null) {
					delete data[key]; // remove invalid null values
				} else if (typeof data[key] === 'object') {
					data[key] = this.replaceCredentialData(data[key] as ICredentialDataDecryptedObject);
				} else if (typeof data[key] === 'string') {
					data[key] = this.stringContainsExpression(data[key] as string) ? data[key] : '';
				} else if (typeof data[key] === 'number') {
					// TODO: leaving numbers in for now, but maybe we should remove them
					continue;
				}
			} catch (error) {
				this.logger.error(`Failed to sanitize credential data: ${(error as Error).message}`);
				throw error;
			}
		}
		return data;
	}

	private stringContainsExpression(testString: string): boolean {
		return /^=.*\{\{.*\}\}/.test(testString);
	}

	async exportCredentialsToWorkFolder(candidates: SourceControlledFile[]): Promise<ExportResult> {
		try {
			const { credentialExportFolder } = this.preferencesService;
			this.checkIfFoldersExists([credentialExportFolder]);
			const credentialIds = candidates.map((e) => e.id);
			const credentialsToBeExported =
				await this.sharedCredentialsRepository.findByCredentialIds(credentialIds);
			let missingIds: string[] = [];
			if (credentialsToBeExported.length !== credentialIds.length) {
				const foundCredentialIds = credentialsToBeExported.map((e) => e.credentialsId);
				missingIds = credentialIds.filter(
					(remote) => foundCredentialIds.findIndex((local) => local === remote) === -1,
				);
			}
			await Promise.all(
				credentialsToBeExported.map(async (sharedCredential) => {
					const { name, type, nodesAccess, data, id } = sharedCredential.credentials;
					const credentialObject = new Credentials({ id, name }, type, nodesAccess, data);
					const plainData = credentialObject.getData();
					const sanitizedData = this.replaceCredentialData(plainData);
					const fileName = this.preferencesService.getCredentialPath(
						sharedCredential.credentials.id,
					);
					const sanitizedCredential: ExportableCredential = {
						id: sharedCredential.credentials.id,
						name: sharedCredential.credentials.name,
						type: sharedCredential.credentials.type,
						data: sanitizedData,
						nodesAccess: sharedCredential.credentials.nodesAccess,
					};
					this.logger.debug(`Writing credential ${sharedCredential.credentials.id} to ${fileName}`);
					return await fsWriteFile(fileName, JSON.stringify(sanitizedCredential, null, 2));
				}),
			);
			return {
				count: credentialsToBeExported.length,
				folder: credentialExportFolder,
				files: credentialsToBeExported.map((e) => ({
					id: e.credentials.id,
					name: this.preferencesService.getCredentialPath(e.credentials.name),
				})),
				missingIds,
			};
		} catch (error) {
			throw new ApplicationError('Failed to export credentials to work folder', { cause: error });
		}
	}
}
