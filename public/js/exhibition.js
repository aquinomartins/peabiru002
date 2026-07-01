const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const socket = window.Nuvens.createSocket();
const connectionStatus = document.querySelector('#connectionStatus');

const { CHARACTER_SHEETS } = window.CorreriaCharacters;
const SHEETS = CHARACTER_SHEETS;
const PARTICIPANT_LIMIT = 80;
const EVAPORATION_TIME = 1000 * 60 * 2;
const INITIAL_CROWD_MULTIPLIER = 3;
const CHARACTER_DISPLAY_SCALE = 1.25;
const CROWD_TOP_RATIO = 0.18;
const CROWD_BOTTOM_RATIO = 1.94;

const sheets = new Map();
const allPeeps = [];
const availableInitialPeeps = [];
const crowd = [];
const participantCharacters = new Map();
let dpr = 1;
let width = innerWidth;
let height = innerHeight;
let lastTime = performance.now();
let initialCrowdReady = false;

const randomRange = (min, max) => min + Math.random() * (max - min);
const randomIndex = (array) => randomRange(0, array.length) | 0;
const removeFromArray = (array, i) => array.splice(i, 1)[0];
const removeItemFromArray = (array, item) => {
  const index = array.indexOf(item);
  return index >= 0 ? removeFromArray(array, index) : null;
};
const removeRandomFromArray = (array) => removeFromArray(array, randomIndex(array));

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function easePower2In(value) { return value * value; }
function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function randomFrom(seed) {
  let state = seed >>> 0;
  return () => { state = Math.imul(state + 0x6d2b79f5, 1 | state); state ^= state + Math.imul(state ^ (state >>> 7), 61 | state); return ((state ^ (state >>> 14)) >>> 0) / 4294967296; };
}

class Peep {
  constructor({ id = null, source, image, rect, participant = false }) {
    this.id = id;
    this.source = source;
    this.image = image;
    this.rect = rect;
    this.width = rect[2];
    this.height = rect[3];
    this.participant = participant;
    this.x = 0;
    this.y = 0;
    this.anchorY = 0;
    this.scaleX = 1;
    this.displayScale = CHARACTER_DISPLAY_SCALE;
    this.progress = 0;
    this.timeScale = 1;
    this.opacity = 1;
    this.createdAt = Date.now();
    this.life = Infinity;
    this.dissolvingFrom = null;
  }

  render(context, nowMs) {
    const fade = dissolveFactor(this, Date.now());
    if (fade <= 0) return;
    const bobProgress = (this.progress * 10 / 0.25) % 1;
    const bob = bobProgress < 0.5 ? bobProgress * 2 : (1 - bobProgress) * 2; //const bob = bobProgress < 0.5 ? bobProgress * 2 : (1 - bobProgress) * 2;
    const y = this.anchorY - (5 * bob);

    context.save();
    context.globalAlpha = this.opacity * fade;
    context.translate(this.x, y);
    context.scale(this.scaleX * this.displayScale, this.displayScale);
    context.drawImage(this.image, ...this.rect, 0, 0, this.width, this.height);
    context.restore();
  }
}

function setConnectionError(message) {
  if (!connectionStatus) return;
  connectionStatus.textContent = message;
  connectionStatus.hidden = !message;
}

function getSheetCell(source, spriteIndex) {
  const sheet = sheets.get(source);
  if (!sheet?.image.complete || sheet.image.naturalWidth === 0) return null;
  const { rows, cols } = sheet.config;
  const index = clamp(spriteIndex, 0, rows * cols - 1, 0);
  const rectWidth = sheet.image.naturalWidth / cols;
  const rectHeight = sheet.image.naturalHeight / rows;
  return [
    (index % cols) * rectWidth,
    (index / cols | 0) * rectHeight,
    rectWidth,
    rectHeight,
  ];
}

