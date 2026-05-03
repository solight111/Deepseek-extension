import * as vscode from 'vscode';
import { ConfigManager } from '../services/configManager';
import { DeepSeekClient, DeepSeekMessage } from '../services/deepseekClient';
import { ContextBuilder } from '../services/contextBuilder';

export class ChatPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private client: DeepSeekClient;
    private configManager: ConfigManager;
    private currentAbortController?: AbortController;
    private conversationHistory: DeepSeekMessage[] = [];
    private readonly MAX_CONVERSATION_MESSAGES = 20;

    constructor(
        private readonly extensionUri: vscode.Uri,
        configManager: ConfigManager
    ) {
        this.configManager = configManager;
        this.client = new DeepSeekClient(configManager);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'cancelRequest':
                    this.cancelCurrentRequest();
                    break;
                case 'promptApiKey':
                    await this.configManager.promptForApiKey();
                    this._view?.webview.postMessage({
                        type: 'apiKeyStatus',
                        hasKey: !!(await this.configManager.getApiKey())
                    });
                    break;
                case 'clearChat':
                    this.conversationHistory = [];
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    break;
                case 'setApiKey':
                    await this.configManager.setApiKey(data.key);
                    this._view?.webview.postMessage({
                        type: 'showNotification',
                        text: 'API key saved!'
                    });
                    break;
                case 'getApiKey':
                    const key = await this.configManager.getApiKey();
                    this._view?.webview.postMessage({
                        type: 'apiKeyStatus',
                        hasKey: !!key
                    });
                    break;
            }
        });
    }

    private cancelCurrentRequest(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
            this._view?.webview.postMessage({
                type: 'showNotification',
                text: 'Request cancelled'
            });
        }
    }

    public async sendMessage(query: string): Promise<void> {
        if (!this._view) return;

        this._view.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: query
        });

        const editorContext = ContextBuilder.getEditorContext();
        const prompt = ContextBuilder.buildPrompt(query, editorContext);
        const userMessage: DeepSeekMessage = { role: 'user', content: prompt };
        const messages: DeepSeekMessage[] = [
            ...this.conversationHistory,
            userMessage
        ];

        this.currentAbortController = new AbortController();

        try {
            const assistantResponse = await this.client.chat(
                messages,
                (token) => {
                    this._view?.webview.postMessage({
                        type: 'addToken',
                        token
                    });
                },
                this.currentAbortController.signal
            );

            this.conversationHistory.push(userMessage, {
                role: 'assistant',
                content: assistantResponse
            });

            if (this.conversationHistory.length > this.MAX_CONVERSATION_MESSAGES) {
                this.conversationHistory = this.conversationHistory.slice(-this.MAX_CONVERSATION_MESSAGES);
            }

            this._view.webview.postMessage({ type: 'messageComplete' });
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                this._view.webview.postMessage({ type: 'messageComplete' });
            } else {
                this._view.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: `Error: ${error?.message || error}`
                });
            }
        } finally {
            this.currentAbortController = undefined;
        }
    }

    public updateConfig(): void {
        this.client = new DeepSeekClient(this.configManager);
    }

    private async handleUserMessage(message: string): Promise<void> {
        await this.sendMessage(message);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = getNonce();
        const deepseekIconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'deepseek.svg')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>DeepSeek Chat</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            padding: 12px;
            display: flex;
            flex-direction: column;
            height: 100vh;
            margin: 0;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        #messages {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 12px;
            scroll-behavior: smooth;
        }
        .message {
            margin: 8px 0;
            padding: 10px 12px;
            border-radius: 6px;
            line-height: 1.5;
            animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .user-message {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        .assistant-message {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }
        .assistant-message.streaming {
            border-left: 3px solid var(--vscode-progressBar-background);
        }
        .assistant-message.error {
            border-left: 3px solid var(--vscode-errorForeground);
            color: var(--vscode-errorForeground);
        }
        #input-area {
            display: flex;
            gap: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        #user-input {
            flex: 1;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            min-height: 40px;
            font-family: var(--vscode-font-family);
        }
        #user-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        button img {
            width: 14px;
            height: 14px;
            flex: 0 0 auto;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        #cancel-btn {
            background: var(--vscode-button-secondaryBackground);
            display: none;
        }
        #cancel-btn.visible { display: inline-block; }
        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            align-items: center;
        }
        .toolbar button {
            font-size: 12px;
            padding: 4px 8px;
            background: transparent;
            border: 1px solid var(--vscode-panel-border);
        }
        .toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
        pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            border: 1px solid var(--vscode-panel-border);
            position: relative;
        }
        .code-block-header {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: -8px;
            padding: 2px 0;
        }
        code {
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 0.9em;
        }
        p { margin: 4px 0; }
        ul, ol { padding-left: 20px; }
        .welcome-message {
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="clear-btn" title="Clear conversation"><img src="${deepseekIconUri}" alt="" aria-hidden="true">Clear</button>
        <button id="api-key-btn" title="Update API key"><img src="${deepseekIconUri}" alt="" aria-hidden="true">API Key</button>
        <span style="flex:1"></span>
        <button id="cancel-btn" title="Cancel current request"><img src="${deepseekIconUri}" alt="" aria-hidden="true">Cancel</button>
    </div>
    <div id="messages">
        <div class="welcome-message">
            Hello. I am DeepSeek Coder.<br>
            Ask me about your code, and I will help you write, explain, and debug.
        </div>
    </div>
    <div id="input-area">
        <textarea id="user-input" rows="2" placeholder="Ask anything about your code..."></textarea>
        <button id="send-btn"><img src="${deepseekIconUri}" alt="" aria-hidden="true">Send</button>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const messages = document.getElementById('messages');
            const input = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');
            const cancelBtn = document.getElementById('cancel-btn');
            const clearBtn = document.getElementById('clear-btn');
            const apiKeyBtn = document.getElementById('api-key-btn');
            let currentAssistantMessage = null;
            let streamingBuffer = '';
            let isStreaming = false;
            let lastRenderTime = 0;
            const RENDER_THROTTLE = 50;

            function escapeHtml(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            function parseMarkdown(text) {
                if (!text) return '';
                let html = escapeHtml(text);
                const fence = String.fromCharCode(96, 96, 96);
                html = html.replace(new RegExp(fence + '(\\w*)\\n([\\s\\S]*?)' + fence, 'g'), function(match, lang, code) {
                    const header = lang ? '<div class="code-block-header">' + lang + '</div>' : '';
                    return '<pre>' + header + '<code>' + code.trim() + '</code></pre>';
                });
                html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
                html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
                html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
                html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
                html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
                html = html.replace(/^(\s*)[-*] (.+)$/gm, '<li>$2</li>');
                html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');
                html = '<p>' + html + '</p>';
                html = html.replace(/\n\n/g, '</p><p>');
                html = html.replace(/\n/g, '<br>');
                html = html.replace(/<p><\/p>/g, '');
                return html;
            }

            function sendMessage() {
                if (isStreaming) return;
                const text = input.value.trim();
                if (!text) return;
                vscode.postMessage({ type: 'sendMessage', message: text });
                input.value = '';
                input.style.height = 'auto';
            }

            function cancelRequest() {
                vscode.postMessage({ type: 'cancelRequest' });
                finishStreaming();
            }

            function clearChat() {
                vscode.postMessage({ type: 'clearChat' });
            }

            function setApiKey() {
                vscode.postMessage({ type: 'promptApiKey' });
            }

            sendBtn.addEventListener('click', sendMessage);
            cancelBtn.addEventListener('click', cancelRequest);
            clearBtn.addEventListener('click', clearChat);
            apiKeyBtn.addEventListener('click', setApiKey);

            input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            window.addEventListener('message', event => {
                const data = event.data;
                switch (data.type) {
                    case 'addMessage':
                        addMessage(data.role, data.content);
                        break;
                    case 'addToken':
                        if (!isStreaming) startStreaming();
                        streamingBuffer += data.token;
                        renderStreamingMessageThrottled();
                        break;
                    case 'messageComplete':
                        finishStreaming();
                        break;
                    case 'clearChat':
                        messages.innerHTML = '<div class="welcome-message">Chat cleared. Ready for new questions.</div>';
                        currentAssistantMessage = null;
                        streamingBuffer = '';
                        isStreaming = false;
                        break;
                    case 'showNotification':
                        showNotification(data.text);
                        break;
                    case 'apiKeyStatus':
                        if (!data.hasKey) showNotification('No API key configured');
                        break;
                }
            });

            function startStreaming() {
                isStreaming = true;
                streamingBuffer = '';
                lastRenderTime = 0;
                sendBtn.textContent = 'Sending...';
                sendBtn.disabled = true;
                cancelBtn.classList.add('visible');
                currentAssistantMessage = createMessageElement('assistant');
                currentAssistantMessage.classList.add('streaming');
                messages.appendChild(currentAssistantMessage);
            }

            function renderStreamingMessageThrottled() {
                const now = Date.now();
                if (now - lastRenderTime >= RENDER_THROTTLE) {
                    renderStreamingMessage();
                    lastRenderTime = now;
                }
            }

            function renderStreamingMessage() {
                if (currentAssistantMessage) {
                    currentAssistantMessage.innerHTML = parseMarkdown(streamingBuffer);
                    messages.scrollTop = messages.scrollHeight;
                }
            }

            function finishStreaming() {
                if (isStreaming) {
                    if (currentAssistantMessage) {
                        currentAssistantMessage.innerHTML = parseMarkdown(streamingBuffer);
                        currentAssistantMessage.classList.remove('streaming');
                    }
                    isStreaming = false;
                    sendBtn.textContent = 'Send';
                    sendBtn.disabled = false;
                    cancelBtn.classList.remove('visible');
                    currentAssistantMessage = null;
                    streamingBuffer = '';
                }
            }

            function createMessageElement(role) {
                const div = document.createElement('div');
                div.className = 'message ' + role + '-message';
                return div;
            }

            function addMessage(role, content) {
                const welcome = messages.querySelector('.welcome-message');
                if (welcome) welcome.remove();
                const div = createMessageElement(role);
                if (role === 'assistant' && content && content.startsWith('Error:')) {
                    div.classList.add('error');
                }
                div.innerHTML = parseMarkdown(content);
                messages.appendChild(div);
                messages.scrollTop = messages.scrollHeight;
                return div;
            }

            function showNotification(text) {
                const notification = document.createElement('div');
                notification.style.cssText = 'position:fixed;top:10px;right:10px;background:var(--vscode-notificationToast-background);color:var(--vscode-notificationToast-foreground);padding:8px 16px;border-radius:4px;z-index:1000;animation:fadeIn 0.3s ease;';
                notification.textContent = text;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }

            vscode.postMessage({ type: 'getApiKey' });
        })();
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
