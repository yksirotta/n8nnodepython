import { snakeCase } from 'change-case';
import { BinaryDataManager } from 'n8n-core';
import type {
	INodesGraphResult,
	INodeTypes,
	IRun,
	ITelemetryTrackProperties,
	IWorkflowBase,
} from 'n8n-workflow';
import { sleep, TelemetryHelpers } from 'n8n-workflow';
import { get as pslGet } from 'psl';
import type {
	IDiagnosticInfo,
	ITelemetryUserDeletionData,
	IWorkflowDb,
	IExecutionTrackProperties,
	IWorkflowExecutionDataProcess,
} from '@/Interfaces';
import type { Telemetry } from '@/telemetry';
import type { AuthProviderType } from '@db/entities/AuthIdentity';
import { RoleService } from './role/role.service';
import { eventBus } from './eventbus';
import type { User } from '@db/entities/User';
import { N8N_VERSION } from '@/constants';

function userToPayload(user: User): {
	userId: string;
	_email: string;
	_firstName: string;
	_lastName: string;
	globalRole?: string;
} {
	return {
		userId: user.id,
		_email: user.email,
		_firstName: user.firstName,
		_lastName: user.lastName,
		globalRole: user.globalRole?.name,
	};
}

export class InternalHooks {
	constructor(
		private telemetry: Telemetry,
		private instanceId: string,
		private nodeTypes: INodeTypes,
	) {}

	onServerStarted(diagnosticInfo: IDiagnosticInfo, earliestWorkflowCreatedAt?: Date) {
		const info = {
			version_cli: diagnosticInfo.versionCli,
			db_type: diagnosticInfo.databaseType,
			n8n_version_notifications_enabled: diagnosticInfo.notificationsEnabled,
			n8n_disable_production_main_process: diagnosticInfo.disableProductionWebhooksOnMainProcess,
			n8n_basic_auth_active: diagnosticInfo.basicAuthActive,
			system_info: diagnosticInfo.systemInfo,
			execution_variables: diagnosticInfo.executionVariables,
			n8n_deployment_type: diagnosticInfo.deploymentType,
			n8n_binary_data_mode: diagnosticInfo.binaryDataMode,
			n8n_multi_user_allowed: diagnosticInfo.n8n_multi_user_allowed,
			smtp_set_up: diagnosticInfo.smtp_set_up,
			ldap_allowed: diagnosticInfo.ldap_allowed,
		};

		this.telemetry.identify(info);
		this.telemetry.track('Instance started', {
			...info,
			earliest_workflow_created: earliestWorkflowCreatedAt,
		});
	}

	onFrontendSettingsAPI(sessionId?: string) {
		this.telemetry.track('Session started', { session_id: sessionId });
	}

	onPersonalizationSurveySubmitted(userId: string, answers: Record<string, string>) {
		const camelCaseKeys = Object.keys(answers);
		const personalizationSurveyData = { user_id: userId } as Record<string, string | string[]>;
		camelCaseKeys.forEach((camelCaseKey) => {
			personalizationSurveyData[snakeCase(camelCaseKey)] = answers[camelCaseKey];
		});

		this.telemetry.track('User responded to personalization questions', personalizationSurveyData, {
			withPostHog: true,
		});
	}

