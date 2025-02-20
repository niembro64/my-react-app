
// Home.tsx
import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import SimulationScene from '../scenes/SimulationScene';

const PhaserGame: React.FC = () => {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameRef.current!,
      scene: SimulationScene,
      physics: {
        default: 'matter',
        matter: {
          debug: false, // Set to true for visual debugging of bodies and sensors.
        },
      },
    };

    const game = new Phaser.Game(config);

    // Clean up the Phaser game instance on component unmount.
    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={gameRef} />;
};

export default PhaserGame;
