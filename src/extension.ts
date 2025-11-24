import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand("console-toggle.toggleConsole", () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const { document } = editor;
      const langId = document.languageId;

      const supported = new Set([
        "javascript",
        "javascriptreact",
        "typescript",
        "typescriptreact",
        "vue",
        "svelte",
        "astro",
        "html",
      ]);

      if (!supported.has(langId)) return;

      const config = vscode.workspace.getConfiguration("consoleToggle");
      const toggleError = config.get<boolean>("toggleError", false);
      const toggleWarn = config.get<boolean>("toggleWarn", false);

      const fullText = document.getText();
      if (!fullText) return;

      const lines = fullText.split("\n");
      const totalLines = lines.length;
      if (totalLines === 0) return;

      const result: string[] = new Array(totalLines);
      let changed = false;
      let i = 0;

      let consoleMethods =
        "log|info|debug|table|trace|dir|dirxml|group|groupCollapsed|groupEnd|count|countReset|assert|time|timeLog|timeEnd|clear|profile|profileEnd";

      if (toggleError) {
        consoleMethods += "|error";
      }
      if (toggleWarn) {
        consoleMethods += "|warn";
      }

      const lineCommentedRegex = new RegExp(`^\\s*\\/\\/+\\s*console\\.(${consoleMethods})\\b`);
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

        // pattern - // /* console.log */ pattern - remove //
        if (blockCommentedRegex.test(original)) {
          try {
            const orig = lines[i] || "";
            const leadSpace = orig.substring(0, orig.length - orig.trimStart().length);
            result[i] = orig.replace(/^\s*\/\/+\s*/, leadSpace);
            changed = true;
            i++;
            continue;
          } catch (err) {
            result[i] = original;
          }
        }
        // pattern - pure block comments /* console.log */
        else if (pureBlockCommentedRegex.test(original)) {
          const leading = original.substring(0, original.length - trimmed.length);

          // single-line block comment
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
            // multi-line block comment
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
        }
        // line comments //
        else if (lineCommentedRegex.test(original)) {
          const leading = original.substring(0, original.length - trimmed.length);
          const start = i;
          let parenCount = 0;
          let foundOpen = false;
          let endLine = i;

          for (let j = start; j < totalLines; j++) {
            try {
              const lineText = lines[j].replace(/^\s*\/\/+\s*/, "");
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
                result[k] = orig.replace(/^\s*\/\/+\s*/, leadSpace);
              } catch (err) {
                result[k] = lines[k] || "";
              }
            }
            changed = true;
            i = endLine + 1;
            continue;
          }
        }
        // active console statements
        else if (activeConsoleRegex.test(trimmed)) {
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
            // always use //
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

      if (changed) {
        try {
          const newText = result.join("\n") + (fullText.endsWith("\n") ? "\n" : "");
          editor
            .edit((edit) => {
              const range = new vscode.Range(0, 0, totalLines, 0);
              edit.replace(range, newText);
            })
            .then((success) => {
              if (!success) {
                vscode.window.showErrorMessage("Console Toggle: Failed to apply changes");
              }
            });
        } catch (err) {
          vscode.window.showErrorMessage("Console Toggle: Error applying changes");
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage("Console Toggle: An unexpected error occurred");
      console.error("Console Toggle Error:", err);
    }
  });

  context.subscriptions.push(command);
}

export function deactivate() {}
