// SimulationScene.ts
import Phaser from 'phaser';

export default class SimulationScene extends Phaser.Scene {
  creatures: Phaser.GameObjects.Arc[] = [];
  // Increased interaction distance to allow for interactions over a larger area.
  interactionDistance: number = 200;
  interactionCooldown: number = 125; // Reduced from 500ms to 125ms for 4x faster interactions

  // Resource thresholds for reproduction and death.
  reproductionThreshold: number = 200;
  reproductionCost: number = 100;
  minimumResource: number = 0;

  // New maintenance cost: resources drain slowly over time.
  maintenanceCost: number = 1; // per second

  // UI text for simulation statistics.
  statsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload() {
    // No assets needed since we’re using geometric shapes.
  }

  create() {
    // Define strategies and corresponding colors.
    const strategies = [
      'tit-for-tat',
      'always cooperate',
      'always defect',
      'random',
    ];
    const strategyColors: Record<string, number> = {
      'tit-for-tat': 0x0000ff, // Blue
      'always cooperate': 0xffc0cb, // Pink
      'always defect': 0x800080, // Purple
      random: 0xffff00, // Yellow
    };

    // Create creatures with an equal number for each strategy.
    const creaturesPerStrategy = 5;
    let creatureId = 0;
    strategies.forEach((strategy) => {
      for (let i = 0; i < creaturesPerStrategy; i++) {
        const x = Phaser.Math.Between(
          50,
          (this.game.config.width as number) - 50
        );
        const y = Phaser.Math.Between(
          50,
          (this.game.config.height as number) - 50
        );
        const creatureColor = strategyColors[strategy];
        const creature = this.add.circle(x, y, 20, creatureColor);

        creature.setData('velocityX', Phaser.Math.Between(-100, 100));
        creature.setData('velocityY', Phaser.Math.Between(-100, 100));
        creature.setData('id', creatureId++);
        creature.setData('resources', 100);
        creature.setData('strategy', strategy);
        creature.setData('memory', new Map());
        creature.setData('lastInteractionTime', -this.interactionCooldown);

        this.creatures.push(creature);
      }
    });

    // Create a UI text element to display simulation statistics.
    // Increased font size for readability and placed on top of all other elements.
    this.statsText = this.add.text(10, 10, '', {
      fontSize: '32px',
      color: '#ffffff',
    });
    // Fix the stats text on the screen and set a high depth so it appears on top.
    this.statsText.setScrollFactor(0);
    this.statsText.setDepth(1000);
  }

  update(time: number, delta: number) {
    // Update positions, maintenance cost, and bounce off the edges.
    this.creatures.forEach((creature) => {
      // Apply maintenance cost (draining resources over time)
      const currentResources = creature.getData('resources');
      creature.setData(
        'resources',
        currentResources - this.maintenanceCost * (delta / 1000)
      );

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

        // Check cooldown for both creatures.
        const lastA = creatureA.getData('lastInteractionTime') || 0;
        const lastB = creatureB.getData('lastInteractionTime') || 0;
        if (
          time - lastA < this.interactionCooldown ||
          time - lastB < this.interactionCooldown
        ) {
          continue;
        }

        const distance = Phaser.Math.Distance.Between(
          creatureA.x,
          creatureA.y,
          creatureB.x,
          creatureB.y
        );

        if (distance < this.interactionDistance) {
          this.handleIPDRound(creatureA, creatureB, time);
        }
      }
    }

    // Check for death and reproduction.
    this.handleLifeCycle(time);

    // Update simulation statistics on screen.
    this.updateStats();
  }

