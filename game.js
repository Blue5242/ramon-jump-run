"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  startScreen: document.getElementById("startScreen"),
  startButton: document.getElementById("startButton"),
  messageScreen: document.getElementById("messageScreen"),
  messageEyebrow: document.getElementById("messageEyebrow"),
  messageTitle: document.getElementById("messageTitle"),
  messageText: document.getElementById("messageText"),
  messageButton: document.getElementById("messageButton"),
  level: document.getElementById("levelValue"),
  coins: document.getElementById("coinValue"),
  lives: document.getElementById("livesValue"),
  time: document.getElementById("timeValue"),
  best: document.getElementById("bestValue"),
  sound: document.getElementById("soundButton"),
  toast: document.getElementById("toast"),
};

const VIEW_W = canvas.width;
const VIEW_H = canvas.height;
const GRAVITY = 2050;
const MAX_FALL_SPEED = 980;
const STORAGE_KEY = "ramon-run-best";

const input = {
  held: new Set(),
  pressed: new Set(),
  touch: { left: false, right: false, jump: false },
  touchJumpPressed: false,

  down(action) {
    return this.held.has(action) || this.touch[action] === true;
  },

  justPressed(action) {
    return this.pressed.has(action) || (action === "jump" && this.touchJumpPressed);
  },

  endFrame() {
    this.pressed.clear();
    this.touchJumpPressed = false;
  },
};

const keyMap = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
  KeyP: "pause",
  Escape: "pause",
  KeyR: "restart",
  KeyM: "mute",
};

window.addEventListener("keydown", (event) => {
  const action = keyMap[event.code];
  if (!action) return;
  event.preventDefault();
  if (!input.held.has(action)) input.pressed.add(action);
  input.held.add(action);
});

window.addEventListener("keyup", (event) => {
  const action = keyMap[event.code];
  if (!action) return;
  event.preventDefault();
  input.held.delete(action);
});

