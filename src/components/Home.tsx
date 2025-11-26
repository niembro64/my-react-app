import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import SetupScreen from './SetupScreen';

// Simulation constants
const DEFAULT_CONFIG = {
  INITIAL_CREATURES_PER_STRATEGY: 10,
  CREATURE_RADIUS: 20,
  INTERACTION_DISTANCE: 200,
  INTERACTION_SPEED: 960, // High = fast (converts to cooldown: 1010 - speed)
  REPRODUCTION_THRESHOLD: 200,
  REPRODUCTION_COST: 100,
  MINIMUM_RESOURCE: 0,
  MAINTENANCE_COST: 5,
  CARRYING_CAPACITY: 0, // INITIAL_CREATURES_PER_STRATEGY * 7,
  OVERPOPULATION_FACTOR: 10, // 0.5,
  FOOD_SPAWN_RATE: 0,
  FOOD_VALUE: 10,
  ERROR_RATE_INTERACTION: 0, // 5% chance of noise/error when interacting
  ERROR_RATE_MEMORY: 0, // 5% chance of noise/error when storing a memory
  SPEED_RANDOM: 50,
  SPEED_FOOD: 50,
  SPEED_FLEE: 50,
  SPEED_CHASE: 50,
};

// Visual constants
// const COLOR_COOPERATE: number = 0xffffff;
// const COLOR_DEFECT: number = 0x000000;

const COLOR_COOPERATE: number = 0x00ff00;
const COLOR_DEFECT: number = 0xff0000;

// const COLOR_GREEN: number = 0x33bb55;
// const COLOR_RED: number = 0xff5555;
const LINE_WIDTH: number = 4;

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
    longName: string;
    shortName: string;
    emoji: string;
    description: string;
  }
