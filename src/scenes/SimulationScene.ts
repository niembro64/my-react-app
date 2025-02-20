// SimulationScene.ts
import Phaser from 'phaser';

const cps_init: number = 100;

const colorGreen: number = 0x33bb55;
const colorRed: number = 0xff5555;
const lineWidtth: number = 2;

// Helper to convert a numeric color to a hex string.
const colorToHex = (color: number): string =>
  '#' + color.toString(16).padStart(6, '0');

// Combined strategy info: color, long name, short name, and emoji.
export type Strategy =
  | 'always cooperate'
  | 'always defect'
  | 'tit-for-tat'
  | 'random'
  | 'win-stay-lose-shift'
  | 'grim trigger'
  | 'tit-for-two-tats';

const STRATEGY_INFO: Record<
  Strategy,
  { color: number; longName: string; shortName: string; emoji: string }
> = {
  'win-stay-lose-shift': {
    color: 0xffffff,
    longName: 'win-stay-lose-shift',
    shortName: 'WSLS',
    emoji: '⚪',
  },
  'tit-for-tat': {
    color: 0x0000ff,
    longName: 'tit-for-tat',
    shortName: 'TFT',
    emoji: '🔵',
  },
  'tit-for-two-tats': {
    color: 0x800080,
    longName: 'tit-for-two-tats',
    shortName: 'TFTT',
    emoji: '🟣',
  },
  'always cooperate': {
    color: 0x00ff00,
    longName: 'always cooperate',
    shortName: 'AC',
    emoji: '🟢',
  },
  'always defect': {
    color: 0xff0000,
    longName: 'always defect',
    shortName: 'AD',
    emoji: '🔴',
  },
  'grim trigger': {
    color: 0xffa500,
    longName: 'grim trigger',
    shortName: 'GT',
    emoji: '🟠',
  },
  random: {
    color: 0xffff00,
    longName: 'random',
    shortName: 'R',
    emoji: '🟡',
  },
};

// Define the order in which strategies appear (for reference).
const STRATEGY_ORDER: Strategy[] = [
  'win-stay-lose-shift',
  'tit-for-tat',
  'tit-for-two-tats',
  'always cooperate',
  'always defect',
  'grim trigger',
  'random',
];

// Interface for extra data stored on each creature.
export interface CreatureData {
  velocityX: number;
  velocityY: number;
  id: number | string;
  resources: number;
  strategy: Strategy;
  memory: Map<number | string, ('C' | 'D')[]>;
  lastInteractionTime: number;
  age: number;
  lastPartner: number | null;
  lastAction?: 'C' | 'D';
  lastPayoff?: number;
  emoji?: string;
}

export default class SimulationScene extends Phaser.Scene {
  creatures: Phaser.GameObjects.Arc[] = [];
  interactionDistance: number = 200;
  interactionCooldown: number = 200;

  reproductionThreshold: number = 200;
  reproductionCost: number = 100;
  minimumResource: number = 0;
  maintenanceCost: number = 1;
  carryingCapacity: number = cps_init * 7;
  overpopulationFactor: number = 0.5;
  deathRateFactor: number = 0.0001;

  foodGroup!: Phaser.GameObjects.Group;
  foodSpawnInterval: number = 2000;
  statsText!: Phaser.GameObjects.Text;
  creatureRadius: number = 10;
  creaturesPerStrategy: number = cps_init;

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload(): void {
    // Preload assets if any.
  }

