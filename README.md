# Color Converter
Rozszerzenie do konwersji formatów kolorów HEX, RGB i HSL w VS Code.

## Generowanie pakietu
npx @vscode/vsce package

## Instalacja pliku .vsix w VS Code
Możesz zainstalować gotową paczkę na dwa sposoby:

1. Z poziomu interfejsu graficznego:
- Otwórz VS Code i przejdź do zakładki Extensions (Ctrl+Shift+X / Cmd+Shift+X).
- Kliknij ikonę trzech kropek (...) w prawym górnym rogu panelu rozszerzeń.
- Wybierz Install from VSIX... i wskaż wygenerowany plik.

2. Z wiersza poleceń:
code --install-extension color-converter-0.0.1.vsix
