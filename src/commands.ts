import * as vscode from 'vscode';
import { ChatPanel } from './sidebar/ChatPanel';
import { ContextBuilder, EditorContext } from './services/contextBuilder';
import { DeepSeekClient } from './services/deepseekClient';
import { ConfigManager } from './services/configManager';
import { ResponseHandler } from './handlers/responseHandler';

function getContextWithSelection(): EditorContext | null {
    const context = ContextBuilder.getEditorContext();
    if (!context.currentFile?.selection) {
        return null;
    }
    return context;
}

export function registerCommands(context: vscode.ExtensionContext, chatPanel: ChatPanel) {
    const configManager = ConfigManager.getInstance();
    const client = new DeepSeekClient(configManager);

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.askQuestion', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'What would you like to ask DeepSeek?',
                placeHolder: 'Type your question here...'
            });

            if (query) {
                await chatPanel.sendMessage(query);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.setApiKey', async () => {
            await configManager.promptForApiKey();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.explainCode', async () => {
            const ctx = getContextWithSelection();
            if (!ctx?.currentFile) {
                vscode.window.showInformationMessage('Please select some code to explain.');
                return;
            }

            const prompt = ContextBuilder.buildPrompt(
                'Explain the following code in detail. What does it do, and how does it work?',
                ctx
            );

            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DeepSeek is analyzing your code...',
                cancellable: false
            }, async () => {
                return await client.chat([{ role: 'user', content: prompt }]);
            });

            const language = ctx.currentFile.language;
            await ResponseHandler.showInDocument(response, 'deepseek-explanation', language);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.generateCode', async () => {
            const selectedContext = getContextWithSelection();
            let prompt: string;

            if (selectedContext) {
                prompt = ContextBuilder.buildPrompt(
                    'Generate code based on the following description or code snippet:',
                    selectedContext
                );
            } else {
                const description = await vscode.window.showInputBox({
                    prompt: 'Describe what code you want DeepSeek to generate',
                    placeHolder: 'Example: Create a TypeScript function that validates an email address',
                    ignoreFocusOut: true
                });

                if (!description) return;

                const editorContext = ContextBuilder.getEditorContext();
                prompt = ContextBuilder.buildPrompt(
                    `Generate code for this request: ${description}`,
                    editorContext
                );
            }

            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DeepSeek is generating code...',
                cancellable: false
            }, async () => {
                return await client.chat([{ role: 'user', content: prompt }]);
            });

            ResponseHandler.insertInEditor(response);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.reviewCode', async () => {
            const ctx = getContextWithSelection();
            if (!ctx?.currentFile) {
                vscode.window.showInformationMessage('Please select code to review.');
                return;
            }

            const prompt = ContextBuilder.buildPrompt(
                'Review the following code. Identify any bugs, suggest improvements, and evaluate best practices:',
                ctx
            );

            const response = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DeepSeek is reviewing your code...',
                cancellable: false
            }, async () => {
                return await client.chat([{ role: 'user', content: prompt }]);
            });

            await ResponseHandler.showInDocument(response, 'deepseek-review', 'markdown');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('deepseek.openChat', () => {
            vscode.commands.executeCommand('deepseek.chatView.focus');
        })
    );
}
