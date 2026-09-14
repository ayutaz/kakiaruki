# サードパーティ表示

このプロジェクトの配布物（`dist/` および <https://ayutaz.github.io/one-stroke-evolution-web/> で配信されるJavaScript）には、次のソフトウェアのコードが含まれています。

---

## Phaser Box2D

- https://www.npmjs.com/package/phaser-box2d
- Copyright (c) 2024 Phaser
- MIT License

物理演算に使用しています。ビルド時に必要な部分だけが成果物へ取り込まれます。

Phaser Box2D は、Erin Catto 氏による Box2D (v3) のC実装をJavaScriptへ移植したものです。

- Box2D: Copyright 2023 Erin Catto
- MIT License

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Phaser

- https://phaser.io
- Copyright (c) 2024 Richard Davey, Phaser Studio Inc.
- MIT License（本文は上と同一）

**製品画面のビルド成果物には含まれません。** 開発用のP0デモ（`bench/p0-demo.html`）でのみ読み込みます。

---

## 同梱していないもの

画像・音声・フォントファイルは1つも同梱していません。描画はすべて Canvas 2D で行い、文字はOS標準のフォントを使います。
