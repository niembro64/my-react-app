import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';

// Simulation constants - these can be modified through the Setup scene
const DEFAULT_CONFIG = {
  INITIAL_CREATURES_PER_STRATEGY: 50,
  CREATURE_RADIUS: 15,
  INTERACTION_DISTANCE: 200,
  INTERACTION_COOLDOWN: 200,
  REPRODUCTION_THRESHOLD: 200,
  REPRODUCTION_COST: 100,
  MINIMUM_RESOURCE: 0,
  MAINTENANCE_COST: 5,
  CARRYING_CAPACITY: 350, // INITIAL_CREATURES_PER_STRATEGY * 7,
  OVERPOPULATION_FACTOR: 0.5,
  DEATH_RATE_FACTOR: 0,
  FOOD_SPAWN_INTERVAL: 2000,
  FOOD_VALUE: 50,
  ERROR_RATE_INTERACTION: 0.05, // 5% chance of noise/error when interacting
  ERROR_RATE_MEMORY: 0.05, // 5% chance of noise/error when storing a memory
};

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
    emoji: '⚪',
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
}

// Interface for simulation configuration
interface SimulationConfig {
  INITIAL_CREATURES_PER_STRATEGY: number;
  CREATURE_RADIUS: number;
  INTERACTION_DISTANCE: number;
  INTERACTION_COOLDOWN: number;
  REPRODUCTION_THRESHOLD: number;
  REPRODUCTION_COST: number;
  MINIMUM_RESOURCE: number;
  MAINTENANCE_COST: number;
  CARRYING_CAPACITY: number;
  OVERPOPULATION_FACTOR: number;
  DEATH_RATE_FACTOR: number;
  FOOD_SPAWN_INTERVAL: number;
  FOOD_VALUE: number;
  ERROR_RATE_INTERACTION: number;
  ERROR_RATE_MEMORY: number;
  enabledStrategies: Record<Strategy, boolean>;
}

