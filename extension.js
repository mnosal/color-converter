const vscode = require('vscode');

// --- Matematyka i parsowanie formatów ---

// Normalizacja kanału alfa (np. "0.5", "8.2%", "50%") na liczbę w zakresie 0-1
function parseAlpha(aStr) {
  if (aStr === undefined || aStr === null) return 1;
  const str = aStr.trim();
  if (str.endsWith('%')) {
    const pct = parseFloat(str.slice(0, -1));
    return isNaN(pct) ? 1 : Math.min(1, Math.max(0, pct / 100));
  }
  const val = parseFloat(str);
  return isNaN(val) ? 1 : Math.min(1, Math.max(0, val));
}

function parseColor(str) {
  const text = str.trim();

  // 1. HEX (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
  const hexMatch = text.match(/^#?([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    let a = 1;
    if (hex.length === 8) {
      a = parseFloat((parseInt(hex.substring(6, 8), 16) / 255).toFixed(2));
    }
    return { type: 'hex', r, g, b, a };
  }

  // 2. RGB / RGBA: obsługa składni legacy (przecinki) i nowoczesnej (spacje / ukośnik)
  const rgbMatch = text.match(/^rgba?\s*\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:(?:\/|,)\s*([\d.]+%?))?\s*\)$/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    if (r <= 255 && g <= 255 && b <= 255) {
      const a = parseAlpha(rgbMatch[4]);
      return { type: 'rgb', r, g, b, a };
    }
  }

  // 3. HSL / HSLA: obsługa składni legacy (przecinki) i nowoczesnej (spacje / ukośnik)
  const hslMatch = text.match(/^hsla?\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*(?:,\s*|\s+)(\d{1,3}(?:\.\d+)?)%\s*(?:,\s*|\s+)(\d{1,3}(?:\.\d+)?)%\s*(?:(?:\/|,)\s*([\d.]+%?))?\s*\)$/i);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) % 360;
    const s = Math.min(100, Math.max(0, parseFloat(hslMatch[2]))) / 100;
    const l = Math.min(100, Math.max(0, parseFloat(hslMatch[3]))) / 100;
    const a = parseAlpha(hslMatch[4]);

    const k = (n) => (n + h / 30) % 12;
    const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);

    return { type: 'hsl', r, g, b, a };
  }

  return null;
}

// --- Nowoczesne formatowanie wyjściowe (CSS Color Level 4) ---

function toHexFormat({ r, g, b, a }) {
  const pad = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  let hex = `#${pad(r)}${pad(g)}${pad(b)}`;
  if (a < 1) {
    hex += pad(Math.round(a * 255));
  }
  return hex;
}

function toRgbFormat({ r, g, b, a }) {
  if (a < 1) {
    const cleanAlpha = parseFloat(a.toFixed(3));
    return `rgb(${r} ${g} ${b} / ${cleanAlpha})`;
  }
  return `rgb(${r} ${g} ${b})`;
}

function toHslFormat({ r, g, b, a }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
  }

  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);

  if (a < 1) {
    const cleanAlpha = parseFloat(a.toFixed(3));
    return `hsl(${h} ${sPct}% ${lPct}% / ${cleanAlpha})`;
  }
  return `hsl(${h} ${sPct}% ${lPct}%)`;
}

// Cykl przełączania: HEX -> RGB -> HSL -> HEX
function toggleColor(rawText) {
  const parsed = parseColor(rawText);
  if (!parsed) return null;

  if (parsed.type === 'hex') {
    return toRgbFormat(parsed);
  }
  if (parsed.type === 'rgb') {
    return toHslFormat(parsed);
  }
  if (parsed.type === 'hsl') {
    return toHexFormat(parsed);
  }

  return null;
}

// --- Wyszukiwanie koloru pod pozycją kursora ---

function findColorRangeAtPosition(document, position) {
  const lineText = document.lineAt(position.line).text;
  const col = position.character;

  const colorRegex = /(hsla?\s*\(\s*\d{1,3}(?:\.\d+)?(?:,|\s+)\s*\d{1,3}(?:\.\d+)?%(?:,|\s+)\s*\d{1,3}(?:\.\d+)?%(?:\s*(?:\/|,)\s*[\d.]+%?)?\s*\)|rgba?\s*\(\s*\d{1,3}(?:,|\s+)\s*\d{1,3}(?:,|\s+)\s*\d{1,3}(?:\s*(?:\/|,)\s*[\d.]+%?)?\s*\)|#[A-Fa-f0-9]{8}\b|#[A-Fa-f0-9]{6}\b|#[A-Fa-f0-9]{4}\b|#[A-Fa-f0-9]{3}\b)/gi;

  let match;
  while ((match = colorRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (col >= start && col <= end) {
      const range = new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, end)
      );
      return { range, text: match[0] };
    }
  }

  return null;
}

// --- Rejestracja w VS Code ---

function activate(context) {
  const applyConversion = (convertFn) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selections = editor.selections;
    const targets = [];

    selections.forEach((sel) => {
      if (!sel.isEmpty) {
        const text = editor.document.getText(sel).trim();
        targets.push({ range: sel, text });
      } else {
        const detected = findColorRangeAtPosition(editor.document, sel.active);
        if (detected) {
          targets.push(detected);
        }
      }
    });

    if (targets.length === 0) {
      vscode.window.showInformationMessage('Nie znaleziono koloru pod kursorem ani w zaznaczeniu.');
      return;
    }

    let convertedCount = 0;

    editor.edit((editBuilder) => {
      targets.forEach(({ range, text }) => {
        const converted = convertFn(text);
        if (converted) {
          editBuilder.replace(range, converted);
          convertedCount++;
        }
      });
    }).then((success) => {
      if (success && convertedCount === 0) {
        vscode.window.showWarningMessage('Nie udało się przekonwertować koloru na wybrany format.');
      }
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('colorConverter.toggleColor', () => {
      applyConversion(toggleColor);
    }),
    vscode.commands.registerCommand('colorConverter.toHex', () => {
      applyConversion((text) => {
        const p = parseColor(text);
        return p ? toHexFormat(p) : null;
      });
    }),
    vscode.commands.registerCommand('colorConverter.toRgb', () => {
      applyConversion((text) => {
        const p = parseColor(text);
        return p ? toRgbFormat(p) : null;
      });
    }),
    vscode.commands.registerCommand('colorConverter.toHsl', () => {
      applyConversion((text) => {
        const p = parseColor(text);
        return p ? toHslFormat(p) : null;
      });
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};