import { NodeVM, makeResolverFromLegacyOptions, type Resolver } from '@n8n/vm2';
import type { CodeExecutionMode, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { ValidationError } from './ValidationError';
import { ExecutionError } from './ExecutionError';
import type { SandboxContext } from './Sandbox';
import { Sandbox } from './Sandbox';

const { NODE_FUNCTION_ALLOW_BUILTIN: builtIn, NODE_FUNCTION_ALLOW_EXTERNAL: external } =
	process.env;

export const vmResolver = makeResolverFromLegacyOptions({
	external: external
		? {
				modules: external.split(','),
				transitive: false,
		  }
		: false,
	builtin: builtIn?.split(',') ?? [],
});

export class JavaScriptSandbox extends Sandbox {
	private readonly vm: NodeVM;

	constructor(
		context: IExecuteFunctions,
		codeExecutionMode: CodeExecutionMode,
		private jsCode: string,
		options?: { resolver?: Resolver },
	) {
		super(context, codeExecutionMode, {
			object: {
				singular: 'object',
				plural: 'objects',
			},
		});

		const sandboxContext: SandboxContext = {
			// from NodeExecuteFunctions
			$getNodeParameter: context.getNodeParameter,
			$getWorkflowStaticData: context.getWorkflowStaticData,
			helpers: context.helpers,

			// to bring in all $-prefixed vars and methods from WorkflowDataProxy
			// $node, $items(), $parameter, $json, $env, etc.
			...context.dataProxy,
		};

		// TODO: Move this into the base class
		if (codeExecutionMode === 'runOnceForEachItem') {
			Object.defineProperty(sandboxContext, 'item', {
				get: () => sandboxContext.$input.item,
			});
		} else {
			sandboxContext.items = sandboxContext.$input.all();
		}

		this.vm = new NodeVM({
			console: 'redirect',
			sandbox: sandboxContext,
			require: options?.resolver ?? vmResolver,
			wasm: false,
		});

		this.vm.on('console.log', (...args: unknown[]) => this.emit('output', ...args));
	}

	validateCode() {
		const match = this.jsCode.match(/\$input\.(?<disallowedMethod>first|last|all|itemMatching)/);
		if (match?.groups?.disallowedMethod) {
			const { disallowedMethod } = match.groups;

			const lineNumber =
				this.jsCode.split('\n').findIndex((line) => {
					return line.includes(disallowedMethod) && !line.startsWith('//') && !line.startsWith('*');
				}) + 1;

			const disallowedMethodFound = lineNumber !== 0;

			if (disallowedMethodFound) {
				throw new ValidationError({
					message: `Can't use .${disallowedMethod}() here`,
					description: "This is only available in 'Run Once for All Items' mode",
					lineNumber,
				});
			}
		}
	}

	async runCode(): Promise<unknown> {
		const script = `module.exports = async function() {${this.jsCode}\n}()`;
		try {
			const executionResult = await this.vm.run(script, __dirname);
			return executionResult;
		} catch (error) {
			throw new ExecutionError(error);
		}
	}

	async runCodeAllItems(options?: {
		multiOutput?: boolean;
	}): Promise<INodeExecutionData[] | INodeExecutionData[][]> {
		const script = `module.exports = async function() {${this.jsCode}\n}()`;

		let executionResult: INodeExecutionData | INodeExecutionData[] | INodeExecutionData[][];

		try {
			executionResult = await this.vm.run(script, __dirname);
		} catch (error) {
			// anticipate user expecting `items` to pre-exist as in Function Item node
			if (error.message === 'items is not defined' && !/(let|const|var) items =/.test(script)) {
				const quoted = error.message.replace('items', '`items`');
				error.message = (quoted as string) + '. Did you mean `$input.all()`?';
			}

			throw new ExecutionError(error);
		}

		if (executionResult === null) return [];

		if (options?.multiOutput === true) {
			// Check if executionResult is an array of arrays
			if (!Array.isArray(executionResult) || executionResult.some((item) => !Array.isArray(item))) {
				throw new ValidationError({
					message: "The code doesn't return an array of arrays",
					description:
						'Please return an array of arrays. One array for the different outputs and one for the different items that get returned.',
					itemIndex: this.itemIndex,
				});
			}

			return executionResult.map((data) => {
				return this.validateRunCodeAllItems(data);
			});
		}

		return this.validateRunCodeAllItems(
			executionResult as INodeExecutionData | INodeExecutionData[],
		);
	}

	async runCodeEachItem(): Promise<INodeExecutionData | undefined> {
		const script = `module.exports = async function() {${this.jsCode}\n}()`;

		let executionResult: INodeExecutionData;

		try {
			executionResult = await this.vm.run(script, __dirname);
		} catch (error) {
			// anticipate user expecting `item` to pre-exist as in Function Item node
			if (error.message === 'item is not defined' && !/(let|const|var) item =/.test(script)) {
				const quoted = error.message.replace('item', '`item`');
				error.message = (quoted as string) + '. Did you mean `$input.item.json`?';
			}

			throw new ExecutionError(error, this.itemIndex);
		}

		if (executionResult === null) return;

		return this.validateRunCodeEachItem(executionResult);
	}
}
