import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const isSupported = (langId: string): boolean => {
    return new Set([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
      "vue",
      "svelte",
      "astro",
      "html",
    ]).has(langId);
  };

  const getConsoleMethods = (): string => {
    const config = vscode.workspace.getConfiguration("consoleToggle");
    const toggleError = config.get<boolean>("toggleError", false);
    const toggleWarn = config.get<boolean>("toggleWarn", false);

    let methods =
      "log|info|debug|table|trace|dir|dirxml|group|groupCollapsed|groupEnd|count|countReset|assert|time|timeLog|timeEnd|clear|profile|profileEnd";

    if (toggleError) methods += "|error";
    if (toggleWarn) methods += "|warn";

    return methods;
  };

  const toggleConsoleStatements = (text: string, consoleMethods: string): { newText: string; changed: boolean } => {
    const lines = text.split("\n");
    const totalLines = lines.length;
    if (totalLines === 0) return { newText: text, changed: false };

    const result: string[] = new Array(totalLines);
    let changed = false;
    let i = 0;

    const lineCommentedRegex = new RegExp(`^\\s*(?:\\/\\/\\s*)+console\\.(${consoleMethods})\\b`);
    const blockCommentedRegex = new RegExp(`^\\s*\\/\\/+\\s*\\/\\*\\s*console\\.(${consoleMethods})\\b`);
    const pureBlockCommentedRegex = new RegExp(`^\\s*\\/\\*\\s*console\\.(${consoleMethods})\\b`);
    const activeConsoleRegex = new RegExp(`\\bconsole\\.(${consoleMethods})\\s*\\(`);

    while (i < totalLines) {
      const original = lines[i];
      if (original === undefined) {
        result[i] = "";
        i++;
        continue;
      }

      const trimmed = original.trimStart();

      if (blockCommentedRegex.test(original)) {
        try {
          const leadSpace = original.substring(0, original.length - trimmed.length);
          result[i] = original.replace(/^\s*\/\/+\s*/, leadSpace);
          changed = true;
          i++;
          continue;
        } catch (err) {
          result[i] = original;
        }
      } else if (pureBlockCommentedRegex.test(original)) {
        const leading = original.substring(0, original.length - trimmed.length);

        if (/\/\*.*\*\//.test(original)) {
          try {
            const uncommented = original.replace(/^\s*\/\*\s*/, leading).replace(/\s*\*\/\s*$/, "");
            result[i] = uncommented;
            changed = true;
            i++;
            continue;
          } catch (err) {
            result[i] = original;
          }
        } else {
          const start = i;
          let endLine = i;
          let foundEnd = false;

          for (let j = start; j < totalLines; j++) {
            if (lines[j].includes("*/")) {
              endLine = j;
              foundEnd = true;
              break;
            }
          }

          if (foundEnd) {
            for (let k = start; k <= endLine; k++) {
              try {
                let line = lines[k] || "";
                const leadSpace = line.substring(0, line.length - line.trimStart().length);

                if (k === start) {
                  line = line.replace(/^\s*\/\*\s*/, leadSpace);
                }
                if (k === endLine) {
                  line = line.replace(/\s*\*\/\s*$/, "");
                }
                result[k] = line;
              } catch (err) {
                result[k] = lines[k] || "";
              }
            }
            changed = true;
            i = endLine + 1;
            continue;
          }
        }
      } else if (lineCommentedRegex.test(original)) {
        const leading = original.substring(0, original.length - trimmed.length);
        const start = i;
        let parenCount = 0;
        let foundOpen = false;
        let endLine = i;

        for (let j = start; j < totalLines; j++) {
          try {
            const lineText = lines[j].replace(/^\s*(?:\/\/\s*)+/, "");
            const len = lineText.length;

            for (let k = 0; k < len; k++) {
              const char = lineText[k];
              if (char === "(") {
                parenCount++;
                foundOpen = true;
              } else if (char === ")") {
                parenCount--;
                if (foundOpen && parenCount === 0) {
                  endLine = j;
                  j = totalLines;
                  break;
                }
              }
            }
          } catch (err) {
            result[j] = lines[j] || "";
          }
        }

        if (foundOpen && parenCount === 0) {
          for (let k = start; k <= endLine; k++) {
            try {
              const orig = lines[k] || "";
              const leadSpace = orig.substring(0, orig.length - orig.trimStart().length);
              result[k] = orig.replace(/^\s*(?:\/\/\s*)+/, leadSpace);
            } catch (err) {
              result[k] = lines[k] || "";
            }
          }
          changed = true;
          i = endLine + 1;
          continue;
        }
      } else if (activeConsoleRegex.test(trimmed)) {
        const start = i;
        let parenCount = 0;
        let foundOpen = false;
        let endLine = i;

        for (let j = start; j < totalLines; j++) {
          try {
            const lineText = lines[j];
            const len = lineText.length;

            for (let k = 0; k < len; k++) {
              const char = lineText[k];
              if (char === "(") {
                parenCount++;
                foundOpen = true;
              } else if (char === ")") {
                parenCount--;
                if (foundOpen && parenCount === 0) {
                  endLine = j;
                  j = totalLines;
                  break;
                }
              }
            }
          } catch (err) {
            result[j] = lines[j] || "";
          }
        }

        if (foundOpen && parenCount === 0) {
          for (let k = start; k <= endLine; k++) {
            try {
              const orig = lines[k] || "";
              const leadSpace = orig.substring(0, orig.length - orig.trimStart().length);
              const trim = orig.trimStart();
              result[k] = leadSpace + "// " + trim;
            } catch (err) {
              result[k] = lines[k] || "";
            }
          }
          changed = true;
          i = endLine + 1;
          continue;
        }
      }

      result[i] = original;
      i++;
    }

    return { newText: result.join("\n"), changed };
  };

  const toggleCommand = vscode.commands.registerCommand("console-toggle.toggleConsole", () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isSupported(editor.document.languageId)) return;

      const consoleMethods = getConsoleMethods();
      const selection = editor.selection;

      if (!selection.isEmpty) {
        const selectedText = editor.document.getText(selection);
        const { newText, changed } = toggleConsoleStatements(selectedText, consoleMethods);

        if (changed) {
          editor.edit((edit) => {
            edit.replace(selection, newText);
          });
        }
      } else {
        const fullText = editor.document.getText();
        const { newText, changed } = toggleConsoleStatements(fullText, consoleMethods);

        if (changed) {
          const totalLines = editor.document.lineCount;
          const lastLine = editor.document.lineAt(totalLines - 1);
          const range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);

          editor.edit((edit) => {
            edit.replace(range, newText);
          });
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage("Console Toggle: An unexpected error occurred");
      console.error("Console Toggle Error:", err);
    }
  });

  const commentAllCommand = vscode.commands.registerCommand("console-toggle.commentAll", () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isSupported(editor.document.languageId)) return;

      const consoleMethods = getConsoleMethods();
      const fullText = editor.document.getText();
      const lines = fullText.split("\n");
      const totalLines = lines.length;

      const consoleRegex = new RegExp(`\\bconsole\\.(${consoleMethods})\\s*\\(`);
      const result: string[] = new Array(totalLines);
      let changed = false;

      for (let i = 0; i < totalLines; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        if (consoleRegex.test(trimmed)) {
          const leadSpace = line.substring(0, line.length - trimmed.length);
          result[i] = leadSpace + "// " + trimmed;
          changed = true;
        } else {
          result[i] = line;
        }
      }

      if (changed) {
        const newText = result.join("\n");
        const lastLine = editor.document.lineAt(totalLines - 1);
        const range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);

        editor.edit((edit) => {
          edit.replace(range, newText);
        });
      }
    } catch (err) {
      vscode.window.showErrorMessage("Console Toggle: Failed to comment all");
      console.error("Console Toggle Error:", err);
    }
  });

  const uncommentAllCommand = vscode.commands.registerCommand("console-toggle.uncommentAll", () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isSupported(editor.document.languageId)) return;

      const consoleMethods = getConsoleMethods();
      const fullText = editor.document.getText();
      const lines = fullText.split("\n");
      const totalLines = lines.length;

      const result: string[] = new Array(totalLines);
      let changed = false;
      let i = 0;

      const lineCommentRegex = new RegExp(`^\\s*(?:\\/\\/\\s*)+console\\.(${consoleMethods})\\b`);
      const blockCommentRegex = new RegExp(`^\\s*\\/\\*\\s*console\\.(${consoleMethods})\\b`);

      while (i < totalLines) {
        const line = lines[i];
        const trimmed = line.trimStart();

        if (lineCommentRegex.test(line)) {
          const leadSpace = line.substring(0, line.length - trimmed.length);
          result[i] = line.replace(/^\s*(?:\/\/\s*)+/, leadSpace);
          changed = true;
          i++;
        } else if (blockCommentRegex.test(line) && /\/\*.*\*\//.test(line)) {
          const leadSpace = line.substring(0, line.length - trimmed.length);
          const uncommented = line.replace(/^\s*\/\*\s*/, leadSpace).replace(/\s*\*\/\s*$/, "");
          result[i] = uncommented;
          changed = true;
          i++;
        } else if (blockCommentRegex.test(line)) {
          const start = i;
          let endLine = i;

          for (let j = start; j < totalLines; j++) {
            if (lines[j].includes("*/")) {
              endLine = j;
              break;
            }
          }

          for (let k = start; k <= endLine; k++) {
            let processedLine = lines[k];
            const leadSpace = processedLine.substring(0, processedLine.length - processedLine.trimStart().length);

            if (k === start) {
              processedLine = processedLine.replace(/^\s*\/\*\s*/, leadSpace);
            }
            if (k === endLine) {
              processedLine = processedLine.replace(/\s*\*\/\s*$/, "");
            }
            result[k] = processedLine;
          }

          changed = true;
          i = endLine + 1;
        } else {
          result[i] = line;
          i++;
        }
      }

      if (changed) {
        const newText = result.join("\n");
        const lastLine = editor.document.lineAt(totalLines - 1);
        const range = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);

        editor.edit((edit) => {
          edit.replace(range, newText);
        });
      }
    } catch (err) {
      vscode.window.showErrorMessage("Console Toggle: Failed to uncomment all");
      console.error("Console Toggle Error:", err);
    }
  });

  context.subscriptions.push(toggleCommand, commentAllCommand, uncommentAllCommand);
}

export function deactivate() {}
