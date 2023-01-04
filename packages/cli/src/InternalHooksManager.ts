import type { INodeTypes } from 'n8n-workflow';
import { InternalHooks } from '@/InternalHooks';
import { Telemetry } from '@/telemetry';

export class InternalHooksManager {
	private static internalHooksInstance: InternalHooks;

	static getInstance(): InternalHooks {
		if (this.internalHooksInstance) {
			return this.internalHooksInstance;
		}

		throw new Error('InternalHooks not initialized');
	}

	static async init(instanceId: string, nodeTypes: INodeTypes): Promise<InternalHooks> {
		if (!this.internalHooksInstance) {
			const telemetry = new Telemetry(instanceId);
			await telemetry.init();
			this.internalHooksInstance = new InternalHooks(telemetry, instanceId, nodeTypes);
		}

		return this.internalHooksInstance;
	}
}