function createInitialPeeps() {
  const sheet = sheets.get('initialCrowd');
  if (!sheet?.image.complete || sheet.image.naturalWidth === 0) return;
  allPeeps.length = 0;
  const total = sheet.config.cols * sheet.config.rows;
  for (let cycle = 0; cycle < INITIAL_CROWD_MULTIPLIER; cycle += 1) {
    for (let i = 0; i < total; i += 1) {
      allPeeps.push(new Peep({
        source: 'initialCrowd',
        image: sheet.image,
        rect: getSheetCell('initialCrowd', i),
      }));
    }
  }
  initialCrowdReady = true;
  resetCrowd();
}

function loadSheets() {
  Object.entries(SHEETS).forEach(([key, config]) => {
    const image = new Image();
    image.onload = () => {
      if (key === 'initialCrowd') createInitialPeeps();
      if (key === 'participatory') participantCharacters.forEach((character) => ensureParticipantPeep(character));
    };
    image.src = config.src;
    sheets.set(key, { config, image });
  });
}

function resetPeep(peep, { startProgress = 0 } = {}) {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const scaledWidth = peep.width * CHARACTER_DISPLAY_SCALE;
  const scaledHeight = peep.height * CHARACTER_DISPLAY_SCALE;
  const verticalDepth = easePower2In(Math.random());
  const minTop = height * CROWD_TOP_RATIO;
  const maxTop = Math.max(minTop, height * CROWD_BOTTOM_RATIO - scaledHeight);
  const startY = minTop + (maxTop - minTop) * verticalDepth;
  let startX;
  let endX;

  if (direction === 1) {
    startX = -scaledWidth;
    endX = width;
    peep.scaleX = 1;
  } else {
    startX = width + scaledWidth;
    endX = 0;
    peep.scaleX = -1;
  }

  peep.startX = startX;
  peep.endX = endX;
  peep.x = startX;
  peep.y = startY;
  peep.anchorY = startY;
  peep.progress = startProgress;
  peep.timeScale = randomRange(0.5, 1.5);
  updatePeepPosition(peep, 0);
  return peep;
}

function addPeepToCrowd(peep, options) {
  resetPeep(peep, options);
  crowd.push(peep);
  sortCrowd();
  return peep;
}

function removePeepFromCrowd(peep) {
  removeItemFromArray(crowd, peep);
  if (!peep.participant) availableInitialPeeps.push(peep);
}

function resetCrowd() {
  crowd.length = 0;
  availableInitialPeeps.length = 0;
  availableInitialPeeps.push(...allPeeps);
  while (availableInitialPeeps.length) addPeepToCrowd(removeRandomFromArray(availableInitialPeeps), { startProgress: Math.random() });
  participantCharacters.forEach((character) => {
    character.peep = null;
    ensureParticipantPeep(character);
  });
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth || innerWidth;
  height = canvas.clientHeight || innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (initialCrowdReady) resetCrowd();
}

function normalizeParticipant(character) {
  const seed = character.seed || hashString(`${character.id}:${character.type}`);
  const rnd = randomFrom(seed);
  return {
    id: character.id,
    source: 'participatory',
    spriteIndex: clamp(character.spriteIndex, 0, SHEETS.participatory.cols * SHEETS.participatory.rows - 1, 0),
    opacity: clamp(character.opacity, 0, 1, 0.96),
    createdAt: character.createdAt || Date.now(),
    life: clamp(character.life, 1000 * 60 * 4, 1000 * 60 * 20, 1000 * 60 * 8),
    dissolvingFrom: character.dissolvingFrom,
    startProgress: clamp(character.x, 0, 1, rnd()),
    peep: null,
  };
}

function ensureParticipantPeep(character) {
  if (character.peep || crowd.some((peep) => peep.id === character.id)) return;
  const sheet = sheets.get('participatory');
  const rect = getSheetCell('participatory', character.spriteIndex);
  if (!sheet?.image || !rect) return;
  const peep = new Peep({ id: character.id, source: 'participatory', image: sheet.image, rect, participant: true });
  peep.opacity = character.opacity;
  peep.createdAt = character.createdAt;
  peep.life = character.life;
  peep.dissolvingFrom = character.dissolvingFrom;
  character.peep = peep;
  addPeepToCrowd(peep, { startProgress: character.startProgress });
}

