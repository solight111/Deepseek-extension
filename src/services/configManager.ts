import * as vscode from 'vscode';

export class ConfigManager {
    private static instance: ConfigManager;
    private secretStorage: vscode.SecretStorage;
    private readonly SECRET_KEY = 'deepseek.apiKey';

    private constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
    }

    static getInstance(context?: vscode.ExtensionContext): ConfigManager {
        if (!ConfigManager.instance && context) {
            ConfigManager.instance = new ConfigManager(context);
        }
        return ConfigManager.instance;
    }

    async checkApiKey(): Promise<void> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            const setKey = await vscode.window.showInformationMessage(
                'DeepSeek API key not found. Would you like to set it now?',
                'Yes',
                'No'
            );
            if (setKey === 'Yes') {
                await this.promptForApiKey();
            }
        }
    }

    async promptForApiKey(): Promise<void> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your DeepSeek API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-...',
            validateInput: (value) => {
                if (!value || value.length < 10) {
                    return 'Please enter a valid API key';
                }
                return null;
            }
        });

        if (apiKey) {
            await this.setApiKey(apiKey);
            vscode.window.showInformationMessage('DeepSeek API key saved securely!');
        }
    }

    async getApiKey(): Promise<string | undefined> {
        return await this.secretStorage.get(this.SECRET_KEY);
    }

    async setApiKey(apiKey: string): Promise<void> {
        await this.secretStorage.store(this.SECRET_KEY, apiKey);
    }

    async deleteApiKey(): Promise<void> {
        await this.secretStorage.delete(this.SECRET_KEY);
    }

    getModel(): string {
        return vscode.workspace.getConfiguration('deepseek').get('model', 'deepseek-v4-pro');
    }

    getTemperature(): number {
        return vscode.workspace.getConfiguration('deepseek').get('temperature', 0.7);
    }

    getMaxTokens(): number {
        return vscode.workspace.getConfiguration('deepseek').get('maxTokens', 2048);
    }
}
