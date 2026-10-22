window.MVCore = (() => {
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

  function slug(s, fallback) {
    let t = String(s || '').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32).replace(/_+$/g, '');
    if (!t) t = fallback;
    if (/^[0-9]/.test(t)) t = 'm_' + t;
    return t;
  }
  function mobIds(mobs) {
    const used = new Set();
    return mobs.map(m => { const b = slug(m.name, 'mob'); let id = b, n = 2; while (used.has(id)) id = b + '_' + n++; used.add(id); return id; });
  }

  /* ---------- bodies (Bedrock coordinates: the mob faces -z, its right side is -x) ----------
     part strings: "key" = m.parts[key] is true, "key=value" = m.parts[key] === value, alternatives joined with "|" */
  const tailSeg = (i) => ({ name:`tail${i}`, parent: i === 1 ? 'body' : `tail${i - 1}`, pivot:[0, 17, 10 + (i - 1) * 6], cubes:[
    { r:'tail', origin:[-2, 15, 10 + (i - 1) * 6], size:[4, 4, 6], uv:[80, 22] },
    { r:'spike', part:'spikes', origin:[-1, 19, 11 + (i - 1) * 6], size:[2, 4, 3], uv:[112, 0] }] });
  const neckSeg = (i) => ({ name:`neck${i}`, parent: i === 1 ? 'body' : `neck${i - 1}`, pivot:[0, 17, -10 - (i - 1) * 6], cubes:[
    { r:'neck', origin:[-3, 14, -16 - (i - 1) * 6], size:[6, 6, 6], uv:[88, 0] },
    { r:'spike', part:'spikes', origin:[-1, 20, -15 - (i - 1) * 6], size:[2, 4, 3], uv:[112, 0] }] });
  const BODIES = {
    quad: {
      label:'Fyrbent', size:64, coll:[0.9, 1.25], seat:1.05, wings:'wings', bounds:[4, 3.5, 1.25],
      regions: [
        { key:'head',  name:'Huvud',          short:'Huvud', box:[0, 0, 8, 8, 8],    mirror:'head',  group:'head' },
        { key:'snout', name:'Nos',            short:'Nos',   box:[32, 0, 4, 3, 1],   mirror:'snout', group:'head', part:'nose=snout' },
        { key:'lsnout',name:'Lång nos',       short:'Nos',   box:[48, 8, 4, 3, 4],   mirror:'lsnout',group:'head', part:'nose=long' },
        { key:'beak',  name:'Näbb',           short:'Näbb',  box:[34, 16, 4, 2, 3],  mirror:'beak',  group:'head', part:'nose=beak' },
        { key:'horn',  name:'Små horn',       short:'Horn',  box:[44, 0, 1, 3, 1],   mirror:null,    group:'head', part:'horns=small' },
        { key:'bhorn', name:'Stora horn',     short:'Horn',  box:[0, 16, 2, 2, 5],   mirror:null,    group:'head', part:'horns=big' },
        { key:'ear',   name:'Öron',           short:'Öra',   box:[34, 22, 2, 2, 1],  mirror:null,    group:'head', part:'ears' },
        { key:'body',  name:'Kropp',          short:'Kropp', box:[0, 16, 10, 8, 14], mirror:'body',  group:'body' },
        { key:'spike', name:'Ryggtaggar',     short:'Tagg',  box:[40, 22, 1, 2, 3],  mirror:'spike', group:'body', part:'spikes' },
        { key:'leg',   name:'Ben',            short:'Ben',   box:[0, 38, 4, 8, 4],   mirror:null,    group:'legs' },
        { key:'tail',  name:'Svans',          short:'Svans', box:[16, 38, 2, 2, 6],  mirror:'tail',  group:'body', part:'tail=short|tail=long' },
        { key:'tail2', name:'Svansspets',     short:'Spets', box:[48, 0, 2, 2, 6],   mirror:'tail2', group:'body', part:'tail=long' },
        { key:'wing',  name:'Vinge',          short:'Vinge', box:[32, 38, 8, 1, 7],  mirror:null,    group:'wings', part:'wings' },
        { key:'wtip',  name:'Vingspets',      short:'Spets', box:[32, 46, 8, 1, 6],  mirror:null,    group:'wings', part:'wings' }
      ],
      bones: [
        { name:'body', pivot:[0, 12, 0], cubes:[
          { r:'body', origin:[-5, 8, -7], size:[10, 8, 14], uv:[0, 16] },
          { r:'spike', part:'spikes', origin:[-0.5, 16, -5], size:[1, 2, 3], uv:[40, 22] },
          { r:'spike', part:'spikes', origin:[-0.5, 16, 0], size:[1, 2, 3], uv:[40, 22] },
          { r:'spike', part:'spikes', origin:[-0.5, 16, 4], size:[1, 2, 3], uv:[40, 22] }] },
        { name:'head', parent:'body', pivot:[0, 13, -7], cubes:[
          { r:'head', origin:[-4, 10, -14], size:[8, 8, 8], uv:[0, 0] },
          { r:'snout', part:'nose=snout', origin:[-2, 11, -15], size:[4, 3, 1], uv:[32, 0] },
          { r:'lsnout', part:'nose=long', origin:[-2, 11, -18], size:[4, 3, 4], uv:[48, 8] },
          { r:'beak', part:'nose=beak', origin:[-2, 12, -17], size:[4, 2, 3], uv:[34, 16] },
          { r:'horn', part:'horns=small', origin:[-4, 18, -11], size:[1, 3, 1], uv:[44, 0] },
          { r:'horn', part:'horns=small', origin:[3, 18, -11], size:[1, 3, 1], uv:[44, 0], mirror:true },
          { r:'bhorn', part:'horns=big', origin:[-5, 16, -9], size:[2, 2, 5], uv:[0, 16] },
          { r:'bhorn', part:'horns=big', origin:[3, 16, -9], size:[2, 2, 5], uv:[0, 16], mirror:true },
          { r:'ear', part:'ears', origin:[-5, 18, -9], size:[2, 2, 1], uv:[34, 22] },
          { r:'ear', part:'ears', origin:[3, 18, -9], size:[2, 2, 1], uv:[34, 22], mirror:true }] },
        { name:'leg0', parent:'body', pivot:[-3, 8, 5],  cubes:[{ r:'leg', origin:[-5, 0, 3],  size:[4, 8, 4], uv:[0, 38] }] },
        { name:'leg1', parent:'body', pivot:[3, 8, 5],   cubes:[{ r:'leg', origin:[1, 0, 3],   size:[4, 8, 4], uv:[0, 38], mirror:true }] },
        { name:'leg2', parent:'body', pivot:[-3, 8, -5], cubes:[{ r:'leg', origin:[-5, 0, -7], size:[4, 8, 4], uv:[0, 38] }] },
        { name:'leg3', parent:'body', pivot:[3, 8, -5],  cubes:[{ r:'leg', origin:[1, 0, -7],  size:[4, 8, 4], uv:[0, 38], mirror:true }] },
        { name:'tail', parent:'body', pivot:[0, 15, 7], part:'tail=short|tail=long', cubes:[{ r:'tail', origin:[-1, 13, 7], size:[2, 2, 6], uv:[16, 38] }] },
        { name:'tail2', parent:'tail', pivot:[0, 14, 13], part:'tail=long', cubes:[{ r:'tail2', origin:[-1, 13, 13], size:[2, 2, 6], uv:[48, 0] }] },
        { name:'wing_r', parent:'body', pivot:[-5, 16, -2], part:'wings', cubes:[{ r:'wing', origin:[-13, 15.5, -4], size:[8, 1, 7], uv:[32, 38] }] },
        { name:'wingtip_r', parent:'wing_r', pivot:[-13, 16, -2], part:'wings', cubes:[{ r:'wtip', origin:[-21, 15.5, -4], size:[8, 1, 6], uv:[32, 46] }] },
        { name:'wing_l', parent:'body', pivot:[5, 16, -2], part:'wings', cubes:[{ r:'wing', origin:[5, 15.5, -4], size:[8, 1, 7], uv:[32, 38], mirror:true }] },
        { name:'wingtip_l', parent:'wing_l', pivot:[13, 16, -2], part:'wings', cubes:[{ r:'wtip', origin:[13, 15.5, -4], size:[8, 1, 6], uv:[32, 46], mirror:true }] }
      ]
    },
    biped: {
      label:'Tvåbent', size:64, coll:[0.6, 1.9], seat:1.6, wings:null, bounds:[4, 3.5, 1.25],
      regions: [
        { key:'head',  name:'Huvud',           short:'Huvud', box:[0, 0, 8, 8, 8],    mirror:'head',  group:'head' },
        { key:'hat',   name:'Huvud, yttre',    short:'Yttre', box:[32, 0, 8, 8, 8],   mirror:'hat',   group:'head', outer:true },
        { key:'body',  name:'Kropp',           short:'Kropp', box:[16, 16, 8, 12, 4], mirror:'body',  group:'body' },
        { key:'jacket',name:'Kropp, yttre',    short:'Yttre', box:[16, 32, 8, 12, 4], mirror:'jacket',group:'body', outer:true },
        { key:'rarm',  name:'Höger arm',       short:'H arm', box:[40, 16, 4, 12, 4], mirror:'larm',  group:'arms' },
        { key:'rarm2', name:'Höger ärm',       short:'H arm', box:[40, 32, 4, 12, 4], mirror:'larm2', group:'arms', outer:true },
        { key:'larm',  name:'Vänster arm',     short:'V arm', box:[32, 48, 4, 12, 4], mirror:'rarm',  group:'arms' },
        { key:'larm2', name:'Vänster ärm',     short:'V arm', box:[48, 48, 4, 12, 4], mirror:'rarm2', group:'arms', outer:true },
        { key:'rleg',  name:'Höger ben',       short:'H ben', box:[0, 16, 4, 12, 4],  mirror:'lleg',  group:'legs' },
        { key:'rleg2', name:'Höger byxben',    short:'H ben', box:[0, 32, 4, 12, 4],  mirror:'lleg2', group:'legs', outer:true },
        { key:'lleg',  name:'Vänster ben',     short:'V ben', box:[16, 48, 4, 12, 4], mirror:'rleg',  group:'legs' },
        { key:'lleg2', name:'Vänster byxben',  short:'V ben', box:[0, 48, 4, 12, 4],  mirror:'rleg2', group:'legs', outer:true }
      ],
      bones: [
        { name:'body', pivot:[0, 24, 0], cubes:[{ r:'body', origin:[-4, 12, -2], size:[8, 12, 4], uv:[16, 16] }, { r:'jacket', origin:[-4, 12, -2], size:[8, 12, 4], uv:[16, 32], inflate:0.25 }] },
        { name:'head', parent:'body', pivot:[0, 24, 0], cubes:[{ r:'head', origin:[-4, 24, -4], size:[8, 8, 8], uv:[0, 0] }, { r:'hat', origin:[-4, 24, -4], size:[8, 8, 8], uv:[32, 0], inflate:0.5 }] },
        { name:'rightarm', parent:'body', pivot:[-5, 22, 0], cubes:[{ r:'rarm', origin:[-8, 12, -2], size:[4, 12, 4], uv:[40, 16] }, { r:'rarm2', origin:[-8, 12, -2], size:[4, 12, 4], uv:[40, 32], inflate:0.25 }] },
        { name:'leftarm', parent:'body', pivot:[5, 22, 0], cubes:[{ r:'larm', origin:[4, 12, -2], size:[4, 12, 4], uv:[32, 48] }, { r:'larm2', origin:[4, 12, -2], size:[4, 12, 4], uv:[48, 48], inflate:0.25 }] },
        { name:'rightleg', parent:'body', pivot:[-1.9, 12, 0], cubes:[{ r:'rleg', origin:[-3.9, 0, -2], size:[4, 12, 4], uv:[0, 16] }, { r:'rleg2', origin:[-3.9, 0, -2], size:[4, 12, 4], uv:[0, 32], inflate:0.25 }] },
        { name:'leftleg', parent:'body', pivot:[1.9, 12, 0], cubes:[{ r:'lleg', origin:[-0.1, 0, -2], size:[4, 12, 4], uv:[16, 48] }, { r:'lleg2', origin:[-0.1, 0, -2], size:[4, 12, 4], uv:[0, 48], inflate:0.25 }] }
      ]
    },
    dragon: {
      label:'Drake', size:128, coll:[1.8, 1.5], seat:1.4, wings:'always', bounds:[7, 4, 1.5],
      regions: [
        { key:'head',  name:'Huvud',         short:'Huvud', box:[0, 0, 10, 8, 10],   mirror:'head',  group:'head' },
        { key:'snout', name:'Nos',           short:'Nos',   box:[40, 0, 8, 4, 8],    mirror:'snout', group:'head' },
        { key:'jaw',   name:'Käke',          short:'Käke',  box:[40, 12, 8, 2, 8],   mirror:'jaw',   group:'head' },
        { key:'horn',  name:'Horn',          short:'Horn',  box:[72, 0, 2, 2, 6],    mirror:null,    group:'head', part:'horns=small|horns=big' },
        { key:'neck',  name:'Hals',          short:'Hals',  box:[88, 0, 6, 6, 6],    mirror:'neck',  group:'body' },
        { key:'spike', name:'Taggar',        short:'Tagg',  box:[112, 0, 2, 4, 3],   mirror:'spike', group:'body', part:'spikes' },
        { key:'body',  name:'Kropp',         short:'Kropp', box:[0, 22, 12, 10, 20], mirror:'body',  group:'body' },
        { key:'leg',   name:'Ben',           short:'Ben',   box:[64, 22, 4, 10, 4],  mirror:null,    group:'legs' },
        { key:'tail',  name:'Svans',         short:'Svans', box:[80, 22, 4, 4, 6],   mirror:'tail',  group:'body' },
        { key:'wbar',  name:'Vingens ben',   short:'Ben',   box:[0, 52, 16, 2, 2],   mirror:null,    group:'wings' },
        { key:'tbar',  name:'Spetsens ben',  short:'Ben',   box:[36, 52, 16, 1, 1],  mirror:null,    group:'wings' },
        { key:'wskin', name:'Vinghud',       short:'Vinghud', box:[0, 56, 16, 0, 14],  mirror:null,  group:'wings' },
        { key:'tskin', name:'Vingspets',     short:'Spets', box:[60, 56, 16, 0, 14],  mirror:null,    group:'wings' }
      ],
      bones: [
        { name:'body', pivot:[0, 15, 0], cubes:[
          { r:'body', origin:[-6, 10, -10], size:[12, 10, 20], uv:[0, 22] },
          { r:'spike', part:'spikes', origin:[-1, 20, -8], size:[2, 4, 3], uv:[112, 0] },
          { r:'spike', part:'spikes', origin:[-1, 20, -2], size:[2, 4, 3], uv:[112, 0] },
          { r:'spike', part:'spikes', origin:[-1, 20, 4], size:[2, 4, 3], uv:[112, 0] }] },
        neckSeg(1), neckSeg(2), neckSeg(3),
        { name:'head', parent:'neck3', pivot:[0, 17, -28], cubes:[
          { r:'head', origin:[-5, 13, -38], size:[10, 8, 10], uv:[0, 0] },
          { r:'snout', origin:[-4, 14, -46], size:[8, 4, 8], uv:[40, 0] },
          { r:'horn', part:'horns=small|horns=big', origin:[-4, 21, -32], size:[2, 2, 6], uv:[72, 0] },
          { r:'horn', part:'horns=small|horns=big', origin:[2, 21, -32], size:[2, 2, 6], uv:[72, 0], mirror:true }] },
        { name:'jaw', parent:'head', pivot:[0, 14, -38], cubes:[{ r:'jaw', origin:[-4, 12, -46], size:[8, 2, 8], uv:[40, 12] }] },
        { name:'leg0', parent:'body', pivot:[-5, 10, 6],  cubes:[{ r:'leg', origin:[-7, 0, 4],  size:[4, 10, 4], uv:[64, 22] }] },
        { name:'leg1', parent:'body', pivot:[5, 10, 6],   cubes:[{ r:'leg', origin:[3, 0, 4],   size:[4, 10, 4], uv:[64, 22], mirror:true }] },
        { name:'leg2', parent:'body', pivot:[-5, 10, -6], cubes:[{ r:'leg', origin:[-7, 0, -8], size:[4, 10, 4], uv:[64, 22] }] },
        { name:'leg3', parent:'body', pivot:[5, 10, -6],  cubes:[{ r:'leg', origin:[3, 0, -8],  size:[4, 10, 4], uv:[64, 22], mirror:true }] },
        tailSeg(1), tailSeg(2), tailSeg(3), tailSeg(4), tailSeg(5),
        { name:'wing_r', parent:'body', pivot:[-6, 19, -4], cubes:[
          { r:'wbar', origin:[-22, 18, -5], size:[16, 2, 2], uv:[0, 52] }, { r:'wskin', origin:[-22, 19, -4], size:[16, 0, 14], uv:[0, 56] }] },
        { name:'wingtip_r', parent:'wing_r', pivot:[-22, 19, -4], cubes:[
          { r:'tbar', origin:[-38, 18.5, -4.5], size:[16, 1, 1], uv:[36, 52] }, { r:'tskin', origin:[-38, 19, -4], size:[16, 0, 14], uv:[60, 56] }] },
        { name:'wing_l', parent:'body', pivot:[6, 19, -4], cubes:[
          { r:'wbar', origin:[6, 18, -5], size:[16, 2, 2], uv:[0, 52], mirror:true }, { r:'wskin', origin:[6, 19, -4], size:[16, 0, 14], uv:[0, 56], mirror:true }] },
        { name:'wingtip_l', parent:'wing_l', pivot:[22, 19, -4], cubes:[
          { r:'tbar', origin:[22, 18.5, -4.5], size:[16, 1, 1], uv:[36, 52], mirror:true }, { r:'tskin', origin:[22, 19, -4], size:[16, 0, 14], uv:[60, 56], mirror:true }] }
      ]
    },
    tall: {
      label:'Lång', size:64, coll:[0.6, 2.9], seat:2.5, wings:null, bounds:[2.5, 4, 1.75],
      regions: [
        { key:'head', name:'Huvud',       short:'Huvud', box:[0, 0, 8, 8, 8],    mirror:'head', group:'head' },
        { key:'body', name:'Kropp',       short:'Kropp', box:[32, 0, 8, 12, 4],  mirror:'body', group:'body' },
        { key:'rarm', name:'Höger arm',   short:'H arm', box:[0, 16, 2, 28, 2],  mirror:'larm', group:'arms' },
        { key:'larm', name:'Vänster arm', short:'V arm', box:[8, 16, 2, 28, 2],  mirror:'rarm', group:'arms' },
        { key:'rleg', name:'Höger ben',   short:'H ben', box:[16, 16, 2, 28, 2], mirror:'lleg', group:'legs' },
        { key:'lleg', name:'Vänster ben', short:'V ben', box:[24, 16, 2, 28, 2], mirror:'rleg', group:'legs' }
      ],
      bones: [
        { name:'body', pivot:[0, 28, 0], cubes:[{ r:'body', origin:[-4, 28, -2], size:[8, 12, 4], uv:[32, 0] }] },
        { name:'head', parent:'body', pivot:[0, 40, 0], cubes:[{ r:'head', origin:[-4, 40, -4], size:[8, 8, 8], uv:[0, 0] }] },
        { name:'rightarm', parent:'body', pivot:[-5, 39, 0], cubes:[{ r:'rarm', origin:[-6, 11, -1], size:[2, 28, 2], uv:[0, 16] }] },
        { name:'leftarm', parent:'body', pivot:[5, 39, 0], cubes:[{ r:'larm', origin:[4, 11, -1], size:[2, 28, 2], uv:[8, 16] }] },
        { name:'rightleg', parent:'body', pivot:[-2, 28, 0], cubes:[{ r:'rleg', origin:[-3, 0, -1], size:[2, 28, 2], uv:[16, 16] }] },
        { name:'leftleg', parent:'body', pivot:[2, 28, 0], cubes:[{ r:'lleg', origin:[1, 0, -1], size:[2, 28, 2], uv:[24, 16] }] }
      ]
    },
    giant: {
      label:'Jätte', size:128, coll:[0.9, 2.9], seat:2.6, wings:null, bounds:[3.5, 4, 1.75],
      regions: [
        { key:'head', name:'Huvud',       short:'Huvud', box:[0, 0, 16, 15, 10],  mirror:'head', group:'head' },
        { key:'body', name:'Kropp',       short:'Kropp', box:[0, 26, 18, 21, 10], mirror:'body', group:'body' },
        { key:'rarm', name:'Höger arm',   short:'H arm', box:[60, 0, 8, 28, 8],   mirror:'larm', group:'arms' },
        { key:'larm', name:'Vänster arm', short:'V arm', box:[92, 0, 8, 28, 8],   mirror:'rarm', group:'arms' },
        { key:'rleg', name:'Höger ben',   short:'H ben', box:[60, 40, 6, 13, 6],  mirror:'lleg', group:'legs' },
        { key:'lleg', name:'Vänster ben', short:'V ben', box:[88, 40, 6, 13, 6],  mirror:'rleg', group:'legs' }
      ],
      bones: [
        { name:'body', pivot:[0, 13, 0], cubes:[{ r:'body', origin:[-9, 13, -5], size:[18, 21, 10], uv:[0, 26] }] },
        { name:'head', parent:'body', pivot:[0, 34, 0], cubes:[{ r:'head', origin:[-8, 34, -5], size:[16, 15, 10], uv:[0, 0] }] },
        { name:'rightarm', parent:'body', pivot:[-13, 33, 0], cubes:[{ r:'rarm', origin:[-17, 5, -4], size:[8, 28, 8], uv:[60, 0] }] },
        { name:'leftarm', parent:'body', pivot:[13, 33, 0], cubes:[{ r:'larm', origin:[9, 5, -4], size:[8, 28, 8], uv:[92, 0] }] },
        { name:'rightleg', parent:'body', pivot:[-5, 13, 0], cubes:[{ r:'rleg', origin:[-8, 0, -3], size:[6, 13, 6], uv:[60, 40] }] },
        { name:'leftleg', parent:'body', pivot:[5, 13, 0], cubes:[{ r:'lleg', origin:[2, 0, -3], size:[6, 13, 6], uv:[88, 40] }] }
      ]
    }
  };
  function partOn(m, part) {
    if (!part) return true;
    return part.split('|').some(alt => { const [k, v] = alt.split('='); return v === undefined ? !!m.parts[k] : m.parts[k] === v; });
  }
  const hasWings = m => m.body === 'dragon' || (m.body === 'quad' && !!m.parts.wings);
  const flies = m => !!m.fly && hasWings(m);
  const rides = m => flies(m) && !!m.ride && m.behavior === 'pet';

  /* ---------- game data ---------- */
  const FOODS = [
    ['minecraft:wheat','Vete'], ['minecraft:wheat_seeds','Frön'], ['minecraft:carrot','Morot'], ['minecraft:potato','Potatis'], ['minecraft:beetroot','Rödbeta'],
    ['minecraft:apple','Äpple'], ['minecraft:golden_apple','Guldäpple'], ['minecraft:golden_carrot','Guldmorot'], ['minecraft:sweet_berries','Söta bär'],
    ['minecraft:melon_slice','Melonskiva'], ['minecraft:cookie','Kaka'], ['minecraft:sugar','Socker'], ['minecraft:bone','Ben'], ['minecraft:beef','Rått nötkött'],
    ['minecraft:porkchop','Rått fläsk'], ['minecraft:chicken','Rå kyckling'], ['minecraft:cod','Torsk'], ['minecraft:salmon','Lax'], ['minecraft:kelp','Kelp'],
    ['minecraft:slime_ball','Slemboll'], ['minecraft:emerald','Smaragd'], ['minecraft:diamond','Diamant'], ['minecraft:blaze_powder','Brännpulver'], ['minecraft:coal','Kol']
  ];
  const DROPS = [
    ['minecraft:leather','Läder'], ['minecraft:feather','Fjäder'], ['minecraft:bone','Ben'], ['minecraft:string','Snöre'], ['minecraft:rotten_flesh','Ruttet kött'],
    ['minecraft:gunpowder','Krut'], ['minecraft:beef','Rått nötkött'], ['minecraft:porkchop','Rått fläsk'], ['minecraft:chicken','Rå kyckling'], ['minecraft:mutton','Rått fårkött'],
    ['minecraft:rabbit_hide','Kaninskinn'], ['minecraft:slime_ball','Slemboll'], ['minecraft:egg','Ägg'], ['minecraft:white_wool','Vit ull'], ['minecraft:ink_sac','Bläcksäck'],
    ['minecraft:glow_ink_sac','Lysande bläcksäck'], ['minecraft:honeycomb','Vaxkaka'], ['minecraft:ender_pearl','Enderpärla'], ['minecraft:iron_nugget','Järnklimp'],
    ['minecraft:gold_nugget','Guldklimp'], ['minecraft:emerald','Smaragd'], ['minecraft:diamond','Diamant'], ['minecraft:amethyst_shard','Ametistskärva'],
    ['minecraft:prismarine_shard','Prismarinskärva'], ['minecraft:apple','Äpple'], ['minecraft:cookie','Kaka'], ['minecraft:golden_apple','Guldäpple'],
    ['minecraft:blaze_powder','Brännpulver'], ['minecraft:phantom_membrane','Fantomhud'], ['minecraft:dragon_breath','Drakandedräkt']
  ];
  const SOUNDS = {
    none:    { label:'Tyst' },
    pig:     { label:'Gris',    ev:{ ambient:'mob.pig.say', hurt:'mob.pig.say', death:'mob.pig.death', step:'mob.pig.step' } },
    cow:     { label:'Ko',      ev:{ ambient:'mob.cow.say', hurt:'mob.cow.hurt', death:'mob.cow.hurt', step:'mob.cow.step' } },
    sheep:   { label:'Får',     ev:{ ambient:'mob.sheep.say', hurt:'mob.sheep.say', death:'mob.sheep.say', step:'mob.sheep.step' } },
    chicken: { label:'Höna',    ev:{ ambient:'mob.chicken.say', hurt:'mob.chicken.hurt', death:'mob.chicken.hurt', step:'mob.chicken.step' } },
    wolf:    { label:'Varg',    ev:{ ambient:'mob.wolf.bark', hurt:'mob.wolf.hurt', death:'mob.wolf.death', step:'mob.wolf.step' } },
    cat:     { label:'Katt',    ev:{ ambient:'mob.cat.straymeow', hurt:'mob.cat.hit', death:'mob.cat.hit' } },
    fox:     { label:'Räv',     ev:{ ambient:'mob.fox.ambient', hurt:'mob.fox.hurt', death:'mob.fox.death' } },
    frog:    { label:'Groda',   ev:{ ambient:'mob.frog.ambient', hurt:'mob.frog.hurt', death:'mob.frog.death', step:'mob.frog.step' } },
    parrot:  { label:'Papegoja',ev:{ ambient:'mob.parrot.idle', hurt:'mob.parrot.hurt', death:'mob.parrot.death' } },
    dragon:  { label:'Drake',   ev:{ ambient:'mob.enderdragon.growl', hurt:'mob.enderdragon.hit', death:'mob.enderdragon.death' }, volume:0.6 },
    zombie:  { label:'Zombie',  ev:{ ambient:'mob.zombie.say', hurt:'mob.zombie.hurt', death:'mob.zombie.death', step:'mob.zombie.step' } },
    skeleton:{ label:'Skelett', ev:{ ambient:'mob.skeleton.say', hurt:'mob.skeleton.hurt', death:'mob.skeleton.death', step:'mob.skeleton.step' } },
    spider:  { label:'Spindel', ev:{ ambient:'mob.spider.say', hurt:'mob.spider.say', death:'mob.spider.death', step:'mob.spider.step' } },
    enderman:{ label:'Enderman', ev:{ ambient:'mob.endermen.idle', hurt:'mob.endermen.hit', death:'mob.endermen.death' } },
    warden:  { label:'Warden',  ev:{ ambient:'mob.warden.idle', hurt:'mob.warden.hurt', death:'mob.warden.death', step:'mob.warden.step' } }
  };
  const BIOMES = [
    ['common', 'Där djur och monster brukar finnas'], ['plains', 'Slätter'], ['forest', 'Skog'], ['taiga', 'Barrskog'], ['jungle', 'Djungel'],
    ['desert', 'Öken'], ['savanna', 'Savann'], ['swamp', 'Träsk'], ['frozen', 'Snö och is'], ['mountain', 'Berg'], ['beach', 'Strand'],
    ['mesa', 'Badlands'], ['meadow', 'Äng'], ['cherry_grove', 'Körsbärsskog']
  ];
  const SPEEDS = [0.15, 0.2, 0.25, 0.3, 0.38];
  const SPEED_LABEL = ['Långsam', 'Lite långsam', 'Vanlig', 'Snabb', 'Väldigt snabb'];
  const WEIGHTS = { rare:3, some:10, often:25 };
  const hostile = m => m.behavior === 'hostile';
  const breeds = m => m.behavior === 'passive' || m.behavior === 'pet' || m.behavior === 'neutral';
  const fights = m => m.behavior !== 'passive';

  /* ---------- json builders ---------- */
  function geometryJson(m, ns, id) {
    const B = BODIES[m.body], bones = [];
    for (const b of B.bones) {
      if (!partOn(m, b.part)) continue;
      const cubes = b.cubes.filter(c => partOn(m, c.part)).map(c => { const o = { origin: c.origin, size: c.size, uv: c.uv }; if (c.inflate) o.inflate = c.inflate; if (c.mirror) o.mirror = true; return o; });
      const bone = { name: b.name, pivot: b.pivot, cubes }; if (b.parent) bone.parent = b.parent;
      bones.push(bone);
    }
    const [bw, bh, by] = B.bounds;
    return { format_version: '1.12.0', 'minecraft:geometry': [{
      description: { identifier: `geometry.${ns}.${id}`, texture_width: B.size, texture_height: B.size,
        visible_bounds_width: bw, visible_bounds_height: bh, visible_bounds_offset: [0, by, 0] },
      bones }] };
  }
  function animationsJson(ns) {
    const w = a => `math.cos(query.anim_time * 38.17) * ${a}`;
    const flap = (sign, phase, air, ground) => `${sign}math.sin(query.life_time * 500.0${phase}) * (query.is_on_ground ? ${ground} : ${air})`;
    const tails = {}; for (let i = 1; i <= 5; i++) tails[`tail${i}`] = { rotation: [0, `math.sin(query.life_time * 150.0 - ${i * 45}.0) * 8.0`, 0] };
    return { format_version: '1.8.0', animations: {
      [`animation.${ns}.mob.quad_walk`]: { loop: true, anim_time_update: 'query.modified_distance_moved', bones: {
        leg0: { rotation: [w('80.0'), 0, 0] }, leg1: { rotation: [w('-80.0'), 0, 0] }, leg2: { rotation: [w('-80.0'), 0, 0] }, leg3: { rotation: [w('80.0'), 0, 0] } } },
      [`animation.${ns}.mob.biped_walk`]: { loop: true, anim_time_update: 'query.modified_distance_moved', bones: {
        rightarm: { rotation: [w('40.0'), 0, 0] }, leftarm: { rotation: [w('-40.0'), 0, 0] }, rightleg: { rotation: [w('-50.0'), 0, 0] }, leftleg: { rotation: [w('50.0'), 0, 0] } } },
      [`animation.${ns}.mob.tall_walk`]: { loop: true, anim_time_update: 'query.modified_distance_moved', bones: {
        rightleg: { rotation: ['math.cos(query.anim_time * 24.0) * 28.0', 0, 0] }, leftleg: { rotation: ['math.cos(query.anim_time * 24.0) * -28.0', 0, 0] },
        rightarm: { rotation: ['math.cos(query.anim_time * 24.0) * -12.0', 0, 0] }, leftarm: { rotation: ['math.cos(query.anim_time * 24.0) * 12.0', 0, 0] } } },
      [`animation.${ns}.mob.giant_walk`]: { loop: true, anim_time_update: 'query.modified_distance_moved', bones: {
        body: { rotation: [0, 0, 'math.cos(query.anim_time * 26.0) * 3.0'] },
        rightleg: { rotation: ['math.cos(query.anim_time * 26.0) * 24.0', 0, 0] }, leftleg: { rotation: ['math.cos(query.anim_time * 26.0) * -24.0', 0, 0] },
        rightarm: { rotation: ['math.cos(query.anim_time * 26.0) * -18.0', 0, 0] }, leftarm: { rotation: ['math.cos(query.anim_time * 26.0) * 18.0', 0, 0] } } },
      [`animation.${ns}.mob.arms_forward`]: { loop: true, bones: { rightarm: { rotation: [-80.0, 0, 0] }, leftarm: { rotation: [-80.0, 0, 0] } } },
      [`animation.${ns}.mob.tail_wag`]: { loop: true, bones: { tail: { rotation: [0, 'math.sin(query.life_time * 300.0) * 15.0', 0] }, tail2: { rotation: [0, 'math.sin(query.life_time * 300.0 - 60.0) * 15.0', 0] } } },
      [`animation.${ns}.mob.flap`]: { loop: true, bones: {
        wing_r: { rotation: [0, 0, flap('', '', '35.0', '6.0')] }, wing_l: { rotation: [0, 0, flap('-', '', '35.0', '6.0')] },
        wingtip_r: { rotation: [0, 0, flap('', ' - 40.0', '25.0', '4.0')] }, wingtip_l: { rotation: [0, 0, flap('-', ' - 40.0', '25.0', '4.0')] } } },
      [`animation.${ns}.mob.dragon_body`]: { loop: true, bones: Object.assign({
        jaw: { rotation: ['math.max(0.0, math.sin(query.life_time * 80.0)) * 12.0', 0, 0] },
        neck1: { rotation: ['math.sin(query.life_time * 60.0) * 3.0', 0, 0] }, neck2: { rotation: ['math.sin(query.life_time * 60.0 - 30.0) * 3.0', 0, 0] } }, tails) }
    } };
  }
  function clientJson(m, ns, id) {
    const anims = { look: 'animation.common.look_at_target' }, animate = [];
    if (m.body === 'tall' || m.body === 'giant') { anims.walk = `animation.${ns}.mob.${m.body}_walk`; animate.push({ walk: 'query.modified_move_speed' }, 'look'); }
    else if (m.body === 'biped') { anims.walk = `animation.${ns}.mob.biped_walk`; animate.push({ walk: 'query.modified_move_speed' }, 'look'); if (hostile(m)) { anims.arms = `animation.${ns}.mob.arms_forward`; animate.push('arms'); } }
    else {
      anims.walk = `animation.${ns}.mob.quad_walk`; animate.push({ walk: 'query.modified_move_speed' }, 'look');
      if (m.body === 'quad' && m.parts.tail !== 'none') { anims.tail = `animation.${ns}.mob.tail_wag`; animate.push('tail'); }
      if (hasWings(m)) { anims.flap = `animation.${ns}.mob.flap`; animate.push('flap'); }
      if (m.body === 'dragon') { anims.dragon = `animation.${ns}.mob.dragon_body`; animate.push('dragon'); }
    }
    return { format_version: '1.10.0', 'minecraft:client_entity': { description: {
      identifier: `${ns}:${id}`,
      materials: { default: 'entity_alphatest' },
      textures: { default: `textures/entity/${ns}_${id}` },
      geometry: { default: `geometry.${ns}.${id}` },
      animations: anims,
      scripts: { animate },
      render_controllers: ['controller.render.default'],
      spawn_egg: { base_color: m.egg.base, overlay_color: m.egg.spot }
    } } };
  }
  const itemList = v => [v];
  function entityJson(m, ns, id) {
    const self = `${ns}:${id}`, B = BODIES[m.body], groups = {}, events = {};
    const family = [id, 'mob']; if (hostile(m)) family.push('monster');
    const F = flies(m), RIDE = rides(m);
    const c = {
      'minecraft:type_family': { family },
      'minecraft:collision_box': { width: B.coll[0], height: B.coll[1] },
      'minecraft:health': { value: m.health, max: m.health },
      'minecraft:movement': { value: SPEEDS[m.speed] },
      'minecraft:can_climb': {},
      'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
      'minecraft:breathable': { total_supply: 15, suffocate_time: 0 },
      'minecraft:nameable': {},
      'minecraft:leashable': {},
      'minecraft:hurt_on_condition': { damage_conditions: [{ filters: { test: 'in_lava', subject: 'self' }, cause: 'lava', damage_per_tick: 4 }] },
      'minecraft:behavior.float': { priority: 0 },
      'minecraft:behavior.look_at_player': { priority: 8, look_distance: 6.0, probability: 0.02 },
      'minecraft:behavior.random_look_around': { priority: 9 }
    };
    if (F) {
      Object.assign(c, {
        'minecraft:navigation.fly': { can_path_from_air: true, can_path_over_water: true, avoid_damage_blocks: true },
        'minecraft:movement.fly': {},
        'minecraft:can_fly': {},
        'minecraft:behavior.random_fly': { priority: 6, xz_dist: 15, y_dist: 4, y_offset: 0, speed_multiplier: 1.0, can_land_on_trees: true, avoid_damage_blocks: true },
        'minecraft:damage_sensor': { triggers: { cause: 'fall', deals_damage: 'no' } }
      });
    } else {
      Object.assign(c, {
        'minecraft:navigation.walk': { can_path_over_water: true, avoid_water: true, avoid_damage_blocks: true },
        'minecraft:movement.basic': {},
        'minecraft:jump.static': {},
        'minecraft:behavior.random_stroll': { priority: 7, speed_multiplier: 1.0 }
      });
    }
    if (!RIDE) c['minecraft:physics'] = {};
    if (m.teleport) c['minecraft:teleport'] = { random_teleports: true, max_random_teleport_time: 30, random_teleport_cube: [32, 32, 32],
      target_distance: 16, target_teleport_chance: 0.05, light_teleport_chance: 0.05, teleports_on_projectile_hit: true };
    if (m.sound !== 'none') c['minecraft:ambient_sound_interval'] = { value: 8.0, range: 16.0, event_name: 'ambient' };
    if (m.behavior === 'passive') c['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.25 };
    if (fights(m)) {
      c['minecraft:attack'] = { damage: m.damage };
      c['minecraft:behavior.melee_attack'] = { priority: 3, speed_multiplier: 1.2, track_target: true };
      c['minecraft:behavior.hurt_by_target'] = { priority: 1 };
    }
    if (hostile(m)) {
      c['minecraft:behavior.nearest_attackable_target'] = { priority: 2, must_see: true, reselect_targets: true, within_radius: 25.0,
        entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 25 }] };
      c['minecraft:despawn'] = { despawn_from_distance: {} };
      if (m.burns) c['minecraft:burns_in_daylight'] = {};
    }
    if (breeds(m) && m.food) c['minecraft:behavior.tempt'] = { priority: 4, speed_multiplier: 1.2, items: itemList(m.food) };
    const adult = {
      'minecraft:scale': { value: m.size },
      'minecraft:experience_reward': { on_death: hostile(m) ? 'query.last_hit_by_player ? 5 : 0' : 'query.last_hit_by_player ? Math.Random(1,3) : 0' },
      'minecraft:loot': { table: `loot_tables/entities/${ns}_${id}.json` }
    };
    if (breeds(m) && m.food) {
      adult['minecraft:behavior.breed'] = { priority: 3, speed_multiplier: 1.0 };
      adult['minecraft:breedable'] = { require_tame: m.behavior === 'pet', breed_items: itemList(m.food),
        breeds_with: { mate_type: self, baby_type: self, breed_event: { event: 'minecraft:entity_born', target: 'baby' } } };
      adult['minecraft:experience_reward'].on_bred = 'Math.Random(1,7)';
    }
    groups[`${ns}:adult`] = adult;
    const spawnGroups = [`${ns}:adult`], extra = [];
    if (RIDE) {
      groups[`${ns}:ground`] = { 'minecraft:physics': { has_gravity: true } };
      groups[`${ns}:riding`] = {
        'minecraft:physics': { has_gravity: false },
        'minecraft:flying_speed': { value: 0.08 + SPEEDS[m.speed] * 0.12 },
        'minecraft:input_air_controlled': { strafe_speed_modifier: 1.0, backwards_movement_modifier: 0.5 },
        'minecraft:vertical_movement_action': { vertical_velocity: 0.5 }
      };
      extra.push(`${ns}:ground`);
      events[`${ns}:start_riding`] = { remove: { component_groups: [`${ns}:ground`] }, add: { component_groups: [`${ns}:riding`] } };
      events[`${ns}:stop_riding`] = { remove: { component_groups: [`${ns}:riding`] }, add: { component_groups: [`${ns}:ground`] } };
    }
    if (breeds(m)) {
      groups[`${ns}:baby`] = { 'minecraft:is_baby': {}, 'minecraft:scale': { value: Math.round(m.size * 50) / 100 },
        'minecraft:ageable': { duration: 1200, feed_items: m.food ? itemList(m.food) : [], grow_up: { event: 'minecraft:ageable_grow_up', target: 'self' } },
        'minecraft:behavior.follow_parent': { priority: 6, speed_multiplier: 1.1 } };
    }
    if (m.behavior === 'pet') {
      groups[`${ns}:wild`] = { 'minecraft:tameable': { probability: 0.33, tame_items: itemList(m.tame), tame_event: { event: `${ns}:on_tame`, target: 'self' } } };
      const tame = {
        'minecraft:is_tamed': {},
        'minecraft:behavior.follow_owner': { priority: 5, speed_multiplier: 1.0, start_distance: 10, stop_distance: 2 },
        'minecraft:behavior.owner_hurt_by_target': { priority: 1 },
        'minecraft:behavior.owner_hurt_target': { priority: 2 }
      };
      if (RIDE) Object.assign(tame, {
        'minecraft:rideable': { seat_count: 1, family_types: ['player'], interact_text: 'action.interact.ride.horse', pull_in_entities: false,
          on_rider_enter_event: `${ns}:start_riding`, on_rider_exit_event: `${ns}:stop_riding`,
          seats: [{ position: [0, Math.round(B.seat * m.size * 100) / 100, 0] }] },
        'minecraft:behavior.player_ride_tamed': { priority: 1 }
      });
      else Object.assign(tame, { 'minecraft:sittable': {}, 'minecraft:behavior.stay_while_sitting': { priority: 2 } });
      groups[`${ns}:tame`] = tame;
      spawnGroups.push(`${ns}:wild`);
      events[`${ns}:on_tame`] = { remove: { component_groups: [`${ns}:wild`] }, add: { component_groups: [`${ns}:tame`] } };
    }
    if (breeds(m)) {
      const babyGroups = [`${ns}:baby`].concat(m.behavior === 'pet' ? [`${ns}:wild`] : [], extra);
      events['minecraft:entity_spawned'] = { randomize: [{ weight: 90, add: { component_groups: spawnGroups.concat(extra) } }, { weight: 10, add: { component_groups: babyGroups } }] };
      events['minecraft:entity_born'] = { add: { component_groups: babyGroups } };
      events['minecraft:ageable_grow_up'] = { remove: { component_groups: [`${ns}:baby`] }, add: { component_groups: [`${ns}:adult`] } };
    } else {
      events['minecraft:entity_spawned'] = { add: { component_groups: spawnGroups.concat(extra) } };
    }
    return { format_version: RIDE ? '1.21.90' : '1.21.0', 'minecraft:entity': {
      description: { identifier: self, is_spawnable: true, is_summonable: true },
      component_groups: groups, components: c, events } };
  }
  function lootJson(m) {
    const pools = m.drops.filter(d => d.item).map(d => ({ rolls: 1, entries: [{ type: 'item', name: d.item, weight: 1, functions: [
      { function: 'set_count', count: { min: d.min, max: d.max } }, { function: 'looting_enchant', count: { min: 0, max: 1 } }] }] }));
    return { pools };
  }
  function spawnJson(m, ns, id) {
    const tags = (m.spawn.biomes.length ? m.spawn.biomes : ['common']).map(b => b === 'common' ? (hostile(m) ? 'monster' : 'animal') : b);
    const uniq = [...new Set(tags)];
    const filter = uniq.length === 1 ? { test: 'has_biome_tag', operator: '==', value: uniq[0] } : { any_of: uniq.map(v => ({ test: 'has_biome_tag', operator: '==', value: v })) };
    const light = m.spawn.light === 'day' ? { min: 7, max: 15 } : m.spawn.light === 'night' ? { min: 0, max: 7 } : { min: 0, max: 15 };
    const cond = { 'minecraft:spawns_on_surface': {} };
    if (hostile(m)) cond['minecraft:spawns_underground'] = {};
    cond['minecraft:brightness_filter'] = { min: light.min, max: light.max, adjust_for_weather: hostile(m) };
    if (hostile(m)) cond['minecraft:difficulty_filter'] = { min: 'easy', max: 'hard' };
    cond['minecraft:weight'] = { default: WEIGHTS[m.spawn.weight] || 10 };
    cond['minecraft:herd'] = { min_size: m.spawn.min, max_size: m.spawn.max };
    cond['minecraft:biome_filter'] = filter;
    return { format_version: '1.8.0', 'minecraft:spawn_rules': { description: { identifier: `${ns}:${id}`, population_control: hostile(m) ? 'monster' : 'animal' }, conditions: [cond] } };
  }

  function buildAddon(project, version, texPngs, icon) {
    const ns = slug(project.ns, 'verkstad');
    const name = String(project.name || '').trim() || 'Våra mobbar';
    const base = slug(name, 'mobbar');
    const ver = [1, 0, version];
    const ids = mobIds(project.items);
    const bp = base + '_BP', rp = base + '_RP', U = project.uuids;
    const J = o => enc.encode(JSON.stringify(o, null, 2));
    const files = [], rpFiles = [];
    files.push({ name: `${bp}/manifest.json`, data: J({ format_version: 2,
      header: { name: `${name} BP`, description: 'Mobbar gjorda i Mobverkstaden', uuid: U.bpH, version: ver, min_engine_version: [1, 21, 30] },
      modules: [{ type: 'data', uuid: U.bpM, version: ver }], dependencies: [{ uuid: U.rpH, version: ver }] }) });
    files.push({ name: `${bp}/pack_icon.png`, data: icon });
    rpFiles.push({ name: `${rp}/manifest.json`, data: J({ format_version: 2,
      header: { name: `${name} RP`, description: 'Utseende för Mobverkstaden', uuid: U.rpH, version: ver, min_engine_version: [1, 21, 30] },
      modules: [{ type: 'resources', uuid: U.rpM, version: ver }] }) });
    rpFiles.push({ name: `${rp}/pack_icon.png`, data: icon });
    rpFiles.push({ name: `${rp}/animations/${ns}_mobverkstaden.animation.json`, data: J(animationsJson(ns)) });
    const lang = [], sounds = {};
    project.items.forEach((m, i) => {
      const id = ids[i], disp = (m.name || '').trim() || 'Mob';
      files.push({ name: `${bp}/entities/${id}.json`, data: J(entityJson(m, ns, id)) });
      files.push({ name: `${bp}/loot_tables/entities/${ns}_${id}.json`, data: J(lootJson(m)) });
      if (m.spawn.on) files.push({ name: `${bp}/spawn_rules/${id}.json`, data: J(spawnJson(m, ns, id)) });
      rpFiles.push({ name: `${rp}/entity/${id}.entity.json`, data: J(clientJson(m, ns, id)) });
      rpFiles.push({ name: `${rp}/models/entity/${id}.geo.json`, data: J(geometryJson(m, ns, id)) });
      rpFiles.push({ name: `${rp}/textures/entity/${ns}_${id}.png`, data: texPngs[i] });
      lang.push(`entity.${ns}:${id}.name=${disp}`, `item.spawn_egg.entity.${ns}:${id}.name=Spawnägg: ${disp}`);
      const s = SOUNDS[m.sound]; if (s && s.ev) sounds[`${ns}:${id}`] = { volume: s.volume || 1.0, pitch: [0.8, 1.2], events: s.ev };
    });
    if (Object.keys(sounds).length) rpFiles.push({ name: `${rp}/sounds.json`, data: J({ entity_sounds: { entities: sounds } }) });
    rpFiles.push({ name: `${rp}/texts/languages.json`, data: J(['en_US', 'sv_SE']) });
    const langTxt = enc.encode(lang.join('\n') + '\n');
    rpFiles.push({ name: `${rp}/texts/en_US.lang`, data: langTxt }, { name: `${rp}/texts/sv_SE.lang`, data: langTxt });
    return { files: files.concat(rpFiles), ns, ids, base };
  }

  return { zipStore, crc32, slug, mobIds, BODIES, partOn, hasWings, flies, rides, FOODS, DROPS, SOUNDS, BIOMES, SPEEDS, SPEED_LABEL, WEIGHTS,
    geometryJson, animationsJson, clientJson, entityJson, lootJson, spawnJson, buildAddon };
})();
