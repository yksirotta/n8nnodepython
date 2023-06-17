import { v4 as uuid } from 'uuid';
import type { INodeTypes, WorkflowParams } from 'n8n-workflow';
import { SubworkflowOperationError, Workflow } from 'n8n-workflow';
import { mock } from 'jest-mock-extended';

import config from '@/config';
import type { Role } from '@db/entities/Role';
import type { User } from '@db/entities/User';
import type { SharedCredentials } from '@/databases/entities/SharedCredentials';
import type { SharedWorkflow } from '@db/entities/SharedWorkflow';
import type {
	RoleRepository,
	SharedCredentialsRepository,
	SharedWorkflowRepository,
	UserRepository,
} from '@/databases/repositories';
import * as UserManagementHelper from '@/UserManagement/UserManagementHelper';
import { PermissionService } from '@/services/permission.service';
import type { UserService } from '@/services/user.service';

describe('PermissionChecker', () => {
	const globalOwnerRole = mock<Role>({ id: '1', name: 'owner', scope: 'global' });
	const globalMemberRole = mock<Role>({ id: '2', name: 'member', scope: 'global' });
	const workflowOwnerRole = mock<Role>({ id: '3', name: 'owner', scope: 'workflow' });
	const workflowEditorRole = mock<Role>({ id: '4', name: 'editor', scope: 'workflow' });
	const credentialOwnerRole = mock<Role>({ id: '3', name: 'owner', scope: 'credential' });
	const credentialUserRole = mock<Role>({ id: '3', name: 'user', scope: 'credential' });

	const owner = mock<User>({ id: uuid(), globalRole: globalOwnerRole });
	const member = mock<User>({ id: uuid(), globalRole: globalMemberRole });

	const sharedOwnerWorkflow = mock<SharedWorkflow>({ role: workflowOwnerRole });
	const sharedEditorWorkflow = mock<SharedWorkflow>({ role: workflowEditorRole });
	const sharedOwnerCredential = mock<SharedCredentials>({
		role: credentialOwnerRole,
		credentialsId: '1',
	});
	const sharedUserCredential = mock<SharedCredentials>({
		role: credentialUserRole,
		credentialsId: '2',
	});

	const mockNodeTypes = mock<INodeTypes>();
	const userService = mock<UserService>();
	const roleRepository = mock<RoleRepository>();
	const sharedCredentialsRepository = mock<SharedCredentialsRepository>();
	const sharedWorkflowRepository = mock<SharedWorkflowRepository>();
	const userRepository = mock<UserRepository>();
	const permissionService = new PermissionService(
		userService,
		roleRepository,
		sharedCredentialsRepository,
		sharedWorkflowRepository,
		userRepository,
	);

	describe('check', () => {
		beforeEach(() => {
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(true);
		});

		test('should allow if workflow has no creds', async () => {
			const workflow = createWorkflow({
				nodes: [
					{
						id: uuid(),
						name: 'Start',
						type: 'n8n-nodes-base.start',
						typeVersion: 1,
						parameters: {},
						position: [0, 0],
					},
				],
			});

			await expect(permissionService.check(workflow, owner.id)).resolves.not.toThrow();
		});

		test('should allow if requesting user is instance owner', async () => {
			const workflow = createWorkflow({
				nodes: [
					{
						id: uuid(),
						name: 'Action Network',
						type: 'n8n-nodes-base.actionNetwork',
						parameters: {},
						typeVersion: 1,
						position: [0, 0],
						credentials: {
							actionNetworkApi: {
								id: '1',
								name: 'Action Network Account',
							},
						},
					},
				],
			});
			userRepository.findOneOrFail.mockResolvedValueOnce(owner);
			await expect(permissionService.check(workflow, owner.id)).resolves.not.toThrow();
		});

		test('should allow if workflow creds are a valid subset', async () => {
			const workflow = createWorkflow({
				nodes: [
					{
						id: uuid(),
						name: 'Action Network',
						type: 'n8n-nodes-base.actionNetwork',
						parameters: {},
						typeVersion: 1,
						position: [0, 0],
						credentials: {
							actionNetworkApi: {
								id: sharedOwnerCredential.credentialsId,
								name: 'owner-cred',
							},
						},
					},
					{
						id: uuid(),
						name: 'Action Network 2',
						type: 'n8n-nodes-base.actionNetwork',
						parameters: {},
						typeVersion: 1,
						position: [0, 0],
						credentials: {
							actionNetworkApi: {
								id: sharedUserCredential.credentialsId,
								name: 'user-cred',
							},
						},
					},
				],
			});

			userRepository.findOneOrFail.mockResolvedValueOnce(member);
			sharedCredentialsRepository.find.mockResolvedValue([
				sharedOwnerCredential,
				sharedUserCredential,
			]);
			sharedWorkflowRepository.find.mockResolvedValue([sharedEditorWorkflow]);
			await expect(permissionService.check(workflow, member.id)).resolves.not.toThrow();
		});

		test('should deny if workflow creds are not valid subset', async () => {
			const workflow = createWorkflow({
				nodes: [
					{
						id: uuid(),
						name: 'Action Network',
						type: 'n8n-nodes-base.actionNetwork',
						parameters: {},
						typeVersion: 1,
						position: [0, 0] as [number, number],
						credentials: {
							actionNetworkApi: {
								id: sharedUserCredential.credentialsId,
								name: 'user-cred',
							},
						},
					},
					{
						id: uuid(),
						name: 'Action Network 2',
						type: 'n8n-nodes-base.actionNetwork',
						parameters: {},
						typeVersion: 1,
						position: [0, 0] as [number, number],
						credentials: {
							actionNetworkApi: {
								id: 'non-existing-credential-id',
								name: 'Non-existing credential name',
							},
						},
					},
				],
			});

			userRepository.findOneOrFail.mockResolvedValueOnce(member);
			sharedCredentialsRepository.find.mockResolvedValue([sharedUserCredential]);
			await expect(permissionService.check(workflow, member.id)).rejects.toThrow();
		});
	});

	describe('checkSubworkflowExecutePolicy', () => {
		beforeEach(() => {
			userRepository.get.mockResolvedValueOnce(member);
			userService.getWorkflowOwner.mockResolvedValue(owner);
		});

		test('sets default policy from environment when subworkflow has none', async () => {
			config.set('workflows.callerPolicyDefaultOption', 'none');
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(true);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedEditorWorkflow);

			const subworkflow = createWorkflow();
			await expect(
				permissionService.checkSubworkflowExecutePolicy(subworkflow, member.id),
			).rejects.toThrow(`Target workflow ID ${subworkflow.id} may not be called`);
		});

		test('if sharing is disabled, ensures that workflows are owner by same user', async () => {
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(false);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedEditorWorkflow);

			const subworkflow = createWorkflow();
			await expect(
				permissionService.checkSubworkflowExecutePolicy(subworkflow, member.id),
			).rejects.toThrow(`Target workflow ID ${subworkflow.id} may not be called`);

			// Check description
			try {
				await permissionService.checkSubworkflowExecutePolicy(subworkflow, '', 'abcde');
			} catch (error) {
				if (error instanceof SubworkflowOperationError) {
					expect(error.description).toBe(
						`${owner.firstName} (${owner.email}) can make this change. You may need to tell them the ID of this workflow, which is ${subworkflow.id}`,
					);
				}
			}
		});

		test('list of ids must include the parent workflow id', async () => {
			const invalidParentWorkflowId = uuid();
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(true);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedEditorWorkflow);

			const subworkflow = createWorkflow({
				settings: {
					callerPolicy: 'workflowsFromAList',
					callerIds: '123,456,bcdef  ',
				},
			});
			await expect(
				permissionService.checkSubworkflowExecutePolicy(
					subworkflow,
					member.id,
					invalidParentWorkflowId,
				),
			).rejects.toThrow(`Target workflow ID ${subworkflow.id} may not be called`);
		});

		test('sameOwner passes when both workflows are owned by the same user', async () => {
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(false);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedOwnerWorkflow);

			const subworkflow = createWorkflow();
			await expect(
				permissionService.checkSubworkflowExecutePolicy(subworkflow, member.id, ''),
			).resolves.not.toThrow();
		});

		test('workflowsFromAList works when the list contains the parent id', async () => {
			const workflowId = uuid();
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(true);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedEditorWorkflow);

			const subworkflow = createWorkflow({
				settings: {
					callerPolicy: 'workflowsFromAList',
					callerIds: `123,456,bcdef,  ${workflowId}`,
				},
			});
			await expect(
				permissionService.checkSubworkflowExecutePolicy(subworkflow, member.id, workflowId),
			).resolves.not.toThrow();
		});

		test('should not throw when workflow policy is set to any', async () => {
			jest.spyOn(UserManagementHelper, 'isSharingEnabled').mockReturnValue(true);
			sharedWorkflowRepository.getSharing.mockResolvedValue(sharedEditorWorkflow);

			const subworkflow = createWorkflow({
				settings: {
					callerPolicy: 'any',
				},
			});
			await expect(
				permissionService.checkSubworkflowExecutePolicy(subworkflow, member.id),
			).resolves.not.toThrow();
		});
	});

	const createWorkflow = (partial: Partial<WorkflowParams> = {}) =>
		new Workflow(
			Object.assign(
				{
					id: '2',
					name: 'test',
					active: false,
					nodeTypes: mockNodeTypes,
					connections: {},
					nodes: [],
				},
				partial,
			),
		);
});
