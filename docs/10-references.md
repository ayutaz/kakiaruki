# 参考資料

確認日: 2026-09-14

## 原作・関連作品

1. [一筆進化 - unityroom](https://unityroom.com/games/one-stroke-evo)
   - 一筆入力、戻り線による枝分かれ、学習、表示個体数・速度調整、リプレイ、Godot製を確認。
2. [歩行進化論 - unityroom](https://unityroom.com/games/walking-evolution-theory)
   - 遺伝的アルゴリズム、設計した構造体の歩行学習、個体数設定に関する作者コメントを確認。
3. [再発明された車輪のゲーム置き場](https://beginne28949926.com/games/)
   - 『歩行進化論』の制作コメントと、初期に描画したイラストを動かす案があったことを確認。

## Phaser / Phaser Box2D

4. [Phaser GitHub Releases](https://github.com/phaserjs/phaser/releases)
   - 2026-09-14時点の最新ReleaseがPhaser 4.2.1であることを確認。
5. [Phaser repository](https://github.com/phaserjs/phaser)
   - Web向け2D framework、TypeScript definition、MIT license、Phaser 4の概要。
6. [Phaser Box2D repository](https://github.com/phaserjs/phaser-box2d)
   - Box2D v3のJavaScript移植、standalone利用、Vite template、npm package、capsule、licenseを確認。
7. [Phaser Box2D - Revolute Joints tutorial](https://phaser.io/tutorials/box2d-tutorials/revolute-joints)
   - limit、motor speed、max motor torqueと実行中の更新APIを確認。
8. [Box2D Simulation documentation](https://box2d.org/documentation/md_simulation.html)
   - Revolute Joint、固定step、joint angle／motorの基礎仕様。
9. [Phaser Box2D Releases](https://github.com/phaserjs/phaser-box2d/releases)
   - 2026-09-14時点の最新Releaseが1.1.0であることを確認。

## 公開Issue（事実ではなくリスク情報）

10. [phaser-box2d Issue #19: multiple worlds and WorldStep accumulator](https://github.com/phaserjs/phaser-box2d/issues/19)
11. [phaser-box2d Issue #20: WorldStep totalTime report](https://github.com/phaserjs/phaser-box2d/issues/20)
12. [phaser-box2d Issue #30: TypeScript npm import report](https://github.com/phaserjs/phaser-box2d/issues/30)
13. [phaser-box2d Issue #39: repeated world creation/destruction report](https://github.com/phaserjs/phaser-box2d/issues/39)

これらのIssueは利用者の報告であり、本プロジェクト環境で再現したとは扱いません。P0の検証項目を決めるために参照しています。

## Godotフォールバック

14. [Godot PhysicsServer2D](https://docs.godotengine.org/en/stable/classes/class_physicsserver2d.html)
   - カプセル形状、Pin Jointのlimitとmotor、Nodeから独立したphysics object操作を確認。
15. [Godot: Exporting for the Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
   - WebAssembly／WebGL要件、thread利用時のcross-origin isolation、Web export上の制約を確認。

## 研究背景

16. [Karl Sims, Evolving Virtual Creatures, SIGGRAPH 1994](https://www.karlsims.com/papers/siggraph94.pdf)
   - 形態と制御系を進化させる仮想生物研究の代表例。

## 引用・断定のルール

- 上記資料から確認できる事実だけを **確認済み** とする。
- 原作内部のアルゴリズムや数値を推測で断定しない。
- ライブラリversionは実装時に再確認し、lockfileと試験結果を正とする。
- Issueは再現手順を実行するまで、このプロジェクトの不具合とは扱わない。
