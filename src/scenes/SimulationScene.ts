// SimulationScene.ts
import Phaser from 'phaser';

// Simulation constants
const INITIAL_CREATURES_PER_STRATEGY: number = 5;
const CREATURE_RADIUS: number = 15;
const INTERACTION_DISTANCE: number = 200;
const INTERACTION_COOLDOWN: number = 200;
const REPRODUCTION_THRESHOLD: number = 200;
const REPRODUCTION_COST: number = 100;
const MINIMUM_RESOURCE: number = 0;
const MAINTENANCE_COST: number = 5;
const CARRYING_CAPACITY: number = INITIAL_CREATURES_PER_STRATEGY * 7;
const OVERPOPULATION_FACTOR: number = 0.5;
const DEATH_RATE_FACTOR: number = 0;
const FOOD_SPAWN_INTERVAL: number = 2000;
const FOOD_VALUE: number = 50;
const ERROR_RATE: number = 0.1; // 10% chance of noise/error

// Visual constants
const COLOR_GREEN: number = 0x33bb55;
const COLOR_RED: number = 0xff5555;
const LINE_WIDTH: number = 2;

// Helper to convert a numeric color to a hex string
const colorToHex = (color: number): string =>
  '#' + color.toString(16).padStart(6, '0');

// Prisoner's Dilemma payoff matrix - R,T,P,S values
const PAYOFF_MATRIX = {
  CC: { A: 3, B: 3 }, // Reward for mutual cooperation
  CD: { A: -2, B: 5 }, // Sucker's payoff and Temptation to defect
  DC: { A: 5, B: -2 }, // Temptation to defect and Sucker's payoff
  DD: { A: -1, B: -1 }, // Punishment for mutual defection
};

// Strategy types from Axelrod's tournament
export type Strategy =
  | 'always cooperate'
  | 'always defect'
  | 'tit-for-tat'
  | 'random'
  | 'win-stay-lose-shift'
  | 'grim trigger'
  | 'tit-for-two-tats';

// Complete information about each strategy
const STRATEGY_INFO: Record<
  Strategy,
  {
    // color: number;
    longName: string;
    shortName: string;
    emoji: string;
    description: string;
  }
> = {
  'tit-for-tat': {
    // color: 0x0000ff,
    longName: 'Tit-for-Tat',
    shortName: 'TFT',
    emoji: '🔵',
    description: "Start cooperating, then copy opponent's last move",
  },
  'tit-for-two-tats': {
    // color: 0x800080,
    longName: 'Tit-for-Two-Tats',
    shortName: 'TFTT',
    emoji: '🟣',
    description: 'Only defect if opponent defects twice in a row',
  },
  'win-stay-lose-shift': {
    // color: 0xffffff,
    longName: 'Win-Stay Lose-Shift',
    shortName: 'WSLS',
    emoji: '⚪',
    description: 'Repeat last move if good outcome, change if bad outcome',
  },
  'always cooperate': {
    // color: 0x00ff00,
    longName: 'Always Cooperate',
    shortName: 'ALLC',
    emoji: '🟢',
    description: 'Always cooperate no matter what',
  },
  'always defect': {
    // color: 0xff0000,
    longName: 'Always Defect',
    shortName: 'ALLD',
    emoji: '🔴',
    description: 'Always defect no matter what',
  },
  'grim trigger': {
    // color: 0xffa500,
    longName: 'Grim Trigger',
    shortName: 'GRIM',
    emoji: '🟠',
    description: 'Cooperate until opponent defects, then always defect',
  },
  random: {
    // color: 0xffff00,
    longName: 'Random',
    shortName: 'RAND',
    emoji: '🟡',
    description: 'Choose randomly between cooperation and defection',
  },
};

// Define the order in which strategies appear in stats
const STRATEGY_ORDER: Strategy[] = [
  'tit-for-tat',
  'tit-for-two-tats',
  'win-stay-lose-shift',
  'grim trigger',
  'always cooperate',
  'always defect',
  'random',
];

// Interface for creature data
export interface CreatureData {
  velocityX: number;
  velocityY: number;
  id: number | string;
  resources: number;
  strategy: Strategy;
  memory: Map<number | string, ('C' | 'D')[]>;
  lastInteractionTime: number;
  age: number;
  score: number;
  interactionCount: number;
  cooperationCount: number;
  defectionCount: number;
  lastPartner: number | string | null;
  lastAction?: 'C' | 'D';
  lastPayoff?: number;
  emoji?: string;
  healthBar?: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
}