window.addEventListener("blur", () => {
  input.held.clear();
  input.touch.left = false;
  input.touch.right = false;
  input.touch.jump = false;
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const action = button.dataset.control;

  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    if (action === "jump" && !input.touch.jump) input.touchJumpPressed = true;
    input.touch[action] = true;
    button.classList.add("active");
  };

  const release = (event) => {
    event.preventDefault();
    input.touch[action] = false;
    button.classList.remove("active");
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

class AudioEngine {
  constructor() {
    this.context = null;
    this.enabled = true;
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }
    if (this.context?.state === "suspended") this.context.resume();
  }

  tone(frequency, duration = 0.08, type = "square", volume = 0.045, delay = 0) {
    if (!this.enabled || !this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  jump() {
    this.tone(235, 0.11, "square", 0.035);
    this.tone(350, 0.08, "square", 0.025, 0.045);
  }

  coin() {
    this.tone(710, 0.08, "triangle", 0.05);
    this.tone(970, 0.09, "triangle", 0.04, 0.06);
  }

  stomp() {
    this.tone(150, 0.1, "square", 0.045);
  }

  hurt() {
    this.tone(135, 0.2, "sawtooth", 0.055);
  }

  checkpoint() {
    [440, 554, 659].forEach((note, index) => this.tone(note, 0.14, "triangle", 0.035, index * 0.08));
  }

  win() {
    [392, 523, 659, 784].forEach((note, index) => this.tone(note, 0.2, "triangle", 0.05, index * 0.1));
  }
}

const audio = new AudioEngine();

const P = (x, y, w, h, motion = null) => ({ x, y, w, h, motion });
const C = (x, y) => ({ x, y });
const H = (x, y, w, h = 22) => ({ x, y, w, h });
const E = (x, y, minX, maxX, speed = 72) => ({ x, y, minX, maxX, speed });

const levelBlueprints = [
  {
    name: "Sunset District",
    width: 4300,
    palette: {
      skyTop: "#291b55",
      skyBottom: "#f05d88",
      sun: "#ffd27a",
      far: "#3b2a6d",
      near: "#161933",
      platform: "#242b51",
      edge: "#62f4ff",
      accent: "#ff72bd",
    },
    start: { x: 92, y: 400 },
    platforms: [
      P(0, 470, 720, 70), P(850, 470, 700, 70), P(1660, 470, 620, 70),
      P(2420, 470, 880, 70), P(3420, 470, 880, 70),
      P(300, 390, 180, 24), P(570, 320, 150, 24), P(930, 370, 220, 24),
      P(1240, 295, 170, 24), P(1580, 390, 150, 24), P(1890, 330, 210, 24),
      P(2180, 275, 145, 24, { axis: "y", range: 62, speed: 1.25 }),
      P(2530, 380, 220, 24), P(2860, 305, 180, 24), P(3200, 380, 150, 24),
      P(3520, 320, 200, 24), P(3860, 255, 150, 24),
    ],
    hazards: [
      H(500, 448, 96), H(1050, 448, 88), H(1775, 448, 100), H(2620, 448, 92),
      H(3040, 448, 95), H(3690, 448, 92),
    ],
    coins: [
      C(350, 345), C(440, 345), C(610, 275), C(700, 275), C(910, 420), C(1015, 325),
      C(1120, 325), C(1290, 250), C(1380, 250), C(1605, 345), C(1700, 420), C(1940, 285),
      C(2045, 285), C(2225, 225), C(2500, 420), C(2600, 335), C(2700, 335), C(2900, 260),
      C(3000, 260), C(3235, 335), C(3460, 420), C(3570, 275), C(3680, 275), C(3900, 210),
      C(4000, 210), C(4140, 420),
    ],
    enemies: [E(980, 438, 900, 1030), E(1850, 438, 1750, 2180, 82), E(2680, 438, 2460, 2990, 88), E(3590, 438, 3460, 3820, 92)],
    checkpoints: [{ x: 2020, y: 410 }],
    goal: { x: 4115, y: 382, w: 58, h: 88 },
  },
  {
    name: "Midnight Heights",
    width: 4800,
    palette: {
      skyTop: "#071326",
      skyBottom: "#143e67",
      sun: "#c6f8ff",
      far: "#102e4d",
      near: "#081525",
      platform: "#172b46",
      edge: "#7ef9b4",
      accent: "#63b7ff",
    },
    start: { x: 88, y: 400 },
    platforms: [
      P(0, 470, 520, 70), P(760, 470, 560, 70), P(1450, 470, 620, 70),
      P(2230, 470, 620, 70), P(3020, 470, 680, 70), P(3890, 470, 910, 70),
      P(260, 360, 160, 24), P(525, 410, 150, 24, { axis: "x", range: 85, speed: 1.35 }),
      P(800, 340, 170, 24), P(1060, 275, 160, 24), P(1325, 380, 145, 24, { axis: "y", range: 70, speed: 1.15 }),
      P(1550, 350, 200, 24), P(1830, 280, 170, 24), P(2080, 390, 150, 24, { axis: "x", range: 70, speed: 1.4 }),
      P(2340, 330, 180, 24), P(2615, 255, 160, 24), P(2860, 390, 150, 24, { axis: "y", range: 76, speed: 1.3 }),
      P(3100, 350, 220, 24), P(3410, 275, 180, 24), P(3710, 390, 160, 24, { axis: "x", range: 78, speed: 1.5 }),
      P(3990, 330, 190, 24), P(4260, 255, 160, 24), P(4525, 350, 170, 24),
    ],
    hazards: [
      H(390, 448, 90), H(880, 448, 95), H(1180, 448, 95), H(1630, 448, 100),
      H(2360, 448, 90), H(2720, 448, 85), H(3190, 448, 105), H(3520, 448, 100), H(4100, 448, 100),
    ],
    coins: [
      C(295, 315), C(390, 315), C(560, 360), C(650, 360), C(820, 295), C(920, 295),
      C(1090, 230), C(1190, 230), C(1370, 330), C(1585, 305), C(1690, 305), C(1870, 235),
      C(1970, 235), C(2130, 340), C(2375, 285), C(2480, 285), C(2650, 210), C(2750, 210),
      C(2900, 340), C(3140, 305), C(3260, 305), C(3450, 230), C(3560, 230), C(3760, 340),
      C(4025, 285), C(4130, 285), C(4300, 210), C(4400, 210), C(4560, 305), C(4670, 305),
    ],
    enemies: [E(150, 438, 70, 350), E(840, 438, 790, 1160, 92), E(1740, 438, 1500, 2020, 96), E(2460, 438, 2260, 2760, 100), E(3230, 438, 3050, 3560, 104), E(4200, 438, 3940, 4500, 110)],
    checkpoints: [{ x: 2420, y: 410 }],
    goal: { x: 4660, y: 382, w: 58, h: 88 },
  },
  {
    name: "Aurora Core",
    width: 5200,
    palette: {
      skyTop: "#09091e",
      skyBottom: "#341958",
      sun: "#c9ff7a",
      far: "#23144a",
      near: "#100d29",
      platform: "#282052",
      edge: "#d6ff69",
      accent: "#b768ff",
    },
    start: { x: 88, y: 400 },
    platforms: [
      P(0, 470, 450, 70), P(650, 470, 550, 70), P(1380, 470, 530, 70),
      P(2100, 470, 560, 70), P(2840, 470, 620, 70), P(3650, 470, 600, 70), P(4430, 470, 770, 70),
      P(220, 350, 150, 24), P(465, 395, 140, 24, { axis: "x", range: 78, speed: 1.65 }),
      P(710, 315, 160, 24), P(970, 240, 150, 24), P(1215, 375, 145, 24, { axis: "y", range: 82, speed: 1.45 }),
      P(1470, 335, 170, 24), P(1730, 255, 150, 24), P(1940, 390, 145, 24, { axis: "x", range: 72, speed: 1.7 }),
      P(2200, 325, 170, 24), P(2470, 245, 150, 24), P(2675, 390, 145, 24, { axis: "y", range: 85, speed: 1.55 }),
      P(2930, 340, 190, 24), P(3210, 260, 170, 24), P(3470, 395, 145, 24, { axis: "x", range: 85, speed: 1.8 }),
      P(3740, 325, 180, 24), P(4020, 240, 165, 24), P(4260, 385, 150, 24, { axis: "y", range: 80, speed: 1.7 }),
      P(4520, 330, 180, 24), P(4790, 250, 160, 24),
    ],
    hazards: [
      H(330, 448, 90), H(720, 448, 95), H(1050, 448, 100), H(1500, 448, 100), H(1780, 448, 90),
      H(2240, 448, 100), H(2530, 448, 90), H(2970, 448, 105), H(3310, 448, 95), H(3740, 448, 100),
      H(4080, 448, 100), H(4560, 448, 105), H(4890, 448, 100),
    ],
    coins: [
      C(250, 305), C(345, 305), C(500, 345), C(585, 345), C(745, 270), C(845, 270),
      C(1000, 195), C(1100, 195), C(1250, 325), C(1500, 290), C(1600, 290), C(1760, 210),
      C(1850, 210), C(1980, 340), C(2235, 280), C(2335, 280), C(2500, 200), C(2590, 200),
      C(2710, 340), C(2960, 295), C(3070, 295), C(3240, 215), C(3350, 215), C(3510, 345),
      C(3770, 280), C(3890, 280), C(4050, 195), C(4150, 195), C(4300, 335), C(4550, 285),
      C(4660, 285), C(4820, 205), C(4920, 205), C(5080, 420),
    ],
    enemies: [E(100, 438, 60, 290, 100), E(770, 438, 680, 1030, 106), E(1520, 438, 1410, 1830, 112), E(2230, 438, 2140, 2520, 116), E(3040, 438, 2900, 3330, 120), E(3800, 438, 3690, 4140, 124), E(4660, 438, 4470, 4990, 128)],
    checkpoints: [{ x: 2280, y: 410 }, { x: 3890, y: 410 }],
    goal: { x: 5070, y: 382, w: 58, h: 88 },
  },
];

const game = {
  state: "menu",
  levelIndex: 0,
  level: null,
  player: null,
  cameraX: 0,
  elapsed: 0,
  totalElapsed: 0,
  score: 0,
  levelScoreStart: 0,
  lives: 3,
  particles: [],
  toastTimer: 0,
  shake: 0,
  best: Number(localStorage.getItem(STORAGE_KEY)) || 0,
};

function cloneLevel(blueprint) {
  return {
    ...blueprint,
    platforms: blueprint.platforms.map((platform, index) => ({
      ...platform,
      id: index,
      baseX: platform.x,
      baseY: platform.y,
      prevX: platform.x,
      prevY: platform.y,
      dx: 0,
      dy: 0,
    })),
    hazards: blueprint.hazards.map((hazard) => ({ ...hazard })),
    coins: blueprint.coins.map((coin, index) => ({ ...coin, id: index, collected: false, bob: index * 0.65 })),
    enemies: blueprint.enemies.map((enemy, index) => ({
      ...enemy,
      id: index,
      w: 38,
      h: 32,
      dir: index % 2 === 0 ? 1 : -1,
      alive: true,
    })),
    checkpoints: blueprint.checkpoints.map((checkpoint) => ({ ...checkpoint, reached: false })),
    goal: { ...blueprint.goal },
  };
}

function makePlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    prevX: spawn.x,
    prevY: spawn.y,
    w: 34,
    h: 48,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    standingOn: null,
    coyote: 0,
    jumpBuffer: 0,
    invulnerable: 0,
    spawn: { ...spawn },
    runCycle: 0,
  };
}

function loadLevel(index, resetRun = false) {
  game.levelIndex = index;
  game.level = cloneLevel(levelBlueprints[index]);
  game.player = makePlayer(game.level.start);
  game.cameraX = 0;
  game.elapsed = 0;
  game.particles = [];
  game.shake = 0;

  if (resetRun) {
    game.score = 0;
    game.totalElapsed = 0;
    game.lives = 3;
  }

  game.levelScoreStart = game.score;
  updateHud();
}

function beginGame() {
  audio.unlock();
  loadLevel(0, true);
  game.state = "playing";
  ui.startScreen.classList.add("hidden");
  ui.messageScreen.classList.add("hidden");
  showToast("LEVEL 1 · SUNSET DISTRICT");
}

function restartLevel() {
  if (game.state === "menu") return;
  const scoreAtLevelStart = game.levelScoreStart;
  const totalBeforeLevel = game.totalElapsed - game.elapsed;
  loadLevel(game.levelIndex, false);
  game.score = scoreAtLevelStart;
  game.levelScoreStart = scoreAtLevelStart;
  game.totalElapsed = Math.max(0, totalBeforeLevel);
  game.lives = 3;
  game.state = "playing";
  hideMessage();
  showToast("LEVEL NEU GESTARTET");
}

function nextLevel() {
  if (game.levelIndex >= levelBlueprints.length - 1) {
    beginGame();
    return;
  }

  loadLevel(game.levelIndex + 1, false);
  game.state = "playing";
  hideMessage();
  showToast(`LEVEL ${game.levelIndex + 1} · ${game.level.name.toUpperCase()}`);
}

function pauseToggle() {
  if (game.state === "playing") {
    game.state = "paused";
    showMessage("PAUSE", "Kurz durchatmen", "Drücke P oder Escape, um weiterzuspielen.", "WEITERSPIELEN", () => {
      game.state = "playing";
      hideMessage();
    });
  } else if (game.state === "paused") {
    game.state = "playing";
    hideMessage();
  }
}

function showMessage(eyebrow, title, text, buttonText, callback) {
  ui.messageEyebrow.textContent = eyebrow;
  ui.messageTitle.textContent = title;
  ui.messageText.textContent = text;
  ui.messageButton.textContent = buttonText;
  ui.messageButton.onclick = callback;
  ui.messageScreen.classList.remove("hidden");
}

function hideMessage() {
  ui.messageScreen.classList.add("hidden");
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  game.toastTimer = 2.2;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const remainder = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function updateHud() {
  if (!game.level) return;
  const collected = game.level.coins.filter((coin) => coin.collected).length;
  ui.level.textContent = `${game.levelIndex + 1} / ${levelBlueprints.length}`;
  ui.coins.textContent = `${collected} / ${game.level.coins.length}`;
  ui.lives.textContent = Array.from({ length: 3 }, (_, index) => (index < game.lives ? "♥" : "♡")).join(" ");
  ui.time.textContent = formatTime(game.totalElapsed);
  ui.best.textContent = game.best ? formatTime(game.best) : "–";
}

function rectsOverlap(a, b, inset = 0) {
  return a.x + inset < b.x + b.w && a.x + a.w - inset > b.x && a.y + inset < b.y + b.h && a.y + a.h - inset > b.y;
}

function updateMovingPlatforms(time) {
  for (const platform of game.level.platforms) {
    platform.prevX = platform.x;
    platform.prevY = platform.y;

    if (platform.motion) {
      const offset = Math.sin(time * platform.motion.speed + platform.id * 0.8) * platform.motion.range;
      if (platform.motion.axis === "x") platform.x = platform.baseX + offset;
      if (platform.motion.axis === "y") platform.y = platform.baseY + offset;
    }

    platform.dx = platform.x - platform.prevX;
    platform.dy = platform.y - platform.prevY;
  }
}

function updatePlayer(dt) {
  const player = game.player;
  player.prevX = player.x;
  player.prevY = player.y;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.coyote = player.onGround ? 0.11 : Math.max(0, player.coyote - dt);
  player.jumpBuffer = input.justPressed("jump") ? 0.13 : Math.max(0, player.jumpBuffer - dt);

  if (player.standingOn) {
    player.x += player.standingOn.dx;
    player.y += player.standingOn.dy;
  }

  const move = (input.down("right") ? 1 : 0) - (input.down("left") ? 1 : 0);
  const acceleration = player.onGround ? 2300 : 1450;
  const maxSpeed = 330;

  if (move !== 0) {
    player.vx += move * acceleration * dt;
    player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
    player.facing = move;
    player.runCycle += Math.abs(player.vx) * dt * 0.045;
  } else {
    const drag = player.onGround ? 0.78 : 0.93;
    player.vx *= Math.pow(drag, dt * 60);
    if (Math.abs(player.vx) < 2) player.vx = 0;
  }

  if (player.jumpBuffer > 0 && player.coyote > 0) {
    player.vy = -710;
    player.onGround = false;
    player.standingOn = null;
    player.coyote = 0;
    player.jumpBuffer = 0;
    spawnParticles(player.x + player.w / 2, player.y + player.h, "#7df8ff", 8, 120);
    audio.jump();
  }

  if (!input.down("jump") && player.vy < -250) player.vy += GRAVITY * 1.15 * dt;

  player.x += player.vx * dt;
  resolveHorizontal(player);

  player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY * dt);
  player.y += player.vy * dt;
  resolveVertical(player);

  player.x = Math.max(0, Math.min(game.level.width - player.w, player.x));

  if (player.y > VIEW_H + 150) hurtPlayer();

  for (const checkpoint of game.level.checkpoints) {
    if (!checkpoint.reached && player.x + player.w / 2 >= checkpoint.x) {
      checkpoint.reached = true;
      player.spawn = { x: checkpoint.x + 18, y: checkpoint.y - player.h };
      game.score += 250;
      audio.checkpoint();
      spawnParticles(checkpoint.x, checkpoint.y - 34, "#ffe66d", 20, 180);
      showToast("CHECKPOINT ERREICHT");
    }
  }
}

function resolveHorizontal(player) {
  for (const platform of game.level.platforms) {
    if (!rectsOverlap(player, platform)) continue;
    if (player.vx > 0 && player.prevX + player.w <= platform.prevX + 5) {
      player.x = platform.x - player.w;
      player.vx = 0;
    } else if (player.vx < 0 && player.prevX >= platform.prevX + platform.w - 5) {
      player.x = platform.x + platform.w;
      player.vx = 0;
    }
  }
}

function resolveVertical(player) {
  const previousBottom = player.prevY + player.h;
  const previousTop = player.prevY;
  const currentBottom = player.y + player.h;
  const currentTop = player.y;
  player.onGround = false;
  player.standingOn = null;

  for (const platform of game.level.platforms) {
    const horizontalOverlap = player.x + player.w - 5 > platform.x && player.x + 5 < platform.x + platform.w;
    if (!horizontalOverlap) continue;

    if (player.vy >= 0 && previousBottom <= platform.prevY + 7 && currentBottom >= platform.y && currentBottom <= platform.y + platform.h + 30) {
      player.y = platform.y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.standingOn = platform;
    } else if (player.vy < 0 && previousTop >= platform.prevY + platform.h - 7 && currentTop <= platform.y + platform.h) {
      player.y = platform.y + platform.h;
      player.vy = 0;
    }
  }
}

function updateEnemies(dt) {
  const player = game.player;

  for (const enemy of game.level.enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.dir * enemy.speed * dt;
    if (enemy.x <= enemy.minX) {
      enemy.x = enemy.minX;
      enemy.dir = 1;
    } else if (enemy.x + enemy.w >= enemy.maxX) {
      enemy.x = enemy.maxX - enemy.w;
      enemy.dir = -1;
    }

    if (!rectsOverlap(player, enemy, 4)) continue;
    const stomped = player.vy > 140 && player.prevY + player.h <= enemy.y + 10;
    if (stomped) {
      enemy.alive = false;
      player.vy = -455;
      game.score += 180;
      audio.stomp();
      spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, game.level.palette.accent, 16, 190);
    } else {
      hurtPlayer();
      break;
    }
  }
}

