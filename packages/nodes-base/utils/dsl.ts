import type {
	INodeProperties,
	INodePropertyTypeOptions,
	NodeParameterValueType,
} from 'n8n-workflow';

type Type = 'number' | 'string' | 'options';

abstract class Property<T> {
	abstract type: Type;

	protected _required: boolean = false;

	protected _typeOptions: INodePropertyTypeOptions | undefined;

	constructor(
		readonly name: string,
		readonly displayName: string,
		readonly defaultValue: T,
	) {}

	get required() {
		this._required = true;
		return this;
	}

	typeOptions(value: INodePropertyTypeOptions) {
		this._typeOptions = value;
		return this;
	}

	toNodeProperty(): INodeProperties {
		const toReturn: INodeProperties = {
			type: this.type,
			name: this.name,
			displayName: this.displayName,
			default: this.defaultValue as NodeParameterValueType,
		};
		if (this._typeOptions) toReturn.typeOptions = this._typeOptions;
		return toReturn;
	}
}

class NumberProperty extends Property<number> {
	override type = 'number' as Type;
}

class StringProperty extends Property<string> {
	override type = 'string' as Type;
}

class SecretProperty extends Property<string> {
	override type = 'string' as Type;

	override _typeOptions = { password: true };
}

class OptionsProperty extends Property<string> {
	override type = 'options' as Type;

	private _values: Record<string, string> = {};

	values(optionValues: Record<string, string>) {
		this._values = optionValues;
		return this;
	}

	toNodeProperty(): INodeProperties {
		const toReturn = super.toNodeProperty();
		if (this._values)
			toReturn.options = Object.entries(this._values).map(([value, name]) => ({ name, value }));
		return toReturn;
	}
}

export const number = (name: string, displayName: string, defaultValue: number) =>
	new NumberProperty(name, displayName, defaultValue);

export const string = (name: string, displayName: string, defaultValue: string = '') =>
	new StringProperty(name, displayName, defaultValue);

export const secret = (name: string, displayName: string) =>
	new SecretProperty(name, displayName, '');

export const options = (name: string, displayName: string, defaultValue: string) =>
	new OptionsProperty(name, displayName, defaultValue);

export type InferProps<T> = any;