// Setup Scene for configuring simulation parameters
class SetupScene extends Phaser.Scene {
  private config: SimulationConfig;
  private title!: Phaser.GameObjects.Text;
  private strategyToggles: Record<Strategy, Phaser.GameObjects.Container> =
    {} as Record<Strategy, Phaser.GameObjects.Container>;
  private sliders: Record<
    string,
    {
      slider: Phaser.GameObjects.Graphics;
      text: Phaser.GameObjects.Text;
      value: number;
    }
  > = {};
  private startButton!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'SetupScene' });

    // Initialize configuration with default values
    this.config = {
      ...DEFAULT_CONFIG,
      enabledStrategies: {} as Record<Strategy, boolean>,
    };

    // Default all strategies to enabled
    STRATEGY_ORDER.forEach((strategy) => {
      this.config.enabledStrategies[strategy] = true;
    });
  }

  create(): void {
    const width = this.cameras.main.width as number;
    const height = this.cameras.main.height as number;

    // Create a dark background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0, 0);

    // Title
    this.title = this.add
      .text(width / 2, 40, "AXELROD'S TOURNAMENT SIMULATOR", {
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    // Subtitle
    this.add
      .text(width / 2, 80, 'Select strategies and configure parameters', {
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5, 0);

    // Create strategy toggles
    this.createStrategyToggles(width, height);

    // Create parameter sliders
    this.createParameterSliders(width, height);

    // Create start button
    this.createStartButton(width, height);
  }

  private createStrategyToggles(width: number, height: number): void {
    // Increased from 120 to 160 for better spacing
    const startY = 160;
    const padding = 15;
    const toggleSize = 30;
    const togglesPerRow = 2;
    const toggleWidth = width / togglesPerRow - padding * 2;

    STRATEGY_ORDER.forEach((strategy, index) => {
      const row = Math.floor(index / togglesPerRow);
      const col = index % togglesPerRow;
      const x = padding + col * (toggleWidth + padding) + toggleWidth / 2;
      const y = startY + row * (toggleSize + padding) * 2;

      const container = this.add.container(x, y);
      const info = STRATEGY_INFO[strategy];

      // Create toggle background
      const bg = this.add
        .rectangle(0, 0, toggleWidth, toggleSize * 2, 0x222244)
        .setStrokeStyle(2, 0x444488);
      container.add(bg);

      // Create emoji and name
      const emoji = this.add
        .text(-toggleWidth / 2 + padding, -toggleSize / 2, info.emoji, {
          fontSize: '24px',
        })
        .setOrigin(0, 0.5);
      container.add(emoji);

      const name = this.add
        .text(-toggleWidth / 2 + padding + 40, -toggleSize / 2, info.longName, {
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5);
      container.add(name);

      // Create description
      const description = this.add
        .text(-toggleWidth / 2 + padding, toggleSize / 2, info.description, {
          fontSize: '14px',
          color: '#aaaaaa',
          wordWrap: { width: toggleWidth - padding * 2 },
        })
        .setOrigin(0, 0.5);
      container.add(description);

      // **Removed dot indicator in favor of alpha toggling**

      // Initialize alpha based on current enabled state
      container.setAlpha(this.config.enabledStrategies[strategy] ? 1 : 0.4);

      // Make toggle interactive
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        // Toggle the strategy
        this.config.enabledStrategies[strategy] =
          !this.config.enabledStrategies[strategy];
        // Change alpha to represent muted or bright
        container.setAlpha(this.config.enabledStrategies[strategy] ? 1 : 0.4);
      });

      this.strategyToggles[strategy] = container;
    });
  }

  private createParameterSliders(width: number, height: number): void {
    // Increased from 320 to 580 for better spacing
    const startY = 580;
    const sliderWidth = 300;
    const sliderHeight = 8;
    const padding = 20;
    const slidersPerColumn = 4;
    const totalColumns = 2;

    // Only keep the four requested parameters
    const parameters = [
      {
        key: 'REPRODUCTION_THRESHOLD',
        label: 'Reproduction Threshold',
        min: 100,
        max: 300,
        step: 10,
      },
      {
        key: 'REPRODUCTION_COST',
        label: 'Reproduction Cost',
        min: 50,
        max: 150,
        step: 10,
      },
      {
        key: 'ERROR_RATE_INTERACTION',
        label: 'Interaction Error Rate',
        min: 0,
        max: 0.2,
        step: 0.01,
      },
      {
        key: 'ERROR_RATE_MEMORY',
        label: 'Memory Error Rate',
        min: 0,
        max: 0.2,
        step: 0.01,
      },
    ];

    // Initialize all slider objects first
    parameters.forEach((param) => {
      this.sliders[param.key] = {
        slider: null as any,
        text: null as any,
        value: this.config[param.key as keyof SimulationConfig] as number,
      };
    });

    parameters.forEach((param, index) => {
      const column = Math.floor(index / slidersPerColumn);
      const row = index % slidersPerColumn;

      const x = width / 4 + column * (width / 2);
      const y = startY + row * 60;

      // Label
      const label = this.add
        .text(x, y, param.label, {
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0);

      // Slider track
      const sliderTrack = this.add.graphics();
      sliderTrack.fillStyle(0x444444, 1);
      sliderTrack.fillRect(
        x - sliderWidth / 2,
        y + 30,
        sliderWidth,
        sliderHeight
      );

      // Slider handle
      const sliderHandle = this.add.graphics();

      // Value text
      const valueText = this.add
        .text(x + sliderWidth / 2 + 20, y + 30, '', {
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0, 0.5);

      // Get the current value
      const currentValue = this.sliders[param.key].value;
      const initialPosition =
        ((currentValue - param.min) / (param.max - param.min)) * sliderWidth;

      // Update slider references
      this.sliders[param.key].slider = sliderHandle;
      this.sliders[param.key].text = valueText;

      // Update function
      const updateSlider = (position: number) => {
        // Clear and redraw handle
        sliderHandle.clear();
        sliderHandle.fillStyle(0x00aaff, 1);
        sliderHandle.fillCircle(
          x - sliderWidth / 2 + position,
          y + 30 + sliderHeight / 2,
          10
        );

        // Calculate value
        let value =
          param.min + (position / sliderWidth) * (param.max - param.min);
        value = Math.round(value / param.step) * param.step;

        // Update value in config
        this.config[param.key as keyof SimulationConfig] = value as never;

        // Update text
        valueText.setText(value.toFixed(param.step < 1 ? 2 : 0));

        // Store value for reference
        this.sliders[param.key].value = value;
      };

      // Initialize slider
      updateSlider(initialPosition);

      // Make slider interactive
      const hitArea = this.add
        .rectangle(
          x,
          y + 30 + sliderHeight / 2,
          sliderWidth + 20,
          30,
          0xffffff,
          0
        )
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          const position = Phaser.Math.Clamp(
            pointer.x - (x - sliderWidth / 2),
            0,
            sliderWidth
          );
          updateSlider(position);
        })
        .on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (pointer.isDown) {
            const position = Phaser.Math.Clamp(
              pointer.x - (x - sliderWidth / 2),
              0,
              sliderWidth
            );
            updateSlider(position);
          }
        });
    });
  }

  private createStartButton(width: number, height: number): void {
    const buttonWidth = 200;
    const buttonHeight = 50;
    const x = width / 2;
    const y = height - 60;

    const container = this.add.container(x, y);

    // Button background
    const bg = this.add
      .rectangle(0, 0, buttonWidth, buttonHeight, 0x0066cc)
      .setStrokeStyle(3, 0x0088ff);
    container.add(bg);

    // Button text
    const text = this.add
      .text(0, 0, 'START SIMULATION', {
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(text);

    // Make interactive
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.fillColor = 0x0088ff;
      })
      .on('pointerout', () => {
        bg.fillColor = 0x0066cc;
      })
      .on('pointerdown', () => {
        // Start simulation with configured parameters
        this.startSimulation();
      });

    this.startButton = container;
  }

  private startSimulation(): void {
    // Check that at least one strategy is enabled
    const anyStrategyEnabled = Object.values(
      this.config.enabledStrategies
    ).some((enabled) => enabled);

    if (!anyStrategyEnabled) {
      // Show error message
      const errorText = this.add
        .text(
          this.cameras.main.width / 2,
          this.startButton.y - 40,
          'Please select at least one strategy',
          {
            fontSize: '18px',
            color: '#ff0000',
            fontStyle: 'bold',
          }
        )
        .setOrigin(0.5);

      // Fade out after 2 seconds
      this.tweens.add({
        targets: errorText,
        alpha: 0,
        duration: 2000,
        onComplete: () => errorText.destroy(),
      });

      return;
    }

    // Update carrying capacity based on creatures per strategy and enabled strategies
    const enabledStrategyCount = Object.values(
      this.config.enabledStrategies
    ).filter(Boolean).length;
    this.config.CARRYING_CAPACITY = Math.max(
      this.config.CARRYING_CAPACITY,
      this.config.INITIAL_CREATURES_PER_STRATEGY * enabledStrategyCount * 1.5
    );

    // Start simulation scene
    this.scene.start('SimulationScene', this.config);
  }
}