function updateCoins() {
  const player = game.player;
  for (const coin of game.level.coins) {
    if (coin.collected) continue;
    const hitbox = { x: coin.x - 13, y: coin.y - 16, w: 26, h: 32 };
    if (rectsOverlap(player, hitbox)) {
      coin.collected = true;
      game.score += 100;
      audio.coin();
      spawnParticles(coin.x, coin.y, "#ffe66d", 12, 150);
    }
  }
}

function updateHazards() {
  const player = game.player;
  for (const hazard of game.level.hazards) {
    if (rectsOverlap(player, { x: hazard.x + 5, y: hazard.y + 7, w: hazard.w - 10, h: hazard.h - 7 }, 3)) {
      hurtPlayer();
      return;
    }
  }
}

function hurtPlayer() {
  const player = game.player;
  if (player.invulnerable > 0 || game.state !== "playing") return;

  game.lives -= 1;
  game.shake = 0.32;
  audio.hurt();
  spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "#ff4f8b", 18, 210);

  if (game.lives <= 0) {
    game.state = "gameOver";
    showMessage("GAME OVER", "Fast geschafft", `Punkte: ${game.score}. Versuch es noch einmal – die Checkpoints kennst du jetzt.`, "NOCHMAL", () => {
      loadLevel(0, true);
      game.state = "playing";
      hideMessage();
      showToast("NEUER VERSUCH");
    });
    updateHud();
    return;
  }

  player.x = player.spawn.x;
  player.y = player.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.invulnerable = 1.35;
  player.standingOn = null;
  game.cameraX = Math.max(0, player.x - 220);
  showToast("LEBEN VERLOREN");
  updateHud();
}

