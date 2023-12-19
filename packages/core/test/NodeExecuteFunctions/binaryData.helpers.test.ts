import { Container } from 'typedi';
import { mkdtempSync, readFileSync } from 'fs';
import type { IBinaryData, ITaskDataConnections } from 'n8n-workflow';
import { tmpdir } from 'os';
import { join } from 'path';

import { BinaryDataService } from '@/BinaryData/BinaryData.service';
import {
	getBinaryDataBuffer,
	setBinaryDataBuffer,
} from '@/NodeExecuteFunctions/binaryData.helpers';

const temporaryDir = mkdtempSync(join(tmpdir(), 'n8n'));

describe('Binary Data Helpers', () => {
	describe('test binary data helper methods', () => {
		test("test getBinaryDataBuffer(...) & setBinaryDataBuffer(...) methods in 'default' mode", async () => {
			// Setup a 'default' binary data manager instance
			Container.set(BinaryDataService, new BinaryDataService());

			await Container.get(BinaryDataService).init({
				mode: 'default',
				availableModes: ['default'],
				localStoragePath: temporaryDir,
			});

			// Set our binary data buffer
			const inputData: Buffer = Buffer.from('This is some binary data', 'utf8');
			const setBinaryDataBufferResponse: IBinaryData = await setBinaryDataBuffer(
				{
					mimeType: 'txt',
					data: 'This should be overwritten by the actual payload in the response',
				},
				inputData,
				'workflowId',
				'executionId',
			);

			// Expect our return object to contain the base64 encoding of the input data, as it should be stored in memory.
			expect(setBinaryDataBufferResponse.data).toEqual(inputData.toString('base64'));

			// Now, re-fetch our data.
			// An ITaskDataConnections object is used to share data between nodes. The top level property, 'main', represents the successful output object from a previous node.
			const taskDataConnectionsInput: ITaskDataConnections = {
				main: [],
			};

			// We add an input set, with one item at index 0, to this input. It contains an empty json payload and our binary data.
			taskDataConnectionsInput.main.push([
				{
					json: {},
					binary: {
						data: setBinaryDataBufferResponse,
					},
				},
			]);

			// Now, lets fetch our data! The item will be item index 0.
			const getBinaryDataBufferResponse: Buffer = await getBinaryDataBuffer(
				taskDataConnectionsInput,
				0,
				'data',
				0,
			);

			expect(getBinaryDataBufferResponse).toEqual(inputData);
		});

		test("test getBinaryDataBuffer(...) & setBinaryDataBuffer(...) methods in 'filesystem' mode", async () => {
			Container.set(BinaryDataService, new BinaryDataService());

			// Setup a 'filesystem' binary data manager instance
			await Container.get(BinaryDataService).init({
				mode: 'filesystem',
				availableModes: ['filesystem'],
				localStoragePath: temporaryDir,
			});

			// Set our binary data buffer
			const inputData: Buffer = Buffer.from('This is some binary data', 'utf8');
			const setBinaryDataBufferResponse: IBinaryData = await setBinaryDataBuffer(
				{
					mimeType: 'txt',
					data: 'This should be overwritten with the name of the configured data manager',
				},
				inputData,
				'workflowId',
				'executionId',
			);

			// Expect our return object to contain the name of the configured data manager.
			expect(setBinaryDataBufferResponse.data).toEqual('filesystem-v2');

			// Ensure that the input data was successfully persisted to disk.
			expect(
				readFileSync(
					`${temporaryDir}/${setBinaryDataBufferResponse.id?.replace('filesystem-v2:', '')}`,
				),
			).toEqual(inputData);

			// Now, re-fetch our data.
			// An ITaskDataConnections object is used to share data between nodes. The top level property, 'main', represents the successful output object from a previous node.
			const taskDataConnectionsInput: ITaskDataConnections = {
				main: [],
			};

			// We add an input set, with one item at index 0, to this input. It contains an empty json payload and our binary data.
			taskDataConnectionsInput.main.push([
				{
					json: {},
					binary: {
						data: setBinaryDataBufferResponse,
					},
				},
			]);

			// Now, lets fetch our data! The item will be item index 0.
			const getBinaryDataBufferResponse: Buffer = await getBinaryDataBuffer(
				taskDataConnectionsInput,
				0,
				'data',
				0,
			);

			expect(getBinaryDataBufferResponse).toEqual(inputData);
		});
	});
});
