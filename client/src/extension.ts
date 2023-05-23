/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { 
	workspace,
	ExtensionContext,
	window,
	Uri,
	Range,
	Position,
	OutputChannel 
} from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let outputChannel: OutputChannel;

export function activate(context: ExtensionContext) {
	outputChannel = window.createOutputChannel('LSP Project');
    outputChannel.appendLine('LSP Project activated.');

	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'jinie' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.DEFINITION')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'jinieLanguageServer',
		'JINIE Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
	// Handle textDocument/definition requests from the server
	client.onNotification('textDocument/definition', (params: any) => {
		outputChannel.appendLine('onNotification');
		outputChannel.show();
		const uri = Uri.parse(params.uri);
		const position = new Position(params.position.line, params.position.character);

		workspace.openTextDocument(uri).then((document) => {
			window.showTextDocument(document, {
				selection: new Range(position, position),
			});
		});
	});

	outputChannel.show();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	outputChannel.dispose();
	return client.stop();
}
