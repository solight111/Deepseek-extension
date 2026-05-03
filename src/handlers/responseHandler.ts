import * as vscode from 'vscode';

export class ResponseHandler {
    static async showInDocument(content: string, title: string, language: string): Promise<void> {
        const safeTitle = title.replace(/[^a-z0-9-_]/gi, '-');
        const extension = language === 'markdown' ? 'md' : language || 'txt';
        const uri = vscode.Uri.parse(`untitled:${safeTitle}.${extension}`);

        let document = await vscode.workspace.openTextDocument(uri);
        document = await vscode.languages.setTextDocumentLanguage(document, language);

        const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), content);
        });
    }

    static insertInEditor(content: string): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor to insert code into.');
            return;
        }

        const codeBlockMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
        const codeToInsert = codeBlockMatch ? codeBlockMatch[1].trim() : content;

        editor.edit(editBuilder => {
            if (!editor.selection.isEmpty) {
                editBuilder.replace(editor.selection, codeToInsert);
            } else {
                editBuilder.insert(editor.selection.active, codeToInsert);
            }
        }).then(success => {
            if (success) {
                vscode.window.showInformationMessage('Code inserted successfully!');
            }
        });
    }
}
