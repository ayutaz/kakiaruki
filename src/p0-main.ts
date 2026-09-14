import Phaser from "phaser";

import { P0Scene } from "./p0-scene.ts";
import "./style.css";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 720,
  height: 560,
  backgroundColor: "#07131f",
  antialias: true,
  scene: [P0Scene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