  create(): void {
    this.foodGroup = this.add.group();
    this.time.addEvent({
      delay: this.foodSpawnInterval,
      callback: this.spawnFood,
      callbackScope: this,
      loop: true,
    });

    // Create creatures for each strategy.
    const strategies: Strategy[] = [
      'tit-for-tat',
      'always cooperate',
      'always defect',
      'random',
      'win-stay-lose-shift',
      'grim trigger',
      'tit-for-two-tats',
    ];

    let creatureId: number = 0;
    strategies.forEach((strategy: Strategy) => {
      for (let i = 0; i < this.creaturesPerStrategy; i++) {
        const x: number = Phaser.Math.Between(
          50,
          (this.game.config.width as number) - 50
        );
        const y: number = Phaser.Math.Between(
          50,
          (this.game.config.height as number) - 50
        );
        // Use combined strategy info to set creature color.
        const creatureColor: number = STRATEGY_INFO[strategy].color;

        const creature: Phaser.GameObjects.Arc = this.add.circle(
          x,
          y,
          this.creatureRadius,
          creatureColor
        );
        // Initialize creature's data.
        creature.setData('velocityX', Phaser.Math.Between(-100, 100));
        creature.setData('velocityY', Phaser.Math.Between(-100, 100));
        creature.setData('id', creatureId++);
        creature.setData('resources', 100);
        creature.setData('strategy', strategy);
        creature.setData('emoji', STRATEGY_INFO[strategy].emoji);
        creature.setData('memory', new Map<number | string, ('C' | 'D')[]>());
        creature.setData('lastInteractionTime', -this.interactionCooldown);
        creature.setData('age', 0);
        creature.setData('lastPartner', null);

        if (strategy === 'win-stay-lose-shift') {
          creature.setData('lastAction', 'C');
          creature.setData('lastPayoff', 3);
        }
        this.creatures.push(creature);
      }
    });

    // Create the status text (now also serving as the legend) with extra bold style.
    this.statsText = this.add.text(10, 10, '', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      // @ts-ignore
      fontWeight: '900',
      fontFamily: 'Arial Black',
    });
    this.statsText.setScrollFactor(0);
    this.statsText.setDepth(1000);

