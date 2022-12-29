import { EditorSuggestContext, Plugin, prepareFuzzySearch, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import { around } from "monkey-around";

export default class CanvasReferencePlugin extends Plugin {

	async onload() {
		this.patchWorkspaceLeaf();
		this.patchEditorSuggest();
	}

	onunload() {

	}

	patchWorkspaceLeaf() {
		this.register(
			around(WorkspaceLeaf.prototype, {
				openFile: (old) =>
					async function (file: TFile, state?: ViewState) {
						const result = await old.call(this, file, state);

						console.log(result);
						// Check if file is a canvas file
						// @ts-ignore
						if(file.extension === "canvas" && state?.eState?.subpath) {
							const canvas = this.view.canvas;
							if(!canvas) return;
							// @ts-ignore
							const id = state.eState.subpath.replace("#\^", "");
							const node = canvas.nodes.get(id);
							if(!node) return;
							canvas.selectOnly(node);
							canvas.zoomToSelection();
						}
					}

			}),
		);
	}

	patchEditorSuggest() {
		const getNodesFromCanvas = async (canvasFile: TFile, context: EditorSuggestContext) => {


			// Convert json string to object
			const canvasFileContent = await app.vault.cachedRead(canvasFile);
			const canvasFileData = JSON.parse(canvasFileContent);

			const nodes = canvasFileData.nodes;

			return nodes;

		}


		// @ts-ignore
		const suggests = app.workspace.editorSuggest.suggests;
		// @ts-ignore
		const fileSuggest = suggests.find((suggest) => suggest.mode === 'file');

		if(!fileSuggest) return;

		const fileSuggestConstructor = fileSuggest.constructor;

		const uninstaller = around(fileSuggestConstructor.prototype, {
			getSuggestions: (next: any) =>
				async function (context: EditorSuggestContext) {
					const result = await next.call(this, context);

					if(context.query.lastIndexOf(".canvas") !== -1) {
						// Get current canvas path from query string
						const path = context.query.substring(0, context.query.lastIndexOf(".canvas") + 7);

						const canvasFile = app.metadataCache.getFirstLinkpathDest(path, context.file.path);

						if(!canvasFile) return result;

						// Get nodes from canvas file
						const nodes = await getNodesFromCanvas(canvasFile, context);

						if(!nodes) return result;
						const suggestions: any[] = [];

						const cM = /\u00A0/g;
						let inputStr = "";
						if(this.mode === "heading") {
							inputStr = (context.query.replace(cM, " ")).normalize("NFC").split("#")[1];
						}else if(this.mode === "block") {
							inputStr = (context.query.replace(cM, " ")).normalize("NFC").split("^")[1];
						}
						const query = prepareFuzzySearch(inputStr);
						const textNodes = nodes.filter((node: any) => (node.text != undefined || node.label !== undefined));

						textNodes.forEach((node: any)=>{
							const queryResult = query(node?.text ?? node?.label);

							if(queryResult !== null) {
								suggestions.push({
									content: node.text ?? node.label,
									display: (node.text ?? node.label).replace(/\n/g, " "),
									path: path,
									type: "block",
									file: canvasFile,
									// @ts-ignore
									node: {
										id: node.id,
										type: "paragraph",
										position: undefined,
										children: [{
											type: "text",
											value: node.text ?? node.label,
											position: undefined
										}]
									},
									idMatch: queryResult.matches,
									matches: null,
									score: queryResult.score,
								});


							}


						});

						return suggestions.length > 0? suggestions : result;

					}
					// console.log(result);
					return result;
				},
		});
		this.register(uninstaller);
	}

}
