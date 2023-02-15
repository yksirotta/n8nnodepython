import type { Repository } from 'typeorm';
import type { WorkflowEntity } from '@db/entities/WorkflowEntity';
import type { ILicenseReadResponse } from '@/Interfaces';
import type { License } from '@/License';

// TODO: make this injectable
export class LicenseService {
	constructor(private license: License, private workflowRepository: Repository<WorkflowEntity>) {}

	async getActiveTriggerCount(): Promise<number> {
		const totalTriggerCount = await this.workflowRepository.sum('triggerCount', { active: true });
		return totalTriggerCount ?? 0;
	}

	// Helper for getting the basic license data that we want to return
	async getLicenseData(): Promise<ILicenseReadResponse> {
		const triggerCount = await this.getActiveTriggerCount();
		const mainPlan = this.license.getMainPlan();

		return {
			usage: {
				executions: {
					value: triggerCount,
					limit: this.license.getTriggerLimit(),
					warningThreshold: 0.8,
				},
			},
			license: {
				planId: mainPlan?.productId ?? '',
				planName: this.license.getPlanName(),
			},
		};
	}

	getManagementToken(): string {
		return this.license.getManagementJwt();
	}

	async activateLicense(activationKey: string): Promise<void> {
		return this.license.activate(activationKey);
	}

	async renewLicense(): Promise<void> {
		return this.license.renew();
	}
}
