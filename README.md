# Pomodoro (GitHub Pages)

GitHub Pages で動く、静的ファイル（HTML/CSS/JSのみ）のポモドーロタイマーです。

## 使い方（ローカル）

このプロジェクトはビルド不要です。

- `index.html` をブラウザで開く
- もしくは簡易サーバーで起動（例: VS Code / Cursor の Live Server など）

## GitHub Pages で公開

1. GitHub のリポジトリを開く
2. Settings → Pages
3. Build and deployment → Source を **Deploy from a branch** に設定
4. Branch を `main` / `/(root)` に設定して保存

しばらくすると `https://<user>.github.io/<repo>/` で公開されます。

## セキュリティ（最低限）

- 設定は `localStorage` に保存され、サーバーへ送信しません
- 外部ライブラリ依存なし（サプライチェーンリスクを小さく）