	onWorkflowCreated(user: User, workflow: IWorkflowBase, publicApi: boolean) {
		const { nodeGraph } = TelemetryHelpers.generateNodesGraph(workflow, this.nodeTypes);
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.workflow.created',
			payload: {
				...userToPayload(user),
				workflowId: workflow.id,
				workflowName: workflow.name,
			},
		});

		this.telemetry.track('User created workflow', {
			user_id: user.id,
			workflow_id: workflow.id,
			node_graph_string: JSON.stringify(nodeGraph),
			public_api: publicApi,
		});
	}

	onWorkflowDeleted(user: User, workflowId: string, publicApi: boolean) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.workflow.deleted',
			payload: {
				...userToPayload(user),
				workflowId,
			},
		});

		this.telemetry.track('User deleted workflow', {
			user_id: user.id,
			workflow_id: workflowId,
			public_api: publicApi,
		});
	}

	async onWorkflowSaved(user: User, workflow: IWorkflowDb, publicApi: boolean) {
		const { nodeGraph } = TelemetryHelpers.generateNodesGraph(workflow, this.nodeTypes);

		const notesCount = Object.keys(nodeGraph.notes).length;
		const overlappingCount = Object.values(nodeGraph.notes).filter(
			(note) => note.overlapping,
		).length;

		let userRole: 'owner' | 'sharee' | undefined = undefined;
		if (user.id && workflow.id) {
			const role = await RoleService.getUserRoleForWorkflow(user.id, workflow.id);
			if (role) {
				userRole = role.name === 'owner' ? 'owner' : 'sharee';
			}
		}

		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.workflow.updated',
			payload: {
				...userToPayload(user),
				workflowId: workflow.id,
				workflowName: workflow.name,
			},
		});

		this.telemetry.track(
			'User saved workflow',
			{
				user_id: user.id,
				workflow_id: workflow.id,
				node_graph_string: JSON.stringify(nodeGraph),
				notes_count_overlapping: overlappingCount,
				notes_count_non_overlapping: notesCount - overlappingCount,
				version_cli: N8N_VERSION,
				num_tags: workflow.tags?.length ?? 0,
				public_api: publicApi,
				sharing_role: userRole,
			},
			{ withPostHog: true },
		);
	}

	onNodeBeforeExecute(executionId: string, workflow: IWorkflowBase, nodeName: string) {
		const nodeInWorkflow = workflow.nodes.find((node) => node.name === nodeName);
		eventBus.sendNodeEvent({
			eventName: 'n8n.node.started',
			payload: {
				executionId,
				nodeName,
				workflowId: workflow.id?.toString(),
				workflowName: workflow.name,
				nodeType: nodeInWorkflow?.type,
			},
		});
	}

	onNodePostExecute(executionId: string, workflow: IWorkflowBase, nodeName: string) {
		const nodeInWorkflow = workflow.nodes.find((node) => node.name === nodeName);
		eventBus.sendNodeEvent({
			eventName: 'n8n.node.finished',
			payload: {
				executionId,
				nodeName,
				workflowId: workflow.id?.toString(),
				workflowName: workflow.name,
				nodeType: nodeInWorkflow?.type,
			},
		});
	}

	onWorkflowBeforeExecute(executionId: string, data: IWorkflowExecutionDataProcess) {
		eventBus.sendWorkflowEvent({
			eventName: 'n8n.workflow.started',
			payload: {
				executionId,
				userId: data.userId,
				workflowId: data.workflowData.id?.toString(),
				isManual: data.executionMode === 'manual',
				workflowName: data.workflowData.name,
			},
		});
	}

	async onWorkflowPostExecute(
		executionId: string,
		workflow: IWorkflowBase,
		runData?: IRun,
		userId?: string,
	) {
		if (!workflow.id) return;

		const properties: IExecutionTrackProperties = {
			workflow_id: workflow.id,
			is_manual: false,
			version_cli: N8N_VERSION,
			success: false,
		};

		if (userId) {
			properties.user_id = userId;
		}

		if (runData !== undefined) {
			properties.execution_mode = runData.mode;
			properties.success = !!runData.finished;
			properties.is_manual = runData.mode === 'manual';

			let nodeGraphResult: INodesGraphResult | null = null;

			if (!properties.success && runData?.data.resultData.error) {
				properties.error_message = runData?.data.resultData.error.message;
				let errorNodeName =
					'node' in runData?.data.resultData.error
						? runData?.data.resultData.error.node?.name
						: undefined;
				properties.error_node_type =
					'node' in runData?.data.resultData.error
						? runData?.data.resultData.error.node?.type
						: undefined;

				if (runData.data.resultData.lastNodeExecuted) {
					const lastNode = TelemetryHelpers.getNodeTypeForName(
						workflow,
						runData.data.resultData.lastNodeExecuted,
					);

					if (lastNode !== undefined) {
						properties.error_node_type = lastNode.type;
						errorNodeName = lastNode.name;
					}
				}

				if (properties.is_manual) {
					nodeGraphResult = TelemetryHelpers.generateNodesGraph(workflow, this.nodeTypes);
					properties.node_graph = nodeGraphResult.nodeGraph;
					properties.node_graph_string = JSON.stringify(nodeGraphResult.nodeGraph);

					if (errorNodeName) {
						properties.error_node_id = nodeGraphResult.nameIndices[errorNodeName];
					}
				}
			}

			if (properties.is_manual) {
				if (!nodeGraphResult) {
					nodeGraphResult = TelemetryHelpers.generateNodesGraph(workflow, this.nodeTypes);
				}

				let userRole: 'owner' | 'sharee' | undefined = undefined;
				if (userId) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					const role = await RoleService.getUserRoleForWorkflow(userId, workflow.id);
					if (role) {
						userRole = role.name === 'owner' ? 'owner' : 'sharee';
					}
				}

				const manualExecEventProperties: ITelemetryTrackProperties = {
					user_id: userId,
					workflow_id: workflow.id,
					status: properties.success ? 'success' : 'failed',
					error_message: properties.error_message as string,
					error_node_type: properties.error_node_type,
					node_graph_string: properties.node_graph_string as string,
					error_node_id: properties.error_node_id as string,
					webhook_domain: null,
					sharing_role: userRole,
				};

				if (!manualExecEventProperties.node_graph_string) {
					nodeGraphResult = TelemetryHelpers.generateNodesGraph(workflow, this.nodeTypes);
					manualExecEventProperties.node_graph_string = JSON.stringify(nodeGraphResult.nodeGraph);
				}

				if (runData.data.startData?.destinationNode) {
					const telemetryPayload = {
						...manualExecEventProperties,
						node_type: TelemetryHelpers.getNodeTypeForName(
							workflow,
							runData.data.startData?.destinationNode,
						)?.type,
						node_id: nodeGraphResult.nameIndices[runData.data.startData?.destinationNode],
					};

					this.telemetry.track('Manual node exec finished', telemetryPayload, {
						withPostHog: true,
					});
				} else {
					nodeGraphResult.webhookNodeNames.forEach((name: string) => {
						const execJson = runData.data.resultData.runData[name]?.[0]?.data?.main?.[0]?.[0]
							?.json as { headers?: { origin?: string } };
						if (execJson?.headers?.origin && execJson.headers.origin !== '') {
							manualExecEventProperties.webhook_domain = pslGet(
								execJson.headers.origin.replace(/^https?:\/\//, ''),
							);
						}
					});

					this.telemetry.track('Manual workflow exec finished', manualExecEventProperties, {
						withPostHog: true,
					});
				}
			}
		}

		const eventName = properties.success ? 'n8n.workflow.success' : 'n8n.workflow.failed';
		const payload = {
			executionId,
			success: properties.success,
			userId: properties.user_id,
			workflowId: properties.workflow_id,
			isManual: properties.is_manual,
			workflowName: workflow.name,
		};
		if (!properties.success) {
			Object.assign(payload, {
				lastNodeExecuted: runData?.data.resultData.lastNodeExecuted,
				errorNodeType: properties.error_node_type,
				errorNodeId: properties.error_node_id?.toString(),
				errorMessage: properties.error_message?.toString(),
			});
		}
		eventBus.sendWorkflowEvent({ eventName, payload });

		void BinaryDataManager.getInstance().persistBinaryDataForExecutionId(executionId);

		this.telemetry.trackWorkflowExecution(properties);
	}

	onWorkflowSharingUpdate(workflowId: string, userId: string, userList: string[]) {
		const properties: ITelemetryTrackProperties = {
			workflow_id: workflowId,
			user_id_sharer: userId,
			user_id_list: userList,
		};

		this.telemetry.track('User updated workflow sharing', properties, { withPostHog: true });
	}

	async onN8nStop(): Promise<void> {
		return Promise.race([sleep(3000), this.telemetry.trackN8nStop()]);
	}

	onUserDeletion(userDeletionData: {
		user: User;
		telemetryData: ITelemetryUserDeletionData;
		publicApi: boolean;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.deleted',
			payload: {
				...userToPayload(userDeletionData.user),
			},
		});
		this.telemetry.track('User deleted user', {
			...userDeletionData.telemetryData,
			user_id: userDeletionData.user.id,
			public_api: userDeletionData.publicApi,
		});
	}

	onUserInvite(userInviteData: {
		user: User;
		target_user_id: string[];
		public_api: boolean;
		email_sent: boolean;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.invited',
			payload: {
				...userToPayload(userInviteData.user),
				targetUserId: userInviteData.target_user_id,
			},
		});
		this.telemetry.track('User invited new user', {
			user_id: userInviteData.user.id,
			target_user_id: userInviteData.target_user_id,
			public_api: userInviteData.public_api,
			email_sent: userInviteData.email_sent,
		});
	}

	onUserReinvite(userReinviteData: { user: User; target_user_id: string; public_api: boolean }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.reinvited',
			payload: {
				...userToPayload(userReinviteData.user),
				targetUserId: userReinviteData.target_user_id,
			},
		});
		this.telemetry.track('User resent new user invite email', {
			user_id: userReinviteData.user.id,
			target_user_id: userReinviteData.target_user_id,
			public_api: userReinviteData.public_api,
		});
	}

	onUserRetrievedUser(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved user', userRetrievedData);
	}

	onUserRetrievedAllUsers(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved all users', userRetrievedData);
	}

	onUserRetrievedExecution(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved execution', userRetrievedData);
	}

	onUserRetrievedAllExecutions(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved all executions', userRetrievedData);
	}

	onUserRetrievedWorkflow(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved workflow', userRetrievedData);
	}

	onUserRetrievedAllWorkflows(userRetrievedData: { user_id: string; public_api: boolean }) {
		this.telemetry.track('User retrieved all workflows', userRetrievedData);
	}

	onUserUpdate(userUpdateData: { user: User; fields_changed: string[] }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.updated',
			payload: {
				...userToPayload(userUpdateData.user),
				fieldsChanged: userUpdateData.fields_changed,
			},
		});
		this.telemetry.track('User changed personal settings', {
			user_id: userUpdateData.user.id,
			fields_changed: userUpdateData.fields_changed,
		});
	}

	onUserInviteEmailClick(userInviteClickData: { inviter: User; invitee: User }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.invitation.accepted',
			payload: {
				invitee: {
					...userToPayload(userInviteClickData.invitee),
				},
				inviter: {
					...userToPayload(userInviteClickData.inviter),
				},
			},
		});
		this.telemetry.track('User clicked invite link from email', {
			user_id: userInviteClickData.invitee.id,
		});
	}

	onUserPasswordResetEmailClick(userPasswordResetData: { user: User }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.reset',
			payload: {
				...userToPayload(userPasswordResetData.user),
			},
		});
		this.telemetry.track('User clicked password reset link from email', {
			user_id: userPasswordResetData.user.id,
		});
	}

	onUserTransactionalEmail(userTransactionalEmailData: {
		user_id: string;
		message_type: 'Reset password' | 'New user invite' | 'Resend invite';
		public_api: boolean;
	}) {
		this.telemetry.track('Instance sent transactional email to user', userTransactionalEmailData);
	}

	onUserInvokedApi(userInvokedApiData: {
		user_id: string;
		path: string;
		method: string;
		api_version: string;
	}) {
		this.telemetry.track('User invoked API', userInvokedApiData);
	}

	onApiKeyDeleted(apiKeyDeletedData: { user: User; public_api: boolean }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.api.deleted',
			payload: {
				...userToPayload(apiKeyDeletedData.user),
			},
		});
		this.telemetry.track('API key deleted', {
			user_id: apiKeyDeletedData.user.id,
			public_api: apiKeyDeletedData.public_api,
		});
	}

	onApiKeyCreated(apiKeyCreatedData: { user: User; public_api: boolean }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.api.created',
			payload: {
				...userToPayload(apiKeyCreatedData.user),
			},
		});
		this.telemetry.track('API key created', {
			user_id: apiKeyCreatedData.user.id,
			public_api: apiKeyCreatedData.public_api,
		});
	}

	onUserPasswordResetRequestClick(userPasswordResetData: { user: User }) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.reset.requested',
			payload: {
				...userToPayload(userPasswordResetData.user),
			},
		});
		this.telemetry.track('User requested password reset while logged out', {
			user_id: userPasswordResetData.user.id,
		});
	}

	onInstanceOwnerSetup(instanceOwnerSetupData: { user_id: string }) {
		this.telemetry.track('Owner finished instance setup', instanceOwnerSetupData);
	}

	onUserSignup(
		user: User,
		userSignupData: {
			user_type: AuthProviderType;
			was_disabled_ldap_user: boolean;
		},
	) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.signedup',
			payload: {
				...userToPayload(user),
			},
		});
		this.telemetry.track('User signed up', {
			user_id: user.id,
			...userSignupData,
		});
	}

	onEmailFailed(failedEmailData: {
		user: User;
		message_type: 'Reset password' | 'New user invite' | 'Resend invite';
		public_api: boolean;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.email.failed',
			payload: {
				messageType: failedEmailData.message_type,
				...userToPayload(failedEmailData.user),
			},
		});
		this.telemetry.track('Instance failed to send transactional email to user', {
			user_id: failedEmailData.user.id,
		});
	}

	/**
	 * Credentials
	 */
	onUserCreatedCredentials(userCreatedCredentialsData: {
		user: User;
		credential_name: string;
		credential_type: string;
		credential_id: string;
		public_api: boolean;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.credentials.created',
			payload: {
				...userToPayload(userCreatedCredentialsData.user),
				credentialName: userCreatedCredentialsData.credential_name,
				credentialType: userCreatedCredentialsData.credential_type,
				credentialId: userCreatedCredentialsData.credential_id,
			},
		});
		this.telemetry.track('User created credentials', {
			user_id: userCreatedCredentialsData.user.id,
			credential_type: userCreatedCredentialsData.credential_type,
			credential_id: userCreatedCredentialsData.credential_id,
			instance_id: this.instanceId,
		});
	}

	onUserSharedCredentials(userSharedCredentialsData: {
		user: User;
		credential_name: string;
		credential_type: string;
		credential_id: string;
		user_id_sharer: string;
		user_ids_sharees_added: string[];
		sharees_removed: number | null;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.user.credentials.shared',
			payload: {
				...userToPayload(userSharedCredentialsData.user),
				credentialName: userSharedCredentialsData.credential_name,
				credentialType: userSharedCredentialsData.credential_type,
				credentialId: userSharedCredentialsData.credential_id,
				userIdSharer: userSharedCredentialsData.user_id_sharer,
				userIdsShareesAdded: userSharedCredentialsData.user_ids_sharees_added,
				shareesRemoved: userSharedCredentialsData.sharees_removed,
			},
		});
		this.telemetry.track('User updated cred sharing', {
			user_id: userSharedCredentialsData.user.id,
			credential_type: userSharedCredentialsData.credential_type,
			credential_id: userSharedCredentialsData.credential_id,
			user_id_sharer: userSharedCredentialsData.user_id_sharer,
			user_ids_sharees_added: userSharedCredentialsData.user_ids_sharees_added,
			sharees_removed: userSharedCredentialsData.sharees_removed,
			instance_id: this.instanceId,
		});
	}

	/**
	 * Community nodes backend telemetry events
	 */

	onCommunityPackageInstallFinished(installationData: {
		user: User;
		input_string: string;
		package_name: string;
		success: boolean;
		package_version?: string;
		package_node_names?: string[];
		package_author?: string;
		package_author_email?: string;
		failure_reason?: string;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.package.installed',
			payload: {
				...userToPayload(installationData.user),
				inputString: installationData.input_string,
				packageName: installationData.package_name,
				success: installationData.success,
				packageVersion: installationData.package_version,
				packageNodeNames: installationData.package_node_names,
				packageAuthor: installationData.package_author,
				packageAuthorEmail: installationData.package_author_email,
				failureReason: installationData.failure_reason,
			},
		});
		this.telemetry.track('cnr package install finished', {
			user_id: installationData.user.id,
			input_string: installationData.input_string,
			package_name: installationData.package_name,
			success: installationData.success,
			package_version: installationData.package_version,
			package_node_names: installationData.package_node_names,
			package_author: installationData.package_author,
			package_author_email: installationData.package_author_email,
			failure_reason: installationData.failure_reason,
		});
	}

	onCommunityPackageUpdateFinished(updateData: {
		user: User;
		package_name: string;
		package_version_current: string;
		package_version_new: string;
		package_node_names: string[];
		package_author?: string;
		package_author_email?: string;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.package.updated',
			payload: {
				...userToPayload(updateData.user),
				packageName: updateData.package_name,
				packageVersionCurrent: updateData.package_version_current,
				packageVersionNew: updateData.package_version_new,
				packageNodeNames: updateData.package_node_names,
				packageAuthor: updateData.package_author,
				packageAuthorEmail: updateData.package_author_email,
			},
		});
		this.telemetry.track('cnr package updated', {
			user_id: updateData.user.id,
			package_name: updateData.package_name,
			package_version_current: updateData.package_version_current,
			package_version_new: updateData.package_version_new,
			package_node_names: updateData.package_node_names,
			package_author: updateData.package_author,
			package_author_email: updateData.package_author_email,
		});
	}

	onCommunityPackageDeleteFinished(deleteData: {
		user: User;
		package_name: string;
		package_version: string;
		package_node_names: string[];
		package_author?: string;
		package_author_email?: string;
	}) {
		eventBus.sendAuditEvent({
			eventName: 'n8n.audit.package.deleted',
			payload: {
				...userToPayload(deleteData.user),
				packageName: deleteData.package_name,
				packageVersion: deleteData.package_version,
				packageNodeNames: deleteData.package_node_names,
				packageAuthor: deleteData.package_author,
				packageAuthorEmail: deleteData.package_author_email,
			},
		});
		this.telemetry.track('cnr package deleted', {
			user_id: deleteData.user.id,
			package_name: deleteData.package_name,
			package_version: deleteData.package_version,
			package_node_names: deleteData.package_node_names,
			package_author: deleteData.package_author,
			package_author_email: deleteData.package_author_email,
		});
	}

	onLdapSyncFinished(data: {
		type: string;
		succeeded: boolean;
		users_synced: number;
		error: string;
	}) {
		this.telemetry.track('Ldap general sync finished', data);
	}

	onLdapUsersDisabled(data: {
		reason: 'ldap_update' | 'ldap_feature_deactivated';
		users: number;
		user_ids: string[];
	}) {
		this.telemetry.track('Ldap users disabled', data);
	}

	onUserUpdatedLdapSettings(data: {
		user_id: string;
		loginIdAttribute: string;
		firstNameAttribute: string;
		lastNameAttribute: string;
		emailAttribute: string;
		ldapIdAttribute: string;
		searchPageSize: number;
		searchTimeout: number;
		synchronizationEnabled: boolean;
		synchronizationInterval: number;
		loginLabel: string;
		loginEnabled: boolean;
	}) {
		this.telemetry.track('Ldap general sync finished', data);
	}

	onLdapLoginSyncFailed(data: { error: string }) {
		this.telemetry.track('Ldap login sync failed', data);
	}

	userLoginFailedDueToLdapDisabled(data: { user_id: string }) {
		this.telemetry.track('User login failed since ldap disabled', data);
	}

	/*
	 * Execution Statistics
	 */
	onFirstProductionWorkflowSuccess(data: { user_id: string; workflow_id: string }) {
		this.telemetry.track('Workflow first prod success', data, { withPostHog: true });
	}

	onFirstWorkflowDataLoad(data: {
		user_id: string;
		workflow_id: string;
		node_type: string;
		node_id: string;
		credential_type?: string;
		credential_id?: string;
	}) {
		this.telemetry.track('Workflow first data fetched', data, { withPostHog: true });
	}

	/**
	 * License
	 */
	onLicenseRenewAttempt(data: { success: boolean }) {
		this.telemetry.track('Instance attempted to refresh license', data);
	}

	/**
	 * Audit
	 */
	onAuditGeneratedViaCli() {
		this.telemetry.track('Instance generated security audit via CLI command');
	}
}
