import * as vscode from 'vscode';
import { ChatPanel } from './sidebar/ChatPanel';
import { registerCommands } from './commands';
import { ConfigManager } from './services/configManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('DeepSeek Coder is now active!');

    const configManager = ConfigManager.getInstance(context);

    configManager.checkApiKey();

    const chatPanel = new ChatPanel(context.extensionUri, configManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'deepseek.chatView',
            chatPanel
        )
    );

    registerCommands(context, chatPanel);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('deepseek')) {
                chatPanel.updateConfig();
            }
        })
    );
}

export function deactivate() {}
