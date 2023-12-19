import type { IncomingMessage } from 'http';
import type { INode, IWorkflowExecuteAdditionalData, Workflow, WorkflowHooks } from 'n8n-workflow';
import { mock } from 'jest-mock-extended';
import nock from 'nock';

import { parseIncomingMessage, proxyRequestToAxios } from '@/NodeExecuteFunctions/request.helpers';

describe('Request Helpers', () => {
	describe('parseIncomingMessage', () => {
		it('parses valid content-type header', () => {
			const message = mock<IncomingMessage>({
				headers: { 'content-type': 'application/json', 'content-disposition': undefined },
			});
			parseIncomingMessage(message);

			expect(message.contentType).toEqual('application/json');
		});

		it('parses valid content-type header with parameters', () => {
			const message = mock<IncomingMessage>({
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'content-disposition': undefined,
				},
			});
			parseIncomingMessage(message);

			expect(message.contentType).toEqual('application/json');
		});

		it('parses valid content-disposition header with filename*', () => {
			const message = mock<IncomingMessage>({
				headers: {
					'content-type': undefined,
					'content-disposition':
						'attachment; filename="screenshot%20(1).png"; filename*=UTF-8\'\'screenshot%20(1).png',
				},
			});
			parseIncomingMessage(message);

			expect(message.contentDisposition).toEqual({
				filename: 'screenshot (1).png',
				type: 'attachment',
			});
		});

		it('parses valid content-disposition header with filename* (quoted)', () => {
			const message = mock<IncomingMessage>({
				headers: {
					'content-type': undefined,
					'content-disposition': ' attachment;filename*="utf-8\' \'test-unsplash.jpg"',
				},
			});
			parseIncomingMessage(message);

			expect(message.contentDisposition).toEqual({
				filename: 'test-unsplash.jpg',
				type: 'attachment',
			});
		});

		it('parses valid content-disposition header with filename and trailing ";"', () => {
			const message = mock<IncomingMessage>({
				headers: {
					'content-type': undefined,
					'content-disposition': 'inline; filename="screenshot%20(1).png";',
				},
			});
			parseIncomingMessage(message);

			expect(message.contentDisposition).toEqual({
				filename: 'screenshot (1).png',
				type: 'inline',
			});
		});

		it('parses non standard content-disposition with missing type', () => {
			const message = mock<IncomingMessage>({
				headers: {
					'content-type': undefined,
					'content-disposition': 'filename="screenshot%20(1).png";',
				},
			});
			parseIncomingMessage(message);

			expect(message.contentDisposition).toEqual({
				filename: 'screenshot (1).png',
				type: 'attachment',
			});
		});
	});

	describe('proxyRequestToAxios', () => {
		const baseUrl = 'http://example.de';
		const workflow = mock<Workflow>();
		const hooks = mock<WorkflowHooks>();
		const additionalData = mock<IWorkflowExecuteAdditionalData>({ hooks });
		const node = mock<INode>();

		beforeEach(() => {
			hooks.executeHookFunctions.mockClear();
		});

		test('should not throw if the response status is 200', async () => {
			nock(baseUrl).get('/test').reply(200);
			await proxyRequestToAxios(workflow, additionalData, node, `${baseUrl}/test`);
			expect(hooks.executeHookFunctions).toHaveBeenCalledWith('nodeFetchedData', [
				workflow.id,
				node,
			]);
		});

		test('should throw if the response status is 403', async () => {
			const headers = { 'content-type': 'text/plain' };
			nock(baseUrl).get('/test').reply(403, 'Forbidden', headers);
			try {
				await proxyRequestToAxios(workflow, additionalData, node, `${baseUrl}/test`);
			} catch (error) {
				expect(error.statusCode).toEqual(403);
				expect(error.request).toBeUndefined();
				expect(error.response).toMatchObject({ headers, status: 403 });
				expect(error.options).toMatchObject({
					headers: { Accept: '*/*' },
					method: 'get',
					url: 'http://example.de/test',
				});
				expect(error.config).toBeUndefined();
				expect(error.message).toEqual('403 - "Forbidden"');
			}
			expect(hooks.executeHookFunctions).not.toHaveBeenCalled();
		});

		test('should not throw if the response status is 404, but `simple` option is set to `false`', async () => {
			nock(baseUrl).get('/test').reply(404, 'Not Found');
			const response = await proxyRequestToAxios(workflow, additionalData, node, {
				url: `${baseUrl}/test`,
				simple: false,
			});

			expect(response).toEqual('Not Found');
			expect(hooks.executeHookFunctions).toHaveBeenCalledWith('nodeFetchedData', [
				workflow.id,
				node,
			]);
		});

		test('should return full response when `resolveWithFullResponse` is set to true', async () => {
			nock(baseUrl).get('/test').reply(404, 'Not Found');
			const response = await proxyRequestToAxios(workflow, additionalData, node, {
				url: `${baseUrl}/test`,
				resolveWithFullResponse: true,
				simple: false,
			});

			expect(response).toMatchObject({
				body: 'Not Found',
				headers: {},
				statusCode: 404,
				statusMessage: null,
			});
			expect(hooks.executeHookFunctions).toHaveBeenCalledWith('nodeFetchedData', [
				workflow.id,
				node,
			]);
		});
	});
});
