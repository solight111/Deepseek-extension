import * as vscode from 'vscode';
import { ConfigManager } from './configManager';

export interface DeepSeekMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface DeepSeekRequest {
    model: string;
    messages: DeepSeekMessage[];
    temperature: number;
    max_tokens: number;
    stream?: boolean;
}

export class DeepSeekClient {
    private configManager: ConfigManager;
    private readonly API_URL = 'https://api.deepseek.com/chat/completions';

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    async chat(
        messages: DeepSeekMessage[],
        onToken?: (token: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
        const apiKey = await this.configManager.getApiKey();
        if (!apiKey) {
            throw new Error('API key not configured. Use "DeepSeek: Set API Key" command.');
        }

        const request: DeepSeekRequest = {
            model: this.configManager.getModel(),
            messages: messages,
            temperature: this.configManager.getTemperature(),
            max_tokens: this.configManager.getMaxTokens(),
            stream: !!onToken
        };

        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(request),
                signal
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(
                    `DeepSeek API error (${response.status}): ${error.error?.message || response.statusText}`
                );
            }

            if (onToken && response.body) {
                return await this.handleStreamResponse(response.body, onToken, signal);
            } else {
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) {
                    throw new Error('No response content received from DeepSeek');
                }
                return content;
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                vscode.window.showInformationMessage('Request cancelled');
                throw error;
            }

            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`DeepSeek request failed: ${message}`);
            throw error;
        }
    }

    private async handleStreamResponse(
        body: ReadableStream<Uint8Array>,
        onToken: (token: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let pending = '';

        const processLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) return;

            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                    fullResponse += token;
                    onToken(token);
                }
            } catch (e) {
                console.warn('DeepSeek: Failed to parse chunk:', data);
            }
        };

        try {
            while (true) {
                if (signal?.aborted) {
                    await reader.cancel();
                    throw new DOMException('The operation was aborted', 'AbortError');
                }

                const { done, value } = await reader.read();
                if (done) break;

                pending += decoder.decode(value, { stream: true });
                const lines = pending.split('\n');
                pending = lines.pop() ?? '';

                for (const line of lines) {
                    processLine(line);
                }
            }

            pending += decoder.decode();
            if (pending.trim()) {
                processLine(pending);
            }
        } catch (error) {
            await reader.cancel().catch(() => undefined);
            throw error;
        }

        return fullResponse;
    }
}