    // Note: The separate legend is now removed and its info is merged into statsText.
  }

  update(time: number, delta: number): void {
    const deltaSeconds: number = delta / 1000;
    this.creatures.forEach((creature: Phaser.GameObjects.Arc) => {
      // Increment age.
      const currentAge: number =
        (creature.getData('age') as number) + deltaSeconds;
      creature.setData('age', currentAge);

      // Compute death chance based on age.
      const deathChance: number =
        this.deathRateFactor * currentAge * deltaSeconds;
      if (Math.random() < deathChance) {
        creature.destroy();
        return;
      }

      let currentResources: number =
        (creature.getData('resources') as number) -
        this.maintenanceCost * deltaSeconds;
      if (this.creatures.length > this.carryingCapacity) {
        const extraDrain: number =
          (this.creatures.length - this.carryingCapacity) *
          this.overpopulationFactor *
          deltaSeconds;
        currentResources -= extraDrain;
      }
      creature.setData('resources', currentResources);

      let vx: number = creature.getData('velocityX') as number;
      let vy: number = creature.getData('velocityY') as number;
      let newX: number = creature.x + vx * deltaSeconds;
      let newY: number = creature.y + vy * deltaSeconds;
      if (
        newX < this.creatureRadius ||
        newX > (this.game.config.width as number) - this.creatureRadius
      ) {
        vx = -vx;
        creature.setData('velocityX', vx);
      }
      if (
        newY < this.creatureRadius ||
        newY > (this.game.config.height as number) - this.creatureRadius
      ) {
        vy = -vy;
        creature.setData('velocityY', vy);
      }
      creature.x += vx * deltaSeconds;
      creature.y += vy * deltaSeconds;
    });
    this.creatures = this.creatures.filter(
      (creature: Phaser.GameObjects.Arc) => creature.active
    );

    // Handle interactions between creatures.
    for (let i = 0; i < this.creatures.length; i++) {
      for (let j = i + 1; j < this.creatures.length; j++) {
        const creatureA: Phaser.GameObjects.Arc = this.creatures[i];
        const creatureB: Phaser.GameObjects.Arc = this.creatures[j];
        const lastA: number =
          (creatureA.getData('lastInteractionTime') as number) || 0;
        const lastB: number =
          (creatureB.getData('lastInteractionTime') as number) || 0;
        if (
          time - lastA < this.interactionCooldown ||
          time - lastB < this.interactionCooldown
        )
          continue;
        const distance: number = Phaser.Math.Distance.Between(
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

    // Food consumption.
    const foodItems: Phaser.GameObjects.Arc[] =
      this.foodGroup.getChildren() as Phaser.GameObjects.Arc[];
    foodItems.forEach((food: Phaser.GameObjects.Arc) => {
      this.creatures.forEach((creature: Phaser.GameObjects.Arc) => {
        const distance: number = Phaser.Math.Distance.Between(
          creature.x,
          creature.y,
          food.x,
          food.y
        );
        if (distance < 25) {
          const foodValue: number = (food.getData('value') as number) || 50;
          creature.setData(
            'resources',
            (creature.getData('resources') as number) + foodValue
          );
          food.destroy();
        }
      });
    });

    this.handleLifeCycle(time);

    if (this.creatures.length > this.carryingCapacity) {
      const sortedCreatures: Phaser.GameObjects.Arc[] = this.creatures
        .slice()
        .sort(
          (a, b) =>
            (a.getData('resources') as number) -
            (b.getData('resources') as number)
        );
      const numToRemove: number = this.creatures.length - this.carryingCapacity;
      for (let i = 0; i < numToRemove; i++) sortedCreatures[i].destroy();
      this.creatures = this.creatures.filter(
        (creature: Phaser.GameObjects.Arc) => creature.active
      );
    }
    this.updateStats();
  }

  spawnFood(): void {
    const x: number = Phaser.Math.Between(
      20,
      (this.game.config.width as number) - 20
    );
    const y: number = Phaser.Math.Between(
      20,
      (this.game.config.height as number) - 20
    );
    const food: Phaser.GameObjects.Arc = this.add.circle(x, y, 10, 0xffffff);
    food.setData('value', 50);
    this.foodGroup.add(food);
    this.tweens.add({
      targets: food,
      alpha: 0,
      duration: 10000,
      onComplete: () => food.destroy(),
    });
  }

  handleIPDRound(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    time: number
  ): void {
    const actionA: 'C' | 'D' = this.getAction(creatureA, creatureB);
    const actionB: 'C' | 'D' = this.getAction(creatureB, creatureA);
    let payoffA: number = 0,
      payoffB: number = 0;
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
    creatureA.setData(
      'resources',
      (creatureA.getData('resources') as number) + payoffA
    );
    creatureB.setData(
      'resources',
      (creatureB.getData('resources') as number) + payoffB
    );
    this.updateMemory(creatureA, creatureB, actionB);
    this.updateMemory(creatureB, creatureA, actionA);
    if (creatureA.getData('strategy') === 'win-stay-lose-shift') {
      creatureA.setData('lastAction', actionA);
      creatureA.setData('lastPayoff', payoffA);
    }
    if (creatureB.getData('strategy') === 'win-stay-lose-shift') {
      creatureB.setData('lastAction', actionB);
      creatureB.setData('lastPayoff', payoffB);
    }
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

  // Returns the action for a creature with a 10% chance to reverse its intended move.
  getAction(
    creature: Phaser.GameObjects.Arc,
    opponent: Phaser.GameObjects.Arc
  ): 'C' | 'D' {
    const strategy: Strategy = creature.getData('strategy') as Strategy;
    const memory = creature.getData('memory') as Map<
      number | string,
      ('C' | 'D')[]
    >;
    const pastMoves: ('C' | 'D')[] = memory.get(opponent.getData('id')) || [];
    let action: 'C' | 'D' = 'C';

    switch (strategy) {
      case 'always cooperate':
        action = 'C';
        break;
      case 'always defect':
        action = 'D';
        break;
      case 'tit-for-tat':
        action = pastMoves.length > 0 ? pastMoves[pastMoves.length - 1] : 'C';
        break;
      case 'random':
        action = Phaser.Math.Between(0, 1) === 0 ? 'C' : 'D';
        break;
      case 'win-stay-lose-shift': {
        const lastAction: 'C' | 'D' =
          (creature.getData('lastAction') as 'C' | 'D') || 'C';
        const lastPayoff: number =
          (creature.getData('lastPayoff') as number) ?? 3;
        action = lastPayoff > 0 ? lastAction : lastAction === 'C' ? 'D' : 'C';
        break;
      }
      case 'grim trigger':
        action = pastMoves.includes('D') ? 'D' : 'C';
        break;
      case 'tit-for-two-tats':
        action =
          pastMoves.length >= 2 &&
          pastMoves.slice(-2).every((move) => move === 'D')
            ? 'D'
            : 'C';
        break;
      default:
        action = 'C';
    }

    // Apply a 10% chance to accidentally reverse the intended action.
    if (Math.random() < 0.1) {
      action = action === 'C' ? 'D' : 'C';
    }
    return action;
  }

  updateMemory(
    creature: Phaser.GameObjects.Arc,
    opponent: Phaser.GameObjects.Arc,
    opponentAction: 'C' | 'D'
  ): void {
    const memory = creature.getData('memory') as Map<
      number | string,
      ('C' | 'D')[]
    >;
    const opponentId = opponent.getData('id');
    let history = memory.get(opponentId);
    if (!history) {
      history = [];
      memory.set(opponentId, history);
    }
    history.push(opponentAction);
  }

  createInteractionEffect(
    creatureA: Phaser.GameObjects.Arc,
    creatureB: Phaser.GameObjects.Arc,
    actionA: 'C' | 'D',
    actionB: 'C' | 'D'
  ): void {
    const dx: number = creatureB.x - creatureA.x;
    const dy: number = creatureB.y - creatureA.y;
    const length: number = Math.sqrt(dx * dx + dy * dy) || 1;
    const offsetAmount: number = 2;
    const offsetX: number = -(dy / length) * offsetAmount;
    const offsetY: number = (dx / length) * offsetAmount;
    const graphicsA: Phaser.GameObjects.Graphics = this.add.graphics();
    graphicsA.lineStyle(
      lineWidtth / 2,
      actionA === 'C' ? colorGreen : colorRed,
      1
    );
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();
    const graphicsB: Phaser.GameObjects.Graphics = this.add.graphics();
    graphicsB.lineStyle(
      lineWidtth / 2,
      actionB === 'C' ? colorGreen : colorRed,
      1
    );
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

  handleLifeCycle(currentTime: number): void {
    const survivors: Phaser.GameObjects.Arc[] = [];
    const newCreatures: Phaser.GameObjects.Arc[] = [];
    this.creatures.forEach((creature: Phaser.GameObjects.Arc) => {
      const resources: number = creature.getData('resources') as number;
      if (resources <= this.minimumResource) {
        creature.destroy();
        return;
      }
      if (resources >= this.reproductionThreshold) {
        creature.setData('resources', resources - this.reproductionCost);
        const newX: number = Phaser.Math.Clamp(
          creature.x + Phaser.Math.Between(-30, 30),
          this.creatureRadius,
          (this.game.config.width as number) - this.creatureRadius
        );
        const newY: number = Phaser.Math.Clamp(
          creature.y + Phaser.Math.Between(-30, 30),
          this.creatureRadius,
          (this.game.config.height as number) - this.creatureRadius
        );
        const offspring: Phaser.GameObjects.Arc = this.add.circle(
          newX,
          newY,
          this.creatureRadius,
          creature.fillColor // Offspring inherit the parent's color.
        );
        offspring.setData('velocityX', Phaser.Math.Between(-100, 100));
        offspring.setData('velocityY', Phaser.Math.Between(-100, 100));
        offspring.setData('id', Date.now() + Math.random());
        offspring.setData('resources', 100);
        offspring.setData('strategy', creature.getData('strategy'));
        offspring.setData('emoji', creature.getData('emoji'));
        offspring.setData('memory', new Map<number | string, ('C' | 'D')[]>());
        offspring.setData('lastInteractionTime', currentTime);
        offspring.setData('age', 0);
        offspring.setData('lastPartner', null);
        if (creature.getData('strategy') === 'win-stay-lose-shift') {
          offspring.setData('lastAction', 'C');
          offspring.setData('lastPayoff', 3);
        }
        newCreatures.push(offspring);
      }
      survivors.push(creature);
    });
    this.creatures = survivors.concat(newCreatures);
  }

  updateStats(): void {
    const total: number = this.creatures.length;
    const strategyCounts: Record<Strategy, number> = {
      'tit-for-tat': 0,
      'always cooperate': 0,
      'always defect': 0,
      random: 0,
      'win-stay-lose-shift': 0,
      'grim trigger': 0,
      'tit-for-two-tats': 0,
    };
    let totalResources: number = 0;
    let totalAge: number = 0;
    this.creatures.forEach((creature: Phaser.GameObjects.Arc) => {
      const strat = creature.getData('strategy') as Strategy;
      strategyCounts[strat] = (strategyCounts[strat] || 0) + 1;
      totalResources += creature.getData('resources') as number;
      totalAge += creature.getData('age') as number;
    });
    const avgResources: string =
      total > 0 ? (totalResources / total).toFixed(1) : '0';
    const avgAge: string = total > 0 ? (totalAge / total).toFixed(1) : '0';
    const foodCount: number = this.foodGroup.getLength();

    // Build the stats text: include the emoji, color hex, long and short names.
    const statsLines: string[] = [];
    statsLines.push(`Creatures: ${total} (Max: ${this.carryingCapacity})`);
    STRATEGY_ORDER.forEach((strategy) => {
      const info = STRATEGY_INFO[strategy];
      statsLines.push(
        `${info.emoji} ${colorToHex(info.color)} - ${info.longName} (${
          info.shortName
        }): ${strategyCounts[strategy]}`
      );
    });
    statsLines.push(`Avg. Resources: ${avgResources}`);
    statsLines.push(`Avg. Age: ${avgAge}s`);
    statsLines.push(`Food Items: ${foodCount}`);

    this.statsText.setText(statsLines.join('\n'));
  }
}
