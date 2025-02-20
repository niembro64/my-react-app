// src/scenes/SimulationScene.ts
import Phaser from 'phaser';

export default class SimulationScene extends Phaser.Scene {
  creatures: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload() {
    // No assets needed since we’re using geometric shapes.
  }

  create() {
    // Create 10 creatures as simple circles with random positions and velocities.
    for (let i = 0; i < 10; i++) {
      const x = Phaser.Math.Between(
        50,
        (this.game.config.width as number) - 50
      );
      const y = Phaser.Math.Between(
        50,
        (this.game.config.height as number) - 50
      );
      const creature = this.add.circle(x, y, 20, 0x00ff00);
      // Assign random velocities (in pixels per second)
      creature.setData('velocityX', Phaser.Math.Between(-100, 100));
      creature.setData('velocityY', Phaser.Math.Between(-100, 100));
      this.creatures.push(creature);
    }
  }

  update(time: number, delta: number) {
    // Update each creature’s position and reverse direction on boundaries.
    this.creatures.forEach((creature) => {
      let vx = creature.getData('velocityX');
      let vy = creature.getData('velocityY');

      let newX = creature.x + vx * (delta / 1000);
      let newY = creature.y + vy * (delta / 1000);

      // Bounce off horizontal edges
      if (newX < 20 || newX > (this.game.config.width as number) - 20) {
        vx = -vx;
        creature.setData('velocityX', vx);
      }
      // Bounce off vertical edges
      if (newY < 20 || newY > (this.game.config.height as number) - 20) {
        vy = -vy;
        creature.setData('velocityY', vy);
      }

      creature.x += vx * (delta / 1000);
      creature.y += vy * (delta / 1000);
    });
  }
}
