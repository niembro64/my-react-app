import Phaser from 'phaser';

export default class SimulationScene extends Phaser.Scene {
  creatures: Phaser.GameObjects.Arc[] = [];
  interactionDistance: number = 50; // distance threshold for interactions

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload() {
    // No assets needed since we’re using geometric shapes.
  }

  create() {
    const strategies = ['tit-for-tat', 'always cooperate', 'always defect'];

    // Create 10 creatures with random positions, velocities, and strategies.
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

      // Assign random velocities (pixels per second)
      creature.setData('velocityX', Phaser.Math.Between(-100, 100));
      creature.setData('velocityY', Phaser.Math.Between(-100, 100));

      // Assign an ID for memory tracking.
      creature.setData('id', i);
      // Each creature starts with 100 resource points.
      creature.setData('resources', 100);
      // Randomly assign a strategy.
      const randomStrategy =
        strategies[Phaser.Math.Between(0, strategies.length - 1)];
      creature.setData('strategy', randomStrategy);
      // Initialize memory (to store past moves against other creatures).
      creature.setData('memory', new Map());

      this.creatures.push(creature);
    }
  }

  update(time: number, delta: number) {
    // Update positions and bounce off the edges.
    this.creatures.forEach((creature) => {
      let vx = creature.getData('velocityX');
      let vy = creature.getData('velocityY');

      let newX = creature.x + vx * (delta / 1000);
      let newY = creature.y + vy * (delta / 1000);

      // Bounce off horizontal boundaries.
      if (newX < 20 || newX > (this.game.config.width as number) - 20) {
        vx = -vx;
        creature.setData('velocityX', vx);
      }
      // Bounce off vertical boundaries.
      if (newY < 20 || newY > (this.game.config.height as number) - 20) {
        vy = -vy;
        creature.setData('velocityY', vy);
      }

      creature.x += vx * (delta / 1000);
      creature.y += vy * (delta / 1000);
    });

    // Process interactions for each unique pair.
    for (let i = 0; i < this.creatures.length; i++) {
      for (let j = i + 1; j < this.creatures.length; j++) {
        const creatureA = this.creatures[i];
        const creatureB = this.creatures[j];
        const distance = Phaser.Math.Distance.Between(
          creatureA.x,
          creatureA.y,
          creatureB.x,
          creatureB.y
        );

        if (distance < this.interactionDistance) {
          this.handleIPDRound(creatureA, creatureB);
        }
      }
    }
  }

  // Handles one round of the Iterated Prisoner’s Dilemma between two creatures.
  handleIPDRound(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc
  ) {
    // Determine actions for each creature.
    const actionA = this.getAction(creatureA, creatureB);
    const actionB = this.getAction(creatureB, creatureA);

    // Define a payoff matrix:
    // - Both Cooperate: +3 resources each.
    // - A cooperates, B defects: A loses 2, B gains 5.
    // - A defects, B cooperates: A gains 5, B loses 2.
    // - Both Defect: -1 resource each.
    let payoffA = 0;
    let payoffB = 0;

    if (actionA === 'C' && actionB === 'C') {
      payoffA = 3;
      payoffB = 3;
    } else if (actionA === 'C' && actionB === 'D') {
      payoffA = -2;
      payoffB = 5;
    } else if (actionA === 'D' && actionB === 'C') {
      payoffA = 5;
      payoffB = -2;
    } else if (actionA === 'D' && actionB === 'D') {
      payoffA = -1;
      payoffB = -1;
    }

    // Update each creature's resources.
    creatureA.setData('resources', creatureA.getData('resources') + payoffA);
    creatureB.setData('resources', creatureB.getData('resources') + payoffB);

    // Update memories with the opponent’s last action.
    this.updateMemory(creatureA, creatureB, actionB);
    this.updateMemory(creatureB, creatureA, actionA);

    // Create a visual effect to indicate the interaction.
    this.createInteractionEffect(creatureA, creatureB, actionA, actionB);

    // Log the interaction for debugging.
    console.log(
      `Creature ${creatureA.getData('id')} (${creatureA.getData(
        'strategy'
      )}) chose ${actionA} vs. ` +
        `Creature ${creatureB.getData('id')} (${creatureB.getData(
          'strategy'
        )}) chose ${actionB} => ` +
        `Resources: ${creatureA.getData('resources')}, ${creatureB.getData(
          'resources'
        )}`
    );
  }

  // Returns the action ('C' for cooperate, 'D' for defect) based on the creature's strategy.
  getAction(
    creature: Phaser.GameObjects.Arc,
    opponent: Phaser.GameObjects.Arc
  ): 'C' | 'D' {
    const strategy: string = creature.getData('strategy');
    const memory: Map<any, string[]> = creature.getData('memory');
    const opponentId = opponent.getData('id');

    if (strategy === 'always cooperate') {
      return 'C';
    } else if (strategy === 'always defect') {
      return 'D';
    } else if (strategy === 'tit-for-tat') {
      // If there is a recorded history, mimic the opponent's last move.
      const pastMoves = memory.get(opponentId);
      if (pastMoves && pastMoves.length > 0) {
        return pastMoves[pastMoves.length - 1] as 'C' | 'D';
      } else {
        // Cooperate by default on the first encounter.
        return 'C';
      }
    }
    // Default action.
    return 'C';
  }

  // Updates the memory of a creature regarding its opponent’s last action.
  updateMemory(
    creature: Phaser.GameObjects.Arc,
    opponent: Phaser.GameObjects.Arc,
    opponentAction: 'C' | 'D'
  ) {
    const memory: Map<any, string[]> = creature.getData('memory');
    const opponentId = opponent.getData('id');
    let history = memory.get(opponentId);
    if (!history) {
      history = [];
      memory.set(opponentId, history);
    }
    history.push(opponentAction);
  }

  // Creates a visual effect (a temporary line) between interacting creatures.
  createInteractionEffect(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    actionA: 'C' | 'D',
    actionB: 'C' | 'D'
  ) {
    const graphics = this.add.graphics();
    let color: number;

    if (actionA === 'C' && actionB === 'C') {
      color = 0x00ff00; // Green for mutual cooperation.
    } else if (actionA === 'D' && actionB === 'D') {
      color = 0xff0000; // Red for mutual defection.
    } else {
      color = 0xffff00; // Yellow for mixed actions.
    }

    graphics.lineStyle(2, color, 1);
    graphics.beginPath();
    graphics.moveTo(creatureA.x, creatureA.y);
    graphics.lineTo(creatureB.x, creatureB.y);
    graphics.strokePath();

    // Fade out and destroy the graphics after a short duration.
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 500,
      onComplete: () => graphics.destroy(),
    });
  }
}
