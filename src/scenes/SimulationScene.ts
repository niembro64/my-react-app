// SimulationScene.ts
import Phaser from 'phaser';

export default class SimulationScene extends Phaser.Scene {
  creatures: Phaser.GameObjects.Arc[] = [];
  interactionDistance: number = 200;
  interactionCooldown: number = 125; // 125ms cooldown for faster interactions

  // Resource thresholds for reproduction and death.
  reproductionThreshold: number = 200;
  reproductionCost: number = 100;
  minimumResource: number = 0;

  // Maintenance cost: resources drain slowly over time.
  maintenanceCost: number = 1; // per second

  // Maximum number of creatures allowed.
  carryingCapacity: number = 100; // Updated to 100 max agents.
  overpopulationFactor: number = 0.5; // Extra resource drain per creature above capacity.

  // Age mechanism: maximum age (in seconds) for a creature.
  maxAge: number = 30;

  // Group to hold food items.
  foodGroup!: Phaser.GameObjects.Group;
  // Food spawn timer interval (in milliseconds)
  foodSpawnInterval: number = 2000;

  // UI text for simulation statistics.
  statsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload() {
    // No assets needed since we’re using geometric shapes.
  }

  create() {
    // Create a group for food items.
    this.foodGroup = this.add.group();

    // Spawn food items periodically.
    this.time.addEvent({
      delay: this.foodSpawnInterval,
      callback: this.spawnFood,
      callbackScope: this,
      loop: true,
    });

    // Define strategies and corresponding colors.
    const strategies = [
      'tit-for-tat',
      'always cooperate',
      'always defect',
      'random',
      'win-stay-lose-shift',
    ];
    const strategyColors: Record<string, number> = {
      'tit-for-tat': 0x0000ff, // Blue
      'always cooperate': 0xffc0cb, // Pink
      'always defect': 0x800080, // Purple
      random: 0xffff00, // Yellow
      'win-stay-lose-shift': 0x00ffff, // Cyan
    };

    // Create initial creatures with an equal number for each strategy.
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
        creature.setData('age', 0); // Initialize age
        creature.setData('lastPartner', null); // Initialize last partner

        // Initialize win-stay-lose-shift specific parameters.
        if (strategy === 'win-stay-lose-shift') {
          creature.setData('lastAction', 'C');
          creature.setData('lastPayoff', 3); // Default positive payoff
        }

        this.creatures.push(creature);
      }
    });

    // Create a UI text element to display simulation statistics.
    this.statsText = this.add.text(10, 10, '', {
      fontSize: '24px',
      color: '#ffffff',
    });
    this.statsText.setScrollFactor(0);
    this.statsText.setDepth(1000);
  }

  update(time: number, delta: number) {
    const deltaSeconds = delta / 1000;

    // Update positions, maintenance cost, age, and bounce off the edges.
    this.creatures.forEach((creature) => {
      // Update age.
      let age = creature.getData('age');
      age += deltaSeconds;
      creature.setData('age', age);
      // Kill creature if it exceeds max age.
      if (age > this.maxAge) {
        creature.destroy();
        return;
      }

      // Apply maintenance cost.
      let currentResources = creature.getData('resources');
      currentResources -= this.maintenanceCost * deltaSeconds;

      // Apply extra drain if population exceeds carrying capacity.
      if (this.creatures.length > this.carryingCapacity) {
        const extraDrain =
          (this.creatures.length - this.carryingCapacity) *
          this.overpopulationFactor *
          deltaSeconds;
        currentResources -= extraDrain;
      }
      creature.setData('resources', currentResources);

      // Update movement.
      let vx = creature.getData('velocityX');
      let vy = creature.getData('velocityY');
      let newX = creature.x + vx * deltaSeconds;
      let newY = creature.y + vy * deltaSeconds;

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

      creature.x += vx * deltaSeconds;
      creature.y += vy * deltaSeconds;
    });

    // Remove destroyed creatures from the simulation.
    this.creatures = this.creatures.filter((creature) => creature.active);

    // Check for interactions (IPD rounds) between creatures.
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

        // Check if either creature just interacted with the other.
        const lastPartnerA = creatureA.getData('lastPartner');
        const lastPartnerB = creatureB.getData('lastPartner');
        if (
          lastPartnerA === creatureB.getData('id') ||
          lastPartnerB === creatureA.getData('id')
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

    // Handle food consumption.
    // @ts-ignore
    this.foodGroup.getChildren().forEach((food: Phaser.GameObjects.Arc) => {
      this.creatures.forEach((creature) => {
        const distance = Phaser.Math.Distance.Between(
          creature.x,
          creature.y,
          food.x,
          food.y
        );
        if (distance < 25) {
          const foodValue = food.getData('value') || 50;
          creature.setData(
            'resources',
            creature.getData('resources') + foodValue
          );
          food.destroy();
        }
      });
    });

    // Handle reproduction and death based on resource levels.
    this.handleLifeCycle(time);

    // Handle overpopulation: if number of agents exceeds carrying capacity (100), remove the weakest agents.
    if (this.creatures.length > this.carryingCapacity) {
      // Sort creatures by resources in ascending order.
      const sortedCreatures = this.creatures.slice().sort((a, b) => {
        return a.getData('resources') - b.getData('resources');
      });
      const numToRemove = this.creatures.length - this.carryingCapacity;
      for (let i = 0; i < numToRemove; i++) {
        sortedCreatures[i].destroy();
      }
      // Clean up the list after removals.
      this.creatures = this.creatures.filter((creature) => creature.active);
    }

    // Update simulation statistics on screen.
    this.updateStats();
  }

  // Spawns a food item at a random location.
  spawnFood() {
    const x = Phaser.Math.Between(20, (this.game.config.width as number) - 20);
    const y = Phaser.Math.Between(20, (this.game.config.height as number) - 20);
    const food = this.add.circle(x, y, 10, 0x00ff00);
    food.setData('value', 50);
    this.foodGroup.add(food);
    this.tweens.add({
      targets: food,
      alpha: 0,
      duration: 10000,
      onComplete: () => food.destroy(),
    });
  }

  // Handles one round of the Iterated Prisoner’s Dilemma between two creatures.
  handleIPDRound(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    time: number
  ) {
    const actionA = this.getAction(creatureA, creatureB);
    const actionB = this.getAction(creatureB, creatureA);

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

    creatureA.setData('resources', creatureA.getData('resources') + payoffA);
    creatureB.setData('resources', creatureB.getData('resources') + payoffB);

    // Update memories with the opponent’s last action.
    this.updateMemory(creatureA, creatureB, actionB);
    this.updateMemory(creatureB, creatureA, actionA);

    // Update win-stay-lose-shift parameters.
    if (creatureA.getData('strategy') === 'win-stay-lose-shift') {
      creatureA.setData('lastAction', actionA);
      creatureA.setData('lastPayoff', payoffA);
    }
    if (creatureB.getData('strategy') === 'win-stay-lose-shift') {
      creatureB.setData('lastAction', actionB);
      creatureB.setData('lastPayoff', payoffB);
    }

    // Update interaction times and last partners.
    creatureA.setData('lastInteractionTime', time);
    creatureB.setData('lastInteractionTime', time);
    creatureA.setData('lastPartner', creatureB.getData('id'));
    creatureB.setData('lastPartner', creatureA.getData('id'));

    this.createInteractionEffect(creatureA, creatureB, actionA, actionB);

    console.log(
      `Creature ${creatureA.getData('id')} (${creatureA.getData(
        'strategy'
      )}) chose ${actionA} vs. Creature ${creatureB.getData(
        'id'
      )} (${creatureB.getData(
        'strategy'
      )}) chose ${actionB} => Resources: ${creatureA.getData(
        'resources'
      )}, ${creatureB.getData('resources')}`
    );
  }

  // Determines an action ('C' for cooperate, 'D' for defect) based on strategy and memory.
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
      const pastMoves = memory.get(opponentId);
      return pastMoves && pastMoves.length > 0
        ? (pastMoves[pastMoves.length - 1] as 'C' | 'D')
        : 'C';
    } else if (strategy === 'random') {
      return Phaser.Math.Between(0, 1) === 0 ? 'C' : 'D';
    } else if (strategy === 'win-stay-lose-shift') {
      let lastAction: 'C' | 'D' = creature.getData('lastAction') || 'C';
      let lastPayoff: number =
        creature.getData('lastPayoff') !== undefined
          ? creature.getData('lastPayoff')
          : 3;
      // If the previous payoff was positive, keep the same move; otherwise, switch.
      if (lastPayoff > 0) {
        return lastAction;
      } else {
        return lastAction === 'C' ? 'D' : 'C';
      }
    }
    return 'C';
  }

  // Records the opponent's last action in the creature's memory.
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

  // Creates a visual effect to represent each creature's action.
  createInteractionEffect(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    actionA: 'C' | 'D',
    actionB: 'C' | 'D'
  ) {
    const dx = creatureB.x - creatureA.x;
    const dy = creatureB.y - creatureA.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const offsetAmount = 5;
    const offsetX = -(dy / length) * offsetAmount;
    const offsetY = (dx / length) * offsetAmount;

    const colorA = actionA === 'C' ? 0x00ff00 : 0xff0000;
    const graphicsA = this.add.graphics();
    graphicsA.lineStyle(4, colorA, 1);
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();

    const colorB = actionB === 'C' ? 0x00ff00 : 0xff0000;
    const graphicsB = this.add.graphics();
    graphicsB.lineStyle(4, colorB, 1);
    graphicsB.beginPath();
    graphicsB.moveTo(creatureB.x - offsetX, creatureB.y - offsetY);
    graphicsB.lineTo(creatureA.x - offsetX, creatureA.y - offsetY);
    graphicsB.strokePath();

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

      if (resources <= this.minimumResource) {
        creature.destroy();
        continue;
      }

      if (resources >= this.reproductionThreshold) {
        creature.setData('resources', resources - this.reproductionCost);

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

        const offspring = this.add.circle(newX, newY, 20, creature.fillColor);
        offspring.setData('velocityX', Phaser.Math.Between(-100, 100));
        offspring.setData('velocityY', Phaser.Math.Between(-100, 100));
        offspring.setData('id', Date.now() + Math.random());
        offspring.setData('resources', 100);
        offspring.setData('strategy', creature.getData('strategy'));
        offspring.setData('memory', new Map());
        offspring.setData('lastInteractionTime', currentTime);
        offspring.setData('age', 0);
        offspring.setData('lastPartner', null);

        // Inherit win-stay-lose-shift parameters if applicable.
        if (creature.getData('strategy') === 'win-stay-lose-shift') {
          offspring.setData('lastAction', 'C');
          offspring.setData('lastPayoff', 3);
        }

        newCreatures.push(offspring);
      }

      survivors.push(creature);
    }

    this.creatures = survivors.concat(newCreatures);
  }

  // Updates the on-screen statistics.
  updateStats() {
    const total = this.creatures.length;
    const strategyCounts: Record<string, number> = {
      'tit-for-tat': 0,
      'always cooperate': 0,
      'always defect': 0,
      random: 0,
      'win-stay-lose-shift': 0,
    };
    let totalResources = 0;
    let totalAge = 0;
    for (let creature of this.creatures) {
      const strat = creature.getData('strategy');
      strategyCounts[strat] = (strategyCounts[strat] || 0) + 1;
      totalResources += creature.getData('resources');
      totalAge += creature.getData('age');
    }
    const avgResources = total > 0 ? (totalResources / total).toFixed(1) : 0;
    const avgAge = total > 0 ? (totalAge / total).toFixed(1) : 0;
    const foodCount = this.foodGroup.getLength();

    this.statsText.setText(
      `Creatures: ${total} (Max: ${this.carryingCapacity})\n` +
        `Tit-for-Tat: ${strategyCounts['tit-for-tat']}\n` +
        `Always Cooperate: ${strategyCounts['always cooperate']}\n` +
        `Always Defect: ${strategyCounts['always defect']}\n` +
        `Random: ${strategyCounts['random']}\n` +
        `Win-Stay Lose-Shift: ${strategyCounts['win-stay-lose-shift']}\n` +
        `Avg. Resources: ${avgResources}\n` +
        `Avg. Age: ${avgAge}s\n` +
        `Food Items: ${foodCount}`
    );
  }
}