function checkGoal() {
  if (!rectsOverlap(game.player, game.level.goal, 3)) return;

  game.state = "levelComplete";
  game.score += 1000 + game.lives * 250;
  audio.win();

  if (game.levelIndex < levelBlueprints.length - 1) {
    showMessage(
      "LEVEL GESCHAFFT",
      game.levelIndex === 0 ? "Der Himmel wird dunkel" : "Nur noch der Kern",
      `${game.level.coins.filter((coin) => coin.collected).length} Kristalle gesammelt · ${formatTime(game.elapsed)}`,
      "NÄCHSTES LEVEL",
      nextLevel,
    );
  } else {
    const runTime = Math.max(1, Math.round(game.totalElapsed));
    const isBest = !game.best || runTime < game.best;
    if (isBest) {
      game.best = runTime;
      localStorage.setItem(STORAGE_KEY, String(runTime));
    }
    showMessage(
      "SPIEL GESCHAFFT",
      isBest ? "Neuer Bestwert!" : "Skyline bezwungen!",
      `Zeit: ${formatTime(runTime)} · Punkte: ${game.score}`,
      "NOCH EIN LAUF",
      beginGame,
    );
  }
  updateHud();
}

function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 35,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 480 * dt;
    particle.vx *= Math.pow(0.97, dt * 60);
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function update(dt) {
  if (input.justPressed("mute")) toggleSound();
  if (input.justPressed("pause") && ["playing", "paused"].includes(game.state)) pauseToggle();
  if (input.justPressed("restart") && game.state !== "menu") restartLevel();

  if (game.toastTimer > 0) {
    game.toastTimer -= dt;
    if (game.toastTimer <= 0) ui.toast.classList.remove("show");
  }

  if (game.state !== "playing") {
    updateParticles(dt);
    input.endFrame();
    return;
  }

  game.elapsed += dt;
  game.totalElapsed += dt;
  game.shake = Math.max(0, game.shake - dt);

  updateMovingPlatforms(game.elapsed);
  updatePlayer(dt);
  updateEnemies(dt);
  updateCoins();
  updateHazards();
  checkGoal();
  updateParticles(dt);

  const targetCamera = Math.max(0, Math.min(game.level.width - VIEW_W, game.player.x - VIEW_W * 0.34));
  game.cameraX += (targetCamera - game.cameraX) * Math.min(1, dt * 5.5);
  updateHud();
  input.endFrame();
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawBackground() {
  const palette = game.level?.palette || levelBlueprints[0].palette;
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const camera = game.cameraX || 0;
  const sunX = 770 - (camera * 0.035) % 120;
  const sunY = game.levelIndex === 0 ? 125 : 110;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 105);
  sunGlow.addColorStop(0, `${palette.sun}aa`);
  sunGlow.addColorStop(0.3, `${palette.sun}55`);
  sunGlow.addColorStop(1, "transparent");
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 105, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.sun;
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.arc(sunX, sunY, game.levelIndex === 0 ? 42 : 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 44; i += 1) {
    const x = ((i * 173 + 67) % 1040) - (camera * (0.025 + (i % 3) * 0.012)) % 1040;
    const wrappedX = (x + 1040) % 1040;
    const y = 30 + ((i * 83) % 270);
    const twinkle = 0.35 + Math.sin(game.totalElapsed * 2 + i) * 0.22;
    ctx.globalAlpha = game.levelIndex === 0 ? twinkle * 0.35 : twinkle;
    ctx.fillStyle = i % 5 === 0 ? palette.edge : "#ffffff";
    ctx.fillRect(wrappedX, y, i % 7 === 0 ? 2.5 : 1.5, i % 7 === 0 ? 2.5 : 1.5);
  }
  ctx.globalAlpha = 1;

  drawMountainLayer(camera * 0.08, 325, 75, palette.far, 210);
  drawMountainLayer(camera * 0.16, 390, 96, palette.near, 175);
  drawCityLayer(camera * 0.28, palette.near);
}