// Main simulation scene
class SimulationScene extends Phaser.Scene {
  // Game objects
  private creatures: Phaser.GameObjects.Container[] = [];
  private foodGroup!: Phaser.GameObjects.Group;
  private statsText!: Phaser.GameObjects.Text;
  private resetButton!: Phaser.GameObjects.Container;

  // Simulation parameters
  private config!: SimulationConfig;
  private interactionDistance: number = DEFAULT_CONFIG.INTERACTION_DISTANCE;
  private interactionCooldown: number = DEFAULT_CONFIG.INTERACTION_COOLDOWN;
  private reproductionThreshold: number = DEFAULT_CONFIG.REPRODUCTION_THRESHOLD;
  private reproductionCost: number = DEFAULT_CONFIG.REPRODUCTION_COST;
  private minimumResource: number = DEFAULT_CONFIG.MINIMUM_RESOURCE;
  private maintenanceCost: number = DEFAULT_CONFIG.MAINTENANCE_COST;
  private carryingCapacity: number = DEFAULT_CONFIG.CARRYING_CAPACITY;
  private overpopulationFactor: number = DEFAULT_CONFIG.OVERPOPULATION_FACTOR;
  private deathRateFactor: number = DEFAULT_CONFIG.DEATH_RATE_FACTOR;
  private foodSpawnInterval: number = DEFAULT_CONFIG.FOOD_SPAWN_INTERVAL;
  private creatureRadius: number = DEFAULT_CONFIG.CREATURE_RADIUS;
  private creaturesPerStrategy: number =
    DEFAULT_CONFIG.INITIAL_CREATURES_PER_STRATEGY;
  private errorRateInteraction: number = DEFAULT_CONFIG.ERROR_RATE_INTERACTION;
  private errorRateMemory: number = DEFAULT_CONFIG.ERROR_RATE_MEMORY;
  private foodValue: number = DEFAULT_CONFIG.FOOD_VALUE;
  private enabledStrategies!: Record<Strategy, boolean>;

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
    this.interactionCooldown = data.INTERACTION_COOLDOWN;
    this.reproductionThreshold = data.REPRODUCTION_THRESHOLD;
    this.reproductionCost = data.REPRODUCTION_COST;
    this.minimumResource = data.MINIMUM_RESOURCE;
    this.maintenanceCost = data.MAINTENANCE_COST;
    this.carryingCapacity = data.CARRYING_CAPACITY;
    this.overpopulationFactor = data.OVERPOPULATION_FACTOR;
    this.deathRateFactor = data.DEATH_RATE_FACTOR;
    this.foodSpawnInterval = data.FOOD_SPAWN_INTERVAL;
    this.creatureRadius = data.CREATURE_RADIUS;
    this.creaturesPerStrategy = data.INITIAL_CREATURES_PER_STRATEGY;
    this.errorRateInteraction = data.ERROR_RATE_INTERACTION;
    this.errorRateMemory = data.ERROR_RATE_MEMORY;
    this.foodValue = data.FOOD_VALUE;
    this.enabledStrategies = data.enabledStrategies;
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
    this.foodSpawnEvent = this.time.addEvent({
      delay: this.foodSpawnInterval,
      callback: this.spawnFood,
      callbackScope: this,
      loop: true,
    });