export default class SimulationScene extends Phaser.Scene {
  // Game objects
  private creatures: Phaser.GameObjects.Container[] = [];
  private foodGroup!: Phaser.GameObjects.Group;
  private statsText!: Phaser.GameObjects.Text;

  // Simulation parameters
  private interactionDistance: number = INTERACTION_DISTANCE;
  private interactionCooldown: number = INTERACTION_COOLDOWN;
  private reproductionThreshold: number = REPRODUCTION_THRESHOLD;
  private reproductionCost: number = REPRODUCTION_COST;
  private minimumResource: number = MINIMUM_RESOURCE;
  private maintenanceCost: number = MAINTENANCE_COST;
  private carryingCapacity: number = CARRYING_CAPACITY;
  private overpopulationFactor: number = OVERPOPULATION_FACTOR;
  private deathRateFactor: number = DEATH_RATE_FACTOR;
  private foodSpawnInterval: number = FOOD_SPAWN_INTERVAL;
  private creatureRadius: number = CREATURE_RADIUS;
  private creaturesPerStrategy: number = INITIAL_CREATURES_PER_STRATEGY;

  // Game state
  private paused: boolean = false;
  private generationCount: number = 0;
  private simulationTime: number = 0;
  private totalInteractions: number = 0;

  constructor() {
    super({ key: 'SimulationScene' });
  }

  preload(): void {
    // Preload assets if needed
  }

  create(): void {
    // Create a dark background
    const width = this.cameras.main.width as number;
    const height = this.cameras.main.height as number;

    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0, 0);

