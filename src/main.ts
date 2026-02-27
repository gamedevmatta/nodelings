import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('ui-overlay') as HTMLElement;

const game = new Game(canvas, overlay);
game.start();

// Expose for debugging
(window as any).game = game;
