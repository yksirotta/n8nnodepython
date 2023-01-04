import type RudderStack from '@rudderstack/rudder-sdk-node';
import type { PostHog } from 'posthog-node';
import type { ITelemetryTrackProperties } from 'n8n-workflow';
import { LoggerProxy } from 'n8n-workflow';
import config from '@/config';
import type { IExecutionTrackProperties } from '@/Interfaces';
import { getLogger } from '@/Logger';
import { getLicense } from '@/License';
import { LicenseService } from '@/license/License.service';
import { N8N_VERSION } from '@/constants';

type ExecutionTrackDataKey = 'manual_error' | 'manual_success' | 'prod_error' | 'prod_success';

interface IExecutionTrackData {
	count: number;
	first: Date;
}

interface IExecutionsBuffer {
	[workflowId: string]: {
		manual_error?: IExecutionTrackData;
		manual_success?: IExecutionTrackData;
		prod_error?: IExecutionTrackData;
		prod_success?: IExecutionTrackData;
		user_id: string | undefined;
	};
}

export class Telemetry {
	private rudderStack?: RudderStack;

	private postHog?: PostHog;

	private pulseIntervalReference: NodeJS.Timeout;

	private executionCountsBuffer: IExecutionsBuffer = {};

	constructor(private instanceId: string) {}

	async init() {
		const enabled = config.getEnv('diagnostics.enabled');
		if (enabled) {
			const conf = config.getEnv('diagnostics.config.backend');
			const [key, url] = conf.split(';');

			if (!key || !url) {
				const logger = getLogger();
				LoggerProxy.init(logger);
				logger.warn('Diagnostics backend config is invalid');
				return;
			}

			const logLevel = config.getEnv('logs.level');

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const { default: RudderStack } = await import('@rudderstack/rudder-sdk-node');
			this.rudderStack = new RudderStack(key, url, { logLevel });

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const { PostHog } = await import('posthog-node');
			this.postHog = new PostHog(config.getEnv('diagnostics.config.posthog.apiKey'));

			this.startPulse();
		}
	}

	private startPulse() {
		this.pulseIntervalReference = setInterval(() => this.pulse(), 6 * 60 * 60 * 1000); // every 6 hours
	}

	private pulse(): void {
		if (!this.rudderStack) return;

		Object.keys(this.executionCountsBuffer).forEach(async (workflowId) => {
			this.track(
				'Workflow execution count',
				{
					event_version: '2',
					workflow_id: workflowId,
					...this.executionCountsBuffer[workflowId],
				},
				{ withPostHog: true },
			);
		});

		this.executionCountsBuffer = {};

		// License info
		void LicenseService.getActiveTriggerCount().then((usage) => {
			const license = getLicense();
			this.track('pulse', {
				plan_name_current: license.getPlanName(),
				quota: license.getTriggerLimit(),
				usage,
			});
		});
	}

	trackWorkflowExecution(properties: IExecutionTrackProperties): void {
		if (this.rudderStack) {
			const execTime = new Date();
			const workflowId = properties.workflow_id;

			this.executionCountsBuffer[workflowId] = this.executionCountsBuffer[workflowId] ?? {
				user_id: properties.user_id,
			};

			const key: ExecutionTrackDataKey = `${properties.is_manual ? 'manual' : 'prod'}_${
				properties.success ? 'success' : 'error'
			}`;

			if (!this.executionCountsBuffer[workflowId][key]) {
				this.executionCountsBuffer[workflowId][key] = {
					count: 1,
					first: execTime,
				};
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.executionCountsBuffer[workflowId][key]!.count++;
			}

			if (!properties.success && properties.error_node_type?.startsWith('n8n-nodes-base')) {
				this.track('Workflow execution errored', properties);
			}
		}
	}

	async trackN8nStop(): Promise<void> {
		clearInterval(this.pulseIntervalReference);
		void this.track('User instance stopped');
		return new Promise<void>((resolve) => {
			if (this.postHog) {
				this.postHog.shutdown();
			}

			if (this.rudderStack) {
				this.rudderStack.flush(resolve);
			} else {
				resolve();
			}
		});
	}

	identify(traits?: {
		[key: string]: string | number | boolean | object | undefined | null;
	}): void {
		if (this.rudderStack) {
			this.rudderStack.identify({
				userId: this.instanceId,
				traits: {
					...traits,
					instanceId: this.instanceId,
				},
			});
		}
	}

	track(
		eventName: string,
		properties: ITelemetryTrackProperties = {},
		{ withPostHog } = { withPostHog: false }, // whether to additionally track with PostHog
	): void {
		if (this.rudderStack) {
			const { user_id } = properties;
			const updatedProperties: ITelemetryTrackProperties = {
				...properties,
				instance_id: this.instanceId,
				version_cli: N8N_VERSION,
			};

			const payload = {
				userId: `${this.instanceId}${user_id ? `#${user_id}` : ''}`,
				event: eventName,
				properties: updatedProperties,
			};

			if (withPostHog) {
				this.postHog?.capture({
					distinctId: payload.userId,
					sendFeatureFlags: true,
					...payload,
				});
			}

			this.rudderStack.track(payload);
		}
	}

	async isFeatureFlagEnabled(
		featureFlagName: string,
		{ user_id: userId }: ITelemetryTrackProperties = {},
	): Promise<boolean | undefined> {
		if (!this.postHog) return Promise.resolve(false);

		const fullId = [this.instanceId, userId].join('#');

		return this.postHog.isFeatureEnabled(featureFlagName, fullId);
	}

	// test helpers

	getCountsBuffer(): IExecutionsBuffer {
		return this.executionCountsBuffer;
	}
}