function upsertParticipant(character) {
  const normalized = normalizeParticipant(character);
  const previous = participantCharacters.get(normalized.id);
  if (previous?.peep) {
    normalized.peep = previous.peep;
    normalized.peep.opacity = normalized.opacity;
    normalized.peep.life = normalized.life;
    normalized.peep.dissolvingFrom = normalized.dissolvingFrom;
  }
  participantCharacters.set(normalized.id, normalized);
  ensureParticipantPeep(normalized);
}

function rebuildScene() {
  socket.emit('agent:join', {}, (response) => { if (!response?.ok) setConnectionError(response?.error || 'Conexão instável. Reconstruindo a cena…'); });
  socket.emit('scene:request-state');
}
socket.on('connect', () => { setConnectionError(''); rebuildScene(); });
socket.io.on('reconnect', () => { setConnectionError(''); rebuildScene(); });
socket.io.on('reconnect_attempt', () => setConnectionError('Reconectando à cena…'));
socket.io.on('reconnect_error', () => setConnectionError('Conexão instável. A cena será restaurada automaticamente.'));
socket.io.on('reconnect_failed', () => setConnectionError('Sem conexão com o servidor. Verifique a rede local.'));
socket.on('disconnect', () => setConnectionError('Reconectando à cena…'));
socket.on('connect_error', () => setConnectionError('Conexão instável. Tentando novamente…'));
socket.on('scene:state', (state) => {
  [...participantCharacters.values()].forEach((character) => { if (character.peep) removePeepFromCrowd(character.peep); });
  participantCharacters.clear();
  (state.characters || []).slice(-PARTICIPANT_LIMIT).forEach(upsertParticipant);
});
socket.on('character:create', upsertParticipant);
socket.on('character:update', (character) => upsertParticipant({ ...(participantCharacters.get(character.id) || {}), ...character }));
socket.on('character:remove', ({ id }) => {
  const character = participantCharacters.get(id);
  if (character?.peep) character.peep.dissolvingFrom = Date.now();
  if (character) character.dissolvingFrom = Date.now();
});
socket.on('scene:reset', () => {
  [...participantCharacters.values()].forEach((character) => { if (character.peep) removePeepFromCrowd(character.peep); });
  participantCharacters.clear();
});

function updatePeepPosition(peep, dt) {
  peep.progress += (dt * peep.timeScale) / 1;
  if (peep.progress >= 1) {
    if (peep.participant) resetPeep(peep);
    else {
      removePeepFromCrowd(peep);
      addPeepToCrowd(removeRandomFromArray(availableInitialPeeps));
      return;
    }
  }
  peep.x = peep.startX + (peep.endX - peep.startX) * peep.progress;
}

function updateCrowd(dt) {
  const now = Date.now();
  [...crowd].forEach((peep) => {
    updatePeepPosition(peep, dt);
    if (peep.participant && dissolveFactor(peep, now) <= 0) {
      removePeepFromCrowd(peep);
      participantCharacters.delete(peep.id);
    }
  });
  sortCrowd();
}
function sortCrowd() { crowd.sort((a, b) => a.anchorY - b.anchorY); }
function dissolveFactor(character, now) {
  const age = now - (character.createdAt || now);
  const ttlFade = age > character.life ? Math.max(0, 1 - (age - character.life) / EVAPORATION_TIME) : 1;
  const removalFade = character.dissolvingFrom ? Math.max(0, 1 - (now - character.dissolvingFrom) / 9000) : 1;
  return Math.min(ttlFade, removalFade);
}
function drawBackground() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}
function render(nowMs) {
  const dt = Math.min(0.08, (nowMs - lastTime) / 1000);
  lastTime = nowMs;
  updateCrowd(dt);
  drawBackground();
  crowd.forEach((peep) => peep.render(ctx, nowMs));
  requestAnimationFrame(render);
}

loadSheets();
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(render);
