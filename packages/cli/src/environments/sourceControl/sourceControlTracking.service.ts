import { Service } from 'typedi';
import type { SourceControlledFile } from './types/sourceControlledFile';

@Service()
export class SourceControlTrackingService {
	getTrackingInformationFromPullResult(result: SourceControlledFile[]): {
		cred_conflicts: number;
		workflow_conflicts: number;
		workflow_updates: number;
	} {
		const uniques = this.filterSourceControlledFilesUniqueIds(result);
		return {
			cred_conflicts: uniques.filter(
				(file) =>
					file.type === 'credential' && file.status === 'modified' && file.location === 'local',
			).length,
			workflow_conflicts: uniques.filter(
				(file) =>
					file.type === 'workflow' && file.status === 'modified' && file.location === 'local',
			).length,
			workflow_updates: uniques.filter((file) => file.type === 'workflow').length,
		};
	}

	getTrackingInformationFromPrePushResult(result: SourceControlledFile[]): {
		workflows_eligible: number;
		workflows_eligible_with_conflicts: number;
		creds_eligible: number;
		creds_eligible_with_conflicts: number;
		variables_eligible: number;
	} {
		const uniques = this.filterSourceControlledFilesUniqueIds(result);
		return {
			workflows_eligible: uniques.filter((file) => file.type === 'workflow').length,
			workflows_eligible_with_conflicts: uniques.filter(
				(file) => file.type === 'workflow' && file.conflict,
			).length,
			creds_eligible: uniques.filter((file) => file.type === 'credential').length,
			creds_eligible_with_conflicts: uniques.filter(
				(file) => file.type === 'credential' && file.conflict,
			).length,
			variables_eligible: uniques.filter((file) => file.type === 'variables').length,
		};
	}

	getTrackingInformationFromPostPushResult(result: SourceControlledFile[]): {
		workflows_eligible: number;
		workflows_pushed: number;
		creds_pushed: number;
		variables_pushed: number;
	} {
		const uniques = this.filterSourceControlledFilesUniqueIds(result);
		return {
			workflows_pushed:
				uniques.filter((file) => file.pushed && file.type === 'workflow').length ?? 0,
			workflows_eligible: uniques.filter((file) => file.type === 'workflow').length ?? 0,
			creds_pushed:
				uniques.filter((file) => file.pushed && file.file.startsWith('credential_stubs')).length ??
				0,
			variables_pushed:
				uniques.filter((file) => file.pushed && file.file.startsWith('variable_stubs')).length ?? 0,
		};
	}

	private filterSourceControlledFilesUniqueIds(files: SourceControlledFile[]) {
		return (
			files.filter((file, index, self) => {
				return self.findIndex((f) => f.id === file.id) === index;
			}) || []
		);
	}
}
