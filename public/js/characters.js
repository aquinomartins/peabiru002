(function (root) {
  const CHARACTER_SHEETS = {
    initialCrowd: {
      key: 'initialCrowd',
      src: '/characters/open-peeps-sheet.png',
      cols: 15,
      rows: 7,
    },
    participatory: {
      key: 'participatory',
      src: '/characters/personas.png',
      cols: 15,
      rows: 7,
    },
  };

  const PARTICIPANT_CHARACTERS = [
    { type: 'persona_01', label: 'Persona 001', note: 'contribuição do público / deslocamento contínuo', speed: 0.3, rhythm: 0.8, field: 0.45, hue: 126, spriteIndex: 12 },
    { type: 'persona_02', label: 'Persona 002', note: 'contribuição do público / presença lenta', speed: 0.16, rhythm: 0.55, field: 0.68, hue: 194, spriteIndex: 44 },
    { type: 'persona_03', label: 'Persona 003', note: 'contribuição do público / travessia densa', speed: 0.24, rhythm: 0.65, field: 0.74, hue: 45, spriteIndex: 81 },
  ];

  const CHARACTER_TYPES = PARTICIPANT_CHARACTERS.reduce((types, character) => {
    types[character.type] = {
      zone: 'lower',
      scaleMin: 0.42,
      scaleMax: 0.9,
      speedMin: character.type === 'persona_02' ? 0.04 : character.type === 'persona_03' ? 0.05 : 0.08,
      speedMax: character.type === 'persona_02' ? 0.42 : character.type === 'persona_03' ? 0.5 : 0.55,
      rhythmMin: character.type === 'persona_01' ? 0.35 : 0.25,
      rhythmMax: character.type === 'persona_01' ? 1.4 : character.type === 'persona_02' ? 1.15 : 1.25,
      fieldMin: character.type === 'persona_01' ? 0.18 : character.type === 'persona_02' ? 0.22 : 0.2,
      fieldMax: character.type === 'persona_01' ? 0.85 : 1,
      radiusMin: character.type === 'persona_01' ? 0.07 : character.type === 'persona_02' ? 0.1 : 0.09,
      radiusMax: character.type === 'persona_01' ? 0.18 : 0.24,
      spriteIndex: character.spriteIndex,
      hue: character.hue,
    };
    return types;
  }, {});

  const catalog = { CHARACTER_SHEETS, PARTICIPANT_CHARACTERS, CHARACTER_TYPES };

  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
  root.CorreriaCharacters = catalog;
}(typeof window !== 'undefined' ? window : globalThis));
