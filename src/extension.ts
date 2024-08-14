import * as vscode from 'vscode';
import axios, { AxiosResponse, AxiosError } from 'axios';

interface AIResponse {
    choices: { message: { content: string }, suggestions?: string[] }[];
}

async function getCodeSnippet(prompt: string): Promise<{ content: string, suggestions?: string[] }> {
    try {
        console.time('API Call');

        const response: AxiosResponse<AIResponse> = await Promise.race([
            axios.post<AIResponse>('https://api.together.xyz/v1/chat/completions', {
                model: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
                messages: [
                    {
                        role: "system",
                        content: "AI coding assistant"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 1400,
                temperature: 0.1,
                top_p: 1,
                top_k: 50,
                repetition_penalty: 1,
                stop: ["<|eot_id|>"]
            }, {
                headers: {
                    'Authorization': 'Bearer f3060f555ebf48dd3d03f6c956c48bf04d77b712d67d162538ba16e478fba122',
                    'Content-Type': 'application/json'
                }
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out')), 15000)
            )
        ]);
        console.timeEnd('API Call');

        const content = response.data.choices[0].message.content;
        const suggestions = response.data.choices[0].suggestions;

        return { content, suggestions };
    } catch (error: unknown) {
        if (error instanceof AxiosError) {
            console.error('Error making API request:', error.response ? error.response.data : error.message);
            vscode.window.showErrorMessage('Error: ' + (error.response ? error.response.data : error.message));
        } else {
            console.error('Unknown error:', error);
        }
        return { content: 'Error: Unable to fetch response.', suggestions: [] };
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.openChat', () => {
        const panel = vscode.window.createWebviewPanel(
            'Chat',
            'Chat with AI',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        panel.webview.html = getWebviewContent();

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'ask':
                        const { content, suggestions } = await getCodeSnippet(message.text);
                        panel.webview.postMessage({ command: 'response', text: content, suggestions });
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    }));
}

function getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat with AI</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #098ae6;
                margin: 0;
                padding: 5px;
            }
            #chat {
                height: 390px;
                overflow-y: auto;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 10px;
                background-color: black;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            #input {
                width: calc(100% - 100px);
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                margin-top: 10px;
            }
            #send {
                padding: 10px;
                border: none;
                border-radius: 4px;
                background-color: #e31507;
                color: white;
                cursor: pointer;
                margin-left: 5px;
            }
            #send:hover {
                background-color: #005fa3;
            }
            .user-message {
                color: black;
                margin: 5px 0;
            }
            .ai-message {
                color: white;
                margin: 5px 0;
            }
            .suggestion {
                background-color: #f0f0f0;
                border-left: 4px solid #e31507;
                padding: 5px;
                margin: 5px 0;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div id="chat"></div>
        <input type="text" id="input" placeholder="Ask a question..." />
        <button id="send">Send</button>
        <script>
            const chat = document.getElementById('chat');
            const input = document.getElementById('input');
            const sendButton = document.getElementById('send');
            // Acquire the vs code API
            const vscode = acquireVsCodeApi();
            
            const sendMessage = () => {
                const text = input.value;
                if (text.trim() === '') return;
                chat.innerHTML += '<div class="user-message">You: ' + text + '</div>';
                input.value = '';
                
                vscode.postMessage({ command: 'ask', text: text });
                chat.innerHTML += '<div class="ai-message">MyPilot: ... (Searching...)</div>';
                chat.scrollTop = chat.scrollHeight;
            };

            sendButton.onclick = sendMessage;
            
            input.addEventListener('keydown', (event) => {
                if (event.shiftKey && event.key === 'Enter') {
                    event.preventDefault();
                    sendMessage();
                }
            });

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'response':
                        chat.innerHTML += '<div class="ai-message">AI: <pre><code>' + escapeHtml(message.text) + '</code></pre></div>';
                        if (message.suggestions && message.suggestions.length > 0) {
                            message.suggestions.forEach(suggestion => {
                                chat.innerHTML += '<div class="suggestion">' + escapeHtml(suggestion) + '</div>';
                            });
                        }
                        chat.scrollTop = chat.scrollHeight;
                        break;
                }
            });

            function escapeHtml(unsafe) {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }
        </script>
    </body>
    </html>`;
}