> = {
  'tit-for-tat': {
    longName: 'Tit-for-Tat',
    shortName: 'TFT',
    emoji: '🔵',
    description: "Start cooperating, then copy opponent's last move",
  },
  'tit-for-two-tats': {
    longName: 'Tit-for-Two-Tats',
    shortName: 'TFTT',
    emoji: '🟣',
    description: 'Only defect if opponent defects twice in a row',
  },
  'win-stay-lose-shift': {
    longName: 'Win-Stay Lose-Shift',
    shortName: 'WSLS',
    emoji: '🟡',
    description: 'Repeat last move if good outcome, change if bad outcome',
  },
  'always cooperate': {
    longName: 'Always Cooperate',
    shortName: 'ALLC',
    emoji: '🟢',
    description: 'Always cooperate no matter what',
  },
  'always defect': {
    longName: 'Always Defect',
    shortName: 'ALLD',
    emoji: '🔴',
    description: 'Always defect no matter what',
  },
  'grim trigger': {
    longName: 'Grim Trigger',
    shortName: 'GRIM',
    emoji: '🟠',
    description: 'Cooperate until opponent defects, then always defect',
  },
  random: {
    longName: 'Random',
    shortName: 'RAND',
    emoji: '⚪',
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
interface CreatureData {
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
  lastHarmer?: { x: number; y: number } | null;
  lastVictim?: Phaser.GameObjects.Container | null;
}

// Interface for simulation configuration
interface SimulationConfig {
  INITIAL_CREATURES_PER_STRATEGY: number;
  CREATURE_RADIUS: number;
  INTERACTION_DISTANCE: number;
  INTERACTION_SPEED: number;
  REPRODUCTION_THRESHOLD: number;
  REPRODUCTION_COST: number;
  MINIMUM_RESOURCE: number;
  MAINTENANCE_COST: number;
  CARRYING_CAPACITY: number;
  OVERPOPULATION_FACTOR: number;
  FOOD_SPAWN_RATE: number;
  FOOD_VALUE: number;
  ERROR_RATE_INTERACTION: number;
  ERROR_RATE_MEMORY: number;
  SPEED_RANDOM: number;
  SPEED_FOOD: number;
  SPEED_FLEE: number;
  SPEED_CHASE: number;
  enabledStrategies: Record<Strategy, boolean>;
}

// Main simulation scene
class SimulationScene extends Phaser.Scene {
  // Game objects
  private creatures: Phaser.GameObjects.Container[] = [];
  private foodGroup!: Phaser.GameObjects.Group;
  private statsText!: Phaser.GameObjects.Text;

  // Simulation parameters
  private config!: SimulationConfig;
  private interactionDistance: number = DEFAULT_CONFIG.INTERACTION_DISTANCE;
  private interactionCooldown: number = 1010 - DEFAULT_CONFIG.INTERACTION_SPEED;
  private payoffScale: number = 500 / DEFAULT_CONFIG.INTERACTION_SPEED; // Payoffs inversely proportional to speed
  private reproductionThreshold: number = DEFAULT_CONFIG.REPRODUCTION_THRESHOLD;
  private reproductionCost: number = DEFAULT_CONFIG.REPRODUCTION_COST;
  private minimumResource: number = DEFAULT_CONFIG.MINIMUM_RESOURCE;
  private maintenanceCost: number = DEFAULT_CONFIG.MAINTENANCE_COST;
  private carryingCapacity: number = DEFAULT_CONFIG.CARRYING_CAPACITY;
  private overpopulationFactor: number = DEFAULT_CONFIG.OVERPOPULATION_FACTOR;
  private foodSpawnRate: number = DEFAULT_CONFIG.FOOD_SPAWN_RATE;
  private creatureRadius: number = DEFAULT_CONFIG.CREATURE_RADIUS;
  private creaturesPerStrategy: number =
    DEFAULT_CONFIG.INITIAL_CREATURES_PER_STRATEGY;
  private errorRateInteraction: number = DEFAULT_CONFIG.ERROR_RATE_INTERACTION;
  private errorRateMemory: number = DEFAULT_CONFIG.ERROR_RATE_MEMORY;
  private foodValue: number = DEFAULT_CONFIG.FOOD_VALUE;
  private enabledStrategies!: Record<Strategy, boolean>;
  private speedRandom: number = DEFAULT_CONFIG.SPEED_RANDOM;
  private speedFood: number = DEFAULT_CONFIG.SPEED_FOOD;
  private speedFlee: number = DEFAULT_CONFIG.SPEED_FLEE;
  private speedChase: number = DEFAULT_CONFIG.SPEED_CHASE;

  // Game state
  private paused: boolean = false;
  private generationCount: number = 0;
  private simulationTime: number = 0;
  private totalInteractions: number = 0;
  private foodSpawnEvent!: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'SimulationScene' });
  }

  init(data: SimulationConfig): void {
    // Initialize configuration from setup scene
    this.config = data;
    this.interactionDistance = data.INTERACTION_DISTANCE;
    this.interactionCooldown = 1010 - data.INTERACTION_SPEED; // Convert speed to cooldown
    this.payoffScale = 500 / data.INTERACTION_SPEED; // Payoffs inversely proportional to speed
    this.reproductionThreshold = data.REPRODUCTION_THRESHOLD;
    this.reproductionCost = data.REPRODUCTION_COST;
    this.minimumResource = data.MINIMUM_RESOURCE;
    this.maintenanceCost = data.MAINTENANCE_COST;
    this.carryingCapacity = data.CARRYING_CAPACITY;
    this.overpopulationFactor = data.OVERPOPULATION_FACTOR;
    this.foodSpawnRate = data.FOOD_SPAWN_RATE;
    this.creatureRadius = data.CREATURE_RADIUS;
    this.creaturesPerStrategy = data.INITIAL_CREATURES_PER_STRATEGY;
    this.errorRateInteraction = data.ERROR_RATE_INTERACTION;
    this.errorRateMemory = data.ERROR_RATE_MEMORY;
    this.foodValue = data.FOOD_VALUE;
    this.enabledStrategies = data.enabledStrategies;
    this.speedRandom = data.SPEED_RANDOM;
    this.speedFood = data.SPEED_FOOD;
    this.speedFlee = data.SPEED_FLEE;
    this.speedChase = data.SPEED_CHASE;
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

    // Create UI panel for stats - sized to fit content
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.8);
    panel.fillRoundedRect(15, 60, 380, 350, 10);
    panel.setScrollFactor(0);
    panel.setDepth(1000);

    // Create stats text with monospace font for proper table alignment
    this.statsText = this.add.text(25, 70, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'Courier New, monospace',
    });
    this.statsText.setScrollFactor(0);
    this.statsText.setDepth(1001);

    // Create food system
    this.foodGroup = this.add.group();

    // Only create food spawn timer if rate is greater than 0
    // Convert rate to interval: rate 1 = 1000ms, rate 10 = 100ms
    if (this.foodSpawnRate > 0) {
      const foodSpawnInterval = 1000 / this.foodSpawnRate;
      this.foodSpawnEvent = this.time.addEvent({
        delay: foodSpawnInterval,
        callback: this.spawnFood,
        callbackScope: this,
        loop: true,
      });
    }

    // Create initial creatures
    this.initializeCreatures();
  }

  private initializeCreatures(): void {
    let creatureId: number = 0;

    // Create creatures only for enabled strategies
    STRATEGY_ORDER.forEach((strategy: Strategy) => {
      if (this.enabledStrategies[strategy]) {
        for (let i = 0; i < this.creaturesPerStrategy; i++) {
          this.createCreature(strategy, creatureId++);
        }
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

    // Create a container for the creature and its labels
    const container = this.add.container(x, y);
    container.setDepth(1);

    // Add emoji indicator
    const emoji = this.add
      .text(0, 0, STRATEGY_INFO[strategy].emoji, {
        fontSize: '50px',
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
      velocityX: 0,
      velocityY: 0,
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
      lastHarmer: null,
      lastVictim: null,
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
      })
      .on('pointerout', () => {
        if (label) label.setVisible(false);
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

    if (this.creatures.length > this.carryingCapacity * 2) {
      currentResources = 0;
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

    // Initialize velocity components
    let vx = 0;
    let vy = 0;

    // 1. Random wandering component
    if (this.speedRandom > 0) {
      const randomAngle = Math.random() * Math.PI * 2;
      vx += Math.cos(randomAngle) * this.speedRandom;
      vy += Math.sin(randomAngle) * this.speedRandom;
    }

    // 2. Food seeking component
    if (this.speedFood > 0) {
      const foodItems = this.foodGroup.getChildren();
      let nearestFood: Phaser.GameObjects.GameObject | null = null;
      let nearestDistance = Infinity;

      foodItems.forEach((food) => {
        const distance = Phaser.Math.Distance.Between(
          creature.x,
          creature.y,
          (food as Phaser.GameObjects.Arc).x,
          (food as Phaser.GameObjects.Arc).y
        );
        if (distance < nearestDistance) {
          nearestFood = food;
          nearestDistance = distance;
        }
      });

      if (nearestFood) {
        const dx = (nearestFood as Phaser.GameObjects.Arc).x - creature.x;
        const dy = (nearestFood as Phaser.GameObjects.Arc).y - creature.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
          vx += (dx / distance) * this.speedFood;
          vy += (dy / distance) * this.speedFood;
        }
      }
    }

    // 3. Flee from harmer component
    if (this.speedFlee > 0 && data.lastHarmer) {
      const dx = creature.x - data.lastHarmer.x;
      const dy = creature.y - data.lastHarmer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        vx += (dx / distance) * this.speedFlee;
        vy += (dy / distance) * this.speedFlee;
      }
      // Clear harmer after fleeing for a while (decay the memory)
      if (distance > 300) {
        data.lastHarmer = null;
      }
    }

    // 4. Chase victim component (move towards last creature we harmed)
    if (this.speedChase > 0 && data.lastVictim && data.lastVictim.active) {
      const dx = data.lastVictim.x - creature.x;
      const dy = data.lastVictim.y - creature.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        vx += (dx / distance) * this.speedChase;
        vy += (dy / distance) * this.speedChase;
      }
    }
    // Clear victim if they're no longer active (dead)
    if (data.lastVictim && !data.lastVictim.active) {
      data.lastVictim = null;
    }

    const percent_keep = 0.95

    // Apply velocity with smoothing (blend with previous velocity)
    data.velocityX = data.velocityX * percent_keep + vx * (1 - percent_keep);
    data.velocityY = data.velocityY * percent_keep + vy * (1 - percent_keep);
    // Limit max speed
    const maxSpeed = 150;
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

    creature.x = newX;
    creature.y = newY;
  }

  private createDeathEffect(x: number, y: number, color: number): void {
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
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
    data.resources -= this.reproductionCost;

    const offspringId = Date.now() + Math.random();
    this.createCreature(data.strategy, offspringId, creature.x, creature.y);

    this.generationCount++;
  }

  private handleInteractions(time: number): void {
    for (let i = 0; i < this.creatures.length; i++) {
      for (let j = i + 1; j < this.creatures.length; j++) {
        const creatureA = this.creatures[i];
        const creatureB = this.creatures[j];

        const dataA = creatureA.getData('creatureData') as CreatureData;
        const dataB = creatureB.getData('creatureData') as CreatureData;

        if (
          time - dataA.lastInteractionTime < this.interactionCooldown ||
          time - dataB.lastInteractionTime < this.interactionCooldown
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

    const actionA: 'C' | 'D' = this.getAction(creatureA, creatureB);
    const actionB: 'C' | 'D' = this.getAction(creatureB, creatureA);

    let payoffA: number = 0;
    let payoffB: number = 0;

    // Get base payoffs from matrix, then scale by interaction frequency
    // More frequent interactions = smaller individual payoffs
    if (actionA === 'C' && actionB === 'C') {
      payoffA = PAYOFF_MATRIX.CC.A * this.payoffScale;
      payoffB = PAYOFF_MATRIX.CC.B * this.payoffScale;
    } else if (actionA === 'C' && actionB === 'D') {
      payoffA = PAYOFF_MATRIX.CD.A * this.payoffScale;
      payoffB = PAYOFF_MATRIX.CD.B * this.payoffScale;
    } else if (actionA === 'D' && actionB === 'C') {
      payoffA = PAYOFF_MATRIX.DC.A * this.payoffScale;
      payoffB = PAYOFF_MATRIX.DC.B * this.payoffScale;
    } else if (actionA === 'D' && actionB === 'D') {
      payoffA = PAYOFF_MATRIX.DD.A * this.payoffScale;
      payoffB = PAYOFF_MATRIX.DD.B * this.payoffScale;
    }

    dataA.resources += payoffA;
    dataB.resources += payoffB;
    dataA.score += payoffA;
    dataB.score += payoffB;
    dataA.interactionCount++;
    dataB.interactionCount++;

    if (actionA === 'C') dataA.cooperationCount++;
    if (actionB === 'C') dataB.cooperationCount++;

    // Track harmer if received negative payoff
    if (payoffA < 0) {
      dataA.lastHarmer = { x: creatureB.x, y: creatureB.y };
    }
    if (payoffB < 0) {
      dataB.lastHarmer = { x: creatureA.x, y: creatureA.y };
    }

    // Track victim (creature this one harmed) for chase behavior
    if (payoffB < 0) {
      dataA.lastVictim = creatureB; // A harmed B, so B is A's victim
    }
    if (payoffA < 0) {
      dataB.lastVictim = creatureA; // B harmed A, so A is B's victim
    }

    this.updateMemory(creatureA, creatureB, actionB);
    this.updateMemory(creatureB, creatureA, actionA);

    if (dataA.strategy === 'win-stay-lose-shift') {
      dataA.lastAction = actionA;
      dataA.lastPayoff = payoffA;
    }
    if (dataB.strategy === 'win-stay-lose-shift') {
      dataB.lastAction = actionB;
      dataB.lastPayoff = payoffB;
    }

    dataA.lastInteractionTime = time;
    dataB.lastInteractionTime = time;
    dataA.lastPartner = dataB.id;
    dataB.lastPartner = dataA.id;

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
        action = Math.random() < 0.5 ? 'C' : 'D';
        break;
      case 'win-stay-lose-shift': {
        const lastAction: 'C' | 'D' = data.lastAction || 'C';
        const lastPayoff: number =
          data.lastPayoff !== undefined ? data.lastPayoff : 3;
        action = lastPayoff > 0 ? lastAction : lastAction === 'C' ? 'D' : 'C';
        break;
      }
      case 'grim trigger':
        action = pastMoves.includes('D') ? 'D' : 'C';
        break;
      case 'tit-for-two-tats':
        action =
          pastMoves.length >= 2 &&
          pastMoves[pastMoves.length - 1] === 'D' &&
          pastMoves[pastMoves.length - 2] === 'D'
            ? 'D'
            : 'C';
        break;
      default:
        action = 'C';
    }

    // Apply noise
    if (Math.random() < this.errorRateInteraction) {
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

    let history = memory.get(opponentId);
    if (!history) {
      history = [];
      memory.set(opponentId, history);
    }

    const savedAction: 'C' | 'D' =
      Math.random() < this.errorRateMemory
        ? opponentAction === 'C'
          ? 'D'
          : 'C'
        : opponentAction;

    history.push(savedAction);

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
    const dx: number = creatureB.x - creatureA.x;
    const dy: number = creatureB.y - creatureA.y;
    const length: number = Math.sqrt(dx * dx + dy * dy) || 1;

    const offsetAmount: number = 3;
    const offsetX: number = -(dy / length) * offsetAmount;
    const offsetY: number = (dx / length) * offsetAmount;

    const graphicsA: Phaser.GameObjects.Graphics = this.add.graphics();

    const colorA = actionA === 'C' ? COLOR_COOPERATE : COLOR_DEFECT;
    graphicsA.lineStyle(LINE_WIDTH, colorA, 1);
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();

    const graphicsB: Phaser.GameObjects.Graphics = this.add.graphics();
    const colorB = actionB === 'C' ? COLOR_COOPERATE : COLOR_DEFECT;
    graphicsB.lineStyle(LINE_WIDTH, colorB, 1);
    graphicsB.beginPath();
    graphicsB.moveTo(creatureB.x - offsetX, creatureB.y - offsetY);
    graphicsB.lineTo(creatureA.x - offsetX, creatureA.y - offsetY);
    graphicsB.strokePath();

    // put both graphics behind the creatures
    // graphicsA.setDepth(-1);
    // graphicsB.setDepth(-1);

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

        if (distance < this.creatureRadius + 15) {
          const foodValue = (food.getData('value') as number) || this.foodValue;
          const data = creature.getData('creatureData') as CreatureData;
          data.resources += foodValue;
          food.destroy();
        }
      });
    });
  }

  private spawnFood(): void {
    const width = this.game.config.width as number;
    const height = this.game.config.height as number;
    const x = Phaser.Math.Between(20, width - 20);
    const y = Phaser.Math.Between(20, height - 20);

    const size = Phaser.Math.Between(8, 12);
    const food = this.add.circle(x, y, size, 0xffffff);
    food.setData('value', this.foodValue);
    this.foodGroup.add(food);

    this.time.delayedCall(15000, () => {
      if (food.active) {
        food.destroy();
      }
    });
  }

  private updateStats(): void {
    const total = this.creatures.length;
    const strategyCounts: Record<Strategy, number> = {} as Record<
      Strategy,
      number
    >;
    STRATEGY_ORDER.forEach((strategy) => {
      strategyCounts[strategy] = 0;
    });

    let totalResources = 0;
    let totalAge = 0;
    let totalScore = 0;
    let totalCooperationCount = 0;
    let totalInteractionCount = 0;

    this.creatures.forEach((creature) => {
      const data = creature.getData('creatureData') as CreatureData;
      const strategy = data.strategy;
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      totalResources += data.resources;
      totalAge += data.age;
      totalScore += data.score;
      totalCooperationCount += data.cooperationCount;
      totalInteractionCount += data.interactionCount;
    });

    const avgResources = total > 0 ? (totalResources / total).toFixed(1) : '0';
    const avgAge = total > 0 ? (totalAge / total).toFixed(1) : '0';
    const avgScore = total > 0 ? (totalScore / total).toFixed(1) : '0';
    const overallCooperationRate =
      totalInteractionCount > 0
        ? ((totalCooperationCount / totalInteractionCount) * 100).toFixed(1) +
          '%'
        : '0%';
    const foodCount = this.foodGroup.getLength();

    const statsLines: string[] = [];
    statsLines.push(`SIMULATION STATS`);
    statsLines.push(`${'='.repeat(42)}`);
    statsLines.push(`Generations Born: ${this.generationCount}`);
    statsLines.push(`Time Elapsed:     ${this.simulationTime.toFixed(0)}s`);
    statsLines.push(`Total Population: ${total}/${this.carryingCapacity}`);
    statsLines.push(`Total Interactions: ${this.totalInteractions}`);
    statsLines.push(`Overall Coop Rate: ${overallCooperationRate}`);
    statsLines.push(`Food Available:   ${foodCount}`);
    statsLines.push(`Avg Resources:    ${avgResources}`);
    statsLines.push(`Avg Age:          ${avgAge}s`);
    statsLines.push(`Avg Score:        ${avgScore}`);
    statsLines.push(``);
    statsLines.push(`POPULATION`);
    statsLines.push(`${'='.repeat(42)}`);

    const activeStrategies = STRATEGY_ORDER.filter(
      (strategy) => this.enabledStrategies[strategy]
    );

    // Create table with proper column alignment
    // Header row
    statsLines.push(`  Name   #   Distribution`);
    statsLines.push(`${'-'.repeat(42)}`);

    // Data rows
    activeStrategies.forEach((strategy) => {
      const info = STRATEGY_INFO[strategy];
      const count = strategyCounts[strategy];
      const percent = total > 0 ? (count / total) * 100 : 0;
      const barLength = Math.floor(percent / 5); // 20 chars max (100% / 5)
      const bar = '█'.repeat(barLength) + ' '.repeat(20 - barLength);

      // Format: emoji + 4-char name  count  percentage + bar
      const name = `${info.emoji} ${info.shortName.padEnd(4)}`;
      const countStr = count.toString().padStart(3);
      const percentStr = percent.toFixed(1).padStart(5);

      statsLines.push(
        `${name} ${countStr}  ${percentStr}% ${bar}`
      );
    });

    this.statsText.setText(statsLines.join('\n'));
  }
}

const Home: React.FC = () => {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig | null>(null);

  const borderAmount: number = 0;

  const handleStartSimulation = (config: SimulationConfig) => {
    setSimulationConfig(config);
    setShowSetup(false);
  };

  useEffect(() => {
    if (!showSetup && simulationConfig && gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: gameRef.current,
        scene: [], // Empty array - we'll add the scene manually with data
        physics: {
          default: 'arcade',
          arcade: {
            debug: false,
            gravity: { x: 0, y: 0 },
          },
        },
      };

      gameInstanceRef.current = new Phaser.Game(config);

      // Add and start the simulation scene with the config data
      // The 'true' parameter auto-starts the scene
      // The last parameter is passed to the scene's init() method
      gameInstanceRef.current.scene.add('SimulationScene', SimulationScene, true, simulationConfig);

      // Clean up the Phaser game instance on component unmount.
      return () => {
        if (gameInstanceRef.current) {
          gameInstanceRef.current.destroy(true);
          gameInstanceRef.current = null;
        }
      };
    }
  }, [showSetup, simulationConfig]);

  if (showSetup) {
    return <SetupScreen onStart={handleStartSimulation} />;
  }

  return (
    <div
      className="game-container"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100dvh',
        width: '100dvw',
        backgroundColor: '#121220',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        ref={gameRef}
        style={{
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

export default Home;
