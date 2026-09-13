# one-stroke-evolution-web

『一筆進化』の公開されている体験を参考にした、Web向け独立実装の技術検証プロジェクトです。

P0技術スパイクとして、Phaser 4、Phaser Box2D、TypeScript、Viteの統合と、固定ステップで動作する最小の2ボーン物理モデルを検証済みです。

## 必要環境

- Node.js 24以上
- npm 11以上

## コマンド

```powershell
npm ci
npm run dev
npm run test
npm run build
npm run verify
```

`npm run verify` は自動試験、型検査、本番ビルドを順番に実行します。

`npm run dev` の既定URLは `http://127.0.0.1:5173/` です。モーター、関節角度制限、シミュレーション速度を画面上で切り替えられます。

設計、PoCの完了条件、技術検証記録は [docs/README.md](docs/README.md) から参照してください。P0の実測結果は [docs/11-p0-technical-validation.md](docs/11-p0-technical-validation.md) にまとめています。
