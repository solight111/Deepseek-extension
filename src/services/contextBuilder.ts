import * as vscode from 'vscode';

export interface EditorContext {
    currentFile?: {
        path: string;
        language: string;
        content: string;
        selection?: {
            start: number;
            end: number;
            text: string;
        };
    };
    workspacePath?: string;
    additionalContext?: string;
}

export class ContextBuilder {
    static getEditorContext(): EditorContext {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return {};

        const document = editor.document;
        const selection = editor.selection;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

        return {
            currentFile: {
                path: workspaceFolder ?
                    document.uri.fsPath.replace(workspaceFolder.uri.fsPath, '') :
                    document.fileName,
                language: document.languageId,
                content: document.getText(),
                selection: selection.isEmpty ? undefined : {
                    start: document.offsetAt(selection.start),
                    end: document.offsetAt(selection.end),
                    text: document.getText(selection)
                }
            },
            workspacePath: workspaceFolder?.uri.fsPath
        };
    }

    static buildPrompt(instruction: string, context: EditorContext): string {
        let prompt = instruction + '\n\n';

        if (context.currentFile) {
            prompt += `Current file: ${context.currentFile.path}\n`;
            prompt += `Language: ${context.currentFile.language}\n\n`;

            if (context.currentFile.selection) {
                prompt += 'Selected code:\n```';
                prompt += context.currentFile.language + '\n';
                prompt += context.currentFile.selection.text + '\n';
                prompt += '```\n\n';
            } else if (context.currentFile.content.length < 5000) {
                prompt += 'Full file content:\n```';
                prompt += context.currentFile.language + '\n';
                prompt += context.currentFile.content + '\n';
                prompt += '```\n\n';
            }
        }

        if (context.additionalContext) {
            prompt += `Additional context: ${context.additionalContext}\n\n`;
        }

        return prompt;
    }
}