function drawMountainLayer(offset, baseline, height, color, spacing) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  ctx.lineTo(0, baseline);
  const shift = -(offset % spacing);
  for (let x = shift - spacing; x <= VIEW_W + spacing; x += spacing) {
    const variance = Math.sin((x + offset) * 0.021) * height * 0.23;
    ctx.lineTo(x + spacing * 0.25, baseline - height * 0.55 - variance);
    ctx.lineTo(x + spacing * 0.55, baseline - height - variance * 0.5);
    ctx.lineTo(x + spacing, baseline);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fill();
}

function drawCityLayer(offset, color) {
  const shift = -(offset % 140);
  ctx.fillStyle = color;
  for (let i = -1; i < 10; i += 1) {
    const x = shift + i * 140;
    const h = 65 + ((i * 47 + 190) % 95);
    const w = 75 + ((i * 23 + 100) % 44);
    ctx.fillRect(x, VIEW_H - h - 45, w, h + 45);
    ctx.fillStyle = "rgba(126, 249, 220, 0.13)";
    for (let wy = VIEW_H - h - 30; wy < VIEW_H - 62; wy += 20) {
      for (let wx = x + 12; wx < x + w - 8; wx += 20) ctx.fillRect(wx, wy, 5, 8);
    }
    ctx.fillStyle = color;
  }
}

