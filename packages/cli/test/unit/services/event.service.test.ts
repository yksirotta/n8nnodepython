import type { IRun, WorkflowExecuteMode } from 'n8n-workflow';
import { LoggerProxy } from 'n8n-workflow';
import { mock } from 'jest-mock-extended';
import {
	QueryFailedError,
	type DataSource,
	type EntityManager,
	type EntityMetadata,
} from 'typeorm';

import config from '@/config';
import type { User } from '@db/entities/User';
import type { WorkflowStatistics } from '@db/entities/WorkflowStatistics';
import { WorkflowStatisticsRepository } from '@db/repositories';
import { EventsService } from '@/services/events.service';
import { getLogger } from '@/Logger';
import { InternalHooks } from '@/InternalHooks';
import type { UserService } from '@/services/user.service';

import { mockInstance } from '../../integration/shared/utils';

describe('EventsService', () => {
	const dbType = config.getEnv('database.type');
	const fakeUser = mock<User>({ id: 'abcde-fghij' });

	const userService = mock<UserService>();
	const internalHooks = mockInstance(InternalHooks);
	const entityManager = mock<EntityManager>();
	const dataSource = mock<DataSource>({
		manager: entityManager,
		getMetadata: () =>
			mock<EntityMetadata>({
				tableName: 'workflow_statistics',
			}),
	});

	Object.assign(entityManager, { connection: dataSource });

	const eventsService = new EventsService(
		userService,
		new WorkflowStatisticsRepository(dataSource),
	);

	userService.getWorkflowOwner.mockResolvedValue(fakeUser);

	beforeAll(() => {
		config.set('diagnostics.enabled', true);
		config.set('deployment.type', 'n8n-testing');
		LoggerProxy.init(getLogger());
	});

	afterAll(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		internalHooks.onFirstProductionWorkflowSuccess.mockClear();
		internalHooks.onFirstWorkflowDataLoad.mockClear();
	});

	const mockDBCall = (count = 1) => {
		if (dbType === 'sqlite') {
			entityManager.findOne.mockResolvedValueOnce(mock<WorkflowStatistics>({ count }));
		} else {
			const result = dbType === 'postgresdb' ? [{ count }] : { affectedRows: count };
			entityManager.query.mockImplementationOnce(async (query) =>
				query.startsWith('INSERT INTO') ? result : null,
			);
		}
	};

	describe('workflowExecutionCompleted', () => {
		test('should create metrics for production successes', async () => {
			// Call the function with a production success result, ensure metrics hook gets called
			const workflow = {
				id: '1',
				name: '',
				active: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				nodes: [],
				connections: {},
			};
			const runData: IRun = {
				finished: true,
				status: 'success',
				data: { resultData: { runData: {} } },
				mode: 'internal' as WorkflowExecuteMode,
				startedAt: new Date(),
			};
			mockDBCall();

			await eventsService.workflowExecutionCompleted(workflow, runData);
			expect(internalHooks.onFirstProductionWorkflowSuccess).toBeCalledTimes(1);
			expect(internalHooks.onFirstProductionWorkflowSuccess).toHaveBeenNthCalledWith(1, {
				user_id: fakeUser.id,
				workflow_id: workflow.id,
			});
		});

		test('should only create metrics for production successes', async () => {
			// Call the function with a non production success result, ensure metrics hook is never called
			const workflow = {
				id: '1',
				name: '',
				active: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				nodes: [],
				connections: {},
			};
			const runData: IRun = {
				finished: false,
				status: 'failed',
				data: { resultData: { runData: {} } },
				mode: 'internal' as WorkflowExecuteMode,
				startedAt: new Date(),
			};
			await eventsService.workflowExecutionCompleted(workflow, runData);
			expect(internalHooks.onFirstProductionWorkflowSuccess).toBeCalledTimes(0);
		});

		test('should not send metrics for updated entries', async () => {
			// Call the function with a fail insert, ensure update is called *and* metrics aren't sent
			const workflow = {
				id: '1',
				name: '',
				active: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				nodes: [],
				connections: {},
			};
			const runData: IRun = {
				finished: true,
				status: 'success',
				data: { resultData: { runData: {} } },
				mode: 'internal' as WorkflowExecuteMode,
				startedAt: new Date(),
			};
			mockDBCall(2);
			await eventsService.workflowExecutionCompleted(workflow, runData);
			expect(internalHooks.onFirstProductionWorkflowSuccess).toBeCalledTimes(0);
		});
	});

	describe('nodeFetchedData', () => {
		test('should create metrics when the db is updated', async () => {
			// Call the function with a production success result, ensure metrics hook gets called
			const workflowId = '1';
			const node = {
				id: 'abcde',
				name: 'test node',
				typeVersion: 1,
				type: '',
				position: [0, 0] as [number, number],
				parameters: {},
			};
			await eventsService.nodeFetchedData(workflowId, node);
			expect(internalHooks.onFirstWorkflowDataLoad).toBeCalledTimes(1);
			expect(internalHooks.onFirstWorkflowDataLoad).toHaveBeenNthCalledWith(1, {
				user_id: fakeUser.id,
				workflow_id: workflowId,
				node_type: node.type,
				node_id: node.id,
			});
		});

		test('should create metrics with credentials when the db is updated', async () => {
			// Call the function with a production success result, ensure metrics hook gets called
			const workflowId = '1';
			const node = {
				id: 'abcde',
				name: 'test node',
				typeVersion: 1,
				type: '',
				position: [0, 0] as [number, number],
				parameters: {},
				credentials: {
					testCredentials: {
						id: '1',
						name: 'Test Credentials',
					},
				},
			};
			await eventsService.nodeFetchedData(workflowId, node);
			expect(internalHooks.onFirstWorkflowDataLoad).toBeCalledTimes(1);
			expect(internalHooks.onFirstWorkflowDataLoad).toHaveBeenNthCalledWith(1, {
				user_id: fakeUser.id,
				workflow_id: workflowId,
				node_type: node.type,
				node_id: node.id,
				credential_type: 'testCredentials',
				credential_id: node.credentials.testCredentials.id,
			});
		});

		test('should not send metrics for entries that already have the flag set', async () => {
			// Fetch data for workflow 2 which is set up to not be altered in the mocks
			entityManager.insert.mockRejectedValueOnce(new QueryFailedError('', undefined, ''));
			const workflowId = '1';
			const node = {
				id: 'abcde',
				name: 'test node',
				typeVersion: 1,
				type: '',
				position: [0, 0] as [number, number],
				parameters: {},
			};
			await eventsService.nodeFetchedData(workflowId, node);
			expect(internalHooks.onFirstWorkflowDataLoad).toBeCalledTimes(0);
		});
	});
});
