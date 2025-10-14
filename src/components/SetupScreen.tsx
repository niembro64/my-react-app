import React, { useState } from 'react';

export type Strategy =
  | 'always cooperate'
  | 'always defect'
  | 'tit-for-tat'
  | 'random'
  | 'win-stay-lose-shift'
  | 'grim trigger'
  | 'tit-for-two-tats';

interface StrategyInfo {
  longName: string;
  shortName: string;
  emoji: string;
  description: string;
}

const STRATEGY_INFO: Record<Strategy, StrategyInfo> = {
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

const STRATEGY_ORDER: Strategy[] = [
  'always cooperate',
  'always defect',
  'tit-for-tat',
  'tit-for-two-tats',
  'win-stay-lose-shift',
  'grim trigger',
  'random',
];

const STRATEGIES_INIT: Strategy[] = ['always cooperate', 'always defect'];

interface SliderConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  init: number;
}

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
  FOOD_SPAWN_INTERVAL: number;
  FOOD_VALUE: number;
  ERROR_RATE_INTERACTION: number;
  ERROR_RATE_MEMORY: number;
  enabledStrategies: Record<Strategy, boolean>;
}

interface SetupScreenProps {
  onStart: (config: SimulationConfig) => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onChange }) => {
  const formatValue = (val: number): string => {
    return step < 1 ? val.toFixed(2) : val.toFixed(0);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
      <div className="flex justify-between items-center mb-3">
        <label className="text-white text-sm font-medium">{label}</label>
        <span className="text-white text-sm font-mono bg-gray-800 px-2 py-1 rounded">
          {formatValue(value)}
        </span>
      </div>
      <div className="relative py-2">
        <div className="w-full h-3 bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute top-0 w-full h-full appearance-none cursor-pointer slider-thumb bg-transparent"
          style={{ marginTop: '0' }}
        />
      </div>
    </div>
  );
};

interface StrategyCardProps {
  strategy: Strategy;
  enabled: boolean;
  onToggle: () => void;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, enabled, onToggle }) => {
  const info = STRATEGY_INFO[strategy];

  return (
    <button
      onClick={onToggle}
      className={`
        rounded-lg p-3
        transition-all duration-200 cursor-pointer
        text-left w-full
        hover:shadow-md
        ${
          enabled
            ? 'bg-blue-600 border-2 border-blue-500'
            : 'bg-gray-700 border-2 border-gray-600 hover:border-gray-500'
        }
      `}
    >
      <div className="flex items-start space-x-3 mb-2">
        <span className="text-2xl">{info.emoji}</span>
        <div className="flex-1">
          <h3 className="text-white text-base font-semibold">
            {info.longName}
          </h3>
        </div>
      </div>

      <p className={`text-sm leading-relaxed hidden md:block ${enabled ? 'text-blue-100' : 'text-gray-400'}`}>
        {info.description}
      </p>
    </button>
  );
};