    // Create grid lines
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x333366, 0.3);

    // Draw grid lines
    for (let x = 0; x <= width; x += 50) {
      graphics.beginPath();
      graphics.moveTo(x, 0);
      graphics.lineTo(x, height);
      graphics.strokePath();
    }

    for (let y = 0; y <= height; y += 50) {
      graphics.beginPath();
      graphics.moveTo(0, y);
      graphics.lineTo(width, y);
      graphics.strokePath();
    }

    // Create UI panel for stats
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.7);
    panel.fillRoundedRect(10, 10, 300, 400, 10);
    panel.setScrollFactor(0);
    panel.setDepth(1000);

    // Create stats text
    this.statsText = this.add.text(20, 20, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial',
    });
    this.statsText.setScrollFactor(0);
    this.statsText.setDepth(1001);

    // Create food system
    this.foodGroup = this.add.group();
    this.time.addEvent({
      delay: this.foodSpawnInterval,
      callback: this.spawnFood,
      callbackScope: this,
      loop: true,
    });

    // Create initial creatures
    this.initializeCreatures();

    // Create strategy legend
    this.createStrategyLegend(width, height);
  }

  private createStrategyLegend(width: number, height: number): void {
    const legendY = height - 100;
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.7);
    panel.fillRoundedRect(10, legendY, width - 20, 90, 10);
    panel.setDepth(1000);

    const title = this.add
      .text(width / 2, legendY + 10, "AXELROD'S TOURNAMENT STRATEGIES", {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    title.setDepth(1001);

    // Create legend items
    const strategies = STRATEGY_ORDER;
    const itemWidth = 200;
    const itemsPerRow = 3;
    const startX = 20;
    const startY = legendY + 40;

    strategies.forEach((strategy, index) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index % itemsPerRow;
      const x = startX + col * itemWidth;
      const y = startY + row * 30;

      const info = STRATEGY_INFO[strategy];

      // Create circle for color
      // const circle = this.add.circle(x + 10, y + 10, 8, info.color);
      // circle.setDepth(1001);

      // Create text with emoji
      const text = this.add.text(x + 25, y, `${info.emoji} ${info.longName}`, {
        fontSize: '14px',
        color: '#ffffff',
      });
      text.setDepth(1001);
    });
  }

  private initializeCreatures(): void {
    let creatureId: number = 0;

    // Create creatures for each strategy
    STRATEGY_ORDER.forEach((strategy: Strategy) => {
      for (let i = 0; i < this.creaturesPerStrategy; i++) {
        this.createCreature(strategy, creatureId++);
      }
    });
  }

  private createCreature(
    strategy: Strategy,
    id: number | string,
    parentX?: number,
    parentY?: number
  ): Phaser.GameObjects.Container {
    // Determine starting position (random or near parent)
    const x: number =
      parentX !== undefined
        ? Phaser.Math.Clamp(
            parentX + Phaser.Math.Between(-30, 30),
            this.creatureRadius,
            (this.game.config.width as number) - this.creatureRadius
          )
        : Phaser.Math.Between(
            this.creatureRadius,
            (this.game.config.width as number) - this.creatureRadius
          );

    const y: number =
      parentY !== undefined
        ? Phaser.Math.Clamp(
            parentY + Phaser.Math.Between(-30, 30),
            this.creatureRadius,
            (this.game.config.height as number) - this.creatureRadius
          )
        : Phaser.Math.Between(
            this.creatureRadius,
            (this.game.config.height as number) - this.creatureRadius
          );

    // Set creature color based on strategy
    // const color: number = STRATEGY_INFO[strategy].color;

    // Create a container for the creature and its labels
    const container = this.add.container(x, y);

    // Create the main circle for the creature
    // const creatureCircle = this.add.circle(0, 0, this.creatureRadius, color);
    // creatureCircle.setStrokeStyle(2, 0xffffff, 0.5);
    // container.add(creatureCircle);

    // Add emoji indicator
    const emoji = this.add
      .text(0, 0, STRATEGY_INFO[strategy].emoji, {
        fontSize: '50px',
        // lineSpacing: -10,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);
    container.add(emoji);

    // Add health bar above creature
    const healthBar = this.add.graphics();
    healthBar.y = -this.creatureRadius - 10;
    container.add(healthBar);

    // Add strategy label (initially hidden, shows on hover)
    const label = this.add
      .text(0, this.creatureRadius + 10, STRATEGY_INFO[strategy].shortName, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5, 0);
    label.setVisible(false);
    container.add(label);

    // Initialize data for the creature
    const creatureData: CreatureData = {
      velocityX: Phaser.Math.Between(-80, 80),
      velocityY: Phaser.Math.Between(-80, 80),
      id: id,
      resources: 100,
      strategy: strategy,
      memory: new Map<number | string, ('C' | 'D')[]>(),
      lastInteractionTime: -this.interactionCooldown,
      age: 0,
      score: 0,
      interactionCount: 0,
      cooperationCount: 0,
      defectionCount: 0,
      lastPartner: null,
      emoji: STRATEGY_INFO[strategy].emoji,
      healthBar: healthBar,
      label: label,
    };

    // Initialize special properties for specific strategies
    if (strategy === 'win-stay-lose-shift') {
      creatureData.lastAction = 'C';
      creatureData.lastPayoff = 3;
    }

    // Set data on the container
    container.setData('creatureData', creatureData);

    // Make creature interactive
    container
      .setInteractive(
        new Phaser.Geom.Circle(0, 0, this.creatureRadius),
        Phaser.Geom.Circle.Contains
      )
      .on('pointerover', () => {
        if (label) label.setVisible(true);
        // creatureCircle.setStrokeStyle(3, 0xffffff, 0.8);
      })
      .on('pointerout', () => {
        if (label) label.setVisible(false);
        // creatureCircle.setStrokeStyle(2, 0xffffff, 0.5);
      });

    // Add to creatures array
    this.creatures.push(container);

    // Update health bar display
    this.updateHealthBar(container);

    return container;
  }

  private updateHealthBar(creature: Phaser.GameObjects.Container): void {
    const data = creature.getData('creatureData') as CreatureData;
    const healthBar = data.healthBar;

    if (healthBar) {
      healthBar.clear();

      // Calculate health percentage
      const healthPercent = Math.min(
        data.resources / this.reproductionThreshold,
        1
      );
      const barWidth = this.creatureRadius * 2;

      // Background
      healthBar.fillStyle(0x000000, 0.7);
      healthBar.fillRect(-barWidth / 2, 0, barWidth, 4);

      // Health fill - color based on health level
      const barColor =
        healthPercent > 0.6
          ? 0x00ff00
          : healthPercent > 0.3
          ? 0xffff00
          : 0xff0000;
      healthBar.fillStyle(barColor, 1);
      healthBar.fillRect(-barWidth / 2, 0, barWidth * healthPercent, 4);
    }
  }

  update(time: number, delta: number): void {
    if (this.paused) return;

    const deltaSeconds: number = delta / 1000;
    this.simulationTime += deltaSeconds;

    // Update each creature
    this.creatures.forEach((creature: Phaser.GameObjects.Container) => {
      this.updateCreature(creature, time, deltaSeconds);
    });

    // Filter out destroyed creatures
    this.creatures = this.creatures.filter(
      (creature: Phaser.GameObjects.Container) => creature.active
    );

    // Handle interactions between creatures
    this.handleInteractions(time);

    // Handle food consumption
    this.handleFoodConsumption();

    // Update stats display
    this.updateStats();
  }

  private updateCreature(
    creature: Phaser.GameObjects.Container,
    time: number,
    deltaSeconds: number
  ): void {
    const data = creature.getData('creatureData') as CreatureData;

    // Increment age
    data.age += deltaSeconds;

    // Compute death chance based on age
    const deathChance: number = this.deathRateFactor * data.age * deltaSeconds;
    if (Math.random() < deathChance) {
      // Create death effect
      this.createDeathEffect(creature.x, creature.y, 0xffffff);
      creature.destroy();
      return;
    }

    // Update resources
    let currentResources: number =
      data.resources - this.maintenanceCost * deltaSeconds;

    // Apply overpopulation penalty
    if (this.creatures.length > this.carryingCapacity) {
      const extraDrain: number =
        (this.creatures.length - this.carryingCapacity) *
        this.overpopulationFactor *
        deltaSeconds;
      currentResources -= extraDrain;
    }

    data.resources = currentResources;

    // Check for death by starvation
    if (data.resources <= this.minimumResource) {
      creature.destroy();
      return;
    }

    // Check for reproduction
    if (data.resources >= this.reproductionThreshold) {
      this.reproduce(creature);
    }

    // Update movement
    this.updateMovement(creature, deltaSeconds);

    // Update visual health bar
    this.updateHealthBar(creature);
  }

  private updateMovement(
    creature: Phaser.GameObjects.Container,
    deltaSeconds: number
  ): void {
    const data = creature.getData('creatureData') as CreatureData;
    const width = this.game.config.width as number;
    const height = this.game.config.height as number;

    // Apply random movement with some inertia
    if (Math.random() < 0.02) {
      data.velocityX += Phaser.Math.Between(-20, 20);
      data.velocityY += Phaser.Math.Between(-20, 20);
    }

    // Move toward food if nearby
    this.moveTowardNearestFood(creature);

    // Limit speed to reasonable values
    const maxSpeed = 120;
    const speed = Math.sqrt(
      data.velocityX * data.velocityX + data.velocityY * data.velocityY
    );
    if (speed > maxSpeed) {
      data.velocityX = (data.velocityX / speed) * maxSpeed;
      data.velocityY = (data.velocityY / speed) * maxSpeed;
    }

    // Move creature
    let newX: number = creature.x + data.velocityX * deltaSeconds;
    let newY: number = creature.y + data.velocityY * deltaSeconds;

    // Bounce off edges
    if (newX < this.creatureRadius || newX > width - this.creatureRadius) {
      data.velocityX = -data.velocityX;
      newX = Phaser.Math.Clamp(
        newX,
        this.creatureRadius,
        width - this.creatureRadius
      );
    }

    if (newY < this.creatureRadius || newY > height - this.creatureRadius) {
      data.velocityY = -data.velocityY;
      newY = Phaser.Math.Clamp(
        newY,
        this.creatureRadius,
        height - this.creatureRadius
      );
    }

    // Update position
    creature.x = newX;
    creature.y = newY;
  }

  private moveTowardNearestFood(creature: Phaser.GameObjects.Container): void {
    const data = creature.getData('creatureData') as CreatureData;

    // Only move toward food if resources are below a threshold
    if (data.resources > this.reproductionThreshold * 0.7) return;

    const foodItems = this.foodGroup.getChildren();
    let nearestFood = null;
    let nearestDistance = Infinity;

    foodItems.forEach((food) => {
      const distance = Phaser.Math.Distance.Between(
        creature.x,
        creature.y,
        // @ts-ignore
        food.x,
        // @ts-ignore
        food.y
      );

      if (distance < 200 && distance < nearestDistance) {
        nearestFood = food;
        nearestDistance = distance;
      }
    });

    if (nearestFood) {
      // Apply a small force toward food
      // @ts-ignore
      const dx = nearestFood.x - creature.x;
      // @ts-ignore
      const dy = nearestFood.y - creature.y;
      const angle = Math.atan2(dy, dx);

      data.velocityX += Math.cos(angle) * 20;
      data.velocityY += Math.sin(angle) * 20;
    }
  }

  private createDeathEffect(x: number, y: number, color: number): void {
    // Create simple particle effect for death
    const particles = [];
    const particleCount = 8;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 50;
      const particle = this.add.circle(x, y, 3, color);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 30,
        y: y + Math.sin(angle) * 30,
        alpha: 0,
        scale: 0.1,
        duration: 800,
        onComplete: () => particle.destroy(),
      });
    }
  }

  private reproduce(creature: Phaser.GameObjects.Container): void {
    const data = creature.getData('creatureData') as CreatureData;

    // Deduct reproduction cost
    data.resources -= this.reproductionCost;

    // Create offspring
    const offspringId = Date.now() + Math.random();
    this.createCreature(data.strategy, offspringId, creature.x, creature.y);

    // Increment generation counter
    this.generationCount++;
  }

  private handleInteractions(time: number): void {
    // Check for interactions between all pairs of creatures
    for (let i = 0; i < this.creatures.length; i++) {
      for (let j = i + 1; j < this.creatures.length; j++) {
        const creatureA = this.creatures[i];
        const creatureB = this.creatures[j];

        const dataA = creatureA.getData('creatureData') as CreatureData;
        const dataB = creatureB.getData('creatureData') as CreatureData;

        // Skip if either creature is on cooldown
        if (
          time - dataA.lastInteractionTime < this.interactionCooldown ||
          time - dataB.lastInteractionTime < this.interactionCooldown
        ) {
          continue;
        }

        // Check if creatures are close enough to interact
        const distance = Phaser.Math.Distance.Between(
          creatureA.x,
          creatureA.y,
          creatureB.x,
          creatureB.y
        );

        if (distance < this.interactionDistance) {
          this.handleIPDRound(creatureA, creatureB, time);
          this.totalInteractions++;
        }
      }
    }
  }

  private handleIPDRound(
    creatureA: Phaser.GameObjects.Container,
    creatureB: Phaser.GameObjects.Container,
    time: number
  ): void {
    const dataA = creatureA.getData('creatureData') as CreatureData;
    const dataB = creatureB.getData('creatureData') as CreatureData;

    // Get actions from both creatures based on their strategies
    const actionA: 'C' | 'D' = this.getAction(creatureA, creatureB);
    const actionB: 'C' | 'D' = this.getAction(creatureB, creatureA);

    // Calculate payoffs based on actions
    let payoffA: number = 0;
    let payoffB: number = 0;

    if (actionA === 'C' && actionB === 'C') {
      // Both cooperate
      payoffA = PAYOFF_MATRIX.CC.A;
      payoffB = PAYOFF_MATRIX.CC.B;
    } else if (actionA === 'C' && actionB === 'D') {
      // A cooperates, B defects
      payoffA = PAYOFF_MATRIX.CD.A;
      payoffB = PAYOFF_MATRIX.CD.B;
    } else if (actionA === 'D' && actionB === 'C') {
      // A defects, B cooperates
      payoffA = PAYOFF_MATRIX.DC.A;
      payoffB = PAYOFF_MATRIX.DC.B;
    } else if (actionA === 'D' && actionB === 'D') {
      // Both defect
      payoffA = PAYOFF_MATRIX.DD.A;
      payoffB = PAYOFF_MATRIX.DD.B;
    }

    // Update resources and scores
    dataA.resources += payoffA;
    dataB.resources += payoffB;
    dataA.score += payoffA;
    dataB.score += payoffB;

    // Update interaction counts
    dataA.interactionCount++;
    dataB.interactionCount++;

    // Update cooperation counts
    if (actionA === 'C') dataA.cooperationCount++;
    if (actionB === 'C') dataB.cooperationCount++;

    // Update memories (what each knows about the other)
    this.updateMemory(creatureA, creatureB, actionB);
    this.updateMemory(creatureB, creatureA, actionA);

    // Update last action and payoff for win-stay-lose-shift strategy
    if (dataA.strategy === 'win-stay-lose-shift') {
      dataA.lastAction = actionA;
      dataA.lastPayoff = payoffA;
    }

    if (dataB.strategy === 'win-stay-lose-shift') {
      dataB.lastAction = actionB;
      dataB.lastPayoff = payoffB;
    }

    // Record interaction time and partner
    dataA.lastInteractionTime = time;
    dataB.lastInteractionTime = time;
    dataA.lastPartner = dataB.id;
    dataB.lastPartner = dataA.id;

    // Create visual effects for the interaction
    this.createInteractionEffect(creatureA, creatureB, actionA, actionB);
  }

  private getAction(
    creature: Phaser.GameObjects.Container,
    opponent: Phaser.GameObjects.Container
  ): 'C' | 'D' {
    const data = creature.getData('creatureData') as CreatureData;
    const strategy: Strategy = data.strategy;
    const memory = data.memory as Map<number | string, ('C' | 'D')[]>;
    const opponentId = (opponent.getData('creatureData') as CreatureData).id;
    const pastMoves: ('C' | 'D')[] = memory.get(opponentId) || [];

    let action: 'C' | 'D' = 'C'; // Default to cooperation

    // Determine action based on strategy
    switch (strategy) {
      case 'always cooperate':
        action = 'C';
        break;

      case 'always defect':
        action = 'D';
        break;

      case 'tit-for-tat':
        // Start with cooperation, then mirror opponent's last move
        action = pastMoves.length > 0 ? pastMoves[pastMoves.length - 1] : 'C';
        break;

      case 'random':
        // Choose randomly between cooperation and defection
        action = Math.random() < 0.5 ? 'C' : 'D';
        break;

      case 'win-stay-lose-shift':
        // Also known as Pavlov in some implementations
        const lastAction: 'C' | 'D' = data.lastAction || 'C';
        const lastPayoff: number =
          data.lastPayoff !== undefined ? data.lastPayoff : 3;

        // If last payoff was positive, repeat last action; otherwise, switch
        action = lastPayoff > 0 ? lastAction : lastAction === 'C' ? 'D' : 'C';
        break;

      case 'grim trigger':
        // Cooperate until opponent defects, then always defect
        action = pastMoves.includes('D') ? 'D' : 'C';
        break;

      case 'tit-for-two-tats':
        // Only defect if opponent defected twice in a row
        action =
          pastMoves.length >= 2 &&
          pastMoves[pastMoves.length - 1] === 'D' &&
          pastMoves[pastMoves.length - 2] === 'D'
            ? 'D'
            : 'C';
        break;

      default:
        action = 'C'; // Default to cooperation for unknown strategies
    }

    // Apply noise - chance of making a mistake (crucial for evolutionary stability)
    if (Math.random() < ERROR_RATE) {
      action = action === 'C' ? 'D' : 'C';
    }

    return action;
  }

  private updateMemory(
    creature: Phaser.GameObjects.Container,
    opponent: Phaser.GameObjects.Container,
    opponentAction: 'C' | 'D'
  ): void {
    const data = creature.getData('creatureData') as CreatureData;
    const memory = data.memory as Map<number | string, ('C' | 'D')[]>;
    const opponentId = (opponent.getData('creatureData') as CreatureData).id;

    // Get existing history or create new one
    let history = memory.get(opponentId);
    if (!history) {
      history = [];
      memory.set(opponentId, history);
    }

    // Add this move to history
    history.push(opponentAction);

    // Limit memory to last 10 interactions to prevent unlimited growth
    if (history.length > 10) {
      history.shift();
    }
  }

  private createInteractionEffect(
    creatureA: Phaser.GameObjects.Container,
    creatureB: Phaser.GameObjects.Container,
    actionA: 'C' | 'D',
    actionB: 'C' | 'D'
  ): void {
    // Calculate vector between creatures
    const dx: number = creatureB.x - creatureA.x;
    const dy: number = creatureB.y - creatureA.y;
    const length: number = Math.sqrt(dx * dx + dy * dy) || 1;

    // Create offset for parallel lines
    const offsetAmount: number = 3;
    const offsetX: number = -(dy / length) * offsetAmount;
    const offsetY: number = (dx / length) * offsetAmount;

    // Draw line for A's action
    const graphicsA: Phaser.GameObjects.Graphics = this.add.graphics();
    const colorA = actionA === 'C' ? COLOR_GREEN : COLOR_RED;
    graphicsA.lineStyle(LINE_WIDTH, colorA, 1);
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();

    // Draw line for B's action
    const graphicsB: Phaser.GameObjects.Graphics = this.add.graphics();
    const colorB = actionB === 'C' ? COLOR_GREEN : COLOR_RED;
    graphicsB.lineStyle(LINE_WIDTH, colorB, 1);
    graphicsB.beginPath();
    graphicsB.moveTo(creatureB.x - offsetX, creatureB.y - offsetY);
    graphicsB.lineTo(creatureA.x - offsetX, creatureA.y - offsetY);
    graphicsB.strokePath();

    // Fade out interaction lines
    this.tweens.add({
      targets: [graphicsA, graphicsB],
      alpha: 0,
      duration: 800,
      onComplete: () => {
        graphicsA.destroy();
        graphicsB.destroy();
      },
    });
  }

  private handleFoodConsumption(): void {
    const foodItems = this.foodGroup.getChildren() as Phaser.GameObjects.Arc[];

    foodItems.forEach((food: Phaser.GameObjects.Arc) => {
      this.creatures.forEach((creature: Phaser.GameObjects.Container) => {
        const distance = Phaser.Math.Distance.Between(
          creature.x,
          creature.y,
          food.x,
          food.y
        );

        // If creature is close enough to food, consume it
        if (distance < this.creatureRadius + 15) {
          const foodValue = (food.getData('value') as number) || FOOD_VALUE;
          const data = creature.getData('creatureData') as CreatureData;

          // Add food value to creature's resources
          data.resources += foodValue;

          // Remove the food
          food.destroy();
        }
      });
    });
  }

  private spawnFood(): void {
    const width = this.game.config.width as number;
    const height = this.game.config.height as number;

    // Random position
    const x = Phaser.Math.Between(20, width - 20);
    const y = Phaser.Math.Between(20, height - 20);

    // Create food with slight size variation
    const size = Phaser.Math.Between(8, 12);
    const food = this.add.circle(x, y, size, 0xffffff);

    // Set food data
    food.setData('value', FOOD_VALUE);

    // Add to food group
    this.foodGroup.add(food);

    // Destroy automatically after 15 seconds if not consumed
    this.time.delayedCall(15000, () => {
      if (food.active) {
        food.destroy();
      }
    });
  }

  private updateStats(): void {
    const total = this.creatures.length;

    // Count creatures by strategy
    const strategyCounts: Record<Strategy, number> = {} as Record<
      Strategy,
      number
    >;
    STRATEGY_ORDER.forEach((strategy) => {
      strategyCounts[strategy] = 0;
    });

    // Calculate totals and averages
    let totalResources = 0;
    let totalAge = 0;
    let totalScore = 0;

    this.creatures.forEach((creature) => {
      const data = creature.getData('creatureData') as CreatureData;
      const strategy = data.strategy;

      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      totalResources += data.resources;
      totalAge += data.age;
      totalScore += data.score;
    });

    const avgResources = total > 0 ? (totalResources / total).toFixed(1) : '0';
    const avgAge = total > 0 ? (totalAge / total).toFixed(1) : '0';
    const avgScore = total > 0 ? (totalScore / total).toFixed(1) : '0';
    const foodCount = this.foodGroup.getLength();

    // Build stats display
    const statsLines: string[] = [];
    statsLines.push(`**SIMULATION STATS**`);
    statsLines.push(`Generation: ${this.generationCount}`);
    statsLines.push(`Time: ${this.simulationTime.toFixed(0)}s`);
    statsLines.push(`Creatures: ${total}/${this.carryingCapacity}`);
    statsLines.push(`Interactions: ${this.totalInteractions}`);
    statsLines.push(`Food Available: ${foodCount}`);
    statsLines.push(`\n**POPULATION**`);

    // Show strategy counts
    const activeStrategies = STRATEGY_ORDER.filter(
      (strategy) => strategyCounts[strategy] > 0
    );
    activeStrategies.forEach((strategy) => {
      const info = STRATEGY_INFO[strategy];
      const count = strategyCounts[strategy];
      const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      statsLines.push(
        `${info.emoji} ${info.shortName}: ${count} (${percent}%)`
      );
    });

    statsLines.push(`\n**AVERAGES**`);
    statsLines.push(`Resources: ${avgResources}`);
    statsLines.push(`Age: ${avgAge}s`);
    statsLines.push(`Score: ${avgScore}`);

    this.statsText.setText(statsLines.join('\n'));
  }
}
