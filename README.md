# DeepSeek Coder VS Code Extension

DeepSeek Coder is a day-one-ready VS Code extension scaffold for asking DeepSeek questions, explaining selected code, generating code from selected prompts or snippets, and reviewing selected code.

## Install

### From a VSIX file

1. Download the latest `.vsix` package from this project's releases.
2. Open VS Code.
3. Open the Extensions view.
4. Select **Install from VSIX...** from the Extensions view menu.
5. Choose the downloaded `.vsix` file.
6. Reload VS Code if prompted.

You can also install from the command line:

```bash
code --install-extension deepseek-coder-0.1.0.vsix
```

### From source

Clone the repository, install dependencies, and build the extension:

```bash
npm install
npm run compile
```

For active development with automatic rebuilds:

```bash
npm run watch
```

Then open the folder in VS Code and press `F5` to launch an Extension Development Host.

## Build

```bash
npm install
npm run compile
```

## Debug in VS Code

Open this folder in VS Code and press `F5`, or choose **Run Extension** from the debugger panel. The debugger runs `npm: compile` before launching the extension host.

## Configure DeepSeek API Key

Run **DeepSeek: Set API Key** from the Command Palette, or use the **API Key** button in the DeepSeek sidebar. The key is stored through VS Code SecretStorage rather than plaintext settings.

The extension uses DeepSeek's OpenAI-compatible API at `https://api.deepseek.com` and defaults to the `deepseek-v4-pro` model.

## Commands

| Command | Purpose |
|---|---|
| `Ask DeepSeek` | Ask a general question with current editor context. |
| `DeepSeek: Explain This Code` | Explain selected code in a new editor document. |
| `DeepSeek: Generate Code` | Generate code from selected text and insert it into the active editor. |
| `DeepSeek: Review Code` | Review selected code and show the result as Markdown. |
| `Open DeepSeek Chat` | Focus the sidebar chat view. |
| `DeepSeek: Set API Key` | Save or update the DeepSeek API key. |

## Notes

The sidebar chat supports streaming responses, a nonce-based Content Security Policy, local Markdown rendering without a CDN dependency, and request cancellation via `AbortController`.