function drawWorld() {
  const shakeX = game.shake > 0 ? (Math.random() - 0.5) * 10 : 0;
  const shakeY = game.shake > 0 ? (Math.random() - 0.5) * 7 : 0;
  ctx.save();
  ctx.translate(-game.cameraX + shakeX, shakeY);

  drawCheckpoints();
  drawPlatforms();
  drawHazards();
  drawGoal();
  drawCoins();
  drawEnemies();
  drawParticles();
  drawPlayer();

  ctx.restore();
}

function drawPlatforms() {
  const palette = game.level.palette;
  for (const platform of game.level.platforms) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    roundedRect(ctx, platform.x + 8, platform.y + 10, platform.w, platform.h, 7);
    ctx.fill();

    const body = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
    body.addColorStop(0, palette.platform);
    body.addColorStop(1, "#0a0e1c");
    ctx.fillStyle = body;
    roundedRect(ctx, platform.x, platform.y, platform.w, platform.h, 7);
    ctx.fill();

    ctx.fillStyle = palette.edge;
    ctx.globalAlpha = 0.84;
    roundedRect(ctx, platform.x + 2, platform.y, platform.w - 4, Math.min(6, platform.h), 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (platform.motion) {
      ctx.fillStyle = `${palette.edge}44`;
      for (let x = platform.x + 15; x < platform.x + platform.w - 8; x += 24) ctx.fillRect(x, platform.y + 12, 12, 3);
    }
  }
}