    // Create reset button
    this.createResetButton(width, height);

    // Create initial creatures
    this.initializeCreatures();

    // Create strategy legend
    this.createStrategyLegend(width, height);
  }

  private createResetButton(width: number, height: number): void {
    const buttonWidth = 120;
    const buttonHeight = 40;
    const x = width - buttonWidth / 2 - 10;
    const y = 30;

    const container = this.add.container(x, y);
    container.setDepth(1001);

    // Button background
    const bg = this.add
      .rectangle(0, 0, buttonWidth, buttonHeight, 0x990000)
      .setStrokeStyle(2, 0xff0000);
    container.add(bg);

    // Button text
    const text = this.add
      .text(0, 0, 'RESET', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(text);

    // Make interactive
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.fillColor = 0xcc0000;
      })
      .on('pointerout', () => {
        bg.fillColor = 0x990000;
      })
      .on('pointerdown', () => {
        // Go back to setup scene
        this.scene.start('SetupScene');
      });

    this.resetButton = container;
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

    // Create legend items - only for enabled strategies
    const enabledStrategies = STRATEGY_ORDER.filter(
      (strategy) => this.enabledStrategies[strategy]
    );
    const itemWidth = 200;
    const itemsPerRow = 3;
    const startX = 20;
    const startY = legendY + 40;

    enabledStrategies.forEach((strategy, index) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index % itemsPerRow;
      const x = startX + col * itemWidth;
      const y = startY + row * 30;

      const info = STRATEGY_INFO[strategy];

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

    // Apply random movement with inertia
    if (Math.random() < 0.05) {
      data.velocityX += Phaser.Math.Between(-40, 40);
      data.velocityY += Phaser.Math.Between(-40, 40);

      if (Math.random() < 0.01) {
        data.velocityX = Phaser.Math.Between(-100, 100);
        data.velocityY = Phaser.Math.Between(-100, 100);
      }
    }

    // Slight random jitter
    data.velocityX += (Math.random() - 0.5) * 5;
    data.velocityY += (Math.random() - 0.5) * 5;

    // Move toward food if nearby
    this.moveTowardNearestFood(creature);

    // Limit speed
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

    creature.x = newX;
    creature.y = newY;
  }

  private moveTowardNearestFood(creature: Phaser.GameObjects.Container): void {
    const data = creature.getData('creatureData') as CreatureData;

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

    if (actionA === 'C' && actionB === 'C') {
      payoffA = PAYOFF_MATRIX.CC.A;
      payoffB = PAYOFF_MATRIX.CC.B;
    } else if (actionA === 'C' && actionB === 'D') {
      payoffA = PAYOFF_MATRIX.CD.A;
      payoffB = PAYOFF_MATRIX.CD.B;
    } else if (actionA === 'D' && actionB === 'C') {
      payoffA = PAYOFF_MATRIX.DC.A;
      payoffB = PAYOFF_MATRIX.DC.B;
    } else if (actionA === 'D' && actionB === 'D') {
      payoffA = PAYOFF_MATRIX.DD.A;
      payoffB = PAYOFF_MATRIX.DD.B;
    }

    dataA.resources += payoffA;
    dataB.resources += payoffB;
    dataA.score += payoffA;
    dataB.score += payoffB;
    dataA.interactionCount++;
    dataB.interactionCount++;

    if (actionA === 'C') dataA.cooperationCount++;
    if (actionB === 'C') dataB.cooperationCount++;

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
    const colorA = actionA === 'C' ? COLOR_GREEN : COLOR_RED;
    graphicsA.lineStyle(LINE_WIDTH, colorA, 1);
    graphicsA.beginPath();
    graphicsA.moveTo(creatureA.x + offsetX, creatureA.y + offsetY);
    graphicsA.lineTo(creatureB.x + offsetX, creatureB.y + offsetY);
    graphicsA.strokePath();

    const graphicsB: Phaser.GameObjects.Graphics = this.add.graphics();
    const colorB = actionB === 'C' ? COLOR_GREEN : COLOR_RED;
    graphicsB.lineStyle(LINE_WIDTH, colorB, 1);
    graphicsB.beginPath();
    graphicsB.moveTo(creatureB.x - offsetX, creatureB.y - offsetY);
    graphicsB.lineTo(creatureA.x - offsetX, creatureA.y - offsetY);
    graphicsB.strokePath();

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
    statsLines.push(`**SIMULATION STATS**`);
    statsLines.push(`Generation: ${this.generationCount}`);
    statsLines.push(`Time: ${this.simulationTime.toFixed(0)}s`);
    statsLines.push(`Creatures: ${total}/${this.carryingCapacity}`);
    statsLines.push(`Interactions: ${this.totalInteractions}`);
    statsLines.push(`Cooperation Rate: ${overallCooperationRate}`);
    statsLines.push(`Food Available: ${foodCount}`);
    statsLines.push(`\n**POPULATION**`);

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

const Home: React.FC = () => {
  const gameRef = useRef<HTMLDivElement>(null);

  const borderAmount: number = 0.05;

  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: window.innerWidth * (1 - borderAmount),
      height: window.innerHeight - window.innerWidth * borderAmount,
      parent: gameRef.current!,
      scene: [SetupScene, SimulationScene],
      physics: {
        default: 'arcade',
        arcade: {
          debug: false,
          gravity: { x: 0, y: 0 },
        },
      },
    };

    const game = new Phaser.Game(config);

    // Clean up the Phaser game instance on component unmount.
    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div
      className="game-container"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#121220',
      }}
    >
      <div
        ref={gameRef}
        style={{
          border: '1px solid #333',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
        }}
      />
    </div>
  );
};

export default Home;
