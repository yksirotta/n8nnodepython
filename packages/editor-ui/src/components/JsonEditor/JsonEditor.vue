<template>
	<div ref="jsonEditor" class="ph-no-capture json-editor"></div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { autocompletion } from '@codemirror/autocomplete';
import { indentWithTab, history, redo } from '@codemirror/commands';
import { foldGutter, indentOnInput } from '@codemirror/language';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter as createLinter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import {
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from '@codemirror/view';

import { codeNodeEditorTheme } from '../CodeNodeEditor/theme';

export default defineComponent({
	name: 'json-editor',
	props: {
		value: {
			type: String,
			required: true,
		},
		isReadOnly: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			editor: {} as EditorView,
		};
	},
	computed: {
		doc(): string {
			return this.editor.state.doc.toString();
		},
	},
	mounted() {
		const { isReadOnly } = this;
		const extensions: Extension[] = [
			json(),
			lineNumbers(),
			EditorView.lineWrapping,
			EditorState.readOnly.of(isReadOnly),
			EditorView.editable.of(!isReadOnly),
			codeNodeEditorTheme({ isReadOnly }),
		];
		if (!isReadOnly) {
			extensions.push(
				createLinter(jsonParseLinter()),
				lintGutter(),
				history(),
				keymap.of([indentWithTab, { key: 'Mod-Shift-z', run: redo }]),
				autocompletion(),
				indentOnInput(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				foldGutter(),
				dropCursor(),
				EditorView.updateListener.of((viewUpdate: ViewUpdate) => {
					if (!viewUpdate.docChanged) return;
					this.$emit('valueChanged', this.doc);
				}),
			);
		}
		const state = EditorState.create({ doc: this.value, extensions });

		const parent = this.$refs.jsonEditor as HTMLDivElement;
		this.editor = new EditorView({ parent, state });
	},
});
</script>
