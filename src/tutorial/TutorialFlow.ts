import type { Game } from '../game/Game';
import type { BuildingType } from '../entities/Building';

export type TutorialPhase =
  | 'intro'          // Intro letter
  | 'place_node'     // Place a station from the tray
  | 'first_prompt'   // Click the Nodeling to prompt
  | 'chaining'       // After first task, suggest second
  | 'aha'            // Suggest looping
  | 'complete';      // Tutorial done, free play

export class TutorialFlow {
  phase: TutorialPhase = 'intro';
  private game: Game;
  private tickCounter = 0;
  private promptCount = 0;
  private phaseTimer = 0;

  constructor(game: Game) {
    this.game = game;
  }

  start() {
    this.phase = 'intro';

    // Power on immediately
    this.game.powerOn();
    this.game.wakeNodelings();

    // Show intro letter after a brief pause
    setTimeout(() => {
      this.game.tutorialOverlay.showLetter(
        'Welcome to Nodelings',
        `Your workspace is empty — but not for long!<br><br>
        Open the <b>Nodes</b> tab below and pick a station to place on the grid.
        Then tell your <b>Nodeling</b> what to do using plain English.`,
        () => {
          this.phase = 'place_node';
          this.phaseTimer = 0;
          this.game.tutorialOverlay.showTooltip('Open the Nodes tab and place a station on the grid');
        }
      );
    }, 600);
  }

  tick() {
    this.tickCounter++;
    this.phaseTimer++;

    if (this.phase === 'place_node' && this.phaseTimer > 300) {
      this.game.tutorialOverlay.showTooltip('Open the Nodes tab and place a station on the grid');
      this.phaseTimer = 200;
    }

    if (this.phase === 'first_prompt' && this.phaseTimer > 300) {
      this.game.tutorialOverlay.showTooltip('Click the Nodeling to give it instructions');
      this.phaseTimer = 200;
    }
  }

  /** Called when user places a building from the tray */
  onNodePlaced(_type: BuildingType) {
    if (this.phase === 'place_node') {
      this.phase = 'first_prompt';
      this.phaseTimer = 0;
      this.game.tutorialOverlay.hideTooltip();

      setTimeout(() => {
        this.game.tutorialOverlay.showTooltip('Now click the Nodeling to give it instructions');
        setTimeout(() => this.game.tutorialOverlay.hideTooltip(), 6000);
      }, 500);
    }
  }

  /** Legacy — no longer used but kept for interface compatibility */
  onGeneratorClicked() {}

  onNodelingSelected() {
    if (this.phase === 'first_prompt' || this.phase === 'chaining' || this.phase === 'aha') {
      this.game.tutorialOverlay.hideTooltip();
    }
  }

  onPromptSubmitted(_prompt: string) {
    this.promptCount++;

    if (this.phase === 'first_prompt') {
      this.phase = 'chaining';
      this.phaseTimer = 0;

      setTimeout(() => {
        this.game.tutorialOverlay.showTooltip('Nice! Try placing another node from the Nodes tab');
        setTimeout(() => this.game.tutorialOverlay.hideTooltip(), 6000);
      }, 3000);
    } else if (this.phase === 'chaining') {
      this.phase = 'aha';
      this.phaseTimer = 0;

      setTimeout(() => {
        this.game.tutorialOverlay.showTooltip('Try telling it to loop between stations!');
        setTimeout(() => this.game.tutorialOverlay.hideTooltip(), 8000);
      }, 3000);
    } else if (this.phase === 'aha') {
      this.phase = 'complete';
      this.game.tutorialOverlay.hideTooltip();

      setTimeout(() => {
        this.game.tutorialOverlay.showTooltip('You\'ve got it! The workspace is yours.');
        setTimeout(() => this.game.tutorialOverlay.hideTooltip(), 5000);
      }, 2000);
    }
  }
}
