/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection, // Language Server의 주요 연결을 생성하는 함수. LSP 클라이언트와 서버간의 통신을 설정하고 관리
	TextDocuments, // 클라이언트로부터 수신한 텍스트 문서를 관리
	ProposedFeatures,
	InitializeParams,
	DocumentSymbolParams,
	DocumentSymbol,
	SymbolKind,
	TextDocumentPositionParams, // 텍스트 문서와 위치에 대한 매개변수를 담은 객체. LSP에서는 클라이언트로부터 특정 위치에 대한 정보를 요청할때 사용됨
	TextDocumentSyncKind, // 텍스트 문서의 동기화 방식을 지정하는 열거형 함수 (None, Full, Incremental)
	InitializeResult, // Language Server 초기화가 완료되었을 때 반환되는 클래스
	DocumentSymbolRequest,
	DidChangeConfigurationNotification,
	Location,
	Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);


connection.onInitialize(() => {

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			documentSymbolProvider: true,
			definitionProvider: true,
		}
	};

	return result;
});

connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return [];

	const symbols: DocumentSymbol[] = [];

	const lines = document.getText().split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check for function call
		let match;
		const definitionRegex = /JINIE\s+([\w.]+)\s*\(/g;
		while ((match = definitionRegex.exec(line))) {
			const functionName = match[1];
			const startCharacter = line.indexOf(functionName);
			const endCharacter = startCharacter + functionName.length;

			const symbolRange = Range.create(i, startCharacter, i, endCharacter);
			const symbol = DocumentSymbol.create(
				functionName,
				'',
				SymbolKind.Function,
				symbolRange,
				symbolRange
			);

			symbols.push(symbol);
		}
	}

	return symbols;
});

connection.onDefinition((params: TextDocumentPositionParams): Location | undefined => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return undefined;

	const lines = document.getText().split(/\r?\n/);
	const position = params.position;

	const line = lines[position.line];
	const callRegex = /CALL\s+([\w.]+)\s*\(/g;
	let match;
	while ((match = callRegex.exec(line))) {
		const functionName = match[1];
		const startCharacter = line.indexOf(functionName);
		const endCharacter = startCharacter + functionName.length;

		const definitionRange = Range.create(position.line, startCharacter, position.line, endCharacter);

		const definitionLocation = findDefinitionLocationInDocument(document, functionName, definitionRange);
		if (definitionLocation) {
			return definitionLocation;
		}

		const definitionLocationInOtherFiles = findDefinitionLocationInOtherFiles(document, functionName);
		if (definitionLocationInOtherFiles) {
			return definitionLocationInOtherFiles;
		}

		return undefined;
	}
	return undefined;
});

function findDefinitionLocationInDocument(
	document: TextDocument,
	functionName: string,
	definitionRange: Range
): Location | undefined {
	const lines = document.getText().split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const definitionRegex = new RegExp(`JINIE\\s+${functionName}\\s*\\(`, 'g');
		const match = definitionRegex.exec(line);
		if (match) {
			const location = Location.create(document.uri, Range.create(i, 0, i, line.length));
			return location;
		}
	}

	return undefined;
}

function findDefinitionLocationInOtherFiles(
	document: TextDocument,
	functionName: string
): Location | undefined {
	const currentFilePath = document.uri;
	const currentFolder = path.dirname(currentFilePath);
	const definitionFiles = findDefinitionFilesInFolder(decodeURIComponent(currentFolder.replace('file:///', '')));

	for (const definitionFile of definitionFiles) {
		const fileContent = fs.readFileSync(definitionFile, 'utf-8');

		// Check for function definitions
		const definitionRegex = new RegExp(`JINIE\\s+${functionName}\\s*\\(`, 'g');
		const match = definitionRegex.exec(fileContent);
		if (match) {
			const lines = fileContent.split(/\r?\n/);
			const line = lines.findIndex((line) => line.includes(match[0]));
			if (line >= 0) {
				const definitionLocation = Location.create(
					document.uri,
					Range.create(line, 0, line, lines[line].length)
				);
				const searchedUri = encodeURI(definitionFile).replace(/:/g, '%3A').replace(/%5C/g, '/');
				connection.sendNotification('textDocument/definition', {
					position: definitionLocation.range.start,
					uri: "file:///" + searchedUri,
				});
				return definitionLocation;
			}
		}
	}

	console.log('No result.. Find Child Folder');
	const definitionChildFiles = findDefinitionFilesInChildFolder(decodeURIComponent(currentFolder.replace('file:///', '')));
	for (const definitionFile of definitionChildFiles) {
		const fileContent = fs.readFileSync(definitionFile, 'utf-8');

		// Check for function definitions
		const definitionRegex = new RegExp(`JINIE\\s+${functionName}\\s*\\(`, 'g');
		const match = definitionRegex.exec(fileContent);
		if (match) {
			const lines = fileContent.split(/\r?\n/);
			const line = lines.findIndex((line) => line.includes(match[0]));
			if (line >= 0) {
				const definitionLocation = Location.create(
					document.uri,
					Range.create(line, 0, line, lines[line].length)
				);
				const searchedUri = encodeURI(definitionFile).replace(/:/g, '%3A').replace(/%5C/g, '/');
				connection.sendNotification('textDocument/definition', {
					position: definitionLocation.range.start,
					uri: "file:///" + searchedUri,
				});
				return definitionLocation;
			}
		}
	}

	return undefined;
}

function findDefinitionFilesInFolder(folderPath: string): string[] {
	console.log(folderPath);
	const definitionFiles: string[] = [];
	const folderContents = fs.readdirSync(folderPath);

	for (const file of folderContents) {
		const filePath = path.join(folderPath, file);
		const stats = fs.statSync(filePath);

		if (stats.isFile() && path.extname(file) === '.DEFINITION') {
			definitionFiles.push(filePath);
		}
	}
	return definitionFiles;
}

function findDefinitionFilesInChildFolder(folderPath: string): string[] {
	const folderPathChild = folderPath + '/CONFIG';
	const definitionFiles: string[] = [];
	const folderContents = fs.readdirSync(folderPathChild);
	for (const file of folderContents) {
		const filePath = path.join(folderPathChild, file);
		const stats = fs.statSync(filePath);

		if (stats.isFile() && path.extname(file) === '.DEFINITION') {
			definitionFiles.push(filePath);
		}
	}
	return definitionFiles;
}

connection.onInitialized(() => {
	connection.client.register(DidChangeConfigurationNotification.type);
});

connection.onDidChangeWatchedFiles(_change => {
	connection.console.log('We received an file change event');
});

// Listen on the connection
connection.listen();