  // Handles one round of the Iterated Prisoner’s Dilemma between two creatures.
  handleIPDRound(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    time: number
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

    // Set the last interaction time for both creatures.
    creatureA.setData('lastInteractionTime', time);
    creatureB.setData('lastInteractionTime', time);

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
      // Mimic the opponent's last move if recorded.
      const pastMoves = memory.get(opponentId);
      if (pastMoves && pastMoves.length > 0) {
        return pastMoves[pastMoves.length - 1] as 'C' | 'D';
      } else {
        // Cooperate by default on the first encounter.
        return 'C';
      }
    } else if (strategy === 'random') {
      // Randomly choose between cooperation and defection.
      return Phaser.Math.Between(0, 1) === 0 ? 'C' : 'D';
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

  // Creates a visual effect (two lines) to clearly represent each creature's action.
  createInteractionEffect(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    actionA: 'C' | 'D',
    actionB: 'C' | 'D'
  ) {
    // Calculate a perpendicular offset so the two lines don't overlap.
    const dx = creatureB.x - creatureA.x;
    const dy = creatureB.y - creatureA.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1; // avoid division by zero
    const offsetAmount = 5; // pixels of offset
    const offsetX = -(dy / length) * offsetAmount;
    const offsetY = (dx / length) * offsetAmount;

    // Creature A's action line.
    const colorA = actionA === 'C' ? 0x00ff00 : 0xff0000;
    const graphicsA = this.add.graphics();
    graphicsA.lineStyle(4, colorA, 1);
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();

    // Creature B's action line.
    const colorB = actionB === 'C' ? 0x00ff00 : 0xff0000;
    const graphicsB = this.add.graphics();
    graphicsB.lineStyle(4, colorB, 1);
    graphicsB.beginPath();
    graphicsB.moveTo(creatureB.x - offsetX, creatureB.y - offsetY);
    graphicsB.lineTo(creatureA.x - offsetX, creatureA.y - offsetY);
    graphicsB.strokePath();

    // Fade out and destroy the graphics after a short duration.
    this.tweens.add({
      targets: graphicsA,
      alpha: 0,
      duration: 500,
      onComplete: () => graphicsA.destroy(),
    });
    this.tweens.add({
      targets: graphicsB,
      alpha: 0,
      duration: 500,
      onComplete: () => graphicsB.destroy(),
    });
  }

  // Handles reproduction and death based on resource levels.
  handleLifeCycle(currentTime: number) {
    const survivors: Phaser.GameObjects.Arc[] = [];
    const newCreatures: Phaser.GameObjects.Arc[] = [];

    for (let creature of this.creatures) {
      const resources = creature.getData('resources');

      // If resources are too low, the creature dies.
      if (resources <= this.minimumResource) {
        creature.destroy();
        continue;
      }

      // If resources exceed the reproduction threshold, spawn offspring.
      if (resources >= this.reproductionThreshold) {
        // Deduct reproduction cost.
        creature.setData('resources', resources - this.reproductionCost);

        // Determine offspring spawn position (clamped within boundaries).
        let newX = creature.x + Phaser.Math.Between(-30, 30);
        let newY = creature.y + Phaser.Math.Between(-30, 30);
        newX = Phaser.Math.Clamp(
          newX,
          20,
          (this.game.config.width as number) - 20
        );
        newY = Phaser.Math.Clamp(
          newY,
          20,
          (this.game.config.height as number) - 20
        );

        // Create the offspring creature.
        const offspring = this.add.circle(newX, newY, 20, creature.fillColor);
        offspring.setData('velocityX', Phaser.Math.Between(-100, 100));
        offspring.setData('velocityY', Phaser.Math.Between(-100, 100));
        // Assign a new unique id.
        offspring.setData('id', Date.now() + Math.random());
        // Offspring starts with a base resource amount.
        offspring.setData('resources', 100);
        // Inherit the parent's strategy.
        offspring.setData('strategy', creature.getData('strategy'));
        // Start with an empty memory.
        offspring.setData('memory', new Map());
        // Initialize last interaction time to current time to prevent immediate interactions.
        offspring.setData('lastInteractionTime', currentTime);

        newCreatures.push(offspring);
      }

      survivors.push(creature);
    }

    // Update the creatures array with survivors and new offspring.
    this.creatures = survivors.concat(newCreatures);
  }

  // Updates the on-screen simulation statistics.
  updateStats() {
    const total = this.creatures.length;
    const strategyCounts: Record<string, number> = {
      'tit-for-tat': 0,
      'always cooperate': 0,
      'always defect': 0,
      random: 0,
    };
    let totalResources = 0;
    for (let creature of this.creatures) {
      const strat = creature.getData('strategy');
      strategyCounts[strat] = (strategyCounts[strat] || 0) + 1;
      totalResources += creature.getData('resources');
    }
    const avgResources = total > 0 ? (totalResources / total).toFixed(1) : 0;

    this.statsText.setText(
      `Creatures: ${total}\n` +
        `Tit-for-Tat: ${strategyCounts['tit-for-tat']}\n` +
        `Always Cooperate: ${strategyCounts['always cooperate']}\n` +
        `Always Defect: ${strategyCounts['always defect']}\n` +
        `Random: ${strategyCounts['random']}\n` +
        `Avg. Resources: ${avgResources}`
    );
  }
}
