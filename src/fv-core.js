window.FVCore = (() => {
  'use strict';
  const enc = new TextEncoder();

  /* ---------- zip (stored, no compression) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files, date = new Date()) {
    const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xFFFF;
    const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
    const parts = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, day, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, day, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    for (const c of all) { out.set(c, p); p += c.length; }
    return out;
  }

  /* ---------- names and ids ---------- */
  function slug(s, fallback) {
    let t = String(s || '').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32).replace(/_+$/g, '');
    if (!t) t = fallback;
    if (/^[0-9]/.test(t)) t = 'f_' + t;
    return t;
  }
  function itemIds(items) {
    const used = new Set();
    return items.map(it => { const b = slug(it.name, it.type === 'armor' ? 'rustning' : 'foremal'); let id = b, n = 2; while (used.has(id)) id = b + '_' + n++; used.add(id); return id; });
  }

  /* ---------- game data ---------- */
  const TIERS = {
    wood:      { label:'Trä',      speed:2,  tag:'minecraft:wooden_tier',    dur:59,   dmg:2, ench:15 },
    stone:     { label:'Sten',     speed:4,  tag:'minecraft:stone_tier',     dur:131,  dmg:3, ench:5 },
    iron:      { label:'Järn',     speed:6,  tag:'minecraft:iron_tier',      dur:250,  dmg:4, ench:14 },
    gold:      { label:'Guld',     speed:12, tag:'minecraft:golden_tier',    dur:32,   dmg:2, ench:22 },
    diamond:   { label:'Diamant',  speed:8,  tag:'minecraft:diamond_tier',   dur:1561, dmg:5, ench:10 },
    netherite: { label:'Netherit', speed:9,  tag:'minecraft:netherite_tier', dur:2031, dmg:6, ench:15 }
  };
  const TOOLKIND = {
    pickaxe: { label:'Hacka', tag:'minecraft:is_pickaxe', dig:'minecraft:is_pickaxe_item_destructible', slot:'pickaxe', extra:0 },
    axe:     { label:'Yxa',   tag:'minecraft:is_axe',     dig:'minecraft:is_axe_item_destructible',     slot:'axe',     extra:2 },
    shovel:  { label:'Spade', tag:'minecraft:is_shovel',  dig:'minecraft:is_shovel_item_destructible',  slot:'shovel',  extra:0 }
  };
  const toolDamage = it => TIERS[it.tool.tier].dmg + TOOLKIND[it.tool.kind].extra;

  /* ---------- armor data ---------- */
  const PIECES = [
    { key:'head',  label:'Hjälm',     suffix:'hjalm',     slot:'slot.armor.head',  ench:'armor_head',  geo:'helmet',     vis:'helmet_layer_visible', layer:1, eq:'Head',  tpl:'helmet',     dur:11 },
    { key:'chest', label:'Bröstplåt', suffix:'brostplat', slot:'slot.armor.chest', ench:'armor_torso', geo:'chestplate', vis:'chest_layer_visible',  layer:1, eq:'Chest', tpl:'chestplate', dur:16 },
    { key:'legs',  label:'Byxor',     suffix:'byxor',     slot:'slot.armor.legs',  ench:'armor_legs',  geo:'leggings',   vis:'leg_layer_visible',    layer:2, eq:'Legs',  tpl:'leggings',   dur:15 },
    { key:'feet',  label:'Kängor',    suffix:'kangor',    slot:'slot.armor.feet',  ench:'armor_feet',  geo:'boots',      vis:'boot_layer_visible',   layer:1, eq:'Feet',  tpl:'boots',      dur:13 }
  ];
  const PIECE = Object.fromEntries(PIECES.map(p => [p.key, p]));
  const ARMOR_MAT = {
    leather:   { label:'Läder',      prot:{ head:1, chest:3, legs:2, feet:1 }, mul:5,  ench:15, repair:'minecraft:leather' },
    chain:     { label:'Ringbrynja', prot:{ head:2, chest:5, legs:4, feet:1 }, mul:15, ench:12, repair:'minecraft:iron_ingot' },
    iron:      { label:'Järn',       prot:{ head:2, chest:6, legs:5, feet:2 }, mul:15, ench:9,  repair:'minecraft:iron_ingot' },
    gold:      { label:'Guld',       prot:{ head:2, chest:5, legs:3, feet:1 }, mul:7,  ench:25, repair:'minecraft:gold_ingot' },
    diamond:   { label:'Diamant',    prot:{ head:3, chest:8, legs:6, feet:3 }, mul:33, ench:10, repair:'minecraft:diamond' },
    netherite: { label:'Netherit',   prot:{ head:3, chest:8, legs:6, feet:3 }, mul:37, ench:15, repair:'minecraft:netherite_ingot' }
  };
  const REPAIR = [
    ['none', 'Inget'], ['minecraft:leather', 'Läder'], ['minecraft:iron_ingot', 'Järntacka'], ['minecraft:gold_ingot', 'Guldtacka'],
    ['minecraft:diamond', 'Diamant'], ['minecraft:netherite_ingot', 'Netherittacka'], ['minecraft:emerald', 'Smaragd'], ['minecraft:amethyst_shard', 'Ametistskärva']
  ];
  const EFFECTS = [
    ['speed', 'Snabbhet'], ['night_vision', 'Mörkerseende'], ['fire_resistance', 'Eldskydd'], ['jump_boost', 'Höga hopp'],
    ['water_breathing', 'Andas under vatten'], ['strength', 'Styrka'], ['regeneration', 'Läkning'], ['resistance', 'Tålighet'],
    ['haste', 'Snabb grävning'], ['slow_falling', 'Långsamt fall']
  ];
  const armorDur = (it, key) => Math.max(1, Math.round(it.armor.mul * PIECE[key].dur));
  const pieceName = (it, p) => { const n = (it.armor.pieces[p.key].name || '').trim(); return n || `${p.label} (${(it.name || '').trim() || 'Rustning'})`; };
  const includedPieces = it => PIECES.filter(p => it.armor && it.armor.pieces[p.key].on);

  function allIds(items) {
    const ids = itemIds(items), used = new Set(ids);
    const pieceIds = items.map((it, i) => {
      if (it.type !== 'armor' || !it.armor) return null;
      const m = {};
      for (const p of includedPieces(it)) { let pid = `${ids[i]}_${p.suffix}`, n = 2; while (used.has(pid)) pid = `${ids[i]}_${p.suffix}_${n++}`; used.add(pid); m[p.key] = pid; }
      return m;
    });
    return { ids, pieceIds };
  }

  function itemJson(it, ns, id, matId) {
    const key = `${ns}_${id}`;
    const c = {
      'minecraft:icon': { textures: { default: key } },
      'minecraft:display_name': { value: (it.name || '').trim() || 'Föremål' }
    };
    let cat = 'items';
    if (it.type === 'item') c['minecraft:max_stack_size'] = it.stack;
    if (it.type === 'food') {
      c['minecraft:max_stack_size'] = it.stack;
      c['minecraft:food'] = { nutrition: it.food.nutrition, saturation_modifier: 0.6, can_always_eat: !!it.food.always };
      c['minecraft:use_animation'] = it.food.anim === 'drink' ? 'drink' : 'eat';
      c['minecraft:use_modifiers'] = { use_duration: 1.6, movement_modifier: 0.35 };
    }
    if (it.type === 'weapon') {
      cat = 'equipment';
      c['minecraft:max_stack_size'] = 1;
      c['minecraft:hand_equipped'] = true;
      c['minecraft:damage'] = it.weapon.damage;
      c['minecraft:durability'] = { max_durability: it.weapon.durability };
      if (it.weapon.enchant) c['minecraft:enchantable'] = { slot: 'sword', value: 10 };
      c['minecraft:tags'] = { tags: ['minecraft:is_sword'] };
      if (matId) c['minecraft:repairable'] = { repair_items: [{ items: [matId], repair_amount: Math.max(1, Math.round(it.weapon.durability / 4)) }] };
    }
    if (it.type === 'tool') {
      cat = 'equipment';
      const t = TIERS[it.tool.tier], k = TOOLKIND[it.tool.kind];
      c['minecraft:max_stack_size'] = 1;
      c['minecraft:hand_equipped'] = true;
      c['minecraft:damage'] = toolDamage(it);
      c['minecraft:durability'] = { max_durability: it.tool.durability };
      c['minecraft:digger'] = { use_efficiency: true, destroy_speeds: [{ block: { tags: `q.any_tag('${k.dig}')` }, speed: t.speed }] };
      if (it.tool.enchant) c['minecraft:enchantable'] = { slot: k.slot, value: t.ench };
      c['minecraft:tags'] = { tags: [k.tag, t.tag, 'minecraft:is_tool', 'minecraft:digger'] };
      if (matId) c['minecraft:repairable'] = { repair_items: [{ items: [matId], repair_amount: Math.max(1, Math.round(it.tool.durability / 4)) }] };
    }
    if (it.glint) c['minecraft:glint'] = true;
    if (it.rarity && it.rarity !== 'common') c['minecraft:rarity'] = it.rarity;
    return { format_version: '1.21.30', 'minecraft:item': { description: { identifier: `${ns}:${id}`, menu_category: { category: cat } }, components: c } };
  }

  function armorItemJson(it, ns, pid, p, repairId) {
    const a = it.armor, pc = a.pieces[p.key], dur = armorDur(it, p.key);
    const c = {
      'minecraft:icon': { textures: { default: `${ns}_${pid}` } },
      'minecraft:display_name': { value: pieceName(it, p) },
      'minecraft:max_stack_size': 1,
      'minecraft:wearable': { slot: p.slot, protection: pc.prot },
      'minecraft:durability': { max_durability: dur, damage_chance: { min: 60, max: 100 } }
    };
    if (a.ench) c['minecraft:enchantable'] = { slot: p.ench, value: ARMOR_MAT[a.mat].ench };
    if (repairId) c['minecraft:repairable'] = { repair_items: [{ items: [repairId], repair_amount: Math.max(1, Math.round(dur / 4)) }] };
    c['minecraft:tags'] = { tags: ['minecraft:is_armor', 'minecraft:trimmable_armors'] };
    if (it.glint) c['minecraft:glint'] = true;
    if (it.rarity && it.rarity !== 'common') c['minecraft:rarity'] = it.rarity;
    return { format_version: '1.21.30', 'minecraft:item': { description: { identifier: `${ns}:${pid}`, menu_category: { category: 'equipment' } }, components: c } };
  }

  function attachableJson(ns, pid, p, texBase) {
    return { format_version: '1.8.0', 'minecraft:attachable': { description: {
      identifier: `${ns}:${pid}`,
      materials: { default: 'armor', enchanted: 'armor_enchanted' },
      textures: { default: `textures/models/armor/${texBase}_${p.layer}`, enchanted: 'textures/misc/enchanted_actor_glint' },
      geometry: { default: `geometry.humanoid.armor.${p.geo}` },
      scripts: { parent_setup: `variable.${p.vis} = 0.0;` },
      render_controllers: ['controller.render.armor']
    } } };
  }

  function bonusScript(sets) {
    return [
      'import { world, system, EquipmentSlot } from "@minecraft/server";',
      '',
      '// Gjort i Föremålsverkstaden: ger en kraft när man har hela setet på sig.',
      `const SETS = ${JSON.stringify(sets, null, 2)};`,
      '',
      'system.runInterval(() => {',
      '  for (const player of world.getAllPlayers()) {',
      '    const eq = player.getComponent("minecraft:equippable");',
      '    if (!eq) continue;',
      '    for (const set of SETS) {',
      '      let full = true;',
      '      for (const slot of Object.keys(set.pieces)) {',
      '        const item = eq.getEquipment(EquipmentSlot[slot]);',
      '        if (!item || item.typeId !== set.pieces[slot]) { full = false; break; }',
      '      }',
      '      if (!full) continue;',
      '      try {',
      '        player.addEffect(set.effect, set.effect === "night_vision" ? 300 : 60, { amplifier: set.amplifier, showParticles: false });',
      '      } catch (e) { }',
      '    }',
      '  }',
      '}, 20);',
      ''
    ].join('\n');
  }

  /* ---------- materials and recipes ---------- */
  const VANILLA = [
    ['minecraft:iron_ingot','Järntacka'], ['minecraft:gold_ingot','Guldtacka'], ['minecraft:copper_ingot','Koppartacka'], ['minecraft:netherite_ingot','Netherittacka'],
    ['minecraft:iron_nugget','Järnklimp'], ['minecraft:gold_nugget','Guldklimp'], ['minecraft:raw_iron','Råjärn'], ['minecraft:raw_gold','Rått guld'], ['minecraft:raw_copper','Rå koppar'],
    ['minecraft:netherite_scrap','Netheritskrot'], ['minecraft:diamond','Diamant'], ['minecraft:emerald','Smaragd'], ['minecraft:lapis_lazuli','Lapis lazuli'],
    ['minecraft:redstone','Redstone'], ['minecraft:coal','Kol'], ['minecraft:quartz','Netherkvarts'], ['minecraft:amethyst_shard','Ametistskärva'],
    ['minecraft:prismarine_shard','Prismarinskärva'], ['minecraft:prismarine_crystals','Prismarinkristaller'], ['minecraft:echo_shard','Ekoskärva'],
    ['minecraft:glowstone_dust','Glödstensdamm'], ['minecraft:blaze_powder','Brännpulver'], ['minecraft:magma_cream','Magmakräm'], ['minecraft:ghast_tear','Ghasttår'],
    ['minecraft:ender_pearl','Enderpärla'], ['minecraft:nether_star','Netherstjärna'], ['minecraft:slime_ball','Slemboll'], ['minecraft:honeycomb','Vaxkaka'],
    ['minecraft:obsidian','Obsidian'], ['minecraft:glass','Glas'], ['minecraft:sand','Sand'], ['minecraft:cobblestone','Kullersten'], ['minecraft:stone','Sten'],
    ['minecraft:ice','Is'], ['minecraft:snowball','Snöboll'], ['minecraft:clay_ball','Lerklump'], ['minecraft:stick','Pinne'], ['minecraft:string','Snöre'],
    ['minecraft:leather','Läder'], ['minecraft:feather','Fjäder'], ['minecraft:bone','Ben'], ['minecraft:gunpowder','Krut'], ['minecraft:flint','Flinta'],
    ['minecraft:apple','Äpple'], ['minecraft:sugar','Socker'], ['minecraft:wheat','Vete'], ['minecraft:cactus','Kaktus'], ['minecraft:kelp','Kelp']
  ];
  const VANILLA_NAME = Object.fromEntries(VANILLA);
  const SMELT_TAKEN = new Set(['minecraft:raw_iron', 'minecraft:raw_gold', 'minecraft:raw_copper', 'minecraft:sand', 'minecraft:cobblestone', 'minecraft:stone', 'minecraft:clay_ball', 'minecraft:cactus', 'minecraft:kelp']);
  const SMELTABLE = VANILLA.filter(v => !SMELT_TAKEN.has(v[0]));
  const GEAR_PATTERNS = {
    head: ['###', '# #'], chest: ['# #', '###', '###'], legs: ['###', '# #', '# #'], feet: ['# #', '# #'],
    sword: ['#', '#', '|'], pickaxe: ['###', ' | ', ' | '], axe: ['##', '#|', ' |'], shovel: ['#', '|', '|']
  };
  function gridPattern(grid, resolve) {
    const cells = grid.map(g => resolve(g));
    let r0 = 3, r1 = -1, c0 = 3, c1 = -1;
    cells.forEach((v, i) => { if (!v) return; const r = (i / 3) | 0, c = i % 3; r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); });
    if (r1 < 0) return null;
    const sym = new Map(), key = {}, letters = 'ABCDEFGHI', pattern = [];
    for (let r = r0; r <= r1; r++) { let row = ''; for (let c = c0; c <= c1; c++) { const v = cells[r * 3 + c];
      if (!v) { row += ' '; continue; } if (!sym.has(v)) { const L = letters[sym.size]; sym.set(v, L); key[L] = { item: v }; } row += sym.get(v); } pattern.push(row); }
    return { pattern, key, first: [...sym.keys()][0] };
  }
  const shaped = (id, pattern, key, result, count, unlockItem) => ({ format_version: '1.20.30', 'minecraft:recipe_shaped': {
    description: { identifier: id }, tags: ['crafting_table'], pattern, key, unlock: [{ item: unlockItem }], result: { item: result, count } } });
  const furnace = (id, input, output) => ({ format_version: '1.20.30', 'minecraft:recipe_furnace': {
    description: { identifier: id }, tags: ['furnace', 'blast_furnace'], input: { item: input }, output: { item: output, count: 1 } } });

  function buildAddon(project, version, assets, icon) {
    const ns = slug(project.ns, 'verkstad');
    const name = String(project.name || '').trim() || 'Våra föremål';
    const base = slug(name, 'foremal');
    const ver = [1, 0, version];
    const { ids, pieceIds } = allIds(project.items);
    const byUid = {}; project.items.forEach((it, i) => { if (it.type !== 'armor') byUid[it.uid] = `${ns}:${ids[i]}`; });
    const resolve = ref => !ref || ref === 'none' ? null : ref.startsWith('own:') ? (byUid[ref.slice(4)] || null) : ref;
    const matOf = ref => { const r = ref ? resolve('own:' + ref) : null; return r; };
    const bp = base + '_BP', rp = base + '_RP', U = project.uuids;
    const J = o => enc.encode(JSON.stringify(o, null, 2));
    const sets = [];
    project.items.forEach((it, i) => {
      if (it.type !== 'armor' || !it.armor.bonus.on) return;
      const pieces = {}; for (const p of includedPieces(it)) pieces[p.eq] = `${ns}:${pieceIds[i][p.key]}`;
      if (Object.keys(pieces).length) sets.push({ pieces, effect: it.armor.bonus.effect, amplifier: it.armor.bonus.level - 1 });
    });
    const modules = [{ type: 'data', uuid: U.bpM, version: ver }];
    const deps = [{ uuid: U.rpH, version: ver }];
    if (sets.length) {
      modules.push({ type: 'script', language: 'javascript', entry: 'scripts/main.js', uuid: U.bpS, version: ver });
      deps.push({ module_name: '@minecraft/server', version: '1.11.0' });
    }
    const files = [];
    files.push({ name: `${bp}/manifest.json`, data: J({
      format_version: 2,
      header: { name: `${name} BP`, description: 'Föremål gjorda i Föremålsverkstaden', uuid: U.bpH, version: ver, min_engine_version: [1, 21, 30] },
      modules, dependencies: deps
    }) });
    files.push({ name: `${bp}/pack_icon.png`, data: icon });
    const td = {};
    const rpFiles = [];
    project.items.forEach((it, i) => {
      if (it.type === 'armor') {
        const texBase = `${ns}_${ids[i]}`;
        for (const p of includedPieces(it)) {
          const pid = pieceIds[i][p.key];
          files.push({ name: `${bp}/items/${pid}.json`, data: J(armorItemJson(it, ns, pid, p, resolve(it.armor.repair))) });
          rpFiles.push({ name: `${rp}/attachables/${pid}.json`, data: J(attachableJson(ns, pid, p, texBase)) });
          rpFiles.push({ name: `${rp}/textures/items/${pid}.png`, data: assets[i].icons[p.key] });
          td[`${ns}_${pid}`] = { textures: `textures/items/${pid}` };
        }
        rpFiles.push({ name: `${rp}/textures/models/armor/${texBase}_1.png`, data: assets[i].layer1 });
        rpFiles.push({ name: `${rp}/textures/models/armor/${texBase}_2.png`, data: assets[i].layer2 });
      } else {
        files.push({ name: `${bp}/items/${ids[i]}.json`, data: J(itemJson(it, ns, ids[i], it.type === 'weapon' ? matOf(it.weapon.madeOf) : it.type === 'tool' ? matOf(it.tool.madeOf) : null)) });
        rpFiles.push({ name: `${rp}/textures/items/${ids[i]}.png`, data: assets[i] });
        td[`${ns}_${ids[i]}`] = { textures: `textures/items/${ids[i]}` };
      }
    });
    const recipes = [];
    project.items.forEach((it, i) => {
      const self = `${ns}:${ids[i]}`;
      if (it.type === 'item' && it.mat && it.mat.on) {
        if (it.mat.craft.on) { const g = gridPattern(it.mat.craft.grid, resolve); if (g) recipes.push([`${ids[i]}_recept`, shaped(`${ns}:${ids[i]}_recept`, g.pattern, g.key, self, it.mat.craft.count, g.first)]); }
        if (it.mat.smelt.on) { const inp = resolve(it.mat.smelt.input); if (inp && inp !== self) recipes.push([`${ids[i]}_ugn`, furnace(`${ns}:${ids[i]}_ugn`, inp, self)]); }
      }
      if (it.type === 'armor') { const m = matOf(it.armor.madeOf); if (m) for (const p of includedPieces(it)) { const pid = pieceIds[i][p.key];
        recipes.push([`${pid}_recept`, shaped(`${ns}:${pid}_recept`, GEAR_PATTERNS[p.key], { '#': { item: m } }, `${ns}:${pid}`, 1, m)]); } }
      if (it.type === 'weapon' || it.type === 'tool') { const m = matOf(it.type === 'weapon' ? it.weapon.madeOf : it.tool.madeOf); if (m) {
        const pat = GEAR_PATTERNS[it.type === 'weapon' ? 'sword' : it.tool.kind];
        recipes.push([`${ids[i]}_recept`, shaped(`${self}_recept`, pat, { '#': { item: m }, '|': { item: 'minecraft:stick' } }, self, 1, m)]); } }
    });
    recipes.forEach(([n, r]) => files.push({ name: `${bp}/recipes/${n}.json`, data: J(r) }));
    if (sets.length) files.push({ name: `${bp}/scripts/main.js`, data: enc.encode(bonusScript(sets)) });
    files.push({ name: `${rp}/manifest.json`, data: J({
      format_version: 2,
      header: { name: `${name} RP`, description: 'Texturer för Föremålsverkstaden', uuid: U.rpH, version: ver, min_engine_version: [1, 21, 30] },
      modules: [{ type: 'resources', uuid: U.rpM, version: ver }]
    }) });
    files.push({ name: `${rp}/pack_icon.png`, data: icon });
    files.push({ name: `${rp}/textures/item_texture.json`, data: J({ resource_pack_name: name, texture_name: 'atlas.items', texture_data: td }) });
    files.push(...rpFiles);
    return { files, ns, ids, pieceIds, base, sets, recipes: recipes.map(r => r[0]) };
  }

  /* ---------- templates (16x16 masks to paint over) ---------- */
  const mask = fn => { const m = new Uint8Array(256); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (fn(x, y)) m[y * 16 + x] = 1; return m; };
  const ascii = rows => mask((x, y) => rows[y][x] === '#');
  const onHandle = (x, y, len) => { for (let k = 0; k < len; k++) if (y === 13 - k && (x === 2 + k || x === 3 + k)) return true; return false; };
  const dist = (x, y, cx, cy) => Math.hypot(x + .5 - cx, y + .5 - cy);
  function segDist(x, y, ax, ay, bx, by) {
    const px = x + .5, py = y + .5, dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  const E = '................';
  const TEMPLATES = {
    sword: { label:'Svärd', m: ascii([
      E, '.............##.', '............###.', '...........###..', '..........###...', '.........###....', '........###.....', '.......###......',
      '...#..###.......', '....####........', '.....##.........', '....#.##........', '...#...#........', '..#.............', '.##.............', E
    ]) },
    pickaxe: { label:'Hacka', m: mask((x, y) => {
      if (onHandle(x, y, 8)) return true;
      const r = dist(x, y, 4.5, 10.5), a = Math.atan2(y + .5 - 10.5, x + .5 - 4.5) * 180 / Math.PI;
      return r >= 6.6 && r <= 8.2 && a >= -108 && a <= 18;
    }) },
    axe: { label:'Yxa', m: mask((x, y) => onHandle(x, y, 9) || (dist(x, y, 7.6, 4.4) <= 3.6 && x + y <= 13 && x + y >= 8)) },
    shovel: { label:'Spade', m: mask((x, y) => onHandle(x, y, 7) || segDist(x, y, 10.6, 5.4, 12.6, 3.4) <= 2.3) },
    apple: { label:'Äpple', m: mask((x, y) => (dist(x, y, 8, 9.6) <= 5.6 && y >= 5) || (x === 8 && (y === 3 || y === 2)) || (y === 2 && (x === 9 || x === 10)) || (y === 1 && x === 10)) },
    bottle: { label:'Flaska', m: mask((x, y) => dist(x, y, 8, 10.4) <= 4.7 || (x >= 6 && x <= 9 && y >= 4 && y <= 6) || (x >= 6 && x <= 9 && y >= 1 && y <= 2) || (x >= 5 && x <= 10 && y === 3)) },
    gem: { label:'Ädelsten', m: mask((x, y) => y >= 3 && y <= 14 && Math.abs(x + .5 - 8) + Math.abs(y + .5 - 7.4) * .95 <= 6.3 && Math.abs(x + .5 - 8) <= 5.6) },
    key: { label:'Nyckel', m: mask((x, y) => {
      const r = dist(x, y, 5, 5); if (r >= 1.5 && r <= 3.5) return true;
      for (let k = 0; k <= 6; k++) if (y === 7 + k && (x === 7 + k || x === 6 + k)) return true;
      return (x === 10 && y === 13) || (x === 9 && y === 14) || (x === 12 && y === 11) || (x === 11 && y === 12) || (x === 13 && y === 13) || (x === 12 && y === 14);
    }) },
    helmet: { label:'Hjälm', m: ascii([
      E, E, E, '....########....', '...##########...', '..############..', '..############..', '..############..',
      '..####....####..', '..###......###..', '..###......###..', '..###......###..', '...##......##...', E, E, E
    ]) },
    chestplate: { label:'Bröstplåt', m: ascii([
      E, '..####....####..', '.#####....#####.', '.##############.', '.##############.', '.##############.', '..############..', '....########....',
      '....########....', '....########....', '....########....', '....########....', '....########....', '....########....', E, E
    ]) },
    leggings: { label:'Byxor', m: ascii([
      E, E, '...##########...', '...##########...', '...##########...', '...####..####...', '...####..####...', '...###....###...',
      '...###....###...', '...###....###...', '...###....###...', '...###....###...', '...###....###...', '...###....###...', E, E
    ]) },
    boots: { label:'Kängor', m: ascii([
      E, E, E, E, E, E, '....###....###..', '....###....###..',
      '....###....###..', '....###....###..', '..#####..#####..', '.######.######..', '.######.######..', E, E, E
    ]) }
  };

  return { zipStore, crc32, slug, itemIds, allIds, itemJson, armorItemJson, attachableJson, bonusScript, buildAddon, gridPattern, VANILLA, VANILLA_NAME, SMELTABLE, GEAR_PATTERNS,
    TIERS, TOOLKIND, toolDamage, TEMPLATES, PIECES, PIECE, ARMOR_MAT, REPAIR, EFFECTS, armorDur, pieceName, includedPieces };
})();