const DEFAULT_CONFIG = {
  INITIAL_CREATURES_PER_STRATEGY: 10,
  CREATURE_RADIUS: 20,
  INTERACTION_DISTANCE: 200,
  INTERACTION_COOLDOWN: 200,
  REPRODUCTION_THRESHOLD: 200,
  REPRODUCTION_COST: 100,
  MINIMUM_RESOURCE: 0,
  MAINTENANCE_COST: 5,
  CARRYING_CAPACITY: 0,
  OVERPOPULATION_FACTOR: 10,
  FOOD_SPAWN_INTERVAL: 100,
  FOOD_VALUE: 10,
  ERROR_RATE_INTERACTION: 0,
  ERROR_RATE_MEMORY: 0,
};

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart }) => {
  const [enabledStrategies, setEnabledStrategies] = useState<Record<Strategy, boolean>>(() => {
    const initial: Record<Strategy, boolean> = {} as Record<Strategy, boolean>;
    STRATEGY_ORDER.forEach((strategy) => {
      initial[strategy] = STRATEGIES_INIT.includes(strategy);
    });
    return initial;
  });

  const [parameters, setParameters] = useState({
    INTERACTION_COOLDOWN: DEFAULT_CONFIG.INTERACTION_COOLDOWN,
    REPRODUCTION_COST: DEFAULT_CONFIG.REPRODUCTION_COST,
    ERROR_RATE_INTERACTION: DEFAULT_CONFIG.ERROR_RATE_INTERACTION,
    ERROR_RATE_MEMORY: DEFAULT_CONFIG.ERROR_RATE_MEMORY,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sliderConfigs: SliderConfig[] = [
    {
      key: 'INTERACTION_COOLDOWN',
      label: 'Interaction Cooldown',
      min: 10,
      max: 1000,
      step: 10,
      init: DEFAULT_CONFIG.INTERACTION_COOLDOWN,
    },
    {
      key: 'REPRODUCTION_COST',
      label: 'Reproduction Cost',
      min: 50,
      max: 150,
      step: 10,
      init: DEFAULT_CONFIG.REPRODUCTION_COST,
    },
    {
      key: 'ERROR_RATE_INTERACTION',
      label: 'Interaction Error Rate',
      min: 0,
      max: 1,
      step: 0.01,
      init: DEFAULT_CONFIG.ERROR_RATE_INTERACTION,
    },
    {
      key: 'ERROR_RATE_MEMORY',
      label: 'Memory Error Rate',
      min: 0,
      max: 1,
      step: 0.01,
      init: DEFAULT_CONFIG.ERROR_RATE_MEMORY,
    },
  ];

  const toggleStrategy = (strategy: Strategy) => {
    setEnabledStrategies((prev) => ({
      ...prev,
      [strategy]: !prev[strategy],
    }));
    setErrorMessage(null);
  };

  const updateParameter = (key: string, value: number) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleStart = () => {
    const anyStrategyEnabled = Object.values(enabledStrategies).some((enabled) => enabled);

    if (!anyStrategyEnabled) {
      setErrorMessage('Please select at least one strategy');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const enabledStrategyCount = Object.values(enabledStrategies).filter(Boolean).length;
    const carryingCapacity = DEFAULT_CONFIG.INITIAL_CREATURES_PER_STRATEGY * enabledStrategyCount * 2;

    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      ...parameters,
      CARRYING_CAPACITY: carryingCapacity,
      enabledStrategies,
    };

    onStart(config);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center px-4 py-8 md:py-12 overflow-y-auto">
      <div className="w-full max-w-6xl">
        {/* Title Section */}
        <div className="text-center mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Axelrod's Tournament Simulator
          </h1>
          <p className="text-base md:text-lg text-gray-400">
            Select strategies and configure parameters
          </p>
        </div>

        {/* Strategy Toggles */}
        <div className="mb-8 md:mb-10">
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">
            Strategies
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
            {STRATEGY_ORDER.map((strategy) => (
              <StrategyCard
                key={strategy}
                strategy={strategy}
                enabled={enabledStrategies[strategy]}
                onToggle={() => toggleStrategy(strategy)}
              />
            ))}
          </div>
        </div>

        {/* Parameter Sliders */}
        <div className="mb-8 md:mb-10">
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">
            Parameters
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {sliderConfigs.map((config) => (
              <Slider
                key={config.key}
                label={config.label}
                value={parameters[config.key as keyof typeof parameters]}
                min={config.min}
                max={config.max}
                step={config.step}
                onChange={(value) => updateParameter(config.key, value)}
              />
            ))}
          </div>
        </div>

        {/* Start Button */}
        <div className="flex flex-col items-center space-y-4 pb-8">
          {errorMessage && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg px-4 py-2">
              <p className="text-red-200 text-sm font-medium">{errorMessage}</p>
            </div>
          )}
          <button
            onClick={handleStart}
            className="
              bg-blue-600 hover:bg-blue-700
              text-white text-lg md:text-xl font-bold
              px-8 md:px-12 py-3 md:py-4
              rounded-lg
              transition-colors duration-200
              w-full md:w-auto
            "
          >
            START SIMULATION
          </button>
        </div>
      </div>

      {/* Custom slider styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .slider-thumb::-webkit-slider-thumb {
            appearance: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }

          .slider-thumb::-moz-range-thumb {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }

          .slider-thumb::-webkit-slider-thumb:active {
            transform: scale(1.1);
          }

          .slider-thumb::-moz-range-thumb:active {
            transform: scale(1.1);
          }
        `
      }} />
    </div>
  );
};

export default SetupScreen;