function drawHazards() {
  for (const hazard of game.level.hazards) {
    const count = Math.max(1, Math.round(hazard.w / 20));
    const spikeWidth = hazard.w / count;
    for (let i = 0; i < count; i += 1) {
      const x = hazard.x + i * spikeWidth;
      const gradient = ctx.createLinearGradient(x, hazard.y, x, hazard.y + hazard.h);
      gradient.addColorStop(0, "#fff2f8");
      gradient.addColorStop(0.35, "#ff6aa7");
      gradient.addColorStop(1, "#9e245f");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, hazard.y + hazard.h);
      ctx.lineTo(x + spikeWidth / 2, hazard.y);
      ctx.lineTo(x + spikeWidth, hazard.y + hazard.h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawCoins() {
  for (const coin of game.level.coins) {
    if (coin.collected) continue;
    const y = coin.y + Math.sin(game.elapsed * 4 + coin.bob) * 6;
    const pulse = 1 + Math.sin(game.elapsed * 5 + coin.bob) * 0.08;
    ctx.save();
    ctx.translate(coin.x, y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#ffe66d";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffe66d";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, -4);
    ctx.lineTo(7, 11);
    ctx.lineTo(0, 16);
    ctx.lineTo(-7, 11);
    ctx.lineTo(-10, -4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(-2, -9);
    ctx.lineTo(4, -4);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemies() {
  for (const enemy of game.level.enemies) {
    if (!enemy.alive) continue;
    const squash = 1 + Math.sin(game.elapsed * 6 + enemy.id) * 0.04;
    ctx.save();
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h);
    ctx.scale(1 / squash, squash);
    ctx.shadowColor = game.level.palette.accent;
    ctx.shadowBlur = 13;
    const gradient = ctx.createLinearGradient(0, -enemy.h, 0, 0);
    gradient.addColorStop(0, game.level.palette.accent);
    gradient.addColorStop(1, "#4a226f");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-enemy.w / 2, 0);
    ctx.quadraticCurveTo(-enemy.w / 2 - 1, -enemy.h * 0.72, -8, -enemy.h);
    ctx.quadraticCurveTo(0, -enemy.h - 8, 9, -enemy.h);
    ctx.quadraticCurveTo(enemy.w / 2 + 1, -enemy.h * 0.68, enemy.w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0c0e20";
    ctx.fillRect(-9, -21, 4, 6);
    ctx.fillRect(6, -21, 4, 6);
    ctx.restore();
  }
}

function drawPlayer() {
  const player = game.player;
  if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;

  const moving = Math.abs(player.vx) > 15 && player.onGround;
  const legSwing = moving ? Math.sin(player.runCycle) * 5 : 0;
  const lean = Math.max(-0.12, Math.min(0.12, player.vx / 1800));

  ctx.save();
  ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
  ctx.scale(player.facing, 1);
  ctx.rotate(lean);

  ctx.strokeStyle = "#ff4fb8";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-10, -5);
  ctx.quadraticCurveTo(-25 - Math.abs(player.vx) * 0.025, 2, -29 - Math.abs(player.vx) * 0.04, 13);
  ctx.stroke();

  ctx.strokeStyle = "#11162c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-7, 15);
  ctx.lineTo(-8 + legSwing, 23);
  ctx.moveTo(7, 15);
  ctx.lineTo(8 - legSwing, 23);
  ctx.stroke();

  const suit = ctx.createLinearGradient(-15, -20, 15, 20);
  suit.addColorStop(0, "#73fbff");
  suit.addColorStop(1, "#4c7cff");
  ctx.fillStyle = suit;
  ctx.shadowColor = "#55f5ff";
  ctx.shadowBlur = 16;
  roundedRect(ctx, -14, -17, 28, 36, 9);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#eafcff";
  roundedRect(ctx, -12, -24, 24, 19, 8);
  ctx.fill();
  ctx.fillStyle = "#11162d";
  ctx.fillRect(3, -18, 4, 4);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(-8, -20, 8, 3);

  ctx.strokeStyle = "#d9fbff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(11, -4);
  ctx.lineTo(17, 5 + (moving ? Math.sin(player.runCycle + 1) * 3 : 0));
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoints() {
  for (const checkpoint of game.level.checkpoints) {
    ctx.fillStyle = checkpoint.reached ? "#ffe66d" : "rgba(255,255,255,0.35)";
    ctx.fillRect(checkpoint.x, checkpoint.y - 68, 4, 68);
    ctx.shadowColor = checkpoint.reached ? "#ffe66d" : "transparent";
    ctx.shadowBlur = checkpoint.reached ? 16 : 0;
    ctx.beginPath();
    ctx.moveTo(checkpoint.x + 4, checkpoint.y - 66);
    ctx.lineTo(checkpoint.x + 34, checkpoint.y - 56);
    ctx.lineTo(checkpoint.x + 4, checkpoint.y - 44);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawGoal() {
  const goal = game.level.goal;
  const pulse = 0.75 + Math.sin(game.elapsed * 4) * 0.12;
  ctx.save();
  ctx.translate(goal.x + goal.w / 2, goal.y + goal.h / 2);
  ctx.shadowColor = game.level.palette.edge;
  ctx.shadowBlur = 32;
  ctx.strokeStyle = game.level.palette.edge;
  ctx.lineWidth = 7;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.ellipse(0, 0, goal.w * 0.43, goal.h * 0.48, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = game.level.palette.edge;
  ctx.beginPath();
  ctx.ellipse(0, 0, goal.w * 0.31, goal.h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.18, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.69);
  vignette.addColorStop(0.55, "transparent");
  vignette.addColorStop(1, "rgba(0,0,12,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "rgba(255,255,255,0.018)";
  for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
}

function draw() {
  drawBackground();
  if (game.level && game.player) drawWorld();
  drawVignette();
}

function toggleSound() {
  audio.unlock();
  audio.enabled = !audio.enabled;
  ui.sound.textContent = audio.enabled ? "TON: AN" : "TON: AUS";
  ui.sound.setAttribute("aria-pressed", String(!audio.enabled));
  if (audio.enabled) audio.tone(620, 0.08, "triangle", 0.04);
}

ui.startButton.addEventListener("click", beginGame);
ui.sound.addEventListener("click", toggleSound);

let previousTime = performance.now();

function frame(currentTime) {
  const dt = Math.min(0.033, Math.max(0, (currentTime - previousTime) / 1000));
  previousTime = currentTime;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

loadLevel(0, true);
game.state = "menu";
updateHud();
requestAnimationFrame(frame);
