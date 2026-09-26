// ==UserScript==
// @name         RO Rebuild Web Assist
// @namespace    ro-rebuild-web-assist
// @version      4.189.57
// @description  ผู้ช่วยเล่นเว็บ client RO — auto-loot, auto-heal, auto-combat, auto-rest + อัปเดตอัตโนมัติ (Unity WebGL / WebSocket)
// @match        *://*.rayrag.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/cadbaht/ro-rebuild-web-assistant/main/ro-rebuild-web-assist.user.js
// @downloadURL  https://raw.githubusercontent.com/cadbaht/ro-rebuild-web-assistant/main/ro-rebuild-web-assist.user.js
// ==/UserScript==

/* ==========================================================================
   RO REBUILD WEB ASSIST  —  ผู้ช่วยเล่นสำหรับเว็บ client (Unity WebGL)
   ==========================================================================

   มี 2 ระบบทำงานแยกกัน (เปิด/ปิดเป็นอิสระ):

     1) AUTO-LOOT  — เก็บของที่ตกจากมอนที่เราฆ่าเอง
     2) AUTO-HEAL  — ใช้ขวดยาอัตโนมัติเมื่อเลือดต่ำกว่า % ที่ตั้ง

   --------------------------------------------------------------------------
   วิธีติดตั้ง
   --------------------------------------------------------------------------
   ทางเลือก A — Tampermonkey (แนะนำ)
     1. ติดตั้งส่วนเสริม "Tampermonkey"
     2. คลิกไอคอน Tampermonkey → Create a new script
     3. ลบเนื้อหาเดิม → วางสคริปต์นี้ทั้งหมด → Ctrl+S บันทึก
     4. รีเฟรชหน้าเว็บเกม (ต้องติดตั้งก่อนเข้าเกม เพราะต้องดัก WebSocket ตั้งแต่ต้น)

   ทางเลือก B — Console (ชั่วคราว)
     1. เปิดหน้าเว็บเกม แต่ "ยังไม่คลิกเข้าเกม"
     2. กด F12 → แท็บ Console
     3. วางสคริปต์นี้ทั้งหมด → Enter
     4. ค่อยคลิกเข้าเกม/เลือกตัวละคร
     (หมายเหตุ: ใช้วิธีนี้ต้องวางใหม่ทุกครั้งที่รีเฟรช)

   --------------------------------------------------------------------------
   ⭐ ที่ใช้บ่อย (พิมพ์ใน console)
   --------------------------------------------------------------------------
     ASSIST.status()           // ดูสถานะทั้งหมด (HP%, คิวของ, ค่าที่ตั้งไว้)
     ASSIST.help()             // ดูคำสั่งทั้งหมด

     // Auto-Loot (เปิดอยู่ default)
     ASSIST.lootOn()  /  ASSIST.lootOff()

     // Auto-Heal ★ DEFAULT = OFF (ยังไม่สมบูรณ์)
     //   ต้องตั้ง item ก่อน แล้วเปิดเอง:
     ASSIST.setHealItems(501,502,503)   // ตั้งไอเทม (จะเปิด auto-heal ให้อัตโนมัติ)
     ASSIST.setHealAt(50)               // เลือดต่ำกว่า 50% → ใช้ยา
     ASSIST.healOn()  /  ASSIST.healOff()

     // Warp-to-Loot ★ DEFAULT = OFF (ส่ง packet วาร์ปจริง)
     //   เก็บไม่ได้ครบ 6 ครั้ง → วาร์ปไปที่ไอเท็ม (กรณีติดกำแพง/หน้าผา)
     ASSIST.warpLootOn() / ASSIST.warpLootOff()

   ==========================================================================
   ส่วนที่ 1 — AUTO-HEAL
   ==========================================================================

   ทำงานยังไง?
     • อ่าน HP จาก packet ของตัวเอง (opcode 0x25 STAT)
     • พอ HP% ต่ำกว่าค่าที่ตั้ง (เช่น 50%) → สั่งใช้ item ที่กำหนด (packet 0x2f)
     • เลือก item 2 โหมด:
         'order'   = ใช้ item ตัวเดิมซ้ำจนกว่าจะหมด แล้วค่อยไปตัวถัดไป
         'random'  = สุ่มเลือก item ใหม่ทุกครั้ง
     • ★ วิธีรู้ว่า item "หมด": ใช้แล้ว HP ไม่ขยับเลย → ถือว่าหมด → ใช้ตัวถัดไป "ทันที"
       (ไม่ mark ว่าอันไหนหมดถาวร เพราะผู้เล่นอาจไปเก็บ/ซื้อเพิ่มมาแล้ว → รอบถัดไปที่วนกลับมาจะลองใหม่)
     • มีดีเลย์ระหว่างการใช้แต่ละครั้ง (ตั้งได้)

   คำสั่ง console (พิมพ์ได้เลย มีผลทันที):
     ASSIST.setHealAt(50)              // เปิด auto-heal + ตั้ง threshold 50%
     ASSIST.setHealItems(501, 502)     // เซ็ตรายการ item id ที่จะใช้ (ทับของเดิม)
     ASSIST.addHealItem(503)           // เพิ่ม item เข้ารายการ
     ASSIST.setHealMode('order')       // 'order' = ใช้ตัวเดิมจนหมดแล้วข้าม, 'random' = สุ่ม
     ASSIST.setHealDelay(800)          // ดีเลย์ 800ms ระหว่างการใช้แต่ละครั้ง
     ASSIST.healOn() / ASSIST.healOff()    // เปิด/ปิด

   ==========================================================================
   ส่วนที่ 2 — AUTO-LOOT
   ==========================================================================

   ทำงานยังไง?
     • ตรวจจับของที่ตกจากมอนที่ "เราฆ่าเอง" (สัญญาณ EXP + ระยะใกล้ตัว)
     • ส่งคำสั่งเก็บของ (packet 0x52)
     • เก็บไม่ได้ → ลองใหม่สูงสุด 6 ครั้ง ห่างกัน 1.2 วิ พร้อมสลับไปเก็บชิ้นอื่นก่อน
     • ครบ 6 ครั้งยังไม่ได้ → ปล่อยทิ้ง
     • ★ server ทำ walk-and-pickup เอง: ส่ง packet เดียว server เดินตัวละครไปเก็บเอง (รองรับนักธนูฆ่าไกล)
     • มีระบบกรอง: เก็บทั้งหมด / เก็บเฉพาะบางชิ้น / ไม่เก็บบางชิ้น

   คำสั่ง console:
     ASSIST.setLootMode('all')         // 'all' = เก็บหมด, 'only' = เก็บเฉพาะ, 'except' = ยกเว้น
     ASSIST.addLootOnly(909, 512)      // เพิ่ม item สำหรับโหมด 'only'
     ASSIST.addLootExcept(909)         // เพิ่ม item สำหรับโหมด 'except'
     ASSIST.clearLootOnly()            // ล้างรายการ 'only'
     ASSIST.clearLootExcept()          // ล้างรายการ 'except'
     ASSIST.name(935, 'Feather')       // ตั้งชื่อ item ให้อ่าน log ง่าย
     ASSIST.lootOn() / ASSIST.lootOff()    // เปิด/ปิด

   --------------------------------------------------------------------------
   เคล็ดลับหา "item id"
   --------------------------------------------------------------------------
   พิมพ์ ASSIST.status() ตอนมีของ/เลือด → จะเห็นชื่อแบบ "item_935" หรือเปิด inventory
   ในเกมแล้วเอา id มาใส่ในคำสั่งด้านบน

   ตัวอย่าง item id ทั่วไป (อ้างอิง RO มาตรฐาน — อาจต่างในแต่ละเซิร์ฟ):
     501 = Red Potion,    502 = Yellow Potion,   503 = White Potion
     504 = Blue Potion,   505 = Wing of Fly,     601 = Wing of Butterfly
     909 = Jellopy,       512 = Apple
   ========================================================================== */

(function () {
  if (window.__ASSIST) { console.warn('[ASSIST] รันอยู่แล้ว'); return; }
  window.__ASSIST = true;

  // ============================================================
  //  VERSION + config persistence (localStorage)
  // ============================================================
  const VERSION = '4.189.57';
  // ★★ CHANGELOG — แสดงในปุ่ม 📜 Update Log (ใหม่สุดขึ้นก่อน)
  const CHANGELOG = [
    { v: '4.189.57', d: '2026-09-26', items: [
      '⌨️ Shared Teleport Macro — ย้ายปุ่ม Macro ลงไปรวมกับชุดวาร์ปในหน้า ⚔️ Combat',
      '   · เอากล่อง TELEPORT MACRO จาก HOTBAR และปุ่มทดสอบ Macro แยกด้านบนออก',
      '   · ปุ่ม ⌨️ Macro ใช้ร่วมกันทั้ง Warp Find และระบบหนีมอน',
      '   · Warp Find: Macro ON → ลอง Alt↓→1→2→3→Alt↑ ก่อน; ถ้าไม่วาร์ปจึง fallback ไป Fly Wing / Teleport Clip / Direct ตามโหมดเดิม',
      '   · หนีมอนรุมและมอนอันตราย: Macro ON → ลอง Macro ก่อน; ถ้าไม่สำเร็จ fallback วาร์ปสุ่มเดิม',
      '   · HP Emergency Flee และ Blacklist Flee ยังคงใช้ Macro ในลำดับ Direct → Clip → Macro → Fly Wing เหมือนเดิม',
      '   · ปุ่ม 🧪 ทดสอบวาร์ปหามอน ใช้ทดสอบ Macro ได้เมื่อเปิด Macro',
    ]},
    { v: '4.189.56', d: '2026-09-26', items: [
      '⌨️ Fixed Teleport Macro — เปลี่ยน Hotkey Macro เป็นชุดคงที่ตาม Macro: กด Alt ค้าง → 1 → 2 → 3 → ปล่อย Alt',
      '   · เว้น 25ms ระหว่างทุก key down/up: Alt↓ → 1↓ → 1↑ → 2↓ → 2↑ → 3↓ → 3↑ → Alt↑',
      '   · เอาปุ่มเลือก Alt+1 / Alt+2 / Alt+3 ออกจากหน้า ⚔️ Combat เหลือ Master ON/OFF + 🧪 ทดสอบ',
      '   · Macro ทำงานเป็นชุดเดียวก่อน fallback Fly Wing ใน HP Emergency Flee และ Blacklist Flee',
      '   · หลังยิง Macro จะยืนยันผลจากการเปลี่ยนแมพ/ตำแหน่งจริง; ถ้าไม่วาร์ปจึง fallback ต่อ',
      '   · เอา config/API เลือก slot (teleportMacroSlots / setTeleportMacroSlots) ออก เพราะไม่ใช้แล้ว',
    ]},
    { v: '4.189.55', d: '2026-09-26', items: [
      '⌨️ Teleport Hotkey Macro — เพิ่มทางหนีผ่าน Hotbar Alt+1 / Alt+2 / Alt+3',
      '   · เปิด/ปิด Macro และเลือกช่อง Alt+1, Alt+2, Alt+3 แยกกันใน Sub-tab ⚔️ Combat',
      '   · ลองเฉพาะช่องที่เปิดไว้ตามลำดับ; ถ้าช่องว่าง/ของใช้ไม่ได้และตำแหน่งไม่เปลี่ยนภายใน ~0.65s จะลองช่องถัดไป',
      '   · แทรกในลำดับ HP Emergency Flee และ Blacklist Flee: Direct/Database TP → Teleport Clip → Hotkey Macro → Fly Wing 601',
      '   · ไม่ต้องอ่านข้อมูล Hotbar ภายในเกม: ระบบยืนยันผลจากการเปลี่ยนแมพ/ตำแหน่งจริง จึงข้ามช่องที่ไม่ทำให้วาร์ปอัตโนมัติ',
      '   · เพิ่มปุ่ม 🧪 ทดสอบ Macro และ API ASSIST.toggleTeleportMacro / setTeleportMacroSlots / testTeleportMacro',
    ]},
    { v: '4.189.54', d: '2026-09-26', items: [
      '🌀 Blacklist Attack Flee — เพิ่มปุ่มหนีเมื่อมอนใน Target Blacklist เป็นฝ่ายโจมตีเรา',
      '   · ตรวจจาก mobAttackers (มอนโจมตี/ตีเรา) ไม่ใช่แค่ยืนอยู่ใกล้ จึงไม่วาร์ปเพียงเพราะเห็นมอน blacklist',
      '   · ลำดับหนีในแมพเหมือน HP Emergency Flee: Direct/Database TP (0x40) → Teleport Clip → ถ้า Clip ไม่ตอบ ~0.45s ใช้ Fly Wing 601',
      '   · ทำงานแม้ ⚔️ Combat OFF; เปิด/ปิดแยกด้วยปุ่ม 🌀 หนี Blacklist ในหน้า Combat',
      '   · ถ้า HP Flee กำลังลอง Teleport Clip อยู่ จะให้ HP Flee ทำงานก่อนเพื่อไม่ให้ packet หนีชนกัน',
      '   · เพิ่ม API ASSIST.toggleBlacklistFlee(true/false)',
    ]},
    { v: '4.189.53', d: '2026-09-26', items: [
      '🛡️ Combat Flee Controls — ย้าย HP Emergency Flee และมอนอันตรายที่ต้องหนีมาไว้ใน Sub-tab ⚔️ Combat ร่วมกับหนีมอนรุม',
      '   · เพิ่มสวิตช์ 🚨 หนีมอนอันตราย ON/OFF โดยไม่ลบรายชื่อ/ระยะที่ตั้งไว้',
      '   · ทั้ง 🏃 หนีมอนรุม / 🚨 หนีมอนอันตราย / ❤️ HP Emergency Flee มีสวิตช์หลักแยกกันในหน้า Combat',
      '   · มอนอันตรายถูกย้ายมาตรวจก่อน combatEnabled guard จึงยังหนีได้แม้ Combat OFF เช่นเดียวกับหนีมอนรุม',
      '   · HP Emergency Flee ยังคงทำงานแบบฉุกเฉินแยกจากการหา/โจมตีเป้า และย้ายเฉพาะ UI มาอยู่ Combat',
      '   · Sub-tab 🏃 Flee เหลือการตั้งค่าหนีผู้เล่น เพื่อแยก Player Flee ออกจาก Combat Flee ชัดเจนขึ้น',
      '   · เพิ่ม API ASSIST.toggleDangerFlee(true/false)',
    ]},
    { v: '4.189.52', d: '2026-09-26', items: [
      '🏃 Mob Flee Independent — หนีมอนรุมทำงานได้แม้ ⚔️ Combat = OFF',
      '   · ปิด Combat = ไม่โจมตี/หาเป้า แต่ถ้า 🏃 หนีมอนรุม = ON ยังตรวจ รุม / aggro / มอนรอบ ตาม threshold เดิม',
      '   · ย้ายการตรวจ Mob Flee ไปก่อน combatEnabled guard โดยคง Player Flee เป็น priority สูงสุด',
      '   · Sync ตำแหน่งผู้เล่นและ /where ได้แม้ Combat OFF เพื่อให้รัศมีนับมอนทำงานถูกต้อง',
      '   · Mob Flee ยังเคารพ cooldown เดิม และไม่ทำงานระหว่าง Sell / Kafra / Unstuck Buff / Chat Pause',
    ]},
    { v: '4.189.51', d: '2026-09-26', items: [
      '🏃 Combat Mob Flee Toggle — เพิ่มปุ่มเปิด/ปิด “หนีมอนรุม” แยกจากค่าจำนวนมอน',
      '   · ย้ายค่า รุม / aggro / มอนรอบ / รัศมีนับมอน ไปไว้ใน Sub-tab ⚔️ Combat',
      '   · ปิด “หนีมอนรุม” แล้วระบบจะไม่ใช้ trigger ทั้ง 3 แบบ แต่ยังจำค่าจำนวนเดิมไว้',
      '   · เปิดกลับมาแล้วใช้ threshold เดิมได้ทันทีโดยไม่ต้องตั้งใหม่',
      '   · หนีผู้เล่น / HP Emergency Flee / รายชื่อมอนอันตราย ยังคงอยู่ใน Sub-tab 🏃 Flee ตามเดิม',
      '   · เพิ่ม API ASSIST.toggleMobFlee(true/false)',
    ]},
    { v: '4.189.50', d: '2026-09-26', items: [
      '♾️ Market All Shops Default — เพิ่มตัวเลือก “ทั้งหมด” และตั้งเป็นค่าเริ่มต้นของจำนวนร้านสูงสุด',
      '   · สแกนรอบตัว / กวาดตามจุดที่บันทึก / กวาดตลาดล่างพรอน จะตรวจ Shop ID ที่ค้นพบทั้งหมดโดยไม่หยุดที่ 200/500 ร้าน',
      '   · ยังคงมีตัวเลือก 50 / 100 / 200 / 500 ร้านสำหรับกรณีต้องการจำกัดจำนวนเอง',
      '   · เอาเพดาน 500 ร้านของ Market Index ออก เพื่อไม่ทิ้งร้านเก่าเมื่อพบร้านมากกว่า 500 ร้านในแมพเดียว',
      '   · คำสั่ง ASSIST.marketScan()/marketSweep()/marketSweepPronLower() ที่ไม่ใส่จำนวน จะใช้ “ทั้งหมด” เป็นค่าเริ่มต้น',
    ]},
    { v: '4.189.49', d: '2026-09-26', items: [
      '↔️ Market Left-edge Resize — เพิ่มขอบลากด้านซ้ายสำหรับขยาย/ย่อความกว้างของหน้าต่าง Market',
      '   · ลากขอบซ้ายไปทางซ้าย = ขยาย Market; ลากไปทางขวา = ย่อ Market',
      '   · ขอบขวายังคงยึด right:12px จึงไม่เลื่อนทับพื้นที่เกมด้านขวาเวลาปรับขนาด',
      '   · Native resize:both มุมขวาล่างยังใช้งานได้เหมือนเดิม',
      '   · จำกัดขนาดตาม min/max เดิมของ Market Compact สำหรับ Chrome Zoom 175%',
    ]},
    { v: '4.189.48', d: '2026-09-26', items: [
      '📐 Market Compact for 175% Zoom — ปรับขนาดเริ่มต้นให้ใกล้เคียงภาพตัวอย่างเมื่อเล่น Chrome Zoom 175%',
      '   · ความกว้างใช้ 23vw (สูงสุด 420px) เพื่อให้หน้าต่างกินพื้นที่ประมาณ 1/4 ของจอแทนการล็อก 420px ตลอด',
      '   · ความสูงใช้ 80vh (สูงสุด 640px) เพื่อคงพื้นที่ผลค้นหาแนวตั้งโดยไม่บังเกมมากเกินไป',
      '   · ลด min-width จาก 340px เหลือ 220px เพื่อให้ browser zoom สูงยังย่อได้จริง',
      '   · ยังคง resize:both สามารถลากขยาย/ย่อเองได้ตามเดิม',
    ]},
    { v: '4.189.47', d: '2026-09-26', items: [
      '🗺️ Market Preset — แยก 43 จุดของ prt_fild08 เป็น Preset ชื่อ “กวาดตลาดล่างพรอน”',
      '   · เพิ่มปุ่ม 🗺️ กวาดตลาดล่างพรอน (43 จุด) ซึ่งใช้จุด Built-in และไม่ถูกลบโดยปุ่มล้าง Saved Points',
      '   · เอาปุ่ม 🧹 ล้างจุดบันทึกกลับมาในหน้า Market; ล้างเฉพาะจุดที่ผู้ใช้บันทึกเองของแมพปัจจุบัน',
      '   · จุดที่ผู้ใช้กด 📍 บันทึกจุด แยกจาก Preset โดยสมบูรณ์ ไม่คัดลอก 43 จุดเข้า localStorage อีก',
      '   · ปุ่ม 🗺️ กวาดตามจุดที่บันทึก ใช้เฉพาะ Saved Points ส่วน Preset พรอนใช้ปุ่มของตัวเอง',
    ]},
    { v: '4.189.46', d: '2026-09-26', items: [
      '🛠️ Market Default Points Fix — แก้ปัญหา Default Saved Points 43 จุดหายและปุ่มกวาดถูกปิด',
      '   · Default 43 จุดของ prt_fild08 เปลี่ยนเป็น Built-in fallback ใช้ได้เสมอเมื่อ localStorage ไม่มีจุด',
      '   · ยกเลิกผลของ legacy seed marker ที่เคยทำให้ Default ไม่กลับมาหลังข้อมูล Saved Points ว่าง',
      '   · รองรับชื่อแมพ prt_fild08.gat โดย normalize เป็น prt_fild08 อัตโนมัติ',
      '   · ถ้ากด 📍 บันทึกจุดขณะใช้ Default ระบบจะคัดลอก 43 จุดเดิมก่อนแล้วค่อยเพิ่มจุดใหม่ ไม่ทำให้ Default หาย',
      '   · สถานะแสดงชัดเจนว่าใช้ (Default) หรือ (Saved)',
    ]},
    { v: '4.189.45', d: '2026-09-26', items: [
      '🛡️ Market Saved Points Safety — เอาปุ่มลบจุดล่าสุดและล้างจุดทั้งหมดออกจากหน้าต่าง Market',
      '   · เหลือเฉพาะปุ่ม 📍 บันทึกจุด เพื่อป้องกันการกดลบ Saved Points โดยไม่ตั้งใจ',
      '   · จุดกวาดพื้นฐานเดิมและ Default 43 จุดของ prt_fild08 ไม่ถูกแตะต้อง',
      '   · ปุ่ม 🧹 ด้านบนยังคงมีไว้ล้าง Market Index เท่านั้น และไม่ลบ Saved Points',
    ]},
    { v: '4.189.44', d: '2026-09-26', items: [
      '📍 Market Shop Access Point — จำจุดที่เคยเปิดร้านสำเร็จของแต่ละร้านไว้ใน Market Index',
      '   · ตอน Scan/Sweep/เปิดร้านสำเร็จ จะบันทึกพิกัดที่ส่งคำสั่งเปิดร้านเป็น access point ของร้านนั้น',
      '   · ปุ่มร้านเปลี่ยนเป็น “🛒 ไปเปิด” — ถ้าอยู่ไกลจะพัก automation แล้วเดินไป access point ก่อนเปิดร้าน',
      '   · เมื่อเปิดสำเร็จจากจุดใหม่ จะอัปเดต access point ให้สดใหม่อัตโนมัติและบันทึกลง localStorage',
      '   · ถ้าร้านเก่าจากเวอร์ชันก่อนยังไม่มี access point จะลองเปิดตรงตำแหน่งปัจจุบันก่อน และแนะนำให้สแกนใหม่หากเปิดไม่ได้',
      '   · เปลี่ยนแมพยังคงล้าง Market Index ตาม v4.189.38 ดังนั้นจุดร้านจะไม่ปนข้ามแมพ',
    ]},
    { v: '4.189.43', d: '2026-09-26', items: [
      '📍 Default Market Points — ฝังจุดกวาดมาตรฐาน 43 จุดสำหรับ prt_fild08 ไว้ในสคริปต์',
      '   · เครื่อง/เบราว์เซอร์ที่ยังไม่มี Saved Points จะได้รับชุด 43 จุดนี้อัตโนมัติครั้งแรก',
      '   · ถ้ามี Saved Points ของ prt_fild08 อยู่แล้ว จะไม่เขียนทับค่าที่ผู้ใช้บันทึกไว้',
      '   · หลังผู้ใช้ล้างจุดเอง ระบบจะไม่สร้าง Default กลับมาเองในทุกครั้งที่รีโหลด',
      '   · Market Sweep ยังคงเดินเฉพาะ Saved Points เท่านั้น ไม่มี GAT/NAV/กวาดทั้งแมพ fallback',
    ]},
    { v: '4.189.42', d: '2026-09-26', items: [
      '📍 Market Saved Points Only — เอาโหมดกวาดทั้งแมพ/GAT/NAV fallback ออกจาก Market Sweep',
      '   · เปลี่ยนจากอัดเส้นทางตอนเดินเป็นบันทึกจุดเองทีละจุดจากตำแหน่งตัวละคร',
      '   · จุดที่บันทึกจะถูกเก็บแยกตามแมพใน localStorage และใช้เป็นค่าเริ่มต้นอัตโนมัติทุกครั้ง',
      '   · ใช้ Storage ใหม่สำหรับ Saved Points โดยเฉพาะ ไม่ดึงเส้นทางอัดเดินจาก v4.189.40 มาใช้ปน',
      '   · เพิ่ม 📍 บันทึกจุด / ↩ ลบจุดล่าสุด / 🧹 ล้างจุด และแสดงจำนวนจุดที่บันทึก',
      '   · ปุ่ม Sweep จะทำงานได้เมื่อมีจุดเท่านั้น และเดินเฉพาะจุดที่บันทึกไว้ตามลำดับ',
      '   · ไม่มี Market Sweep แบบกวาดทั้งแมพอีกต่อไป; GAT/NAV ของระบบบอทส่วนอื่นยังคงเดิม',
    ]},
    { v: '4.189.41', d: '2026-09-26', items: [
      '🧹 Remove Market Sweep Zone — เอาระบบกำหนดโซนมุม A/B ออกจาก Market ทั้งหมด',
      '   · ลบปุ่ม 📍 มุม A / 📍 มุม B / ล้างโซน และสถานะโซนออกจากหน้าต่าง Market',
      '   · ลบโค้ด/Storage/API ของ Sweep Zone และล้างค่าโซนเก่าที่ค้างใน localStorage อัตโนมัติ',
      '   · Auto Market Sweep ใช้ Recorded Route เป็นลำดับแรก; ถ้าไม่มีจึง fallback ไป GAT/NAV ทั้งแมป',
      '   · ปุ่ม Sweep จะแสดง “กวาดตามเส้นทาง” เมื่อมี Recorded Route เพื่อให้ตรงกับการทำงานจริง',
    ]},
    { v: '4.189.40', d: '2026-09-25', items: [
      '📝 Market Route Recorder — สร้างเส้นทางกวาดตลาดด้วยการเดินจริง ไม่ต้องมี GAT',
      '   · กดเริ่มบันทึก → เดินตลาดด้วยมือให้ทั่ว → เปิด Market อีกครั้งแล้วกดจบบันทึก',
      '   · เก็บพิกัดจริงจาก server ระหว่างเดินทุกช่วงระยะ และบันทึกแยกตามแมปใน localStorage',
      '   · Auto Market Sweep จะใช้เส้นทางที่บันทึกไว้เป็นลำดับแรก ก่อน GAT/NAV',
      '   · ระหว่างบันทึกจะพัก Combat/Loot/Skill/Warp/Sell/Kafra ชั่วคราว และคืนค่าเมื่อจบ',
      '   · เพิ่มล้างเส้นทาง/สถานะจำนวนจุด และแก้ NAV fallback ให้ route index map กลับเป็น node จริง',
    ]},
    { v: '4.189.39', d: '2026-09-25', items: [
      '📐 Market Sweep Zone — กำหนดพื้นที่กวาดตลาดเป็นกรอบสี่เหลี่ยมได้',
      '   · ตั้งมุม A / มุม B จากพิกัดตัวละครปัจจุบัน แล้ว Auto Market Sweep จะสร้าง waypoint เฉพาะในกรอบ',
      '   · GAT/NAV ถูก clip ให้อยู่ในโซน; ถ้าโซนไม่มีทางเดินจะไม่ออกไปกวาดนอกกรอบ',
      '   · จำโซนแยกตามชื่อแมปใน localStorage เปิดเกมครั้งถัดไปยังใช้ต่อได้',
      '   · ถ้ายังไม่ตั้งโซน ปุ่ม Sweep จะทำงานแบบกวาดทั้งแมปเหมือนเดิม',
    ]},
    { v: '4.189.38', d: '2026-09-25', items: [
      '🗺️ Market Index Scope — เปลี่ยนจากล้างทุกครั้งที่เปิด Market เป็นล้างเมื่อออกจากแมพ/เปลี่ยนแมพ',
      '   · เปิด/ปิด Market ซ้ำในแมพเดิม ข้อมูลร้านและราคายังคงอยู่ ไม่ต้องสแกนใหม่ทุกครั้ง',
      '   · เมื่อ MAP_NAME / SELECT_CHAR / /where ยืนยันว่าเปลี่ยนแมพ จะล้าง Market Index และ localStorage ทันที',
      '   · รีเซ็ต Search/Pagination และยกเลิก Market Scan/Sweep ที่กำลังทำอยู่เมื่อเปลี่ยนแมพ',
      '   · คง Shop-ID Discovery/Calibration ไว้ แต่ล้าง Known Shop IDs ของแมพเก่าเพื่อไม่ให้ปนกับแมพใหม่',
    ]},
    { v: '4.189.37', d: '2026-09-25', items: [
      '🗺️ Auto Market Sweep — เพิ่มโหมดเดินกวาดแมปเพื่อเก็บร้าน/สินค้าอัตโนมัติ',
      '   · ใช้ GAT สร้าง waypoint ครอบคลุมพื้นที่เดินได้ แล้วเดินไปทีละจุดพร้อมสแกน Shop ID ที่ Client เพิ่งโหลด',
      '   · Shop ID ที่ตรวจแล้วจะไม่ตรวจซ้ำในรอบเดียว ช่วยลด packet/เวลา; จุดที่เดินไม่ถึงหรือค้างจะข้ามอัตโนมัติ',
      '   · แสดงสถานะ จุด x/y · ตรวจ candidate · เจอร้าน · จำนวนรายการ และมีปุ่มหยุดกวาดได้ทันที',
      '   · เพิ่ม limit 500 ร้าน; กวาดจะหยุดเมื่อครบ limit หรือครบ waypoint ทั้งหมด แล้วคืนค่า automation เดิม',
      '   · ถ้าแมปไม่มี GAT จะ fallback ไปใช้ NAV nodes/route; ถ้าไม่มีทั้งสองแบบจะแจ้งตรงๆ และไม่สุ่มเดิน',
    ]},
    { v: '4.189.36', d: '2026-09-25', items: [
      '🧹 Fresh Market Index — ทุกครั้งที่เปิด Market จะล้างดัชนีร้าน/สินค้าเดิมก่อนทันที',
      '   · เคลียร์ข้อมูล Market Index ที่บันทึกจากรอบก่อนออกจาก memory และ localStorage',
      '   · รีเซ็ตคำค้นหาและ Pagination กลับหน้า 1 ทุกครั้งที่เปิด Market',
      '   · คง Shop-ID Discovery/Calibration ไว้ เพื่อให้กดสแกนรอบใหม่ได้ทันทีโดยไม่ต้องเรียนรู้ใหม่',
      '   · ผลที่เห็นหลังเปิด Market จึงเป็นข้อมูลจากการสแกน/เปิดร้านในรอบปัจจุบันเท่านั้น',
    ]},
    { v: '4.189.35', d: '2026-09-25', items: [
      '📱 Market Vertical UI — ปรับหน้าต่าง Market เป็นแนวตั้งขนาดเล็ก บังหน้าจอเกมน้อยลง',
      '   · ขนาดเริ่มต้นประมาณ 420px × 640px และยัง resize ได้',
      '   · เปลี่ยนผลค้นหาเป็นการ์ดแนวตั้ง อ่านสินค้า/ราคา/ร้าน/พิกัดง่ายขึ้นในพื้นที่แคบ',
      '   · Pagination หน้าละ 10 รายการ พร้อม ก่อนหน้า / ถัดไป และเลขหน้า',
      '   · พิมพ์ค้นหาใหม่จะกลับไปหน้า 1 อัตโนมัติ และยังคงปุ่ม 🛒 เปิดร้านไว้ครบ',
    ]},
    { v: '4.189.34', d: '2026-09-25', items: [
      '🔢 Market Scan Limit — เปลี่ยนช่องรัศมีเป็นจำนวนร้านสูงสุดที่ต้องการสแกน',
      '   · เลือกได้ 50 / 100 / 200 ร้าน; ค่าเริ่มต้น 100 ร้าน',
      '   · Scanner ใช้ Shop-ID Discovery ตามจริง จึงไม่แสดงรัศมีที่ไม่ได้มีผลกับการสแกนอีก',
      '   · แถบสถานะจะแสดงจำนวนที่กำลังตรวจและจำนวนร้านที่พบตาม limit ที่เลือก',
    ]},
    { v: '4.189.33', d: '2026-09-25', items: [
      '🧹 Market Cleanup — เอา Packet Capture ออกจาก Market Search ทั้งหมด',
      '   · ลบ Advanced: Packet Capture, ปุ่ม Capture/Copy/Clear และหน้าต่าง log packet',
      '   · ลบ runtime packet hook ของ Market และ API marketCapture*',
      '   · คง Market Scanner / Search / Price Compare / 🛒 เปิดร้าน ไว้ครบ',
      '   · ย่อหน้าต่าง Market ลงอีก เพราะไม่มีส่วน Capture ด้านล่างแล้ว',
    ]},
    { v: '4.189.32', d: '2026-09-25', items: [
      '🪟 Market Compact UI — ย่อหน้าต่าง Market Search ให้กะทัดรัดขึ้น',
      '   · ค่าเริ่มต้น 700×560px (ไม่เกิน 92vw / 64vh) และลากขอบปรับขนาดเองได้',
      '   · ตารางรายการใช้พื้นที่หลักของหน้าต่างและยืด/หดตามขนาดหน้าต่าง',
      '   · ย้าย Packet Capture ทั้งชุดเข้า Advanced แบบพับจริง — ปิดอยู่จะไม่กินพื้นที่',
      '   · ลด padding/ปุ่ม/หัวตารางเล็กน้อย แต่คง Search / Scan / Open Shop ครบ',
    ]},
    { v: '4.189.31', d: '2026-09-25', items: [
      '🛒 Market Open Shop — เพิ่มปุ่มเปิดร้านจริงจากผลค้นหาได้ทันที',
      '   · แต่ละแถวสินค้าเพิ่มปุ่ม 🛒 เปิดร้าน ใช้ Shop Open ID ที่ Market Scanner เก็บไว้',
      '   · กดแล้วเปิดหน้าร้านจริงค้างไว้สำหรับเลือกซื้อ ไม่ปิดอัตโนมัติเหมือนตอนสแกน',
      '   · รอตรวจ IN 0x6b เพื่อยืนยันว่าร้านยังเปิดอยู่; ถ้าข้อมูลเก่า/ร้านปิดแล้วจะแจ้งเปิดไม่สำเร็จ',
      '   · เมื่อเปิดสำเร็จ Market Search จะซ่อนให้อัตโนมัติ เพื่อเห็นหน้าร้านในเกมทันที',
    ]},
    { v: '4.189.30', d: '2026-09-25', items: [
      '🔎 Market Scanner Fix — แก้ช่องค้นหาพิมพ์ไม่ได้ + เปลี่ยนวิธีหา Shop ID ที่ถูกต้อง',
      '   · ช่องค้นชื่อ/Item ID ในหน้าต่าง Market รับคีย์ได้แล้ว แม้ Unity WebGL แย่ง focus',
      '   · ยกเลิกการเดา Shop ID จาก player entity (ผลจริงตรวจ 50 คน = 0 ร้าน เพราะ ID คนละชุด)',
      '   · เพิ่ม Shop-ID Discovery: เก็บ packet ตอนเข้าแมป แล้วเรียนรู้แหล่ง Shop ID จากการเปิดร้านด้วยมือ 1 ครั้ง',
      '   · เมื่อเรียนรู้ signature ได้ จะสกัด Shop ID ของร้านอื่นจาก packet ที่ Client รับไว้ แล้วปุ่มสแกนใช้ ID ชุดนี้แทน player ID',
      '   · จำ signature ที่เรียนรู้ไว้ในเครื่อง; รอบถัดไปหลังเข้าแมปสามารถสแกนร้านที่ค้นพบได้โดยไม่ต้อง calibrate ซ้ำ',
      '   · ถ้ายังเรียนรู้ไม่ได้ UI จะแจ้งตรงๆ ว่าต้อง Reload/เข้าแมปใหม่แล้วเปิดร้าน 1 ร้านเพื่อ Calibration แทนการขึ้น เจอ 0 ร้าน แบบกำกวม',
    ]},
    { v: '4.189.29', d: '2026-09-25', items: [
      '🔎 Market Index / Price Compare — ถอด protocol ร้านค้าจาก capture จริงแล้ว',
      '   · OUT 0x6b len=5 = ขอเปิดร้าน, IN 0x6b = ชื่อร้าน + จำนวนรายการ + item/qty/price, OUT 0x6a = ปิดร้าน',
      '   · รองรับ record สินค้า 2 แบบ: stackable type=1 (15 bytes) และ equipment type=2 (49 bytes)',
      '   · เปิดร้านด้วยมือครั้งเดียว Assist จะบันทึกสินค้า ราคา ร้าน ผู้ขาย พิกัด และเวลาให้อัตโนมัติ',
      '   · เพิ่มหน้าค้นหา Item ID/ชื่อ + เรียงราคาถูก→แพง + ทำเครื่องหมาย ⭐ ราคาถูกสุด',
      '   · เพิ่ม 🔄 สแกนร้านรอบตัว (ทดลอง) ไล่ query ผู้เล่นที่ Client มองเห็นทีละคนแบบ rate-limit และเก็บเฉพาะร้านที่ตอบ 0x6b',
      '   · Market index เก็บในเครื่องและล้างได้จากหน้าต่าง 🔎; Capture เดิมยังอยู่สำหรับ debug protocol',
    ]},
    { v: '4.189.28', d: '2026-09-25', items: [
      '🔎 Market Packet Capture — เพิ่มเครื่องมือจับ protocol ร้านค้าเพื่อทำระบบค้นหา/เทียบราคาแบบใบหาของในขั้นถัดไป',
      '   · เพิ่มปุ่ม 🔎 ใน mini-bar เปิดหน้าต่าง Capture โดยไม่บังการคลิกร้านในเกม',
      '   · จับทั้ง IN/OUT พร้อม opcode, length, full hex และ CLICK marker เพื่อเทียบ packet ก่อน/หลังเปิดร้าน',
      '   · Capture 30 วินาทีและ pause automation ชั่วคราวเพื่อลด packet รบกวน แล้วคืนค่าระบบเดิมอัตโนมัติ',
      '   · แสดงสรุป signature ของ packet + ปุ่ม 📋 คัดลอกผล เพื่อส่งกลับมาวิเคราะห์ได้โดยไม่ต้องเดา opcode',
      '   · ยังไม่สแกน/ซื้อของอัตโนมัติ — เวอร์ชันนี้ใช้เรียนรู้ Shop/Search Store protocol จริงของเซิร์ฟเวอร์ก่อน',
    ]},
    { v: '4.189.27', d: '2026-09-25', items: [
      '💬 Chat Alert + Pause — เมื่อมี nearby/whisper จากผู้เล่นอื่น ให้หยุดการเคลื่อนไหว/ต่อสู้อัตโนมัติชั่วคราว',
      '   · ไม่ตอบอัตโนมัติ: แสดงกล่องแจ้งเตือนพร้อมปุ่มตอบด่วน 👋 / ครับ / แป๊บนึงครับ — ต้องกดเองทุกครั้ง',
      '   · ปุ่ม ▶ Resume ให้กลับมาทำงานต่อ โดยไม่เปลี่ยนค่า Combat/Warp/Wander ที่ตั้งไว้',
      '   · ระหว่าง Pause: หยุด Combat/Wander/Flee/WarpFind/Loot/WarpLoot/Auto Buff และไม่เริ่ม Sell/Storage/AB/Buff Visit รอบใหม่; Auto-Heal ยังทำงานเพื่อความปลอดภัย',
      '   · เพิ่ม toggle Chat Alert + Pause และปุ่ม 🧪 ทดสอบ Chat Alert ในแท็บ 🔔 สำคัญ',
      '   · ข้อความทดสอบไม่ส่งแชทจริง; ปุ่มตอบด่วนจะส่งจริงเฉพาะเมื่อเป็นแชทที่รับมาจริงและผู้ใช้กดเอง',
    ]},
    { v: '4.189.26', d: '2026-09-25', items: [
      '🧪 Warp Find Test — เพิ่มปุ่มทดสอบระบบวาร์ปหามอนแบบ Manual Diagnostic',
      '   · กดทดสอบได้ทันทีโดยไม่ต้องรอ noMonsterWarpSec และไม่ต้องเปิด Warp Find ก่อน',
      '   · Log แสดง Combat/WarpFind state, โหมดที่เลือก, SP, Fly Wing stock และ cooldown ของ Auto',
      '   · ทดสอบตามโหมดจริง: Fly Wing 601 / Teleport Clip skillId 53 / Direct random warp',
      '   · หลังส่งคำสั่งจะตรวจตำแหน่งอีกครั้งและแจ้งว่าเห็นการวาร์ปสำเร็จหรือยังไม่เห็น movement update',
    ]},
    { v: '4.189.25', d: '2026-09-25', items: [
      '🧹 Standalone / No Relay — ตัด Relay Server ออกจาก Userscript ทั้งหมด',
      '   · ลบ Remote Monitor 🌐, Feedback 🐞 และ Telegram Alerts ที่พึ่ง Relay',
      '   · ไม่สร้าง WebSocket ไป relay server และไม่มี auto-reconnect เบื้องหลังอีก',
      '   · ลบ config monitorServer*/telegram relay ออกจาก Profile/Backup; ค่าเก่าจะถูกทำความสะอาดเมื่อบันทึกครั้งถัดไป',
      '   · คง Monitor ในเครื่อง 🖥️ (BroadcastChannel/localStorage/popup) และระบบบอทหลักทั้งหมดไว้ตามเดิม',
    ]},
    { v: '4.189.24', d: '2026-09-25', items: [
      '🔐 Security Hardening — กัน credentials หลุดผ่าน Backup/Profile และเตรียม Relay patch แบบไม่ฝัง Admin Token',
      '   · Backup/Export ไม่รวม Telegram Bot Token, Telegram Chat ID, Auto-login Username/Password',
      '   · Profile ไม่บันทึก credentials และสลับ Profile จะไม่เขียนทับ credentials ที่เก็บเฉพาะเครื่อง',
      '   · Import backup เก่าจะข้าม credential fields อัตโนมัติ',
      '   · ล้าง credential fields ที่เคยค้างอยู่ใน Profile เก่าออกจาก localStorage อัตโนมัติ',
      '   · Relay security bundle: ADMIN_TOKEN ต้องมาจาก environment, ไม่ใช้ ?token= ในหน้า Feedback, runtime secret files ถูก .gitignore',
    ]},
    { v: '4.189.23', d: '2026-09-25', items: [
      '🔐 Telegram Token Security — ลบ Telegram Bot Token ที่เคย hardcode อยู่ใน source ออกทั้งหมด',
      '   · Feedback ไม่ยิง Telegram API จาก browser โดยตรงอีกต่อไป แต่ส่งผ่าน Relay Server เท่านั้น',
      '   · ลบ Feedback Chat ID ที่ฝังใน source และลบตัวอย่าง token รูปแบบจริงออกจาก placeholder',
      '   · Telegram Alerts ที่ผู้ใช้ตั้งเองยังใช้งานผ่าน Relay ได้เหมือนเดิม โดยไม่มี token ผู้พัฒนาฝังใน userscript',
    ]},
    { v: '4.189.22', d: '2026-09-25', items: [
      '⚔️🏠 Combat-gated Return — หลังขาย/ฝากเสร็จ ถ้า Combat OFF จะไม่วาร์ปกลับแมพฟาร์ม',
      '   · Sell/Storage จะค้างสถานะ WAIT_COMBAT_RETURN อยู่ในเมืองจนกด Combat ON',
      '   · พอกด Combat ON จะวาร์ปกลับ map/x/y เดิมที่จดไว้ทันที',
      '   · WAIT_COMBAT_RETURN ไม่โดน watchdog 120s ตัดทิ้ง จึงรอได้ไม่จำกัด',
      '   · Kafra Auto Cancel [4F 05 00 00 00] ยังทำงานก่อนเข้า WAIT_COMBAT_RETURN ตามเดิม',
    ]},
    { v: '4.189.20', d: '2026-09-25', items: [
      '🏦✅ Kafra Cancel FINAL — ล็อก packet จาก Re-Capture จริง: OUT 0x4F len=5 [4F 05 00 00 00]',
      '   · หลังฝากเสร็จ: Storage Close [56 00] → รอเมนู Kafra → Cancel [4F 05 00 00 00] → กลับฟาร์ม',
      '   · ลบ UI/Hook ของ Kafra Cancel Capture ชั่วคราวออกแล้ว',
      '🏦🔬 Kafra Cancel Re-Capture — ปิด Auto Cancel ชั่วคราวเพื่อจับ packet จริงใหม่แบบละเอียด',
      '   · หลังฝากเสร็จจะค้างที่เมนู Kafra ไม่วาร์ปกลับ เพื่อให้กดจับ packet แล้วกด Cancel เอง',
      '   · Capture ทั้ง IN/OUT พร้อม full HEX ของ OUT + CLICK marker และหยุดอัตโนมัติหลังคลิก',
      '   · ยังไม่ล็อก packet Cancel จนกว่าจะยืนยันจาก capture รอบใหม่นี้',
    ]},
    { v: '4.189.19', d: '2026-09-25', items: [
      '🏦✅ Kafra Cancel Sequence Fix — แก้เมนู Kafra ค้างหลังฝากของเสร็จ',
      '   · จาก Capture จริง การกด Cancel ส่ง OUT [04] แล้วตามด้วย OUT [02] ประมาณ 20ms',
      '   · flow ใหม่: ฝากเสร็จ → Storage Close [56 00] → Kafra Cancel [04] → [02] → วาร์ปกลับจุดฟาร์ม',
      '   · รอหลังส่งชุด Cancel ก่อนวาร์ปกลับ เพื่อให้เมนูปิดจริง',
    ]},
    { v: '4.189.18', d: '2026-09-25', items: [
      '🏦✅ Kafra Auto Cancel — หลังฝากของเสร็จจะปิด Storage แล้วกด Cancel เมนู Kafra อัตโนมัติ',
      '   · ล็อก packet จาก Capture จริง: Kafra Cancel = [02]',
      '   · flow ใหม่: ฝากเสร็จ → Storage Close [56 00] → Kafra Cancel [02] → วาร์ปกลับจุดฟาร์ม',
      '   · เอาปุ่ม/กล่อง Kafra Cancel Capture ชั่วคราวออกจากหน้า Storage',
    ]},
    { v: '4.189.17', d: '2026-09-25', items: [
      '🏦🔬 Kafra Cancel Packet Capture — เพิ่มปุ่มดัก packet ชั่วคราวเพื่อจับคำสั่ง Cancel หลังฝากของเสร็จ',
      '   · แสดง IN/OUT opcode, length, hex และ CLICK marker รอบจังหวะกด Cancel ในเกม',
      '   · ระหว่าง Capture จะพัก storage state ชั่วคราว เพื่อไม่ให้วาร์ปกลับก่อนผู้ใช้กด Cancel',
      '   · ยังไม่ส่ง Cancel อัตโนมัติ จนกว่าจะยืนยัน packet จาก capture จริง',
    ]},
    { v: '4.189.16', d: '2026-09-25', items: [
      '💰🏦 Fix Manual Sell/Storage Walk — กดขาย/ฝากเดี๋ยวนี้แล้วเดินต่อจนถึง NPC/Kafra ได้เสถียรขึ้น',
      '   · จุด X/Y เปลี่ยนเป็น navigation anchor: ถ้าเห็น NPC ในระยะใกล้จะเข้าหา NPC ต่อทันที ไม่บังคับแตะจุด anchor ให้เป๊ะก่อน',
      '   · เพิ่ม Route Progress Watchdog — ถ้าส่งเดินแล้วตำแหน่งไม่ขยับ จะเปลี่ยนมุมด้วย long detour 12–15 ช่องอัตโนมัติ แก้ค้างหน้ากำแพง/สิ่งกีดขวาง',
      '   · Sell และ Kafra ใช้ routine เดินชุดเดียวกัน พร้อม recovery เมื่อเส้นตรงถูกบล็อก',
      '   · แยก GitHub URL สำหรับ Update ออกจาก Asset/DB resource เพื่อไม่ให้การเปลี่ยน repo อัปเดตกระทบ resource ภายในสคริปต์',
    ]},
    { v: '4.189.15', d: '2026-09-25', items: [
      '🧹 ถอดระบบ Warp Dance ออกทั้งหมด — ลบ UI, config, runtime logic และ event handlers',
      '   · การตี/วาร์ปหามอน/วาร์ปไปหามอนที่ตี และระบบหนีอื่น ๆ ยังทำงานเหมือนเดิม',
    ]},
    { v: '4.189.14', d: '2026-09-25', items: [
      '⬆ One-Click Update — เมื่อพบเวอร์ชันใหม่ กดปุ่มอัปเดตแล้วเปิดหน้า Update ของ Tampermonkey ทันที',
      '   · ตัด confirm ซ้ำในหน้า Assist ออก เหลือยืนยัน Update/Install ของ Tampermonkey ตามข้อจำกัดของ extension',
      '   · ใช้ Raw .user.js จาก GitHub cadbaht โดยตรง และคงค่าตั้งค่าปัจจุบันไว้ก่อนอัปเดต',
    ]},
    { v: '4.189.13', d: '2026-09-25', items: [
      '🔄 Update Check UI — แสดงปุ่มเช็คอัปเดตตลอด ไม่เงียบเมื่อเวอร์ชันเท่ากัน',
      '   · กดแล้วเห็นสถานะ ⏳ กำลังเช็ค / ✅ ล่าสุด / ⬆ มีเวอร์ชันใหม่ / ⚠ เช็คไม่ได้',
      '   · ถ้า GitHub มีเวอร์ชันใหม่ ปุ่มเดิมจะเปลี่ยนเป็นปุ่มอัปเดตทันที',
    ]},
    { v: '4.189.12', d: '2026-09-25', items: [
      '💰🏦 Fix ปุ่มใช้พิกัดตัวละคร — อัปเดตแมป/เมือง + X/Y บน UI ทันทีและบันทึก config',
      '   · Sell และ Kafra ใช้ currentMap ปัจจุบันร่วมกับพิกัดตัวละคร ไม่ต้องกดใช้ค่าซ้ำ',
    ]},
    { v: '4.189.11', d: '2026-09-25', items: [
      '🔄 เปลี่ยนแหล่งอัปเดตเป็น GitHub ของ cadbaht/ro-rebuild-web-assistant',
      '   · @updateURL / @downloadURL / GITHUB_RAW ใช้ Raw URL จาก branch main ของ repo ใหม่',
    ]},
    { v: '4.189.10', d: '2026-09-25', items: [
      '❤️ HP Authoritative Sync บนฐาน v4.189.7 — UI/Heal/Rest ใช้ HP จาก STAT/SPAWN ของ server เท่านั้น',
      '🛡️ แยก safety HP สำหรับ HP Emergency Flee เพื่อหนีเร็ว โดยไม่ทำให้ตัวเลข HP บน UI drift',
      '🔧 ไม่รวม Standard Profile patch จาก v4.189.8/4.189.9 — คง config/profile behavior ของ v4.189.7 เดิม',
    ]},
    { v: '4.189.7', d: '2026-09-24', items: [
      '🚶 Long Wake Move — ปรับตามการทดสอบจริง: หลัง Unstuck ต้องสั่งเดินไกลกว่า ~10 ช่องจึงปลด movement state',
      '   · เปลี่ยนก้าวปลุกจาก 1–3 ช่องเป็น 12–15 ช่อง (ไม่เกิน game click-walk cap 16)',
      '   · เลือกทิศไปยัง Sell/Kafra ก่อน ถ้าทางตันจะวนทิศอื่นและตรวจ GAT line-walkable เมื่อมีข้อมูล',
      '   · เมื่อ server ส่ง MOVE_UPDATE ยืนยันว่าขยับแล้ว จึงต่อ GAT/NAV/path ปกติทันที',
    ]},
    { v: '4.189.6', d: '2026-09-24', items: [
      '🚶 Wake Move หลัง Unstuck — แก้อาการต้องคลิกเดินเอง 1 ครั้งก่อน Sell/Kafra ถึงจะเดิน',
      '   · หลัง /where ยืนยัน Save Point จะส่งก้าวสั้น 1–3 ช่องไปช่องข้างตัวก่อน ไม่ยิงก้าวไกลเป็นคำสั่งแรก',
      '   · วนลอง 8 ทิศและเลือกช่องที่ GAT เดินได้เมื่อมีข้อมูล จน server ส่ง MOVE_UPDATE ยืนยันว่าขยับจริง',
      '   · เมื่อขยับสำเร็จจึงเริ่ม GAT/NAV/path ไปจุด Sell/Kafra ตามปกติ; ไม่ต้องคลิกปลุกเอง',
      '   · สั่งโหลด GAT ของแมพ Save Point ทันทีเพื่อช่วยเลือกก้าวแรก/เส้นทางในแมพที่มีสิ่งกีดขวาง',
    ]},
    { v: '4.189.5', d: '2026-09-24', items: [
      '🚶 Fix Unstuck → Walk — แก้อาการ Sell/Kafra Unstuck แล้วไม่เดินจนกว่าจะคลิกเอง',
      '   · หลังส่ง Direct Unstuck 0x73 จะทิ้ง player.x/y เก่าทันที ป้องกัน sendMove clamp จากพิกัดก่อน Unstuck',
      '   · ขอพิกัด Save Point จริงจาก server ด้วย /where (0x37) อัตโนมัติ แล้วค่อยเริ่มเดิน',
      '   · /where response อัปเดต currentMap ด้วย เพราะเป็นข้อมูล authoritative จาก server',
      '   · เมื่อได้พิกัดใหม่แล้ว เริ่มส่งก้าวแรกไป NPC/Kafra ใน tick เดียว ไม่ต้องคลิกปลุกการเดิน',
    ]},
    { v: '4.189.4', d: '2026-09-24', items: [
      '💰🏦 Sell/Storage Travel — เปลี่ยนขาไป NPC จาก Direct Teleport เป็น Unstuck 0x73 → เดินไปจุดที่ตั้ง',
      '   · Auto/Manual Sell และ Kafra Storage ใช้ flow เดียวกัน: จดจุดกลับ → Unstuck → รอ 2s → เดิน',
      '   · ใช้ GAT A* ก่อน, fallback NAV waypoint, สุดท้ายเดินตรงเป็นช่วง ≤16 ช่อง',
      '   · Save Point ต้องอยู่แมพเดียวกับ NPC/Kafra ที่ตั้งไว้; ถ้าคนละแมพจะ abort พร้อมแจ้งชัด ไม่วาร์ปข้ามแมพแทน',
      '   · ขากลับฟาร์มหลังขาย/ฝากยังใช้ระบบเดิม เพื่อไม่เปลี่ยนพฤติกรรมส่วนอื่น',
    ]},
    { v: '4.189.3', d: '2026-09-24', items: [
      '🎒 Inventory Bulk Action — เพิ่มปุ่มเลือก ขายทั้งหมด / ฝากทั้งหมด แยกตามแท็บ Item / Equip / Etc.',
      '   · ปุ่มทำหน้าที่ตั้ง action ให้ไอเทมทั้งหมดที่มีอยู่ในหมวดที่กำลังเปิดเท่านั้น ไม่สั่งขาย/ฝากทันที',
      '   · ขายทั้งหมดจะถอดรายการในหมวดนั้นออกจาก Deposit แล้วใส่ Sell; ฝากทั้งหมดทำกลับกัน',
      '   · หลังเลือกจะอัปเดตสี/ป้าย ขาย-ฝาก ใน Inventory ทันที และบันทึกค่าไว้ตามเดิม',
    ]},
    { v: '4.189.2', d: '2026-09-24', items: [
      '🏃 Player Flee fallback — โหมดเปลี่ยนแมพใช้ Direct → Teleport Clip → Fly Wing เมื่อ Direct ยังติด gap',
      '   · Direct 0x40 ไปแมพสำรองพร้อม = เปลี่ยนแมพทันที',
      '   · ถ้า Direct ข้ามแมพยังติด gap 3s: ใช้ Teleport Clip ก่อน; ถ้าไม่ย้ายใน ~450ms ใช้ Fly Wing 601',
      '   · หลัง Clip/Wing หนีออกจากจุดอันตรายแล้ว ระบบยังรอ gap และเปลี่ยนไปแมพสำรองอัตโนมัติทันทีที่ Direct พร้อม',
      '   · โหมดแมพเดิมยังใช้ Direct same-map random ทันทีเหมือนเดิม',
    ]},
    { v: '4.189.1', d: '2026-09-24', items: [
      '🏠 Direct Unstuck default interval — เปลี่ยนค่าเริ่มต้นรอบ Auto จาก 600 วินาทีเป็น 500 วินาที',
      '   · ค่าเดิม 600 วินาทีจาก config รุ่นก่อนจะ migrate เป็น 500 วินาทีอัตโนมัติ',
      '   · พฤติกรรม Finish Current Kill → เก็บของ → Unstuck → กลับจุดเดิม ยังคงเดิม',
    ]},
    { v: '4.189.0', d: '2026-09-24', items: [
      '🏠 AB Auto Finish Current Kill — ครบเวลาระหว่างสู้จะไม่ตัดมอนตัวล่าสุดกลางคัน',
      '   · ตี target ปัจจุบันให้จบก่อน แล้วรอ packet ของตกสั้น ๆ + เก็บ queue/warpQueue ให้หมด',
      '   · ระหว่างรอจะไม่ acquire/defensive-retarget/wander ไปหามอนตัวใหม่',
      '   · เก็บเสร็จแล้ว Direct Unstuck 0x73 ทันที; ถ้าครบเวลาตอนว่างอยู่แล้วจะ Unstuck ทันทีเหมือนเดิม',
    ]},
    { v: '4.188.9', d: '2026-09-24', items: [
      '🏠 Fix AB Auto Timer — ครบเวลาปุ๊บ Direct Unstuck 0x73 ทันที แม้กำลัง Combat/มี target/มี loot/กำลัง wander',
      '   · Auto timer ใช้ trigger เดียวกับปุ่ม ▶ รับบัพตอนนี้ จึงไม่ค้าง state=IDLE ที่ ~0s ระหว่างฟาร์มต่อเนื่อง',
      '   · ยังไม่ตัดกลาง Sell/Storage/BuffVisit เพื่อป้องกัน state ธุรกรรมค้าง; จบทันทีแล้วรอบ AB จะเริ่มเอง',
      '   · หลัง Unstuck รอ 2 วินาที → กลับแมพ+พิกัดเดิม → เริ่มนับ Auto รอบใหม่ตามเดิม',
    ]},
    { v: '4.188.8', d: '2026-09-24', items: [
      '❤️ HP Emergency Flee — ตั้ง %HP แล้วหนีอัตโนมัติแบบ priority สูง ไม่ต้องรอ Combat target',
      '   · เลือกโหมด: 🌀 หนีในแมพ หรือ 🏠 Unstuck 0x73',
      '   · หนีในแมพเรียงอัตโนมัติ: Direct/Database TP (0x40) → Teleport Clip skillId 53 → Fly Wing itemId 601',
      '   · ถ้า Direct TP ยังอยู่ใน teleport gap 3s จะข้ามไป Clip ทันที; ถ้า Clip ไม่ทำให้ตำแหน่งเปลี่ยนภายใน ~450ms จะ fallback เป็น Fly Wing',
      '   · ล็อก 1 รอบต่อช่วง HP ต่ำ ป้องกันเผา Wing/ยิง packet รัว; เมื่อ HP ฟื้นเหนือ threshold +5% จึง arm ใหม่',
    ]},
    { v: '4.188.7', d: '2026-09-24', items: [
      '🤝 Auto Trade LIVE — ล็อก packet จาก capture จริงของ Rayrag',
      '   · Incoming Trade Request = 0x7e len=43',
      '   · Accept-All: ส่ง [78 01] แล้ว [78 00] ทันทีเมื่อมีคำขอ Trade',
      '   · Eject-All: ส่ง [78 00] สองครั้งทันทีเมื่อมีคำขอ Trade',
      '   · Accept-All และ Eject-All เปิดพร้อมกันไม่ได้; เอาเมนู Capture ออกจาก UI แล้ว',
    ]},
    { v: '4.188.6', d: '2026-09-24', items: [
      '🤝 Auto Trade — เพิ่มเมนู Accept-All Trade / Eject-All Trade ในหมวด อื่นๆ',
      '   · Trade protocol ของ Rayrag ยังไม่มีใน Assist เดิม จึงเพิ่ม Trade Packet Capture แบบ IN/OUT เพื่อเรียนรู้ packet จริงก่อน ไม่เดา opcode',
      '   · ปุ่ม 🔬 จับ Accept และ 🔬 จับ Eject: pause automation ชั่วคราว + จับ packet พร้อม marker ตอนคลิกปุ่ม Trade ใน WebGL',
      '   · แสดง unknown incoming opcode เด่น ๆ และ outgoing packet หลังคลิก เพื่อใช้ยืนยัน request/response ในรอบถัดไป',
      '   · ปุ่ม Auto Trade จะยังไม่ส่ง packet จนกว่าจะยืนยัน packet จากการ capture จริง ป้องกันส่งคำสั่งผิดประเภท',
    ]},
    { v: '4.188.5', d: '2026-09-24', items: [
      '🪽 Fly Wing Warp Find — เพิ่มตัวเลือกใช้ Fly Wing (Item ID 601 ตาม Rayrag) สำหรับวาร์ปหามอน',
      '   · ทำงานเฉพาะเมื่อ Combat ON + Warp Find ON + ไม่เจอมอนครบเวลาที่ตั้งไว้',
      '   · Fly Wing และ Teleport Clip เลือกได้ทีละโหมด; เปิดอันหนึ่งจะปิดอีกอันอัตโนมัติ',
      '   · เช็ก inventory ก่อนใช้: ถ้าไม่มี Fly Wing 601 จะไม่ส่ง use-item packet และจะรอรอบถัดไป',
      '   · ใช้ packet ใช้ไอเท็มเดิม 0x2f ผ่าน sendUseItem(601); หลังใช้สำเร็จเริ่มนับ no-monster ใหม่',
    ]},
    { v: '4.188.4', d: '2026-09-24', items: [
      '🧹 Remove Assist Chat Room — ลบระบบห้องแชตของตัว Assist ออกทั้งหมด',
      '   · เอาปุ่ม 💬 ห้องแชต, modal, unread badge, reaction, reply และอัปโหลดไฟล์ออก',
      '   · หยุด roomJoin / roomHistory / roomMessage / roomReact กับ relay server',
      '   · คง Game Chat parser, บัพตามคำขอ, Telegram และ Remote Monitor ไว้ตามเดิม',
    ]},
    { v: '4.188.3', d: '2026-09-24', items: [
      '💀 Post-Respawn Unstuck — หลัง Auto Respawn ยืนยันว่าเกิดใหม่แล้ว (HP > 0) ส่ง Direct Unstuck 0x73 จำนวน 1 ครั้งเสมอ',
      '   · เป็น action แยกจาก AB Refresh: ไม่เริ่มรอบรับบัพและไม่รีเซ็ตตัวนับ AB',
      '   · ถ้าจังหวะแรกส่งไม่สำเร็จ จะค้าง pending และ retry เมื่อ WebSocket พร้อม จนส่งสำเร็จ 1 ครั้ง แล้วล้าง flag',
      '   · หลังส่ง Unstuck แล้ว post-respawn rest / farm guard ทำงานต่อเหมือนเดิม',
    ]},
    { v: '4.188.2', d: '2026-09-24', items: [
      '🏠 รับบัพตอนนี้ = Auto Reset — กดแล้วส่ง Direct Unstuck 0x73 ทันที ไม่ตั้งคิว manual รอสถานะว่าง',
      '   · จำแมพ+พิกัดปัจจุบัน → Unstuck ทันที → รอ 2 วินาที → วาร์ปกลับจุดเดิม',
      '   · เมื่อกลับถึงจุดเดิม เริ่มนับถอยหลัง AB Auto รอบใหม่จากศูนย์',
      '   · เอาสถานะ manual queued/Manual Run ออกจาก flow ของปุ่ม; รอบอัตโนมัติปกติยังรอ Combat ON ตามเดิม',
    ]},
    { v: '4.188.1', d: '2026-09-24', items: [
      '🏠 Unstuck Fast Return — หลังส่ง Direct Unstuck 0x73 รอ 2 วินาที แล้ววาร์ปกลับแมพ+พิกัดเดิมทันที',
      '   · ไม่รอตรวจ WAIT_SPAWN และไม่รอ WAIT_BUFF/AB timer เดิมอีก',
      '   · ส่งวาร์ปกลับครั้งแรกทันทีเมื่อครบ 2 วินาที; หากยังไม่ถึงจุดเดิมจะ retry ทุก 5 วินาทีตามระบบเดิม',
      '   · หน้า AB Refresh เอาช่อง “รอ AB (วิ)” ออก เพราะดีเลย์กลับถูกล็อกที่ 2 วินาที',
    ]},
    { v: '4.188.0', d: '2026-09-24', items: [
      '🚶 Continuous Wander — ไม่มีเป้าแล้วเดินต่อเนื่องขึ้น ลดช่วงหยุดยืนระหว่างกวาดแมป',
      '   · fallback wander: 3000ms → 500ms',
      '   · GAT/Nav re-issue: 1000ms → 400ms',
      '   · GAT move throttle: 900ms → 400ms',
      '   · GAT chain ต่อขาใหม่เมื่อเหลือ ≤14 ช่อง (เดิม ≤10) เพื่อให้เดินลื่นต่อเนื่อง',
      '   · เมื่อพบมอน/มีของรอเก็บ/กำลังสู้ ยังหยุด wander ตามเดิมเพื่อไม่ให้คำสั่งเดินแย่ง Combat',
    ]},
    { v: '4.187.9', d: '2026-09-24', items: [
      '⚡ Fast retarget after loot — ฆ่ามอน → รอ drop สั้น ๆ → เก็บของให้คิวว่าง → หาเป้าใหม่ทันที',
      '   · หลังเก็บของชิ้นสุดท้ายสำเร็จ ไม่ใช้ postCombatDelayMs อีก (combatCooldownUntil = now)',
      '   · หลังมอนตายรอเพียง 250ms เพื่อให้ packet ของตกเข้าคิวก่อน ป้องกันวิ่งไปตีตัวใหม่ก่อนเก็บของ',
      '   · ถ้ามีของในคิว Auto-Loot ยังบล็อก Combat จนเก็บเสร็จเหมือนเดิม',
    ]},
    { v: '4.187.8', d: '2026-09-24', items: [
      '🧹 ซ่อนบรรทัดสถานะ Direct Unstuck fixed 0x73 จากหน้า AB Refresh (การทำงาน 0x73 คงเดิม)',
    ]},
    { v: '4.187.7', d: '2026-09-24', items: [
      '🏠 Fixed Direct Unstuck — ล็อก packet ที่ยืนยันแล้วเป็น 0x73 (len=1) ในตัวสคริปต์',
      '   · ไม่ใช้ Candidate / localStorage packet เดิมอีก ป้องกัน 0x71 packet ใหญ่ถูกเลือกผิด',
      '   · เอาปุ่ม Capture / ใช้ Candidate / ล้าง Packet ออกจากหน้า AB Refresh',
      '   · รอบ AB อัตโนมัติยังรอ Combat ON; ▶ รับบัพตอนนี้ยังใช้ได้แม้ Combat OFF',
      '   · Warp Find/Teleport หามอนยังถูกบล็อกเมื่อ Combat OFF ตามเดิม',
    ]},
    { v: '4.187.6', d: '2026-09-24', items: [
      '🏠 แก้ regression Direct Unstuck จาก v4.187.5 — ไม่บังคับ Combat สำหรับปุ่มรับบัพตอนนี้/Direct Unstuck อีกแล้ว',
      '   · Combat OFF บล็อกเฉพาะ Warp Find/Teleport หามอน และรอบ AB อัตโนมัติ 10 นาที',
      '   · ▶ รับบัพตอนนี้ ใช้ได้แม้ Combat OFF (ถือเป็นคำสั่งผู้ใช้โดยตรง)',
      '   · รอบ AB ที่เริ่มแล้วทำจนจบ ไม่ถูก Combat OFF ยกเลิกกลางทางจนค้างที่จุดเกิด',
      '   · ปิด Combat ขณะ IDLE จะรีเซ็ตเฉพาะ timer รอบอัตโนมัติ ไม่ล้าง Direct Packet/Candidate',
    ]},
    { v: '4.187.5', d: '2026-09-24', items: [
      '🛑 Combat gate: ระบบ AB Refresh/Direct Unstuck จะไม่ทำงานและไม่วาร์ปเองขณะ Combat = OFF',
      '   · Combat OFF ระหว่างรอบรับบัพ = หยุด routine ทันทีและไม่วาร์ปกลับฟาร์ม',
      '   · ตัวจับเวลา 10 นาทีเริ่มใหม่เมื่อเปิด Combat — ป้องกันเปิด Combat แล้ววาร์ปทันทีจาก timer เก่า',
      '   · Warp Find ผ่าน Teleport Clip เช็ค Combat ซ้ำที่ sendWarpFind เพื่อกันการเรียกจากทางอื่น',
    ]},
    { v: '4.187.4', d: '2026-09-24', items: [
      '🏠 Direct Unstuck only — ยืนยัน packet 0x73 ใช้งานได้บนการตั้งค่าปัจจุบัน',
      '   · เอาปุ่ม 🎯 จำปุ่ม Unstuck / ♻️ Reset ปุ่ม / UI fallback แบบคลิกตำแหน่งออก',
      '   · AB Refresh จะทำงานเมื่อ Direct Packet = ON เท่านั้น ไม่ fallback ไปกด ESC/คลิกอัตโนมัติ',
      '   · ยังเก็บ 🔬 จับ Packet / ✅ ใช้ Candidate / 🧹 ล้าง Packet ไว้สำหรับตั้งค่าใหม่หรือทดสอบภายหลัง',
    ]},
    { v: '4.187.3', d: '2026-09-24', items: [
      '🔬 เพิ่ม Unstuck Packet Capture — จับ WebSocket OUT ตอนกด Unstuck จริง เพื่อหา opcode โดยไม่เดา protocol',
      '   · เริ่มจับแล้ว pause automation ชั่วคราว + กด ESC ให้เอง ลด packet รบกวนจาก combat/loot/heal/skill/wander',
      '   · แสดง packet ที่จับได้เป็นเวลา/opcode/length/hex และเลือก packet ล่าสุดเป็น Candidate อัตโนมัติ',
      '   · ปุ่ม ✅ ใช้ Candidate เป็น Unstuck จะบันทึก packet แล้ว AB Refresh ส่งตรง ไม่ต้อง ESC/คลิกอีก',
      '   · มีปุ่ม 🧹 ล้าง Packet / ปิด Direct Packet ได้ตลอด และยัง fallback วิธีปุ่มเดิมได้',
    ]},
    { v: '4.187.2', d: '2026-09-24', items: [
      '🏠 แก้ระบบจำปุ่ม Unstuck: จับคลิกจากทั้ง document ไม่จำกัดเฉพาะ Unity canvas',
      '   · ตอนใช้งานใช้ elementFromPoint() กด DOM/UI overlay ที่ตำแหน่งจำไว้ก่อน แล้วค่อย fallback ไป Unity canvas',
      '   · ค้นปุ่ม Unstuck จาก text / aria-label / title / value แบบ contains และตัด UI ของ Assist ออก',
      '   · เพิ่มปุ่ม ♻️ Reset ปุ่ม Unstuck + API ASSIST.resetUnstuckButton() และแสดงพิกัด/สถานะการจำ',
      '   · reset จะยกเลิกรอบ AB ที่กำลังทำอย่างปลอดภัย ป้องกันคลิกตำแหน่งเก่าหลังเปลี่ยนความละเอียด',
    ]},
    { v: '4.187.1', d: '2026-09-24', items: [
      '👁️ ปรับระบบตรวจจับมอนรอบตัว: รวมหลักฐานจาก SPAWN / MOVE / ENTITY_POS / minimap ให้เสถียรกว่าเดิม',
      '   · 0x14 ENTITY_POS สามารถคืน ghost จาก MOVE ให้เป็น monster ได้ (ยกเว้น id ที่ radar ยืนยันว่าเป็นผู้เล่น)',
      '   · 0x3c แก้ handler ซ้ำ/ตัวเก่าดัก packet: อ่าน count จริงทุกจำนวน และ force player beacon เป็น kind=0',
      '   · false-despawn guard 2s → 6.5s: มอนยืนนิ่งไม่หลุด radar ง่าย แต่ despawn จริงยังถูกลบหลัง grace',
      '   · progressive search เติม maxAcquireDistance เป็นรัศมีสุดท้ายเสมอ + reacquire เร็วขึ้น 1.5s → 0.6s',
      '   · countMonsters กัน beacon player ซ้ำอีกชั้น ไม่ให้นับคนเป็นมอนใน flee/สถิติ',
    ]},
    { v: '4.187.0', d: '2026-09-24', items: [
      '🌀 Warp Find: เลือกใช้ Teleport Lv.1 (skillId 53 / Teleport Clip) แทน packet วาร์ปสุ่มเดิมได้',
      '   · เมื่อเปิดโหมดนี้ skillId 53 จะถูกสงวนไว้สำหรับ Warp Find ไม่ถูกร่ายตาม timer ของ Auto-Skill',
      '🏠 AB Refresh: ทุก 10 นาที ESC → Unstuck → กลับจุดเกิด → รอรับบัพ AB → วาร์ปกลับจุดฟาร์มเดิม',
      '   · เพิ่มระบบบันทึกตำแหน่งปุ่ม Unstuck แบบ ratio ต่อ canvas ใช้ได้กับหลายความละเอียด',
      '   · routine แยก state และกันชนกับ combat / wander / sell / storage / buffVisit / farm warp-back',
    ]},
    { v: '4.186.2', d: '2026-08-27', items: [
      '🚑 แก้ HP ค้าง/ใช้ยารัวบน rayrag (ต่อจาก 4.186.1 ที่ยังไม่หาย)',
      '   พบจาก debug จริง: rayrag ส่ง statType ใน 0x25 เปลี่ยนทุก packet (48,127,124,...) ไม่เสถียร',
      '   → type-lock ตัด HP จริงทิ้งหมด (เห็นใน log: 521→696→820→1226 ถูกข้างหมด) → HP ค้าง → ปั้มยา',
      '   ตอนนี้: ยึด max-anchor (ไม่ยึด type) + จำ type ที่ยืนยัน HP แล้ว + เห็น ≥3 type = ยอมรับหมด (rayrag)',
      '   · ค่าเต็มจาก type ใหม่ = stat ขยะของ gfix → ยังข้ามเหมือนเดิม · heal delay floor 500ms',
    ]},
    { v: '4.186.1', d: '2026-08-27', items: [
      '🚑 แก้ regression บน rayrag (จาก 4.185.0): แถบ HP ไม่ตรับตัวละคร → ปั้มยารัวจนหมด',
      '   สาเหตุ: ตัวเรียนรู้ statType ของ HP เดิมเรียนจาก "ค่าไม่เต็มตัวแรก" ที่เจอ — SP ไม่เต็มมาก่อน',
      '   → HP ถูกแทนที่ด้วยค่า SP → ตกต่ำตลอด → heal ปั้มยาไม่หยุด',
      '   ตอนนี้: เรียนรู้เฉพาะเมื่อ max ตรง anchor (hp.max จาก SPAWN) เท่านั้น · max ตรง sp.max = SP',
    ]},
    { v: '4.186.0', d: '2026-08-27', items: [
      '💬 ใหม่! บัพตามคำขอ — ตั้ง "ต้องแชทคำขอ" ต่อสกิลบัพ (Sub-tab Skills)',
      '   ผู้เล่นต้องพิ่งแชทข้อความที่มีคำนั้นมาก่อน (ภายใน 60 วิ · ไม่สนตัวพิมพ์ · contains)',
      '   เช่น Heal ตั้ง "heal" = คนพิมพ์ heal มาถึงรักษาให้ · เงื่อนไขอื่น (HP%/ระยะ/รายชื่อ/delay ซ้ำ) ยังเช็คครบ',
      '   ว่าง = ไม่เช็ค บัพตามเงื่อนไขเดิม · API: ASSIST.addSkill({skillId:41, buffMode:true, buffChatKeyword:\'heal\', ...})',
      '🖥️ ขยายหน้าต่างจัดการ skill list (420→680px) + แถวฟิลด์ wrap ลงบรรทัดใหม่เมื่อแคบ — ไม่ต้อง scroll ขวาอีก',
    ]},
    { v: '4.185.1', d: '2026-08-27', items: [
      '💊 แก้ใช้ยารัวขั้นสุดท้าย — ฐานความจริงของ "ยาหมด" เปลี่ยนจาก "HP ไม่ขยับ" เป็น **inventory (0x32)**',
      '   เคส gfix: กินยาแล้ว server หักของจริงแต่ HP echo ช้า → เดิมตีความยาหมด ไล่ mark ทุกขวด',
      '   ตอนนี้: HP เพิ่ม = ได้ผล · ของเหลือ 0 = หมดจริง · ของถูกหัก = ยาทำงานอยู่ (รอ delay ปกติ)',
      '   · มี HP ใหม่+ของไม่หาก = ถูกปฏิเสธ · ไม่มีข้อมูลเลย = รอ (นิรภัย 5 วิ/ขวด)',
    ]},
    { v: '4.185.0', d: '2026-08-27', items: [
      '🩺 แก้ HP ? / ตายผิดปกติบน server gfix-ro — สามสาเหตุจากการวิเคราะห์ packet capture:',
      '   1. ตำแหน่งดาเมจใน 0x0b ต่างกัน: rayrag @17 / gfix @18 → อ่านผิด = ดาเมจ×256 (โดน 19 กลายเป็น 4864!)',
      '      → เรียนรู้ offset อัตโนมัติจากคู่ 0x17 + จำต่อ hostname (calibrate เสร็จใน ~2 วิแรก)',
      '   2. นับดาเมจซ้ำ: gfix ส่งการตีเดียวกันทั้ง 0x0b และ 0x17 (ดาเมจเท่ากัน ห่าง ~0.5s) →',
      '      HP ไหลเร็ว 2 เท่า จนชน 0 → ถูก reset เป็น "?" → heal ไม่ทำงาน → ตาย (ทั้ง HP เราและ HP มอน)',
      '      → ตอนนี้นับครั้งเดียว (เทียบ victim+ดาเมจภายใน 900ms — rayrag ส่งอย่างเดียว ไม่มีผล)',
      '   2. 0x25 STAT หลาย stat ปนกัน (gfix: type 5=HP, 32=ค่าอื่น/SP) เดิมเขียนทับ HP หมด',
      '      → เรียนรู้ type ของ HP จริงจากค่าที่ไม่เต็ม + max ตรง sp.max ถือเป็น SP ไปเก็บที่ SP แทน',
      '🗺️ แก้ toggle "วาร์ปกลับอัตโนมัติ" — ลูป retry "ยังอยู่แมปผิด" ไม่เคยเช็ค toggle',
      '   (ปิดแล้วยังโดนดึงกลับเมื่อตาย respawn เมือง/หนีเปลี่ยนแมป) → ปิดได้จริง ฟาร์มแมปที่ไปติดได้',
    ]},
    { v: '4.184.0', d: '2026-08-27', items: [
      '🎬 แก้สกิลร่ายเวลา (นักเวทย์/นักบวช) ยิงทับกันจนบางตัวไม่ติด — ระบบ Cast Lock + เรียงคิวการร่าย',
      '   พบ protocol ใหม่จาก capture: 0x18 = "เริ่มร่าย" (แนบเวลาร่ายจริง! Cold Lv5=1.44s, Fireball=0.82s)',
      '   · 0x19 = เริ่มร่ายสกิลพื้น (Thunderstorm Lv5=2.11s) · 0x1d/0x0b = ร่ายเสร็จ+ดาเมจ → ปลดล็อกทันที',
      '   ★ เรียนรู้เวลาร่ายรายสกิลจาก server แล้วบังคับคิวด้วยเวลา (persist ข้าม session)',
      '     เคสจริง: Cold Bolt โดนยิงกลางการร่าย Fire Bolt → server ทิ้งเงียบ — SP ไม่หัก ไม่มีดาเมจ',
      '   ไม่ต้องเซ็ต cooldown เยื้องกันเองแล้ว — สกิลหมุนเวียนครบทุกตัวตามเวลาร่ายจริง',
      '🔧 แก้โหมดเวทย์ยืนเฉย: สกิลไม่ได้ตั้ง maxDistance → เดินเข้าถึง 9 ช่อง (ระยะเวทย์ทั่วไป) แทนยืนไกล ๆ',
      '   และสกิลพื้นที่ (Thunderstorm ฯลฯ) ที่ตั้งโหมดผิดเป็น AoE → แก้ให้ส่งพิกัดมอนอัตโนมัติ',
      '   (เคสจริง: ร่ายเสร็จ SP หมดแต่ไม่มีดาเมจ เพราะส่ง [1d][05] self แทน [1d][04] พื้น)',
      '   log ตอนใช้สกิลแยกชัด: (พื้น) / (AoE รอบตัว) · debug: 📤 sendSkill บอกรูปแบบที่ส่งจริง',
    ]},
    { v: '4.183.0', d: '2026-08-25', items: [
      '🗺️✨ ใหม่! GAT wander — เดินหามอนตาม "ตารางเดินได้" จากไฟล์ .gat ของแมป (ground truth จาก server)',
      '   อ่านค่า type ต่อช่อง (0=เดินได้) → สุ่มเป้า 25-70 ช่องในพื้นที่เดินได้ → หาทางด้วย A* → เดินตามจุดเลี้ยว',
      '   เดินต่อเนื่องแบบคน: chain ล่วงหน้า — ยังไม่ถึงเป้า (เหลือ ≤14 ช่อง) ก็ต่อขาใหม่ทันที ไม่หยุดยืน',
      '   กวาดพื้นที่ตามทิศ: มุ่งทิศหลัก 8 ทิศ 60-150 ช่อง แล้วเลี้ยว 45-135° (ไม่ย้อนกลับ 180°) เหมือนกวาดหามอนจริง',
      '   moc_fild01 ฝังมาในตัว · อีก 168 แผนที่ (ฟิลด์/ดัน/เมือง) เก็บใน repo โฟลเดอร์ maps-gat — เข้าแมปไหน script ดึงเอง + cache localStorage',
      '   ปุ่ม "เดินตาม GAT" ใน Sub-tab Nav (✅ = แมปนี้มีข้อมูล) · สั่งลำดับ: GAT → nav ที่เรียนรู้ → สุ่มทิศ',
      '   แกน y calibration อัตโนมัติ (เก็บสถิติตำแหน่งจริง 20 ตัวอย่าง) · API: ASSIST.gatStatus()',
      '📏 ทุกคำสั่งเดิน clamp ≤16 ช่องจากตัว (game cap จริง — คลิกเกินโดนตัด · เดิมบางจุดสั่ง 20) กัน fingerprint บอท',
    ]},
    { v: '4.182.0', d: '2026-08-24', items: [
      '🪄 ใหม่! โหมดเวทย์ (ปิด "⚔️ ตีปกติ" ใน Sub-tab Combat) — สำหรับนักเวทย์ร่ายสกิลโจมตีจากไกล',
      '   ปิดแล้ว: ไม่ส่งการตีปกติเลย → server ไม่เดินตัวละครเข้าไปปะทะ (ยืนร่ายจากไกลได้)',
      '   เดินเข้าหามอนแค่พอระยะร่าย = maxDistance มากสุดของสกิลโจมตีที่เปิดอยู่',
      '   (ไม่ได้ตั้ง maxDistance สกิลไหนเลย = เดินเข้าเท่าระยะค้นหาเดิม) · SP หมดพักผ่าน auto-rest ตามปกติ',
      '   ★ อย่าลืมตั้ง "ครั้ง/มอน" (maxUsesPerTarget) ของสกิลให้สูงพอ เช่น 99 — default 1 = ร่ายครั้งเดียวต่อมอนแล้วยืนเฉย',
      '   ต้องตั้งสกิลโจมตี (targeted เช่น Fire Bolt / ground เช่น Storm Gust) ใน Sub-tab Skills ก่อน',
      '   API: ASSIST.toggleNormalAttack(false)',
      '🌐 เอา @match โดเมน gfix-ro.com ออก (ที่เพิ่มเข้าไปใน v4.180.3)',
    ]},
    { v: '4.181.1', d: '2026-08-24', items: [
      '♻️ แก้ "มอนอยู่รอบตัวแต่บอทบอกไม่เจอมอน → วาร์ปหนี" — มอนที่ยืนนิ่งโดน 1b ลบจาก radar',
      '   (ไม่มี 0x07/0x0f มายืนยันใน 2s) พอขยับกลับมา 0x07 สร้างใหม่เป็นผี kind=0 → ตีไม่ได้ตลอดไป',
      '   → ตอนนี้ sweeper จำสถานะ (kind/sub/name) ไว้ 60s — id เดิมขยับกลับมา = คืนเป็นมอนทันที',
      '   ปลอดภัยเท่าเดิม: เฉพาะ id ที่ SPAWN เคยยืนยัน + ตรวจ beacon ผู้เล่นกันไว้อีกชั้น (id ใหม่ไม่รู้จัก = ผีตามเดิม)',
    ]},
    { v: '4.181.0', d: '2026-08-24', items: [
      '🌀⚡ วาร์ปหามอนต่ำกว่า 3 วิได้แล้ว! (เดิมถูกบังคับขั้นต่ำ 3 วิเสมอ)',
      '   ตั้ง 0 = วาร์ปทันทีที่ไม่เจอมอน — ตรงตามที่ label เขียนไว้แล้วจริง ๆ',
      '   คุมความถี่ด้วยคูลดาวน์ ≥3 วิระหว่างวาร์ปเหมือนเดิม (กันยิงรัว)',
      '   ค่า 3 ขึ้นไป (รวม default 30) พฤติกรรมเหมือนเดิมทุกอย่าง',
    ]},
    { v: '4.180.3', d: '2026-08-24', items: [
      '⚔️ ตั้ง "ดีเลย์หลังสู้เสร็จ/เก็บของเสร็จ" ได้จาก UI แล้ว (เดิมแก้ได้แค่ผ่านคอนโซล)',
      '   ช่องใหม่ใน Sub-tab Combat (ใต้ช่อง abandon) — 0-10000ms · กด "ใช้ค่า combat" แล้วบันทึกถาวร',
      '   = เวลารอก่อนหาเป้าใหม่หลังสู้จบ/เก็บของครบ (default 800ms — กันหันไปตีตัวใหม่ทันที ดูเป็นบอท)',
      '   ★ ASSIST.setPostCombatDelay(ms) ตอนนี้บันทึกถาวรเหมือน setting อื่น (เดิมเปลี่ยนแล้วหายเมื่อปิดหน้า)',
      '   + รองรับโดเมนใหม่ gfix-ro.com (@match)',
    ]},
    { v: '4.180.2', d: '2026-08-21', items: [
      '🌀⚡ กดวาร์ปสุ่มรัว ๆ ได้แล้ว! — ผู้ใช้ทดสอบจริง: ระบบในเกมวาร์ปสุ่มได้ 2-3 ครั้ง/วิ',
      '   → วาร์ปสุ่มในแมปเดิม (-999) ยิงทันทีทุกครั้ง ไม่เข้าคิว 3 วิ',
      '   กฎ gap 3 วิ ยังใช้เฉพาะวาร์ปข้ามแมป/พิกัดของระบบ (ขาย/ฝาก/กลับฟาร์ม/บัพ) —',
      '   กรณีที่เคยเจอจริงคือข้ามแมปต่อเนื่องใน 3 วิ แล้วตัวหลังโดนดรอป ไม่ใช่สุ่มในแมปเดิม',
    ]},
    { v: '4.180.1', d: '2026-08-21', items: [
      '🌀 กดวาร์ปสุ่มรัว ๆ แล้วเหมือนต้องรอ? — คือ server รับ teleport ห่างกัน ≥3 วิ',
      '   (ยิงถี่กว่านั้นโดนดรอปเงียบ — เคยทำระบบขาย/ฝากค้างมาแล้ว) serializer จึงคิวไว้ยิงให้เอง',
      '   → ตอนนี้ตอนถูกคิว log บอกชัด: "จะยิงในอีก ~N วิ" แทนข้อความ dbg ที่ไปโผล่แค่ console',
    ]},    { v: '4.179.0', d: '2026-08-21', items: [
      '👤 ใหม่! Profile การตั้งค่า — สร้าง/สลับ/ลบ ชุด config ได้หลายชุด',
      '   เหมาะกับ: บอทหลายตัวต่างบัญชี (รวม auto-login) หรือสไตล์เล่นต่างกัน',
      '   อยู่ใน Sub-tab เดียวกับ export/import: เลือก profile (● = กำลังใช้) ·',
      '   "บันทึกเป็น" = สร้างใหม่/ทับ · "ใช้ตัวนี้" = เซฟของเดิมอัตโนมัติก่อนสลับ',
      '   · สลับแบบแทนที่ทั้งชุด (key ที่ไม่มีในชุดใหม่ = กลับ default ไม่ค้างจากชุดเดิม)',
      '   API: ASSIST.listProfiles / saveProfileAs / switchProfile / deleteProfile',
      '   (buff/skill times + nav data ใช้ร่วมกันทุก profile)',
    ]},
    { v: '4.178.0', d: '2026-08-21', items: [
      '🔓 ตัวการสุดท้ายของ "ขาย equipment ไม่ออก" — จาก capture จริง:',
      '   ขายสำเร็จ 5b 01 ได้ 299z จาก stackable แต่ก้อน equipment ก่อน/หลังเหมือนเป๊ะ (0 ชิ้นถูกขาย)',
      '   เพราะ server ปิด sell dialog อัตโนมัติหลังขายสำเร็จ 1 ครั้ง (5b 01 → 38 → 4d 03)',
      '   → แผน "แยก 2 รอบ: stackable ก่อน → equipment ทีหลัง" (ตั้งแต่ v4.150) ผิดตั้งแต่ฐาน:',
      '     รอบ equipment ยิงใส่ dialog ที่ปิดไปแล้ว หายเงียบ ๆ ทุกครั้ง!',
      '   (ส่วนที่ v4.150 เคยโดนปฏิเสธก้อนปน = บั๊ก slot ตำแหน่ง ซึ่งแก้แล้ว v4.177 — ตัวเกม',
      '    เองก็ขาย 17 ชิ้นรวมก้อนเดียวมาแล้ว)',
      '→ ตอนนี้: ส่งก้อนเดียวรวม stackable + equipment ทั้งหมดใน 0x57 เดียว',
      '   + ถ้าล้มเหลว ลองซ้ำ 1 รอบโดย equipment อ้าง itemId ตรง ๆ แทน slot',
    ]},
    { v: '4.177.0', d: '2026-08-21', items: [
      '🔓🔓 ไข้ปริศนาขาย equipment สำเร็จด้วย capture ตัวเกมจริง — ต้นเหตุเดียว 2 อาการ:',
      '   ★ ตัวเกมขายด้วย format เดียวกับเราเป๊ะ (0x57 + slot 20000+N เรียงสูง→ต่ำ → 5b 01 สำเร็จ)',
      '   ★ แต่หลังขาย/ฝาก server resend ก้อน equipment "คง inst id เดิม" (มีช่องว่าง!',
      '     เช่นเหลือ 0x13880-0x13890 แล้วกระโดดไป 0x138d4) — โค้ดเดิมคำนวณ slot จาก',
      '     "ตำแหน่งในก้อน" → พอมีของถูกเอาออก slot เลื่อนผิดทั้งชุด:',
      '     1. รอบขายถัดไปส่ง slot ผิด → server ปฏิเสธ (ขายไม่ออกตลอดกาล)',
      '     2. 0x32 removal หา slot ไม่เจอ → รายการฝากแล้วค้างใน UI Equip',
      '     3. หาง worn ใช้ดัชนี array → ชิ้นสวมหลัง resend กลายเป็น "ในถุง"',
      '   → แก้: slot = 20000 + (inst − 0x13880)/4 ของชิ้นเอง + หา worn จาก inst ตรง ๆ',
      '     (ยืนยันครบจาก capture: 0x13894→20005 ขายจริง · 0x138d4 สวมอยู่=ไม่ขาย · 0x138d8→20022 ขาย)',
    ]},
    { v: '4.176.0', d: '2026-08-21', items: [
      '💰🔍 สรุปจาก git: การขาย equipment โดย slot id ไม่เคยสำเร็จเลย (ตั้งแต่ v4.150 —',
      '   ครั้งนั้นแก้แค่ "แยก packet ให้ stackable รอด") ไม่ใช่พังหลัง 4.160.2 ·',
      '   สาย mark ขายของ equipment ตรวจครบแล้วถูกต้อง (Equip tab → sellItemIds → คิว)',
      '🔁 เมื่อรอบ equipment โดนปฏิเสธ (0x5b flag=0 หรือ "could not complete sale")',
      '   → ลองส่งใหม่แบบ itemId ตรง ๆ อัตโนมัติ 1 รอบ (ปลอดภัย: ชนิดเดียวกับที่ mark ไว้)',
      '📥 diagnostic: log dump โครงสร้าง 0x53 SELL_OPEN (ร้านรับซื้ออะไร) + 0x5b ทุกครั้ง',
      '   — ถ้ายังไม่ผ่าน ส่ง log ช่วงขายมาจะได้ format จริงที่ server ต้องการ',
    ]},
    { v: '4.175.0', d: '2026-08-21', items: [
      '💰 แก้ "กดขายเดี๋ยวนี้หลังเข้าเกม แล้วของไม่ถูกขาย" — sellNow ด้อยกว่า depositNow:',
      '   1. ไม่รีเซ็ต state ใช้ร่วม → retry วาร์ป/retry ค้างจากรอบก่อนฆ่ารอบใหม่เงียบ ๆ',
      '      (เช่น relogin ในหน้าเดิม: sellWarpRetries=2 ค้าง → รอบใหม่ห้ามวาร์ปซ้ำ → abort ไม่พบ NPC)',
      '   2. กดก่อนพิกัดมาถึง → ปฏิเสธด้วย "(state: IDLE)" ที่ดูเหมือนไม่มีอะไรผิด',
      '      → ตอนนี้บอกชัด "ยังไม่รู้พิกัด รอ 1-2 วิ ลองกดอีกครั้ง"',
      '   3. เพิ่ม pre-check มีของจะขายไหม (ผ่าน equipmentSlots สำหรับของ login) —',
      '      ไม่มี = บอกทันที ไม่วาร์ปไป NPC เปล่า · ชิ้นที่สวมอยู่ = แจ้งให้ถอดก่อน',
      '   4. อยู่ใกล้ NPC แล้วไม่วาร์ปซ้ำ (เหมือน trigger อัตโนมัติ — กันโดน server ดรอป)',
      '⚠️ server ปฏิเสธการขาย ("could not complete sale") → จบทันที ปิด dialog วาร์ปกลับ',
      '   (เดิมแค่ log แล้วค้างใน state SELL จน timeout 15 วิ)',
    ]},
    { v: '4.174.1', d: '2026-08-21', items: [
      '⚙️ เพิ่มช่องตั้ง fleeOnProximityRadius ใน Sub-tab Flee — รัศมีนับมอนของ',
      '   flee ทั้ง 3 แบบ (รุม/aggro/มอนรอบ ใช้รัศมีเดียวกัน, default 8)',
      '   (เดิมตั้งได้แค่ console ASSIST.setFleeProximity(n, radius) — ค่า persist อยู่แล้ว)',
    ]},
    { v: '4.174.0', d: '2026-08-21', items: [
      '🛡️ guard เลขเวอร์ชั่น — เช็คตอน checkVersion:',
      '   1. @version ที่ Tampermonkey รายงาน (GM_info) ไม่ตรง const VERSION → เตือนทันที',
      '   2. @version บน GitHub ต่ำกว่า VERSION ที่รัน → เตือน (header ค้าง หรือยังไม่ push)',
      '   (เคยพลาดจริง 2 ครั้ง — ผู้ใช้ไม่ได้รับอัปเดตทั้งที่เลขใน UI ขึ้นใหม่แล้ว)',
    ]},
    { v: '4.173.1', d: '2026-08-21', items: [
      '📊 แท็บสถิติ "มอน (ตี/aggro/รอบ)" ตัดค่า threat ทิ้ง — เหลือ 3 ค่าตรงชื่อแถว',
      '   (threat = max(aggro, มอนรอบ) ซ้ำซ้อน และหลังแก้ flee แล้วไม่ได้ถูกใช้คุบอะไร)',
    ]},
    { v: '4.173.0', d: '2026-08-21', items: [
      '🏃 แก้วาร์ปหนี "aggro N ตัว" ทั้งที่มอนแค่เดินผ่าน (passive ไม่ตีเรา):',
      '   trigger aggro เดิมใช้ getThreatCount = max(aggro จริง, มอนรอบตัว) — ยกมาจาก',
      '   บอทหลักซึ่งใช้รวมเป็น trigger เดียว พอมาอยู่ userscript ที่มี 3 trigger แยก',
      '   → มอน passive ใกล้ครบเกณฑ์ (default 5) ก็วาร์ปหนี และยิงก่อน fleeOnProximityCount',
      '   → ตอนนี้: รุม = ตีเราจริง · aggro = เล็งเรา (0x18) · มอนรอบ = ใกล้ตัว (รวม passive)',
      '   + log วาร์ปหนีบอกครบ 3 ค่า เช่น "aggro 6 ตัว (ตีเรา 1 · เล็งเรา 6 · มอนรอบ 8)"',
    ]},
    { v: '4.172.1', d: '2026-08-21', items: [
      '⚙️ เพิ่มช่องตั้ง attackAbandonMs ใน Combat — รอเงียบขั้นต่ำก่อน abandon (นับจากตีครั้งแรก)',
      '   (เดิมตั้งได้แค่ console ASSIST.setAttackAbandon และไม่ persist — reload หายเป็น 5000)',
      '   ตอนนี้บันทึกถาวรผ่าน PERSIST_KEYS แล้ว · ลดค่า = abandon เร็วขึ้น (เช่น 2500-3000)',
    ]},
    { v: '4.172.0', d: '2026-08-21', items: [
      '👻 แก้มอนผี "ffffffff ffffffff" ยืนทับตัวเรา — ตีไม่โดน pending ขึ้น 9 บอทยืนนิ่งนาน:',
      '   สาเหตุ: 0x0b แจ้งเราโดนตีโดย attacker id ผิดปกติ (ffffffff = server ไม่บอกผู้โจมตี)',
      '   → ระบบสร้าง ghost entity เป็นมอนยืนทับเรา (dist 0.0) + ลง mobAttackers',
      '   → defensive "ตีตัวที่กำลังตีเรา" เลือกมัน → ตีไม่โดน → isTargetStillEngaged',
      '     บล็อก abandon ตลอด → รอแต่วาร์ปหนีรุม (จาก log จริง pending 7-9 ถึงได้หนี)',
      '   → ตอนนี้: id ผิดปกติ (0/ffffffff) ไม่ถูก track เป็นมอน (HP เรายังลดตาม damage จริง)',
      '   + กัน entity id ขยะเข้า radar ทาง 0x2a/0x3c/0x14 ทุกทาง',
      '🧯 โซ่หนีภัยใหม่: pending ≥ attackPendingMax+3 (อย่างน้อย 5) แม้ "กำลังสู้อยู่" → abandon',
      '   (กันอนาคต: entity ตีไม่ได้แต่ส่งสัญญาณสู้ จะไม่ค้างเป้าจนยืนนิ่งเป็นนาทีอีก)',
    ]},
    { v: '4.171.0', d: '2026-08-21', items: [
      '🔁 ใหม่! ไปรับบัพจากบอทอีกตัว (คู่บอท: ฟาร์ม + บัพ) — Sub-tab Buff',
      '   ตั้ง: แมป+พิกัดจุดรับ / ทุกกี่วินาทีไปรับ / รอรับนานสุดกี่วินาที',
      '   ครบกำหนด (เฉพาะตอนว่าง: ไม่สู้ ไม่นั่งพัก ของเก็บหมด) → จดจุดฟาร์ม →',
      '   ไปหาบอทบัพ: แมปเดิม+ใกล้ (≤60 ช่อง) = เดิน · ไกล/คนละแมป = วาร์ป',
      '   ยืนรับ Heal/Buff ตามเวลารอ → วาร์ปกลับฟาร์มแมป+พิกัดเดิม → นับรอบใหม่',
      '🛡️ กันชนครบ: farm-back ทั้ง 0x12 และ combatLoop ไม่ดึงกลับตอนอยู่แมปรับบัพ ·',
      '   ระหว่างเดิน/รอ/กลับ ไม่หามอนใหม่ ไม่ wander (โดนตีตีกลับได้ตามปกติ)',
      '   · ห้ามชนกับ sell/storage ตาม gates เดิม · ผ่าน teleport serializer กันยิงทับ',
    ]},
    { v: '4.170.2', d: '2026-08-21', items: [
      '🐛 แก้ "Heal ตัวเองรัว ๆ ทั้งที่ HP เต็ม" (buff + รวมตัวเอง + HPเป้า<90%) —',
      '   บล็อก self ใน v4.170.1 ไม่สน targetHpBelowPct (ยิงตามรอบ delay อย่างเดียว)',
      '   → ตอนนี้ HP เป้าหมาย < % คุมทั้งคนอื่นและตัวเอง · HP ตัวเองเต็ม/ไม่รู้ค่า = ข้าม',
    ]},
    { v: '4.170.1', d: '2026-08-21', items: [
      '🐛 แก้ "บัพตัวเอง (รวมตัวเอง) ไม่ทำงานถ้าไม่มีใครเข้ามา" —',
      '   บล็อก self ถูกวางไว้หลัง if (!best) continue = ไม่เจอผู้เล่นคนอื่น → ข้ามทั้งสกิล',
      '   → ย้าย self เป็นผู้สมัครตั้งแต่ต้น (dist 0) ก่อนค้นคนอื่น — ไม่มีใครมาก็ยังบัพตัวเองได้',
      '📍 ไม่รู้ตำแหน่งตัวเอง (หลัง respawn/วาร์ป) เดิมหยุดทั้ง loop — บัพตัวเองไม่ต้องใช้ตำแหน่ง:',
      '   → ค้นคนอื่นข้ามได้ แต่ self-target ยังทำงาน (+ กัน ground skill ยิงไป 0,0)',
    ]},
    { v: '4.170.0', d: '2026-08-21', items: [
      '🌀 แก้วาร์ปปิงปองรัว ๆ เมื่อเปิด Guard + Buff (จาก log จริง):',
      '   warp-back-to-farm ใน 0x12 handler ดึงไป farmMap สู้กับ Guard ที่ดึงมา guardMap',
      '   (กรณี farmMap ≠ guardMap เช่น prt_fild07 vs pay_fild07 — วนไม่รู้จบ)',
      '   → Guard เปิด = 0x12 หยุด warp-back (combatLoop guard branch คุมเอง)',
      '💀 แก้ตายซ้ำหลัง respawn: 0x12 warp กลับ farmMap ทันทีก่อนนั่งพัก',
      '   (HP 2% ไปตกจุดมอนเดิม → ตายซ้ำใน 3 วิ) → ห้าม warp ตอน isDead/postRespawnRest',
      '   — รอพักเสร็จ combatLoop warp กลับเอง + กันแทรกระหว่างขาย/ฝาก',
    ]},
    { v: '4.169.0', d: '2026-08-21', items: [
      '🐛 แก้ "บัพจน SP ต่ำแต่ไม่นั่งพัก" — 2 ชั้น:',
      '   1. SP gate ของบัพเป็นค่า flat (spMin) ไม่ใช่ % → ช่วง spmin ถึง restSpPercent',
      '      วน นั่ง→ลุกบัพ→นั่ง รัว ๆ SP ไม่เคยฟื้น',
      '   2. การลุกมาบัพไม่ set lastRestStandAt → ระบบพักนั่งซ้ำทันทีไม่มีช่วงห่าง',
      '   → เพิ่ม hysteresis: SP% < restSpPercent = หยุดบัพทั้งหมด นั่งพักจน SP% ≥',
      '     restUntilPercent ค่อยกลับมาบัพ (log บอกชัดทั้งขาเข้า/ขาออก)',
      '   → ลุกมาบัพ set lastRestStandAt กันนั่ง-ลุกตีกัน',
    ]},
    { v: '4.168.1', d: '2026-08-21', items: [
      '🐛 แก้สกิลบัพประเภทพื้นที่ (Sanctuary/Pneuma/Safety Wall) ให้คนอื่น —',
      '   เดิมส่ง targeted [1d][01]+playerId เสมอ = ground skill พัง (server คงปฏิเสธเงียบ)',
      '   → ตรวจ skill.ground: ส่ง [1d][04] + พิกัด x,y ของผู้เล่นเป้าหมายแทน',
      '   (รวมตัวเองด้วย = วางที่ตำแหน่งยืนเรา) + log แยก "@ พื้น(x,y)"',
    ]},
    { v: '4.168.0', d: '2026-08-21', items: [
      '❤️ buff เพิ่มเงื่อนไข "HP เป้าหมาย < %" — Heal ให้คนอื่นเฉพาะเมื่อเลือดคนนั้นต่ำกว่าเกณฑ์',
      '   (เดิมไม่เช็คเลย = Heal คนเลือดเต็มเปลือง SP ฟรี) · 0/ว่าง = ไม่สน (บัพ Blessing ได้ตลอด)',
      '   HP คนนั้นมาจาก SPAWN + stat packet (ยืนยันจาก capture แล้ว) · ไม่รู้ค่า = ข้าม',
      '📦 Preset ใหม่ "Heal (รักษาผู้เล่นอื่น)" — ทุกคน HP<90% · ซ้ำ/คน 30 วิ',
      '🔍 diagnostic เพิ่มช่อง HPเป้า<N% ใน buff scan',
    ]},
    { v: '4.167.0', d: '2026-08-21', items: [
      '🪑 นั่งพักเมื่อ SP ต่ำ (restSpPercent — 0=ปิด) เหมือน HP ใช้เวลานั่ง/เกณฑ์ลุกอันเดียวกัน',
      '   ลุกเมื่อ HP และ SP ฟื้นถึง restUntilPercent ครบทั้งคู่ — เหมาะกับบอทบัพที่ SP ไหลลงตลอด',
      '🤝 นั่งอยู่ + มีคนรอบัพ → ลุกมาบัพก่อน แล้วค่อยนั่งพักใหม่ (SP ไม่ต้องครบก่อน)',
      '🙋 buff เพิ่มตัวเลือก "รวมตัวเอง" — บัพตัวเองด้วยสกิลเดียวกันตามรอบ delay ซ้ำ',
      '🔀 addSkill dedupe ด้วย skillId+โหมด — สร้าง Heal (ally HP<50%) + Heal (buff ให้คน) พร้อมกันได้',
      'ℹ️ ชี้แจง cooldown: เป็นช่วงห่างระหว่าง cast ต่อเนื่อง (ข้ามคนได้) ไม่ได้บล็อคคนอื่น —',
      '   บัพหลายคนต่อเนื่องได้ ห่างกัน cast ละ cooldownMs · repeatSec เป็นตัวคุมซ้ำต่อคน',
    ]},
    { v: '4.166.1', d: '2026-08-21', items: [
      '🐛 แก้บั๊กแก้ค่า buff (รายชื่อ/ชื่อ/delay) แล้วค่าเดิม — save handler เดิมบันทึก',
      '   เฉพาะเมื่อ mode=buff ถ้า mode select ค้างค่าเดิม ค่าที่แก้หลุดหมด + ลบชื่อไม่ถูกบันทึก',
      '   → บันทึก buff fields เสมอ + log ยืนยันค่าที่บันทึกทุกครั้ง',
      '🤝 เพิ่ม toggle "บัพให้คนอื่น" (Sub-tab Skill) — default ปิด!',
      '   กันบัพมั่วใส่คนแปลกหน้าตอนเดินผ่านฝูงคน (ตามที่ผู้ใช้ทักถูก)',
      '   ต้องเปิด Skill: ON + toggle นี้ ถึงเริ่มบัพ',
      '🔍 diagnostic ทุก 5s ใน Debug: เห็นผู้เล่นกี่คน · ผ่านชื่อ · ในระยะ · พร้อมบัพ —',
      '   ไล่ได้ทันทีว่าทำไมไม่บัพ',
    ]},
    { v: '4.166.0', d: '2026-08-21', items: [
      '🤝 ใหม่! โหมดสกิล "buff" — บอทบัพให้ผู้เล่นอื่นอัตโนมัติ',
      '   ตั้งต่อสกิล: ใช้กับ "ทุกคนในระยะ" หรือ "เฉพาะรายชื่อ" (เพิ่มได้หลายชื่อ คั่นจุลภาค)',
      '   ระยะใช้ช่อง "ระยะสูงสุด" เดิม (default 9) · delay ซ้ำต่อคน (repeatSec, default 300 วิ)',
      '   กันสแปมสองชั้น: cooldown ระหว่าง cast + จับเวลาต่อคนต่อสกิล',
      '   ค้นเฉพาะผู้เล่นที่มีชื่อจาก SPAWN (ไม่ใช่ dot ผี) + เว้นชื่อตัวเอง',
      '🔀 แยกเป็น buffOthersLoop เอกเอี่ยว — ยืน Guard ประจำจุดก็บัพได้ ไม่ต้องมีมอน',
      '   (ต้องเปิด toggle Skill: ON เท่านั้น · packet [1d][01]+playerId ยืนยันจาก capture แล้ว)',
      '📦 Preset พร้อมใช้: Blessing (บัพให้คน) + Increase Agility (บัพให้คน)',
    ]},
    { v: '4.165.0', d: '2026-08-21', items: [
      '🤝 โหมดสกิลใหม่ "ally" — สกิล Ally ของ Skills.toml (Heal/Blessing/Kyrie ฯลฯ)',
      '   ใช้กับตัวเองผ่าน targetId ของเรา (packet [1d][01]) ต่างจาก selfCast ([1d][05] ไม่มี target)',
      '   แก้ preset 13 สกิล Ally ที่เคยตั้งเป็น selfCast ผิด: Heal, Increase Agility, Blessing, Cure,',
      '   Detoxify, Aspersio, Benedicto, Impositio Manus, Kyrie, Resurrection, Status Recovery,',
      '   Suffragium, Enchant Poison → ally + desc "Ally→ใช้กับตัวเอง"',
      '❤️ Heal preset พร้อมใช้: HP<50% + cooldown 2.5s (ไม่ใช่ interval 4 นาทีแบบบัพ)',
      '✅ ยืนยัน: Passive ไม่มีใน preset ทั้งหมด (ตรวจครบ) · โหมดครบ 5: targeted/ground/AoE/self/ally',
    ]},
    { v: '4.164.0', d: '2026-08-21', items: [
      '❤️ เงื่อนไขสกิลใหม่: "ใช้เมื่อ HP < %" — เช่น Heal ตัวเองเมื่อ HP ต่ำกว่า 50%',
      '   0 หรือว่าง = ไม่สน HP (ใช้ตามเงื่อนไขเดิม) · HP ไม่รู้ค่า (?) = ไม่ใช้ (กันยิงพร่ำเพรื่อ)',
      '   ตั้งได้ทั้งตอนเพิ่มสกิลใหม่และแก้ไข (✎) · รายการแสดง HP<50% ต่อท้าย',
      '🔓 ปลด gate "ต้องมี target" ของ auto-skill — สกิล self-cast (Heal/บัพตัวเอง)',
      '   ใช้ได้แม้ยืนเฉย ๆ ไม่มีมอน (สำคัญกับ Guard mode / บอทบัพในอนาคต)',
    ]},
    { v: '4.163.0', d: '2026-08-21', items: [
      '♻️ รายการแมปฟาร์มหมุนวนเมื่อตาย (Sub-tab Farm) — เพิ่มได้หลายแมปพร้อมพิกัด',
      '   ตายแต่ละครั้ง → หมุนไปแมปถัดไปในรายการ (วนกลับแมปแรก) + toggle เปิด-ปิด',
      '   หลัง respawn พักเลือดเต็มแล้วระบบวาร์ปไปแมปใหม่เอง (ผ่าน farm-guard)',
      '   แต่ละแถวมีปุ่ม "ใช้เลย" (สลับไปแมปนั้นทันที) + "ลบ" + ▶ บอกแมปปัจจุบัน',
      '   เหมาะกับแมปมอนแรง/ผู้เล่นแย่งบอท — ตายบ่อยก็ได้ย้ายรังเป็นรอบ ๆ',
    ]},
    { v: '4.162.1', d: '2026-08-21', items: [
      '☠️ ตายแล้วบอกสาเหตุ — "☠️ ตาย — สู้กับ Wolf · ตีเราล่าสุด: Wolf, Poring @ แมป (x,y)"',
      '   วิเคราะห์จาก target ที่กำลังสู้ + มอนที่ตีเราใน 10s ท้าย (ใหม่สุดก่อน สูงสุด 3 ชื่อ)',
      '   ★ ขึ้น Log สำคัญ + ส่ง Telegram ด้วย (เดิมเป็น log ปกติอย่างเดียว ไม่บอกมอน)',
      '   + ตายแล้วเคลียร์ target เดิมทันที (กันไล่เป้าผีหลัง respawn)',
    ]},
    { v: '4.162.0', d: '2026-08-20', items: [
      '🛡️ ใหม่! GUARD MODE — ยืนประจำตำแหน่ง (เตรียมทำบอทคอยบัพให้คนอื่น)',
      '   ยืนนิ่งไม่หามอน ไม่ wander ไม่วาร์ปหามอน · มอนมาตีถึงตีกลับ',
      '   มอนยิงไกล → เดินเข้าไปตี (ลอจิกเดินหาเป้าเดิม) · ฆ่าเสร็จกลับจุดยืน',
      '   เลิกตีเมื่อมอนเลิกตีเรา 8s · ห่างจุดยืน >60 ช่อง → วาร์ปกลับ',
      '   ผิดแมป guard → วาร์ปกลับเอง (แทน farm-guard ตอน guard เปิด)',
      '⚙️ ตั้งค่าใน Sub-tab Combat: toggle + แผนที่ + X,Y + ปุ่ม "ใช้พิกัดตัวละคร"',
      '   (ASSIST.toggleGuard / setGuardPos ก็ได้) · ใช้ร่วมกับ Combat: ON',
    ]},
    { v: '4.161.1', d: '2026-08-20', items: [
      '🐛 แก้ปุ่ม เก็บ/ขาย/ฝาก ใน Monitor ในเครื่อง กดแล้วเงียบ — relay server ส่งต่อแค่',
      '   system+action และตัด itemId ทิ้ง → คำสั่ง item action หายกลางทาง',
      '   → relay forward itemId ด้วย + log ชัดเจน',
      '💾 cycleItemAction บันทึก config ถาวรแล้ว (เดิมไม่ save — refresh หายทั้ง UI และ monitor)',
    ]},
    { v: '4.161.0', d: '2026-08-20', items: [
      '🖥️ Remote Monitor: การ์ด Inventory → "ของที่เก็บได้ (session)" เหมือนแท็บสถิติใน UI',
      '   + ปุ่มวน เก็บ→ขาย→ฝาก กดจาก monitor ได้ทันที (คำสั่งใหม่ system:item)',
      '📦 ปุ่ม "Inventory" ในการ์ด → popup 3 แท็บ (Item/Etc/Equip) เหมือนในเกม:',
      '   ไอคอน + จำนวน/+refine + ป้าย ขาย/ฝาก + คลิกวน action ได้ + ปุ่ม ขาย/ฝากเดี๋ยวนี้',
      '   ข้อมูลอัปเดตสดทุก 1s เหมือน UI (เปิดค้างไว้ดูได้)',
    ]},
    { v: '4.160.2', d: '2026-08-20', items: [
      '🔓 แก้ deadlock ค้างหลังกด "ฝากเดี๋ยวนี้" — sellLoop/storageLoop บล็อกกันเอง',
      '   (sell รอ storage จบ / storage รอ sell จบ) จน watchdog ทั้งคู่ตาย ค้างถาวร',
      '   เกิดเมื่อ: ขายรอบ equipment ยังไม่ได้คำตอบ แล้วกดฝากทับ → ทั้งคู่ตาย',
      '   → ย้ายการ์ดกัน race ไปไว้เฉพาะช่วง trigger — state machine + watchdog',
      '     ของแต่ละตัวรันต่อเสมอ (sell ติด 15s ก็ abort เองได้ ไม่ลาก storage ตาย)',
      '🚫 depositNow/sellNow ปฏิเสธถ้าอีกฝ่ายกำลังทำอยู่ (บอกชัด รอให้จบก่อน)',
    ]},
    { v: '4.160.1', d: '2026-08-20', items: [
      '🐛 แก้ "ไม่มีของที่จะฝากใน inventory" ทั้งที่มี equipment เต็มถุง —',
      '   ของ equipment จาก login อยู่ใน equipmentList/equipmentSlots ไม่ใช่ inventory map',
      '   แต่ depositNow + คิวฝาก + คิวขาย เช็ค inventory.get() > 0 ก่อนเสมอ → ข้ามหมดเงียบ ๆ',
      '   → ตรวจ equipmentSlots ก่อน (มี slot = ฝาก/ขายได้เลย) แล้วค่อยเช็ค inventory สำหรับ stackable',
    ]},
    { v: '4.160.0', d: '2026-08-20', items: [
      '💰🏦 ปุ่ม "ขายเดี๋ยวนี้" + "ฝากเดี๋ยวนี้" ในหัว popup Inventory —',
      '   ทำงานเหมือนปุ่มใน panel (ASSIST.sellNow / depositNow) กดแล้ววาร์ปไปทำรายการทันที',
      '   popup เปิดค้างไว้ดูได้เรื่อย ๆ (live-refresh) · ปุ่มไม่ชนกับการลากหน้าต่าง',
    ]},
    { v: '4.159.1', d: '2026-08-20', items: [
      '🐛 แก้ Jobs ยังแสดงเป็นรหัสกลุ่ม (SwordUser) — ไฟล์ EquipmentGroups.csv',
      '   ไม่เคยถูก push ขึ้น GitHub (userscript ดึงจาก GitHub → 404 → groupInfo ว่าง)',
      '   → push ไฟล์แล้ว + cache ที่ groupInfo ว่างบังคับรีโหลดอัตโนมัติ',
      '   + log แจ้งชัดเจนถ้าโหลดไฟล์กลุ่มไม่ได้',
    ]},
    { v: '4.159.0', d: '2026-08-20', items: [
      '🐛 แก้ฝาก equipment ไม่ได้ + "Cannot store while equipped":',
      '   ของที่สวมอยู่ก็ยังถือ bag slot ของตัวเอง! สูตรเดิม (ข้ามชิ้นสวมตอนนับ slot) ทำให้เลขเลื่อน',
      '   ไปโดนชิ้นที่สวมอยู่ → server ปฏิเสธ หรือฝากผิดชิ้นแบบเงียบ ๆ',
      '   → slot id = 20000 + ลำดับในก้อน (รวมชิ้นสวม) · ลงทะเบียนฝากได้เฉพาะชิ้นที่ไม่ได้สวม',
      '🔄 สวม (ผ่านเกม) → slot ถูกถอดออกจากคิวฝากทันที · ถอด → คืน slot เดิม',
      '📊 สรุปผลฝากจริง: "สำเร็จ X/Y" นับเฉพาะชิ้นที่ server ตอบ 0x32 ยืนยัน —',
      '   แก้เคส "ขึ้นว่าฝากครบแต่ไม่มีอะไรถูกฝากจริง" (server ปฏิเสธเงียบ ๆ)',
      '⚠️ จับข้อความ "Cannot store while equipped" แสดง log ชัดเจน',
    ]},
    { v: '4.158.1', d: '2026-08-20', items: [
      '🎒 pill Inventory ใน mini-bar ใส่ icon 🎒 นำหน้าจำนวนเสมอ (เดิมตัว setter เขียนทับจน icon หาย)',
      '   + แก้ selector ชนกัน — ตอนนี้แถวสถิติ 🎒 Inventory ก็อัปเดตแล้วด้วย (เดิมค้าง ?)',
      '🔀 ย้ายปุ่ม Inventory มาไว้หลังปุ่ม 🤖 Auto',
    ]},
    { v: '4.158.0', d: '2026-08-20', items: [
      '🏷️ ชื่ออุปกรณ์แสดงจำนวนช่องการ์ดจริง เช่น "Sword[3]" / "+7 Helm[1]" (ไม่มีช่อง = ไม่แสดง)',
      '📊 Tooltip อุปกรณ์แสดงสเตตัสก่อนคำอธิบาย:',
      '   ⚔️ Attack (อาวุธ) · 🛡️ Defense/M.Def (เสื้อผ้า) · ⚖️ Weight · 🔧 Weapon Level · 📏 Required Level',
      '   👤 Jobs — แปลง EquipGroup ผ่าน EquipmentGroups.csv (ไฟล์ใหม่)',
      '   เช่น Sword[3] → Jobs: Novice, Swordsman, Merchant, Thief · Guard → All Jobs',
      '🗃️ itemDB cache v6 (โหลดใหม่อัตโนมัติครั้งแรก — รวมสเตตัส + กลุ่มอาชีพ)',
    ]},
    { v: '4.157.0', d: '2026-08-20', items: [
      '🔓 ตัวชี้ "สวมอยู่" ตัวจริง! — หางท้ายก้อน equipment มีรายการ inst ของชิ้นที่สวมอยู่',
      '   (0 = ช่องว่าง เช่น ช่องโล่ตอนถือดาบ 2 มือ) — ยืนยัน 4/4 captures:',
      '   testmage สวม 6 ชิ้นตรงเป๊ะ · superogira0 9 ชิ้น · ไม่สวม = รายการว่าง',
      '   (แก้: เดิม v4.156 เข้าใจว่าก้อน = ของในถุงล้วน → ของที่สวมโผล่ใน Equip tab)',
      '⚔️ ก้อน = สวม + ในถุงรวมกัน · bag slot id = 20000+ลำดับ "เฉพาะชิ้นที่ไม่ได้สวม"',
      '📏 ถอดขอบ inst เดิม 0x13900 (เดิมหลุดชิ้นที่เกิน 32 — มีตัวละครถือ 59 ชิ้น!)',
    ]},    { v: '4.156.0', d: '2026-08-20', items: [
      '🔓 ปริศนาครบ! ก้อน equipment ตอน login = "ของในถุงเท่านั้น" ไม่รวมที่สวมอยู่',
      '   (ยืนยัน: deposit ทำกับของในก้อนได้ตรง ๆ — ทฤษฎี @28&3=สวม/ถุง เมื่อวานเป็นเรื่องบังเอิญ ถอดทิ้งแล้ว)',
      '🎯 ลำดับในก้อน = bag slot id (20000+N) — ยืนยันจาก deposit จริง:',
      '   Cotton=20000 · Guard=20003 · Egg=20004 ✓ + relogin จัดเลขใหม่ compact ✓',
      '   → ฝาก/ขาย equipment ที่มาตั้งแต่ login ได้เลย (เดิมต้องผ่านคาฟราก่อน)!',
      '   + สวม/ถอด mid-session ตามได้ครบทุกชิ้น (เพราะรู้ slot id ตั้งแต่ login)',
      '🛡️ slot id จาก login = unverified → ฝากไม่ optimistic ลบ รอ server ยืนยัน (กันพังถ้า decode ผิด)',
    ]},
    { v: '4.155.0', d: '2026-08-20', items: [
      '⚙️ เพิ่มช่องตั้ง attackPendingMax ใน Combat (abandon ถ้า server เงียบครบ N ครั้ง)',
      '⚙️ เพิ่มช่องตั้ง maxAttempts ใน Loot (เก็บไม่ได้ครบ N ครั้ง → ปล่อย/วาร์ปไปเก็บ)',
      '   ทั้งคู่บันทึกถาวรผ่าน PERSIST_KEYS แล้ว',
    ]},
    { v: '4.154.1', d: '2026-08-20', items: [
      '💰 หัวข้อ "ของที่เก็บได้ (session นี้)" แสดงยอดรวมเงินจากของที่เก็บได้',
      '   — นับเฉพาะของที่ตั้งค่าให้ "ขาย" (อัปเดตสด ลดตามที่ขายไปแล้ว)',
    ]},
    { v: '4.154.0', d: '2026-08-20', items: [
      '📊 สถิติ "ของที่เก็บได้" = เฉพาะของที่เก็บใน session นี้ (เดิมโชว์ของทั้งหมดใน inventory)',
      '   เรียงจากเก็บล่าสุด → เก่า · จำนวน = ของจริงที่มีอยู่ (ลดตามใช้/ขาย/ฝากสำเร็จ หมดแล้วหายเอง)',
      '   ปุ่ม "ล้างรายการของ" ล้างลิสต์นี้ด้วย',
      '🐛 คืนการแสดงจำนวนในแท็บ Item/Etc ของ popup (v4.153 หลุดตอนแก้ Equip · Equip ไม่ต้องมี=แยกชิ้นอยู่แล้ว)',
      'ℹ️ ขาย/ฝาก: ใช้ของจริงใน inventory ตามที่ตั้งไว้ ไม่ผูกกับ "เก็บใน session" —',
      '   equipment ที่ไม่รู้ slot id ข้ามไปก่อน (ชิ้นที่ผ่านคาฟรา/เก็บใน session ใช้ได้ปกติ)',
    ]},
    { v: '4.153.0', d: '2026-08-20', items: [
      '🎒 Equip tab = เฉพาะของในถุงเท่านั้น (ตัดของที่สวมอยู่ออก — ตามที่ผู้ใช้ต้องการ)',
      '   เดิมแสดงรวมสวม+ถุง ทำให้รายการดูไม่ตรงกับหน้าต่าง Equip ในเกม',
      '🔄 สวม/ถอด mid-session อัปเดตสด: invIdx ใน 0x30 = bag slot id & 0xFF',
      '   (ยืนยันจาก capture: Chain 20011→0x2B · Boots 20012→0x2C) — พลิก worn ของชิ้นที่รู้ slot id',
      '   สวม → หายจากถุง · ถอด → กลับมาในถุง · ชิ้นที่ไม่รู้ slot id รอ refresh ตอนเข้าเกม',
    ]},
    { v: '4.152.0', d: '2026-08-20', items: [
      '👕 Equip: แยก "สวมอยู่" กับ "ในถุง" ได้แล้ว! — decode record 44B ครบ (ยืนยัน 22/22 จาก ground truth)',
      '   u8@11>>2 = refine (+7/+8) · u32@28>>2 = card id ในชิ้น · u32@28&3: 1=ในถุง อื่น=สวมอยู่',
      '   (ถอดกลับ v4.151.0 ที่เข้าใจผิดว่า @28 = slot id — จริง ๆ คือข้อมูลการ์ด)',
      '🏷️ ชื่อ equipment แสดงเหมือนในเกม: "+7 Anti-Magic Helm [1]" / "Brooch of Counter"',
      '   prefix/postfix จาก ItemsCards.csv (cache v5 โหลดใหม่อัตโนมัติ)',
      '🎨 Equip tab: ของสวมอยู่ก่อน (ขอบฟ้า+ป้าย สวม+เรืองแสง) → ของในถุงตามหลัง',
      '   + มุมขวาล่างโชว์ +refine · หัวไฟล์ "สวม X · ถุง Y ชิ้น"',
      '🛡️ ฝาก/ขาย: ข้าม equipment ที่ไม่รู้ slot id (ของมาตั้งแต่ login) + บอกสาเหตุ',
      '   — กันส่งผิดฟอร์แมตแล้ว server ปฏิเสธทั้งก้อนเหมือนเดิม',
    ]},
    { v: '4.151.0', d: '2026-08-20', items: [
      '⚔️ Equip: ถอด bag slot id จาก login block (@28 ค่า ≥1000) — ของที่มาตั้งแต่ login',
      '   ตอนนี้มี slot id ให้ฝาก/ขายได้แล้ว (เดิมไม่มี → ส่งเป็น stackable → server ปฏิเสธเงียบ',
      '   → ของไม่ยอมออกจากรายการ = "รายการไม่ตรงกับความจริง" ที่เจอ)',
      '🛡️ กันพัง: slot id จาก login block จะไม่ optimistic ลบตอนฝาก (รอ server ยืนยัน 0x32)',
      '   — ต่างจากของที่ได้จาก sub=5 (verified) ที่ optimistic ได้ตามเดิม',
      'ℹ️ Equip tab = ของสวมอยู่ + ของในถุง รวมกัน (protocol เกมส่งมาแบบนี้ — ยังแยกไม่ได้ 100%)',
    ]},
    { v: '4.150.0', d: '2026-08-20', items: [
      '🌀 TELEPORT SERIALIZER — server รับ 0x40 ห่างกัน ~3s ยิงถี่ ตัวหลังถูกดรอปเงียบ!',
      '   เคสจริง: วาร์ปกลับฟาร์ม+เริ่มฝาก+วาร์ปสุ่ม ใน 3 วิ → warp หาย → "ประกาศวาร์ปแต่ไม่ไปไหน"',
      '   → ตอนนี้เก็บ intent ล่าสุด (last-wins) แล้ว flush อัตโนมัติเมื่อครบ 3s',
      '🛑 ห้าม combat/wander/loot/warp-loot ตีกับ routine — เพิ่ม gate sell/storage ≠ IDLE',
      '   เคสจริง: สุ่มเดินแย่งทาง NPC / ตี+สกิลมอนข้ามแมป / farm-guard warp สู้ routine',
      '   จนลูป "ยังอยู่แมปผิด" ยาวเป็นนาที',
      '💰 แยกขาย 2 รอบ: stackable ก่อน → equipment ทีหลัง (คนละ packet)',
      '   เคสจริง: ปนกัน → server ปฏิเสธทั้งก้อน 3 ครั้งติด ของไม่ถูกขายเลย',
      '   + แสดงชื่อจริงของ equipment (เดิมโชว์ item_20063 = slot id)',
      '📍 อยู่แมป NPC/Kafra แล้ว+ใกล้พอ (≤40 ช่อง) → ไม่วาร์ปซ้ำ + หา NPC ได้เลยไม่ต้องรอ 5s',
      '🔁 warp ไม่ถึงแมปเป้าหมายใน 10s → ยิงซ้ำอัตโนมัติ (สูงสุด 2 ครั้ง) แทน abort',
      '🎒 inventoryFull คลายเมื่อ slot ว่างจริง: ฝากครบ / 0x32 removal ยืนยัน (เดิมค้างตลอดกาล)',
      '🐛 แก้ sellState._lastMove เก็บบน string = no-op → throttle เดินเข้า NPC ไม่ทำงาน',
    ]},
    { v: '4.149.0', d: '2026-08-19', items: [
      '🖱️ Popup Inventory ลากย้ายอิสระได้ — จับที่แถบหัวเรื่องกดค้างลาก',
      '   กันลากหลุดจอ (เหลือให้เห็นอย่างน้อย 80×40 px) · ลากแล้วคลิกพื้นหลังปิดได้เหมือนเดิม',
      '🎨 แก้สีไม่ sync ตอนคลิกของซ้ำหลายชิ้นใน Equip (เช่น แหวน 2 วง)',
      '   action ผูกกับ itemId → ตอนนี้ทุกชิ้นของ item เดียวกันเปลี่ยนสี/label พร้อมกันทันที',
      '🔧 แก้ const VERSION ค้าง 4.147.1 (ลืมอัปเดตตอนปล่อย 4.148.0)',
    ]},
    { v: '4.148.0', d: '2026-08-19', items: [
      '⚔️ Equip inventory sync real-time — ถอดโครงจาก capture 4 ไฟล์ (สวมใส่/ถอด/ถอดคาฟรา)',
      '   0x32 sub=5 (ถอดคาฟรา/เก็บ equipment จากพื้น) → เพิ่มเข้า equipmentList ทันที',
      '   0x32 removal (ฝาก/ขาย/ทิ้ง) → ลบ 1 ชิ้นออกจาก equipmentList + จุด optimistic ตอนฝากคาฟรา',
      '   แก้บั๊กหายของ: 0x38 resend หลังสวมใส่/ถอด เคยล้าง equipmentList ทิ้ง',
      '   → ตอนนี้ล้างเฉพาะเมื่อเจอก้อน 0x13880 (มีเฉพาะตอนเข้าเกม)',
      '⚖️ น้ำหนัก re-sync แม่นทุกครั้ง — server ส่ง 0x38 ซ้ำทุกครั้งที่สวมใส่/ถอด/ฝาก-ถอดคาฟรา',
      '   ขยาย anchor: prefix byte 01/02 → 01-20 (เจอใหม่ 06/08) + f32 exponent 3f → 3d-3f',
      '   → แก้ delta drift สะสมจากการคำนวณน้ำหนักเอง',
      '🎒 Popup inventory live-refresh — ข้อมูลเปลี่ยน render ใหม่เองใน 1s (คง scroll)',
      '⚔️ Log การสวมใส่/ถอด — ดัก OUT 0x30 จับทิศทาง + IN 0x30 บอก slot (อาวุธ/รองเท้า/ฯลฯ)',
    ]},
    { v: '4.147.1', d: '2026-08-19', items: [
      '🐛 แก้ desc ไม่แสดงสำหรับ Equip/Card/Arrow — regex เดิมไม่รองรับ //id 2101',
      '   ไฟล์ desc ใช้ 2 format: //501 (usable) และ //id 2101 (equip/weapon/card/ammo)',
      '   + strip <desc>...</desc> tags ที่ equip/weapons ใช้',
      '   ทดสอบ: 6/6 ไฟล์ครบ 2879 descs (288+554+503+40+440+750)',
      '   cache v4 — โหลดใหม่ออัตโนมัติ refresh ครั้งถัดไป',
    ]},
    { v: '4.147.0', d: '2026-08-19', items: [
      '🔀 กู้คู่การวาร์ปสุ่มรับๆตอนฝากของคาฟรา (รายงานผู้ใช้)',
      '   เหตุ: stuck abandon → วาร์ปสุ่ม และ ไม่เจอมอน 3s → วาร์ปสุ่ม',
      '   ไม่เช็คว่ากำลังขาย/ฝากของอยู่หรือไม่',
      '   การ์ที่เพิ่งพายังไม่ทัน → ฝากไม่ทัน วาร์ปหนีไม่จบ',
      '   แก้: ทั้ง 2 จุดเพิ่ม guard sellState/storageState === IDLE',
    ]},
    { v: '4.146.0', d: '2026-08-19', items: [
      '⚖️ น้ำหนักอัปเดต real-time (delta-based) — ยืนยันจาก capture 2 ไฟล์',
      '   ไม่มี packet น้ำหนักตอนเก็บของ → คำนวณจาก Weight ใน item DB',
      '   CSV เป็นหน่วย ×10: Bird Feather 10=1, Apple 20=2, Orange Potion 100=10',
      '   วิธี: delta = (count ใหม่-เก่า) × Weight → บวก/ลบ (anchor จาก server ตอน 0x38)',
    ]},
    { v: '4.146.0', d: '2026-08-19', items: [
      '⚖️ น้ำหนักอัปเดต real-time — คำนวณจาก Weight ใน item DB',
      '   (ยืนยันจาก capture 2 ไฟล์: เก็บ Bird Feather 0→1 · Apple 1→3',
      '    ไม่มี packet น้ำหนักแยก — ต้องคำนวณเองจาก Weight×count)',
      '   เรียกทุกครั้งที่ inventory เปลี่ยน (0x32) + ตอน init (0x38)',
    ]},
    { v: '4.145.1', d: '2026-08-19', items: [
      '🏷️ label สถานะมุมซ้ายบนการ์ด item (พื้นดำ ตัวขาว): ขาย / ฝาก',
      '   แสดงเฉพาะตอนตั้งค่าขายหรือฝาก · อัปเดตทันทีเมื่อคลิกวน toggle',
    ]},
    { v: '4.145.0', d: '2026-08-19', items: [
      '📍 popup inventory ชิดขวาจอ (เหมือน log modal)',
      '⚔️ Equip แยกเป็นชิ้นตามลำดับ slot ที่ server ส่ง — เหมือนหน้าต่างในเกม ไม่รวม stack',
      '🖱️ คลิกช่อง item = วน toggle เก็บ(เทา)→ขาย(ส้ม)→ฝาก(เขียว)',
      '   สีพื้นหลังเปลี่ยนทันที · ใช้ config เดียวกับ filter ขาย/ฝากในหน้าสถิติ',
    ]},
    { v: '4.144.1', d: '2026-08-19', items: [
      '🔴 แก้ Equip tab แสดงของปนจาก tab อื่น — filter เดิมผ่านหมด (true)',
      '   ใหม่: รวม equipmentInv เข้า inventory (สแตกจำนวนซ้ำ) แล้วกรองตามหมวดจริงทุก tab',
      '   ทดสอบ: Item [502,504,505] · Equip [1201,1502,1461] · Etc [713,715,716,717] ✓ ตรง',
    ]},
    { v: '4.144.0', d: '2026-08-19', items: [
      '⚔️ Equip tab แสดงของแล้ว! — ถอดโครงสร้างก้อน Equipment จาก capture จริง 10/10',
      '   โครง (stride 44B): [inst:4=0x13880+i][id×4:4][a:2][b:2][UUID:16][slot:4][?:4][pad:4]',
      '   ยืนยัน: Knife 1201 → Gladius 1220 ตรงทุกตัวตามลำดับ slot ของผู้ใช้',
      '   → tab Equip ใน popup จะรวมอาวุธ/ชุดจากก้อนนี้ + ของ cat=equip จาก inventory ธรรมดา',
    ]},
    { v: '4.143.1', d: '2026-08-19', items: [
      '🎨 tooltip inventory: ชื่อ item เป็นแถบ bg สีน้ำเงิน (เหมือนในเกม) — desc ธรรมดา',
      '📍 popup inventory ชิดขวาจอแล้ว (เหมือน log modal)',
    ]},
    { v: '4.143.0', d: '2026-08-19', items: [
      '🎒ใหม่! ปุ่ม Inventory ใน mini-bar — popup แบบในเกม',
      '   3 tab แนวตั้ง: Item (ของใช้) / Equip (ชุด+อาวุธ เรียงตาม slot) / Etc. (Ammo+Card+ของธรรมดา)',
      '   grid 10 ช่อง/แถว + icon (บางอันไม่มีรูป) + hover แสดงชื่อ+desc จาก ItemDescriptions',
      '   แสดงจำนวนชิ้นมุมช่อง + สรุปหัว modal: ชนิด/ชิ้น/น้ำหนัก',
      '🗃️ item DB v2 — จาก db/Item ของ RagnarokRebuildTcp (2584 รายการ แทน items.csv 1016)',
      '   เพิ่ม: หมวด (usable/equip/etc) + slot + descriptions (ถอด <color> tags)',
      '   cache localStorage v2 · Item/Etc เรียงตาม id · Equip ตามลำดับ slot เกม',
    ]},
    { v: '4.142.0', d: '2026-08-19', items: [
      '🎒 generalize parser inventory + น้ำหนัก — ผ่านทุกกรณีจริง 4/4',
      '   anchor [01|02][maxW×10][f32][curW×10] (prefix ต่างตามตัวละคร) + validation-scan',
      '   กันข้อผิดพลาด: เพดาน id≤12000 · phantom equipment guard · clean terminator',
      '   ทดสอบ: ว่าง[] · 502×1 · 502+507×2 · testmage 55 ชนิด/1397 ชิ้น 3147.8/3820 ✓',
    ]},
    { v: '4.140.0', d: '2026-08-19', items: [
      '🔴🔴 HOTFIX — แก้ syntax error ที่ทำให้ script รันไม่ได้เลย (mini-bar หาย!)',
      '   เหตุ: changelog 4.139.2 มี newline หลุดเข้าไปใน string บรรทัด 123',
      '   → ทั้งไฟล์ parse ไม่ผ่าน → ไม่มี panel/log/บอท ทั้งหมดตาย',
      '   (console ขึ้น (index):124 Invalid or unexpected token ตอน Tampermonkey ฉีด script)',
      '🛠️ โบนัส: PANEL RESURRECTION — ตรวจทุก 5s ถ้าหน้าเกมพังแล้วล้าง DOM ไปพร้อม panel',
      '   → สร้างใหม่อัตโนมัติ (สูงสุด 10 ครั้ง) + log 🛠️ ทุกครั้ง',
    ]},
    { v: '4.139.2', d: '2026-08-19', items: [
      '🐛 แก้ offset น้ำหนัก (off-by-one): maxW@sig-16 · curW@sig-8 — ตรวจกับไฟล์จริง 3 ไฟล์',
      '   0/3130 · 10/3130 · 16/3130 ✓ ตรงหมด (เดิมอ่านเพี้ยนเพราะนับระยะผิด 1 byte)',
    ]},
    { v: '4.139.1', d: '2026-08-19', items: [
      '⚖️ decode น้ำหนักจาก 0x38 (ยืนยันด้วยค่าจริงจากผู้ใช้: max 3130, Orange 10/ชิ้น, Red Herb 3/ชิ้น)',
      '   หน่วยใน packet = ×10: curW 160=16 · maxW 31300=3130 ✓',
      '   แสดงในบรรทัดสถานะ Debug (น้ำหนัก 16/3130) + ส่ง monitor (weight/weightMax)',
    ]},
    { v: '4.139.0', d: '2026-08-19', items: [
      '🎒 Inventory เริ่มต้นถูกส่งมาใน 0x38 ตัวที่สอง (หลังเลือกตัวละคร) — เพิ่ง decode!',
      '   (จากการเทียบ capture 3 ครั้ง: ว่าง / Orange 502×1 / +Red Herb 507×2)',
      '   โครง: signature + รายการ [id×4 :u32][count×4 :u16] + field น้ำหนัก',
      '   → parse เติม inventory ทันทีตอนเข้าเกม — แก้ปัญหา heal/sell เห็นของว่าง',
      '   ช่วงแรกก่อนมี 0x32 increment แรก (ทดสอบ parser กับข้อมูลจริง 3 ไฟล์ ตรง 100%)',
    ]},
    { v: '4.138.0', d: '2026-08-19', items: [
      '🔴 แก้ batch 0x3c — ค้นพบจาก capture วาร์ป: byte หลัง opcode คือ จำนวนระเบียน',
      '   (ไม่ใช่ sub) + flag ต่อระเบียน: 1=ผู้เล่น / 3=MiniBoss / 4=Boss / 5=Warp portal',
      '   เดิมสร้างทุกระเบียนเป็น kind=1 — warp portal กลายเป็น มอน ไร้ชื่น',
      '   (รอดเพราะ portal ไกล >12 ช่อง แต่ wander ไปใกล้จะตีเปล่า)',
      '   แก้: flag=5 → warp (kind=2) / flag=1 → ลงทะเบียน beacon player',
      '   / flag=3,4 → mark MiniBoss/Boss',
      '📋 ยืนยันจาก capture: หลังวาร์ป server ส่ง SPAWN มอน 8 ตัว + beacon ตัวเรา',
      '   ทันที + คู่ 1b+36(5) ยังส่งมาเรื่อย ๆ (รองรับแล้ว v4.137)',
    ]},
    { v: '4.137.0', d: '2026-08-19', items: [
      '🔴🔴 พบ "โรงงานผี" จาก capture จริง — ต้นเหตุแท้ของมอนอยู่รอบตัวแต่หาไม่เจอ!',
      '   server ส่ง 1b (despawn?) + 36 reason=5 เป็นประจำทุก ~5s กับมอนที่ยังเดินอยู่',
      '   (client ยัง render!) — เดิมเราลบ entity ทันที → MOVE ถัดไปสร้าง ghost kind=0',
      '   → มอนหายจาก targeting เป็นระยะ',
      '   แก้: 1b ไม่ลบทันที — mark pending รอ 2s ถ้าไม่มี MOVE/36(5)/emote มายืนยัน',
      '   (sweeper ลบจริงเมื่อพ้นเวลา — despawn จริงยังทำงาน)',
      '📋 ใหม่จาก capture: 0x0f action≠3 = emote ของมอน (ใช้ยืนยัน entity มีชีวิต)',
      '   0x36 reason=5 = state change คู่กับ 1b (ไม่ใช่ loot event)',
    ]},
    { v: '4.136.0', d: '2026-08-19', items: [
      '🔴 มอนอยู่รอบตัวแต่บอทบอก "ไม่เจอมอน" แล้ววาร์ปหนี — สาเหตุหลัก: abandonCooldown',
      '   abandon มอนรอบตัวครบทุกตัว (pending server เงียบ) → ทุกตัวโดน cooldown 15s',
      '   → หาอะไรไม่เจอเลย ทั้งที่มอนเต็มจอ → วาร์ปหนีไปเอง',
      '   แก้: ก่อนวาร์ป เช็คว่ามีมอนในระยะที่บล็อกแค่เพราะ cooldown → ปลดตัวใกล้สุด',
      '   แทนการวาร์ป (log 🔓 ให้เห็นชัด)',
      '🔍 Debug เพิ่ม: บรรทัดวิเคราะห์ตอนวาร์ป — มอนในระยะกี่ตัว/โดน antiKS/ghost 0x07',
      '🔍 Debug เพิ่ม: SPAWN parse fail (entity หายจาก radar — อีกสาเหตุของหามอนไม่เจอ)',
    ]},
    { v: '4.135.0', d: '2026-08-19', items: [
      '🔴🔴 กันยึ่งของคนอื่นขั้นเด็ดขาด — blacklist ล่วงหน้าก่อนยิงเก็บเลย',
      '   (จากความรู้จริงของผู้ใช้: item drop ที่ตำแหน่งมอน ±1 ช่อง)',
      '   ใหม่: จดจุดตายของมอนทุกตัว (รวมที่คนอื่นฆ่า) ตอน 0x0f',
      '   → drop ใกล้จุดตายมอนที่เราไม่ได้ตี = ของคนอื่นแน่ → blacklist 60s ทันที',
      '   ไม่ต้องรอ server ปฏิเสธ และไม่วาร์ปไปเก็บ (แก้รายงานผู้ใช้: บอทพยายาม',
      '   ไปเก็บของคนอื่นจนวาร์ปไปหา — เกิดจาก warp-to-loot หลัง fail 4 ครั้ง)',
      '   ยกเว้นตีทับกัน: จุดตายเขาใกล้จุดฆ่าเรา ≤3 ช่อง หรือใกล้ตัวเรา ≤4 ช่อง → ลองได้',
      '🔧 รัศมีพิกัดฆ่า (pickRadiusKill) 5 → 2 ช่อง ตามกลไก drop จริง',
    ]},
    { v: '4.132.0', d: '2026-08-19', items: [
      '🔴🔴 โดนมอนรุมแต่ไม่ตีกลับ — จนวาร์ปหนีรุม 5 (จาก log จริง: Condor ช่วยกัน)',
      '   เหตุ: มอน linked-aggro ที่อยู่นอกจอเดินเข้ามาทาง 0x07 ก่อน SPAWN',
      '   → ถูกสร้างเป็น kind=0 ghost (บั๊กเดียวกับเคสหนีผี) → targeting มองไม่เห็น',
      '   + defensive retarget ข้าม (kind≠1) → เลือกเป้ามอนไกล 17-24 ช่องแทนทั้งที่โดนตี',
      '   แก้: ผู้โจมตีเราผ่าน 0x0b = มอนแน่นอน (ยกเว้นผู้เล่นบน radar)',
      '   → แก้ kind เป็น 1 ทันทีที่โดนตี + สร้าง entity ถ้ายังไม่มี → ตีกลับได้ทันที',
    ]},
    { v: '4.131.0', d: '2026-08-19', items: [
      '🎛️ mini-bar: เพิ่ม pill 🤖 Auto (toggle auto-login — เขียว=เปิด/แดง=ปิด)',
      '   (มีผลตอน refresh ครั้งถัดไป — ระบบ login ทำงานตอนหน้าเว็บโหลด)',
      '🎨 เรียงปุ่มใหม่ท้ายแถบ: 📋 Log → 💬 แชท → 🐞 แจ้งปัญหา → 📜 Update Log (ท้ายสุด)',
    ]},
    { v: '4.130.0', d: '2026-08-19', items: [
      '🔮🔮 รายการสกิลครบ 110 ตัว! จาก Skills.toml ของ RagnarokRebuildTcp (โค้ด server จริง)',
      '   ID = ลำดับในไฟล์ (None=0) — ยืนยัน 100%: preset เดิม 13 ตัวที่ capture จริงตรงทั้งหมด',
      '   (Bash=3 Magnum=6 TwoHandQuicken=30 DoubleStrafe=24 Steal=61 SonicBlow=126 ฯลฯ)',
      '   แต่ละสกิลมี: ชื่อ · เป้าหมาย (โจมตี/AoEพื้น/ตัวเอง/บัพ) · SP ต่อเลเวลครบทุกเลเวล',
      '   · ปรับเลเวลได้/ไม่ได้ · เลเวลสูงสุด — จัดกลุ่มตามอาชีพ 13 กลุ่ม',
      '   ⚠️ สกิลที่ยังไม่ได้ capture ใช้ค่า default (ระยะ 9 ช่อง cooldown 2s) — ปรับได้หลังเพิ่ม',
    ]},
    { v: '4.129.1', d: '2026-08-18', items: [
      '⚠️ ช่อง username/password ใน sub-tab Auto → disabled + hint',
      '   (การพิมพ์รหัสเองยังใช้ไม่ได้ — Unity ไม่รับ synthetic text จะแก้ภายหลัง)',
      '   ระบบใช้ "รหัสที่เกมจำไว้ + Enter + เลือกตัวละครอัตโนมัติ" เต็มรูปแบบแทน —',
      '   ผู้ใช้ล็อกอินผ่านหน้าเกมเอง 1 ครั้งให้เกมจำรหัส แล้วปล่อยให้ระบบทำงานตลอด',
      '🧹 ถอนโค้ดพิมพ์ user/pass เอง (ขั้น fallback ที่ไม่ work) — เหลือกด Enter เท่านั้น',
    ]},
    { v: '4.129.0', d: '2026-08-18', items: [
      '🎯 CHAR-SELECT NUDGE — แก้ค้างหน้าเลือกตัวละคร (จากทดสอบจริง)',
      '   ข้อค้นพบ: WS เปิด = เกมกด login แล้วเสมอ → ห้ามส่ง 0x08 ซ้ำ (server เมิง)',
      '   + เกมจำรหัสไว้ = ไม่มี IN 0x00/token ให้เห็น → packet SELECT_CHAR ใช้ไม่ได้',
      '   แก้: ถ้าไม่มี playerId ใน 12s → กด Enter + คลิกแทนหน้า char select',
      '   (หมุนตำแหน่ง 50%/35%/65%/42%/58% ของความกว้าง — ไล่จนตัวละครถูกเลือก)',
      '🔄 auto-refresh เพิ่มเคส 3: WS เปิดแต่ไม่เข้าเกมเกิน stallSec → refresh ลองใหม่',
    ]},
    { v: '4.128.1', d: '2026-08-18', items: [
      '⌨️ ลำดับใหม่ตามข้อค้นพบจริง: กด Enter ก่อน (ใช้รหัสที่เกมจำไว้)',
      '   → ผ่านเลยถ้าเกมจำรหัส (default ของเกม) ไม่ต้องพิมพ์อะไรเลย',
      '   → ถ้า 5s ไม่มี WS ค่อยลองพิมพ์ user/pass เอง (เคสเบราว์เซอร์ใหม่)',
      '   ทดสอบยืนยัน: พิมพ์ตัวอักษร synthetic ไม่เข้า InputField Unity แต่ Enter ทำงาน',
    ]},
    { v: '4.128.0', d: '2026-08-18', items: [
      '⌨️★★ KEYBOARD auto-login: พิมพ์ user/pass ลงฟอร์มเกมเองผ่าน synthetic keyboard!',
      '   ข้อค้นพบ: เกมเปิด WS ตอนกดปุ่ม Login เท่านั้น (ไม่ใช่ตอนโหลดเสร็จ)',
      '   → รอ WS เองไม่มีวี่วัน ต้องกรอกฟอร์มให้เกม: พิมพ์ user → Tab → pass → Enter',
      '   ลองทุก 22s สูงสุด 8 ครั้ง (หยุดทันทีเมื่อ WS เปิด = login สำเร็จ)',
      '🤖 ปรับ flow หลัง WS ต่อ: ดู 9s ก่อนว่าเกมล็อกอินเอง (session เดิม) →',
      '   ไม่มีค่อยส่ง 0x08 เอง + ถ้าเกมส่ง SELECT_CHAR เอง (0x03 OUT) เราไม่แทรก',
      '   + IN 0x00 → รอ 2.5s ให้เกมเลือกตัวเองก่อน แล้วค่อยส่ง packet แทน',
    ]},
    { v: '4.127.3', d: '2026-08-18', items: [
      '⏳ ระหว่างรอเกมโหลด: log สถานะทุก ~30s (รอแล้วกี่วิ คลิกกี่ครั้ง)',
      '🔄 ถ้าไม่มี WS ใน 3 นาที = โหลดพัง → refresh แล้วเริ่มใหม่เอง',
      '   (สูงสุด 3 รอบต่อเนื่อง กันวนไม่จบ — counter เคลียร์เมื่อโหลดสำเร็จ)',
      '   + alert Telegram ทุกครั้งที่ refresh แก้เกมพัง',
    ]},
    { v: '4.127.2', d: '2026-08-18', items: [
      '🖱️ splash click ยืดเวลา: ทุก 8s นานสุด ~5 นาที (เดิม 4 ครั้ง/28s ไม่พอ —',
      '   ทดสอบจริง Unity เพิ่งเริ่มโหลดตอน 21s และใช้เวลาโหลดต่ออีกนาน)',
      '   + ยิง pointerdown/up ด้วย (Unity WebGL ฟัง pointer events เป็นหลัก)',
      '   หยุดทันทีเมื่อ WS ต่อ/เข้าเกม/login fail',
    ]},
    { v: '4.127.1', d: '2026-08-18', items: [
      '🖱️ Auto-login: ถ้าไม่มี WS ภายใน ~7s → คลิกกลางจอไล่หน้า splash "คลิกเริ่มเกม"',
      '   (สูงสุด 4 ครั้งใน 60s และคลิกเฉพาะตอน WS ยังไม่ต่อ — เข้าเกมแล้วไม่แตะ)',
      '📋 สรุปสถานะ auto-login/refresh ตอนสตาร์ท (เห็นใน log + console ทันที)',
      '🖥️ flow auto-login พิมพ์ console ตรง ๆ ทุกขั้น (ไม่ต้องรอเปิด panel)',
    ]},
    { v: '4.127.0', d: '2026-08-18', items: [
      '🤖 Auto-Login! WS ต่อเกม → ล็อกอินเอง → เลือกตัวละคร slot ที่ตั้งไว้ (จาก capture)',
      '   protocol: OUT [08][00000000][uLen][user][pLen][pass] → IN 0x00 (token 20B)',
      '   → OUT [03][type:2][token][slot] → IN 0x03 เข้าเกม — delay สุ่ม 1.5-3.5s กันดูเป็นบอท',
      '🔄 Auto-Refresh: เข้าเกมแล้ว packet เงียบเกินเกณฑ์ (default 180s) หรือ WS หลุดนาน',
      '   → alert Telegram + refresh หน้า → auto-login กลับเข้าเกมเอง',
      '⚙️ ตั้งค่าใน sub-tab 🔑 Auto (username/password/slot/toggle ทั้งสองระบบ)',
      '   + API: ASSIST.setAutoLogin(user,pass,slot) / autoLoginOn() / setAutoRefresh(sec)',
      '🔒 เก็บใน localStorage (รอดจาก refresh) — ห้ามใช้เครื่องส่วนรวม!',
      '   ตรวจแล้ว: ค่าพวกนี้ไม่หลุดไป monitor/feedback/console แน่นอน',
    ]},
    { v: '4.126.0', d: '2026-08-18', items: [
      '❤️ log ตีมอนแสดง HP มอนแล้ว: ⚔️ ตี Eggshell Picky @(248,229) dist 1.4 HP 65/120 (54%)',
      '   แหล่งค่า: SPAWN (HP เริ่มต้น) + ลดจากดาเมจเราแบบ real-time',
      '   ข้อจำกัด: ถ้าคนอื่นตีมอนตัวเดียวกัน HP ที่แสดงจะค้างสูงกว่าจริง',
    ]},
    { v: '4.125.1', d: '2026-08-18', items: [
      'ⓘ Debug: บรรทัดสถานะทุก 10 วิ — HP/SP เต็มค่า + %, ตำแหน่ง, เป้าปัจจุบัน,',
      '   จำนวนโดนตี/ผู้เล่นใกล้, คิวเก็บของ → เห็น HP ไหลไปไหนระหว่างเหตุการณ์',
      '   (เดิม HP โผล่แค่ตอน SPAWN/ใช้ยา/นั่งพัก — ช่วงกลาง ๆ มองไม่เห็นเลย)',
    ]},
    { v: '4.125.0', d: '2026-08-18', items: [
      '📊 แยก Log เป็น 2 แหล่ง: 📋 กิจกรรม (สิ่งที่บอททำ) กับ 🔍 Debug (ข้อมูลระบบเพื่อวิเคราะห์)',
      '   Debug: SPAWN self dump / SPAWN player / flee scan ทุก 5s / SELF-DETECT /',
      '   AUTO-DETECT / false despawn guard / ตัวกรอง item ข้าม / /where / ล้าง entities',
      '   → Log กิจกรรมสะอาดขึ้นเยอะ (ไม่โดน 344 บรรทัดร้านค้าในเมืองทับ)',
      '   ดูได้ทั้งใน mini-bar 📋 (ปุ่มสลับ กิจกรรม/Debug) และ sub-tab Log',
      '   ปุ่มคัดลอกคัดลอกตาม view ที่เลือก / feedback แนบทั้งสองแบบ /',
      '   monitor ได้รับ dbgLogs เพิ่ม (200 บรรทัด) เก็บไว้ใช้วิเคราะห์',
    ]},
    { v: '4.124.0', d: '2026-08-18', items: [
      '🔴 HP ต่ำกว่าเกณฑ์นั่งพักแต่บอทยังไล่ตีมอนต่อไปเรื่อย ๆ ไม่นั่ง',
      '   เหตุ: ฆ่าได้ → เข้าเป้าใหม่ทันที (แพ้การแข่งกับการนั่งพักใน tick) →',
      '   โดนตีระหว่างสู้ → mobCount≥1 บล็อคการนั่ง (ถูกต้อง) → วนแบบนี้จนตาย',
      '   (ใน log: ต่อสู้ต่อเนื่อง 5 ตัวไม่หยุด แล้ว ☠️ ตาย หลังไล่ตี Condor รัว ๆ)',
      '   แก้: HP < restHpPercent + ไม่โดนตี + ไม่มีของรอเก็บ = ห้ามเปิดสู้ตัวใหม่',
      '   → ปล่อยให้ auto-rest ทำงานแทน (นั่งฟื้นก่อนค่อยกลับมาฟาร์ม)',
    ]},
    { v: '4.123.0', d: '2026-08-18', items: [
      '🔴🔴🔴 บอทหันไปตีผู้เล่น! (จาก log จริง: 🎯 เลือกเป้า: superogira0 → ⚔️ ตี superogira0)',
      '   เหตุ: entity ของผู้เล่นเปลี่ยน kind 0→1 กลางทาง (SPAWN parse พลาด หรือ 0x3c batch/0x14',
      '   สร้างใหม่เป็นมอนตอน entity หายชั่วขณะ) → acquireTarget มองเป็นมอน → ตีคน',
      '   (โชคดี server เงียบไม่ยอมให้ตีคน — แต่ถ้า PvP เปิดคือเรื่องใหญ่)',
      '   แก้: beaconPlayerIds — id ที่เคยปรากฏบน radar ผู้เล่น (0x3c flag=1) = ผู้เล่นแน่นอน',
      '   (มอนไม่มีบน radar) ห้ามกลายเป็นมอน/ห้ามถูกตี ไม่ว่า packet ไหนจะ parse พลาด',
      '   ปิดครบ 4 จุด: SPAWN (แก้ kind) / isTargetable / defensive retarget / 0x3c batch + 0x14',
    ]},
    { v: '4.122.0', d: '2026-08-18', items: [
      '🔴🔴 หนีผีอีก — คราวนี้ตัวการคือ 0x07 ghost ไม่ใช่ minimap',
      '   อาการ: "ผู้เล่น 1 คน" โผล่ห่าง 1.4 ช่อง กลางกอง loot ที่เพิ่งเก็บ (ไม่มี SPAWN player)',
      '   เหตุ: มอนเดินเข้ามาจากนอกจอ / มอนมากินของ → ส่ง 0x07 MOVE มาก่อน SPAWN',
      '   → handler เดิมสมมติว่า "ไม่เคย SPAWN = ผู้เล่น" (สมมติฐานผิด!)',
      '   → ถูกนับเป็นผู้เล่น (name=\'\') ตาม rule radius=0 → หนีผี',
      '   แก้: tag แหล่งที่มา entity — _src=beacon (radar ยืนยัน player) / _src=move (ไม่รู้)',
      '   → flee นับเฉพาะ beacon เท่านั้น + flee debug แสดงเฉพาะ entity ที่นับได้จริง',
    ]},
    { v: '4.121.0', d: '2026-08-18', items: [
      '📍ใหม่: minimap beacon ของเราเอง (id ตรง playerId) → อัปเดตตำแหน่งทุก 4 ช่องที่เดิน',
      '   (จาก capture: server ส่ง 0x3c marker ของเราทุก 4 ช่อง — flag=01 เหมือนคนอื่น แยกด้วย id เท่านั้น)',
      '📍ใหม่: /where oracle (0x37) — ส่งคำถาม → server ตอบ "You are at X,Y on map Z."',
      '   → แปลงเป็นพิกัดแม่นยำอัปเดตทันที + ถามอัตโนมัติทุก 5s เมื่อตำแหน่งหาย (หลังวาร์ป)',
      '   ใช้มือ: ASSIST.where()',
      '📋 สรุปวิจัย protocol จาก capture นี้: 0x07 IN = ตำแหน่งตอนเริ่มเดิน + f32 ละเอียด,',
      '   0x3c marker = beacon ทุก 4 ช่อง, 0x37 = /where, ไม่มี flag บอก "เป็นเรา" ใน minimap',
    ]},
    { v: '4.120.0', d: '2026-08-18', items: [
      '🔴🔴 ถอด SELF-DETECT จาก minimap ออกทั้งหมด — id เราไม่เปลี่ยนตอนวาร์ป!',
      '   หลักฐานจาก log: หลังวาร์ป dot id เดิมของเรายังโผล่ใน minimap ของแมปใหม่',
      '   = server ถือ id เดิมตลอด session → SELF-DETECT ที่ฉก dot ไม่มีชื่อ = ฉก id คนอื่น',
      '   → STAT ของเราไม่ match → HP ค้าง (log จริง: นั่ง-ลุกวน 40s ๆ HP 38% ไม่ขยับเลย)',
      '   แหล่ง playerId ที่เหลือ (พิสูจน์ตัวได้ทุกตัว): SELECT_CHAR / SPAWN ชื่อตรงเป๊ะ /',
      '   AUTO-DETECT แบบใหม่ (id ยังไม่ยืนยัน + โดน "มอน" ตีซ้ำเท่านั้น)',
      '   ตำแหน่งหลังวาร์ป: จาก SPAWN self / 0x07 MOVE / sync จาก entity ตัวเองตามเดิม',
      '🛡️ กันนั่ง-ลุกวนรัวตอน HP ค้าง: ลุกแล้วต้องรอ 2s ก่อนนั่งใหม่',
      '📝 log ลุกยืนบอกเหตุผลจริง: ฟื้นครบ / หมดเวลาแต่ HP ไม่ขยับ (แนะให้ตรวจ player_id)',
    ]},
    { v: '4.119.0', d: '2026-08-18', items: [
      '🔴🔴 ตัวใหม่ชื่อไทยเกิดกลางเมือง → HP เป็น ? และ HP กลายเป็น 100000/100000 ของ Target Dummy',
      '   สาเหตุ 1: AUTO-DETECT "โดนตีซ้ำ 3 ครั้ง = เรา" ฉก id ของ Target Dummy',
      '   (คนทดสอบตี dummy กันรัว ๆ ตอนเกิดใหม่ → ระบบเข้าใจว่า dummy คือเรา!)',
      '   แก้: ห้าม AUTO-DETECT ถ้า playerId ยืนยันแล้ว (selfIdConfirmed)',
      '   + attacker ต้องเป็น "มอน" (kind=1) เท่านั้น — คนตี entity อื่น ≠ เราโดนมอนตี',
      '   สาเหตุ 2: ชื่อไทย (UTF-8) ทำ nameLen คลาด → SPAWN ของตัวเอง parse พิกัด/HP ไม่ได้',
      '   แก้: parser ใหม่ — ลองหลายตำแหน่งจบชื่อ แล้วเลือกอันที่พิกัด valid',
      '   (ยืนยันด้วย simulation: ไทย nameLen คลาด/nameLen บ้า ก็ยังได้ x/y/hp ถูก)',
    ]},
    { v: '4.118.1', d: '2026-08-18', items: [
      '🐛 แก้ ReferenceError: syncToggle is not defined ตอนกด toggle ตีกลับมอน blacklist',
      '   (เรียก helper ที่ประกาศอยู่คนละ scope — แก้เป็น set className เองใน handler)',
    ]},
    { v: '4.118.0', d: '2026-08-18', items: [
      '🛡️ ตั้งได้ว่าจะตีกลับ "มอนใน blacklist ที่ตีเรา" ไหม (จากรายงานผู้ใช้)',
      '   เดิม: defensive retarget ไม่สน blacklist — มอนตีเรา = ตีกลับเสมอ',
      '   (ผู้ที่ blacklist มอนแรงไว้แล้วโดนตี บอทกลับหันไปสู้ = ขัดความตั้งใจ)',
      '   ใหม่: toggle ใน tab Combat "🛡️ ตีกลับมอน blacklist ที่ตีเรา"',
      '   ปิด = เคารพ blacklist เด็ดขาด แม้โดนตีก็ไม่ตีกลับ (ควรใช้คู่กับ fleeMonsters)',
    ]},
    { v: '4.117.0', d: '2026-08-18', items: [
      '🧊 ดีเลย์ก่อนนั่งพักหลังเก็บของเสร็จ (default 1000ms) — กันดูเป็นบอท',
      '   เดิม: เก็บของชิ้นสุดท้ายเสร็จ → นั่งทันทีใน tick ถัดไป = ไวผิดธรรมชาติ',
      '   ตั้งได้ใน sub-tab Rest: "ดีเลย์ก่อนนั่ง (ms)" + ASSIST.setRestDelay(ms)',
      '🎨 Rest inputs แสดงค่าปัจจุบันแล้ว (เดิมช่องว่างตลอด ต้องพิมพ์ใหม่ทุกครั้ง)',
    ]},
    { v: '4.116.0', d: '2026-08-18', items: [
      '🔴 นั่งพักแล้ว ยังยิงเก็บของตอนนั่ง จนต้องวาร์ปไปเก็บ — การนั่งพัง',
      '   ลำดับเดิม: ฆ่าได้ → นั่งทันที (HP ต่ำ) ทั้งที่ drop ยังอยู่ในคิว',
      '   → loot loop ยิง 0x52 ตอนนั่ง fail 4 ครั้ง → วาร์ปไปเก็บ → นั่งไม่เป็นนั่ง',
      '   แก้: มีของรอเก็บ (queue/warpQueue) = ยังไม่นั่ง — เก็บให้เสร็จก่อน',
      '   + ของเข้าคิวระหว่างนั่ง → ลุกไปเก็บก่อน แล้วนั่งใหม่เอง',
      '   (ใช้กับทั้ง auto-rest ปกติและ post-respawn rest)',
    ]},
    { v: '4.115.0', d: '2026-08-18', items: [
      '🔴🔴 หนีผู้เล่นเงียบหายไปเฉย ๆ หลังวาร์ปพร้อมคนตาม (จาก log ทดสอบจริง)',
      '   ลำดับบั๊ก: คนตามวาร์ปตามมาพร้อมกัน → dot ของเขาใน minimap โดน SELF-DETECT',
      '   ฉกเป็น playerId ของเรา → พอ SPAWN ตัวจริงมาแก้กลับ → ระบบ stale id เก่า',
      '   ซึ่งก็คือ id ของ "คนตาม" → เรามองไม่เห็นเขา 5 นาที → ไม่หนีอีกเลย!',
      '   แก้ 3 ชั้น: (1) dot ที่รู้ชื่อแล้วว่าเป็นคนอื่น (SPAWN มาก่อน) ห้าม claim',
      '   (2) stale เฉพาะ playerId เก่าที่ "ยืนยันแล้ว" (selfIdConfirmed) เท่านั้น',
      '   (3) id จาก minimap = ยังไม่ยืนยัน จนกว่า SPAWN ชื่อตรง/SELECT_CHAR/โดนตีซ้ำ',
    ]},
    { v: '4.114.0', d: '2026-08-18', items: [
      '🔴 กันยึ่งของคนอื่น — ฆ่ามอนพร้อมกัน ของเขาตกใกล้ ๆ บอทเคย claim หมด',
      '   รูรั่วเดิม: "เพิ่งได้ EXP ใน 2s" = claim ทุก drop ไม่สนระยะ',
      '   → ฆ่ามอนพร้อมคนอื่น = ยิงเก็บของเขา (โดน 0x20 ปฏิเสธ เปล่า ๆ)',
      '   แก้: EXP window ต้องผูกตำแหน่งแล้ว (ใกล้เรา ≤ pickRadius+3)',
      '   + ผู้เล่นอื่นยืนใกล้ drop กว่าเราชัดเจน (margin 1 ช่อง) → ไม่ยุ่ง + blacklist 60s',
      '   ★ ของใกล้พิกัดมอนที่เราฆ่า หรือตกที่ตัวเรา = เก็บได้เลย (ไม่โดนกฎนี้)',
      '   กันกรณีคน AFK ยืนใกล้จุดฆ่ามอนของนักธนู → ของเราไม่หลุด)',
    ]},
    { v: '4.113.0', d: '2026-08-18', items: [
      '🔴 ของ drop จากมอนที่คนอื่นตี — บอทยิงเก็บซ้ำเปล่า ๆ 5 ครั้ง',
      '   จาก capture: request 0x52 เหมือนกันเป๊ะทั้งของเรา/ของคนอื่น แต่ของคนอื่น',
      '   server ตอบ 0x20 "You are unable to pick up this item yet." (loot ownership)',
      '   ไม่มี 0x52 ตอบกลับเลย → บอทไม่รู้ว่า fail → ลองใหม่ทุก 1s จนครบ maxAttempts',
      '   แก้: เจอ 0x20 "unable to pick up" → ปล่อยของนั้นทันที + blacklist 60s',
      '   กัน tryClaim ใหม่ (เดินผ่านของคนอื่น → อย่าไปสนใจมัน)',
    ]},
    { v: '4.112.0', d: '2026-08-17', items: [
      '🔴🔴 หนีตัวเองข้ามแมปวนลูป — "หนีผู้เล่น! 1 คน @(332,340)" รัว 9 ครั้งใน 2 วิ',
      '   เหตุ 1: MAP_NAME เก็บ entity ตัวเองไว้ตอนเปลี่ยนแมป → ตำแหน่งแมปเก่าติดมา',
      '   + entities.has(playerId) ทำให้ SELF-DETECT ไม่ทำงาน → dot จริงของเรา (id ใหม่)',
      '   ใน minimap แมปใหม่ ถูกนับเป็น "ผู้เล่นคนอื่น" → หนีตัวเอง (พิกัดผีเดิมทุกครั้ง!)',
      '   เหตุ 2: changeMap หนีไม่ clear entities รอ MAP_NAME — แต่วาร์ปล้ม (ไม่มี MAP_NAME)',
      '   = ผีค้าง 30s → หนีใหม่ทุก tick ต่อเนื่อง',
      '   แก้: MAP_NAME clear ทั้งหมดไม่เก็บ myEntry + ต่อ warpGuard ให้ SELF-DETECT จับ dot ใหม่',
      '   + changeMap flee clear entities ทันที (วาร์ปล้มก็ไม่ผีค้าง)',
      '🛡️ เบรกฉุกเฉิน: หนี >5 ครั้งใน 10s → พัก 10s อัตโนมัติ (กันยิง teleport รัวแม้ cooldown=0)',
    ]},
    { v: '4.111.0', d: '2026-08-17', items: [
      '⚡ คูลดาวน์วาร์ปหนีผู้เล่น ตั้งได้ใน UI แล้ว (เดิม fix 5 วิ)',
      '   ใน sub-tab Flee: "คูลดาวน์วาร์ปหนี (วินาที)" — 0 = หนีรัวสุดไม่ต้องรอ',
      '   สำหรับโหมดแมปเดิม: คนวาร์ปตามหา เราหนีต่อได้เร็วขึ้น (0 = ติดลูปเกือบทันที',
      '   ตัวจำกัดธรรมชาติ = รอรู้ตำแหน่งตัวเองหลังวาร์ป ~0.5-2s กัน spam packet)',
      '   API: ASSIST.setFleeWarpCooldown(0)',
    ]},
    { v: '4.110.0', d: '2026-08-17', items: [
      '🔴 หนีผู้เล่น radius=0 (หนีทันทีทั้งแมป) ไม่ทำงาน — คนเข้าแมปไกล ๆ บอทไม่รู้',
      '   เหตุ: นับเฉพาะผู้เล่นจาก SPAWN (มีชื่อ) แต่ server ส่ง SPAWN เฉพาะระยะมองเห็น!',
      '   ส่วน 0x3c minimap (sub=13) มีผู้เล่นทุกคนในแมป แต่ถูกข้าม (name=\"\" กันหนีตัวเอง)',
      '   แก้: radius=0 → นับ minimap dots ด้วย (fresh ≤30s + ไม่ใช่ตำแหน่งเราเป๊ะ กันผี/ตัวเอง)',
      '   → คนเข้าแมปที่ไหนก็เจอทันที ไม่ต้องรอเดินมาใกล้',
      '🔍 flee debug log — • = ผู้เล่นจาก minimap (ไม่มีชื่อ)',
    ]},
    { v: '4.109.0', d: '2026-08-17', items: [
      '🔴 Ctrl+V ใน feedback ไม่ทำงาน (ต้องคลิกขวา Paste)',
      '   เหตุ: keydown handler ที่เราทำไว้กัน Unity แย่งคีย์ preventDefault() ทุกปุ่ม',
      '   รวมถึง Ctrl+V → browser ไม่สร้าง paste event เลย (คลิกขวาไม่ผ่าน keydown เลยรอด)',
      '   แก้: Ctrl/Cmd+V/C/X/A ไม่ preventDefault — คืนให้ browser ทำ → paste event ไหลเข้า handler เดิม',
      '   (รูป→อัปโหลด, ข้อความ→แทรก, >3 บรรทัด→แนบไฟล์) + Ctrl+C ก็กลับมาใช้ได้ด้วย',
      '🔴 กัน Ctrl+ตัวอักษร อื่นแทรกตัวอักษรลง input (เช่น Ctrl+S แทรก "s")',
      '   (ยกเว้น AltGr = ctrl+alt พร้อมกัน — คีย์บอร์ดยุโรปยังพิมพ์ได้ปกติ)',
    ]},
    { v: '4.108.2', d: '2026-08-17', items: [
      '🔍 DEBUG SPAWN self — ย้าย log มาพิมพ์หลัง apply แล้ว (เดิมพิมพ์ก่อน → ขึ้น null/null ทั้งที่ apply สำเร็จ)',
      '📋 สรุปจาก capture: หลัง hpMax ใน SPAWN เป็นก้อน data ตัวละคร 58 bytes ไม่มี sp/spMax ชัด',
      '   → SP ยังใช้ 0x27 อย่างเดียว (มาถึงภายใน ~6 วิหลังเข้าแผนที่)',
    ]},
    { v: '4.108.0', d: '2026-08-17', items: [
      '🔴 สลับตัวละคร (logout → login ตัวใหม่) HP ไม่แสดงของตัวใหม่',
      '   เหตุ: SELECT_CHAR อัปเดต player_id เฉพาะตอน null → ค้างเป็น id ตัวเก่า',
      '   + playerName เก่าบล็อค SPAWN ของตัวใหม่ (guard "ชื่อไม่ตรง") → HP/ตำแหน่งตายตลอด',
      '   แก้: SELECT_CHAR = authoritative เสมอ → reset ทุกอย่างของตัวเก่า',
      '   (playerName/hp/sp/entities/ตำแหน่ง/isDead/isResting) แล้วเริ่มใหม่กับตัวใหม่',
    ]},
    { v: '4.107.0', d: '2026-08-17', items: [
      '🔴🔴 รากของปัญหา HP ? ตอนเข้าเกม — variable shadowing!',
      '   ใน SPAWN handler: local "let hp = 40" บัง object hp ด้านนอก',
      '   → "hp.cur = hp" กลายเป็น set property บนตัวเลข = no-op เงียบ ๆ (ไม่ error!)',
      '   → debug log พิมพ์ 40/40 จาก local แต่ object จริงไม่เคยถูกแตะ → UI ค้าง ? ตลอด',
      '   แก้: rename local เป็น sHp/sHpMax + log ยืนยัน "✅ applied" ว่าเข้า object จริง',
      '🔴 แก้ dead code: if(flag===1) ซ้อนใน if(flag===1) → สาขา reset HP ตอน respawn/warp ไม่เคยทำงาน',
      '   แยกด้วย playerName แทน: รู้ชื่อแล้ว = respawn/warp → reset, ยังไม่รู้ชื่อ = เข้าเกมครั้งแรก',
      '🔴 SPAWN HP apply ไม่เช็ค grace แล้ว — packet สดผูก id ตรง = เชื่อถือได้เสมอ',
    ]},
    { v: '4.105.0', d: '2026-08-17', items: [
      '🔴 SPAWN (flag=1) มี HP/hpMax ของตัวเรา → apply ทันทีตั้งแต่เข้าเกม',
      '   แก้: HP เป็น null จนกว่า STAT จะส่งมา (ช้า) → heal/rest ไม่ทำงานช่วงแรก',
    ]},
    { v: '4.104.0', d: '2026-08-17', items: [
      '📋 Log view modal — real-time update ทุก 1s + auto-scroll (smart: ไม่บังคับเมื่อเลื่อนขึ้นดูเก่า)',
    ]},
    { v: '4.103.0', d: '2026-08-16', items: [
      '🔴 NPC โหลดช้า — รอ 5s (เดิม 3s) + retry 15s ก่อน abort (sell + storage)',
      '   แก้: วาร์ปไปหา NPC → entities ยังไม่โหลด → abort ทันที → พลาด',
    ]},
    { v: '4.102.0', d: '2026-08-16', items: [
      '📋 ปุ่มดู Log ใน mini-bar — modal ชิดขวา 500 บรรทัด + ปุ่มคัดลอกทั้งหมด',
    ]},
    { v: '4.101.0', d: '2026-08-16', items: [
      '📋 Log buffer 200→500 บรรทัด',
      '💬 Feedback — checkbox แนบ log 500 บรรทัด + hint ให้อธิบายละเอียด',
      '📨 Log แนบส่ง Telegram + เก็บบน relay',
      '🌐 หน้าเว็บ /feedback — ดูรายการ + copy ข้อความ + copy log',
      '💬 Feedback — ลบ parse_mode HTML (แก้ 400 bad request จากชื่อ <@w@>)',
      '🐞 สลับไอคอน: 💬=แชท 🐞=แจ้งปัญหา',
      '🌐 /feedback — admin ลบ + เปลี่ยนสถานะ 4 แบบ (รอตรวจสอบ/กำลังดำเนินการ/เรียบร้อย/ไม่ต้องดำเนินการ)',
      '🧹 Bot entry cleanup — ลบ stale entries > 1hr (กันรายการบอทเก่าค้าง)',
      '🟢🔴 Bot list แสดง online/offline + lastSeen + เรียง online ก่อน',
    ]},
    { v: '4.100.0', d: '2026-08-16', items: [
      '🔴 sticky guard ละข้อยกเว้นเมื่อโดนรุม ≥2 ตัว หรือ HP < 50% — ตอบโต้ทันที',
      '🎨 flee debug log แสดงแค่ 5 entities แรก (กัน spam)',
    ]},
    { v: '4.99.0', d: '2026-08-16', items: [
      '🔴 HP=0 แต่ไม่ตาย → reset เป็น null (รอ STAT) — กันนั่งพักวนลูป',
      '🔴 นั่งแล้ว HP=0 → ลุกทันที (ไม่รอ timeout 40s)',
      '🔴 pct=0 → ไม่เริ่มนั่งพัก',
    ]},
    { v: '4.98.0', d: '2026-08-16', items: [
      '🔴 SPAWN SELF-DETECT — flag=2 + ชื่อตรง playerName → update playerId + position',
      '   แก้: หลังวาร์ปสุ่มในแมปเดิม ตำแหน่งค้าง → บอทตี entity เก่า → วนลูป',
      '   แก่: HP เพี้ยน (AUTO-DETECT ตั้ง playerId = Target Dummy → HP ผิด)',
    ]},
    { v: '4.97.0', d: '2026-08-15', items: [
      '🔴 countNearbyPlayers นับเฉพาะ SPAWN entities (มีชื่อจริง) — แก้หนีตัวเองถาวร',
    ]},
    { v: '4.96.0', d: '2026-08-15', items: [
      '🏃 Toggle โหมดหนีผู้เล่น: 🗺️ เปลี่ยนแมป / 📍 แมปเดิม (วาร์ปสุ่ม)',
    ]},
    { v: '4.95.0', d: '2026-08-15', items: [
      '🔴 Real-time HP tracking — ลด HP ทันทีจาก 0x0b/0x17 damage (แก้ heal ช้า)',
    ]},
    { v: '4.94.0', d: '2026-08-15', items: [
      '🔴 SELF-DETECT เพิ่มใน sub=1 (ก่อนหน้ามีแค่ sub=7/13)',
      '🔴 SELF-DETECT ลบ entity เก่า (entities.delete) — กันค้างเป็น player',
    ]},
    { v: '4.93.0', d: '2026-08-15', items: [
      '🔴 Death loop guard — max respawn 5 ครั้ง แล้วหยุด 60s',
      '🔴 AUTO-DETECT ลบ entity เก่า (กันค้างเป็น player → หนีตัวเอง)',
    ]},
    { v: '4.92.0', d: '2026-08-15', items: [
      '🔴 SELF-DETECT หลังวาร์ป — 0x3c flag=1 ตัวแรกตอน warpGuard = ตัวเรา (แก้วนลูปวาร์ปรัว)',
    ]},
    { v: '4.91.0', d: '2026-08-15', items: [
      '🏃 เพิ่ม toggle flee ใน mini-bar',
      '🎨 mini-bar pills — แสดงแค่ icon (เขียว=ON, แดง=OFF) ไม่มีข้อความ',
    ]},
    { v: '4.90.0', d: '2026-08-15', items: [
      '🔴 วาร์ปสุ่ม → null ตำแหน่งทันที — กันวนลูป "ไม่เจอมอน 3s → วาร์ปสุ่ม" ไม่จบ',
    ]},
    { v: '4.89.0', d: '2026-08-15', items: [
      '🔴 defensive retarget ห้ามตี player (kind=0) — เฉพาะ monster (kind=1)',
    ]},
    { v: '4.88.0', d: '2026-08-15', items: [
      '📜 ปุ่ม Update Log ใน mini-bar — ดู changelog ทุกเวอร์ชั่น',
    ]},
    { v: '4.87.0', d: '2026-08-14', items: [
      '🚶 Toggle เดินหลีกหลัง abandon — เปิด/ปิดได้จาก sub-tab Combat',
    ]},
    { v: '4.86.0', d: '2026-08-14', items: [
      '🔴 แก้ critical: duplicate 0x0b handler บล็อก handler หลัก — มอนตีเราไม่ตอบโต้!',
      '🛡️ defensive retarget รวม monsterAggro (มอนเล็งเราด้วยสกิล)',
      '🛡️ defensive retarget ข้าม isTargetable — ตอบโต้เสมอไม่สน cooldown/ระยะ',
      '🔄 AUTO-DETECT playerId จาก 0x0b ซ้ำ ≥3 ครั้ง',
      '❌ 0x26 = HP REGEN ไม่ใช่ attack — ลบออกจาก handler',
      '🔍 ASSIST.debug() — ดูสถานะ combat ครบทุกอย่าง',
    ]},
  ];
  const GITHUB_RAW = 'https://raw.githubusercontent.com/cadbaht/ro-rebuild-web-assistant/main/ro-rebuild-web-assist.user.js';
  // ★ v4.189.16: แยก source อัปเดตออกจาก resource ภายในสคริปต์
  // เปลี่ยน repo update ไม่ควรทำให้ DB/icon/GAT resource เปลี่ยนตามไปด้วย
  const ASSET_RAW = 'https://raw.githubusercontent.com/superogira/ro-rebuild-web-assist/main/ro-rebuild-web-assist.user.js';
  // ★ Standalone mode — ไม่มี Relay Server / Remote Monitor / Feedback transport
  const CFG_STORAGE_KEY = 'roAssistConfig_v1';
  // keys ที่บันทึก/โหลด (boolean/number/array/string — ไม่เก็บ function หรือ object ซ้อน)
  const PERSIST_KEYS = [
    'healEnabled', 'healAtPercent', 'healItems', 'healMode', 'healDelayMs', 'healAtMax',
    'buffEnabled', 'buffItems', 'buffRebuffDelayMs', 'buffVisitEnabled', 'buffVisitMap', 'buffVisitX', 'buffVisitY', 'buffVisitIntervalSec', 'buffVisitWaitSec', 'unstuckBuffEnabled', 'unstuckBuffIntervalSec', 'unstuckBuffWaitSec', 'unstuckBuffMenuDelayMs', 'unstuckBuffSpawnTimeoutSec', 'unstuckBuffClickXRatio', 'unstuckBuffClickYRatio', 'unstuckPacketEnabled', 'unstuckPacketHex', 'autoClearConsoleMin',
    'skillEnabled', 'skills', 'disabledSkillIds', 'buffOthersEnabled',
    'lootEnabled', 'lootDelayAfterDropMs', 'lootUseKillPos', 'pickRadiusKill', 'lootRespectOthers', 'filter', 'sendThrottleMs', 'maxAttempts',
    'warpLootEnabled',
    'combatEnabled', 'targetWhitelist', 'targetBlacklist', 'fightBackBlacklisted', 'blacklistFleeEnabled', 'teleportMacroEnabled', 'normalAttackEnabled', 'guardEnabled', 'guardMap', 'guardX', 'guardY', 'autoLoginEnabled', 'autoLoginUser', 'autoLoginPass', 'autoLoginSlot', 'autoRefreshEnabled', 'autoRefreshStallSec', 'attackRange', 'rangedAttackRange',
    'maxAcquireDistance', 'searchRadii', 'maxChaseDistance', 'attackPendingMax', 'attackAbandonMs', 'antiKS', 'avoidOtherPlayers', 'targetLowestHpFirst',
    'mobFleeEnabled', 'dangerFleeEnabled', 'fleeOnMobCount', 'fleeOnAggroCount', 'fleeOnProximityCount', 'fleeOnProximityRadius', 'fleeMonsters', 'fleeMonsterRadius', 'hpFleeEnabled', 'hpFleePercent', 'hpFleeMode', 'maxEngageSec', 'maxEngageSecSlow', 'slowMonsterSubIds',
    'wanderEnabled', 'warpFindEnabled', 'warpFindUseFlyWing', 'warpFindUseTeleportSkill', 'warpToMonster', 'stuckWarpOnAbandon', 'stepAsideOnAbandon', 'warpToBoss', 'warpToMiniBoss', 'bossAlertRadius', 'noMonsterWarpSec',
    'restEnabled', 'restHpPercent', 'restSpPercent', 'restUntilPercent', 'restMaxSec', 'restDelayMs', 'postCombatDelayMs', 'autoRespawnEnabled', 'autoRespawnDelayMs',
    'sellEnabled', 'sellNpcName', 'sellNpcMap', 'sellNpcX', 'sellNpcY', 'sellIntervalMin', 'sellOnFull', 'sellItemIds',
    'storageEnabled', 'kafraName', 'kafraMap', 'kafraMapX', 'kafraMapY', 'kafraChoice', 'depositOnFull', 'depositAfterSell', 'depositItemIds',
    'farmMap', 'farmMapX', 'farmMapY', 'warpBackToFarm', 'farmMaps', 'farmRotateOnDeath', 'farmMapIdx', 'fleeFromPlayers', 'fleeMode', 'fleeMaps', 'fleePlayerRadius', 'fleeWarpCooldownSec',
    'navRecording', 'navMergeRadius', 'navWanderUseNav', 'navWanderMode', 'gatWanderEnabled',
    'tradeAcceptAll', 'tradeRejectAll', 'tradeRequestOpcode', 'tradeRequestLen', 'tradeAcceptPacketHex', 'tradeRejectPacketHex',
    'chatPauseOnIncoming',
    'itemNames',
  ];

  // ★ Security: credentials เก็บได้เฉพาะ local config ของเครื่องนี้ แต่ห้ามออกไปกับ Profile/Backup
  const SECRET_KEYS = new Set(['autoLoginUser', 'autoLoginPass']);
  const PROFILE_KEYS = PERSIST_KEYS.filter(k => !SECRET_KEYS.has(k));
  const EXPORT_KEYS = PROFILE_KEYS;

  function saveConfig() {
    try {
      const out = {};
      for (const k of PERSIST_KEYS) if (k in CFG) out[k] = CFG[k];
      // ★ sort item ID arrays ตามเลขไอดี (เวลาเขียน localStorage/export จะได้มองง่าย)
      const sortNum = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => a - b) : arr;
      if (out.healItems) out.healItems = sortNum(out.healItems);
      if (out.sellItemIds) out.sellItemIds = sortNum(out.sellItemIds);
      if (out.depositItemIds) out.depositItemIds = sortNum(out.depositItemIds);
      if (out.buffItems && Array.isArray(out.buffItems)) out.buffItems = [...out.buffItems].sort((a, b) => a.itemId - b.itemId);
      localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(out));
    } catch (e) { /* localStorage อาจถูกบล็อก — ข้าม */ }
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k of PERSIST_KEYS) if (k in saved) CFG[k] = saved[k];
      // ★ v4.189.1 migrate: Direct Unstuck/AB Auto old default 600s → 500s
      if (saved.unstuckBuffIntervalSec === 600) {
        CFG.unstuckBuffIntervalSec = 500;
        saved.unstuckBuffIntervalSec = 500;
        try { localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(saved)); } catch (_) {}
        log('⚙️ migrate Direct Unstuck interval: 600s → 500s');
      }
      log('💾 โหลดค่าที่บันทึกไว้จากเครื่อง (' + PERSIST_KEYS.filter(k => k in saved).length + ' รายการ)');
    } catch (e) { /* parse fail — ใช้ default */ }
  }
  // ★ v4.189.25: ล้างค่า Relay/Telegram เก่าที่อาจยังค้างใน localStorage จากเวอร์ชันก่อน
  try {
    const raw = localStorage.getItem(CFG_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const oldKeys = ['monitorServerEnabled','monitorServerUrl','monitorSendIntervalMs','telegramAlertCard','telegramAlertFlee','telegramAlertBotMention','telegramAlertNearby','telegramAlertWhisper','telegramBotToken','telegramChatId'];
      let changed = false;
      for (const k of oldKeys) if (k in saved) { delete saved[k]; changed = true; }
      if (changed) localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(saved));
    }
  } catch (_) {}

  // debounce save (กันเขียนถี่เกินไป)
  let saveTimer = null;
  function saveConfigDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 800);
  }

  // ============================================================
  //  PROFILE — ชุดการตั้งค่าแยกหลายชุด (บอทหลายตัว / สไตล์เล่นต่างกัน)
  //    ★ Security: Profile เก็บเฉพาะ PROFILE_KEYS — ไม่เก็บ Telegram credentials / auto-login credentials
  //    roAssistProfiles_v1 = { ชื่อ: {config} } · roAssistActiveProfile = ชื่อที่ใช้อยู่
  // ============================================================
  const PROFILES_KEY = 'roAssistProfiles_v1';
  const PROFILE_ACTIVE_KEY = 'roAssistActiveProfile';
  function loadProfilesObj() {
    try {
      const obj = JSON.parse(localStorage.getItem(PROFILES_KEY)) || {};
      let scrubbed = 0;
      for (const p of Object.values(obj)) {
        if (!p || typeof p !== 'object') continue;
        for (const k of SECRET_KEYS) { if (k in p) { delete p[k]; scrubbed++; } }
      }
      if (scrubbed) {
        try { localStorage.setItem(PROFILES_KEY, JSON.stringify(obj)); } catch (_) {}
        log('🔐 ล้าง credentials ที่ค้างใน Profile เก่าแล้ว ' + scrubbed + ' ค่า');
      }
      return obj;
    } catch (e) { return {}; }
  }
  function saveProfilesObj(obj) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(obj)); } catch (e) {} }
  function buildPersistObject() {
    const out = {};
    for (const k of PROFILE_KEYS) if (k in CFG) out[k] = CFG[k];
    const sortNum = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => a - b) : arr;
    if (out.healItems) out.healItems = sortNum(out.healItems);
    if (out.sellItemIds) out.sellItemIds = sortNum(out.sellItemIds);
    if (out.depositItemIds) out.depositItemIds = sortNum(out.depositItemIds);
    if (out.buffItems && Array.isArray(out.buffItems)) out.buffItems = [...out.buffItems].sort((a, b) => a.itemId - b.itemId);
    return out;
  }

  // ============================================================
  //  AUTO-BUFF persistence — เก็บเวลาใช้ buff ล่าสุดข้าม session
  //    (mirror bot.js:207-231 serializeUseTimes)
  //    กัน buff หายเมื่อ refresh หน้าเว็บ → บัพจะใช้ใหม่ทันทีถ้าหมดเวลา
  // ============================================================
  const BUFF_TIMES_KEY = 'roAssistBuffTimes_v1';
  const lastBuffUse = new Map();   // itemId → timestamp (ms) ใช้ครั้งล่าสุด
  function loadBuffTimes() {
    try {
      const raw = localStorage.getItem(BUFF_TIMES_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [id, ts] of Object.entries(obj)) lastBuffUse.set(Number(id), Number(ts) || 0);
      log('✨ โหลดเวลา buff ล่าสุด:', lastBuffUse.size, 'รายการ');
    } catch (e) { /* ignore */ }
  }
  function saveBuffTimes() {
    try {
      const obj = {};
      for (const [id, ts] of lastBuffUse) obj[id] = ts;
      localStorage.setItem(BUFF_TIMES_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }
  let buffSaveTimer = null;
  function saveBuffTimesDebounced() {
    if (buffSaveTimer) clearTimeout(buffSaveTimer);
    buffSaveTimer = setTimeout(saveBuffTimes, 1000);
  }

  // ============================================================
  //  Item database (โหลดจาก GitHub raw + cache localStorage)
  // ============================================================
  const DB_BASE = ASSET_RAW.replace('/ro-rebuild-web-assist.user.js', '/db/Item/');
  const ITEMS_ICON_URL = ASSET_RAW.replace('/ro-rebuild-web-assist.user.js', '/items/small/');
  const ITEMDB_CACHE_KEY = 'roAssistItemDB_v6';   // v6 = +slotCount/attack/def/wLevel/reqLevel/equipGroup/jobs   // v5 = +cardPrefix/Postfix   // ★ v2 = จาก db/Item ของ RagnarokRebuildTcp
  // ★★ itemDB v2 — 6 CSV ของ RagnarokRebuildTcp (2584 รายการ แทน items.csv เดิม 1016)
  //   cats: usable / equip (มี slot จาก Position) / etc (Ammo+Cards+Regular)
  //   + desc จาก ItemDescriptions/*.txt (format ::Code //Id + Unity <color> tags)
  const itemDB = { names: {}, prices: {}, cats: {}, slots: {}, descs: {}, weights: {}, cardPrefix: {}, cardPostfix: {},
    slotCounts: {}, attacks: {}, defenses: {}, magicDefs: {}, wLevels: {}, reqLevels: {}, equipGroups: {}, groupInfo: {}, loaded: false };
  const EQUIP_SLOT_ORDER = ['MainHand','Shield','Headgear','Armor','Garment','Boots','Accessory',
    '2HSword','2HAxe','2HSpear','2HRod','Sword','Axe','Spear','Rod','Dagger','Bow','Mace','Knuckle',
    'Katar','Book','Instrument','Whip','Handgun','Rifle','Shotgun','GatlingGun','Grenade','Shuriken'];
  function equipSlotRank(slot) { const i = EQUIP_SLOT_ORDER.indexOf(slot); return i < 0 ? 999 : i; }
  function parseCsv(text) {
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(',');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      rows.push(lines[i].split(','));
    }
    return { head, rows };
  }
  function parseDescs(text) {
    const map = {};
    const parts = text.split(/^::/m);
    for (const part of parts) {
      if (!part.trim()) continue;
      const nl = part.indexOf('\n');
      if (nl < 0) continue;
      // ★ รองรับ 2 format: ::Code //501 (usable/regular) และ ::Code //id 2101 - Shield (equip/weapon/card/ammo)
      const m = part.slice(0, nl).trim().match(/^(\S+)\s*\/\/(?:\s*id\s*)?(\d+)/);
      if (!m) continue;
      const body = part.slice(nl + 1).trim()
        .replace(/<desc>/gi, '').replace(/<\/desc>/gi, '')
        .replace(/<color=[^>]*>/gi, '').replace(/<\/color>/gi, '')
        .replace(/<[^>]+>/g, '');
      if (body) map[m[2]] = body;
    }
    return map;
  }
  async function loadItemDB() {
    if (itemDB.loaded) return;
    try {
      const cached = localStorage.getItem(ITEMDB_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.v === 6 && parsed.names && Object.keys(parsed.groupInfo || {}).length > 0) {   // ★ groupInfo ว่าง = โหลดตอนไฟล์ groups ยังไม่ขึ้น GitHub → บังคับรีโหลด
          itemDB.names = parsed.names; itemDB.prices = parsed.prices || {};
          itemDB.cats = parsed.cats || {}; itemDB.slots = parsed.slots || {}; itemDB.descs = parsed.descs || {}; itemDB.weights = parsed.weights || {};
          itemDB.cardPrefix = parsed.cardPrefix || {}; itemDB.cardPostfix = parsed.cardPostfix || {};
          itemDB.slotCounts = parsed.slotCounts || {}; itemDB.attacks = parsed.attacks || {};
          itemDB.defenses = parsed.defenses || {}; itemDB.magicDefs = parsed.magicDefs || {};
          itemDB.wLevels = parsed.wLevels || {}; itemDB.reqLevels = parsed.reqLevels || {};
          itemDB.equipGroups = parsed.equipGroups || {}; itemDB.groupInfo = parsed.groupInfo || {};
          itemDB.loaded = true;
          log('🗃️ โหลด item DB v2 จาก cache (' + Object.keys(parsed.names).length + ' รายการ)');
          return;
        }
      }
    } catch (e) {}
    try {
      log('🗃️ กำลังโหลด item DB v2 จาก GitHub (db/Item)...');
      const files = [
        ['ItemsUsable.csv', 'usable', null],
        ['ItemsEquipment.csv', 'equip', 'Position'],
        ['ItemsWeapons.csv', 'equip', 'Position'],
        ['ItemsAmmo.csv', 'etc', null],
        ['ItemsCards.csv', 'etc', 'EquipableSlot'],
        ['ItemsRegular.csv', 'etc', null],
      ];
      const descsFiles = ['DescUsableItems.txt', 'DescEquipment.txt', 'DescWeapons.txt', 'DescAmmunition.txt', 'DescCards.txt', 'DescRegularItems.txt'];
      const texts = await Promise.all([
        ...files.map(x => fetch(DB_BASE + x[0]).then(r => r.ok ? r.text() : null).catch(() => null)),
        ...descsFiles.map(x => fetch(DB_BASE + 'ItemDescriptions/' + x).then(r => r.ok ? r.text() : null).catch(() => null)),
        // ★ EquipmentGroups.csv — map EquipGroup → อาชีพที่ใช้ได้ (ไม่มี header: key,"display",job1,job2,...)
        fetch(DB_BASE + 'EquipmentGroups.csv').then(r => r.ok ? r.text() : null).catch(() => null),
      ]);
      // ★★ อ่านกลุ่มอาชีพก่อน (สำหรับแปลง EquipGroup → ชื่ออาชีพ)
      const gtext = texts[descsFiles.length + files.length];
      if (gtext) {
        for (const line of gtext.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const cells = line.split(',');
          const key = (cells[0] || '').trim(); if (!key) continue;
          const disp = (cells[1] || '').trim().replace(/^"|"$/g, '');
          itemDB.groupInfo[key] = { display: disp && disp !== '<Auto>' ? disp : null, members: cells.slice(2).map(s => s.trim()).filter(Boolean) };
        }
        log('👥 โหลดกลุ่มอาชีพ ' + Object.keys(itemDB.groupInfo).length + ' กลุ่ม (EquipmentGroups.csv)');
      } else {
        log('⚠️ โหลด EquipmentGroups.csv ไม่ได้ — Jobs จะแสดงเป็นรหัสกลุ่มแทนรายชื่ออาชีพ');
      }
      let n = 0;
      for (let fi = 0; fi < files.length; fi++) {
        const text = texts[fi];
        if (!text) continue;
        const [, cat, slotCol] = files[fi];
        const { head, rows } = parseCsv(text);
        const idIdx = head.indexOf('Id'), nameIdx = head.indexOf('Name'), priceIdx = head.indexOf('Price');
        const slotIdx = slotCol ? head.indexOf(slotCol) : -1;
        const weightIdx = head.indexOf('Weight');
        const prefixIdx = head.indexOf('Prefix'), postfixIdx = head.indexOf('Postfix');   // ★ ItemsCards.csv
        // ★★ สเตตัสอุปกรณ์: Slot(จำนวนช่องการ์ด) · Attack(อาวุธ) · Defense/MagicDef(เสื้อผ้า) ·
        //   Rank(=Weapon Level อาวุธ) · MinLvl(=Required Level) · EquipGroup(→อาชีพที่ใช้ได้)
        const slotCntIdx = head.indexOf('Slot'), atkIdx = head.indexOf('Attack');
        const defIdx = head.indexOf('Defense'), mdefIdx = head.indexOf('MagicDef');
        const rankIdx = head.indexOf('Rank'), minLvlIdx = head.indexOf('MinLvl'), egIdx = head.indexOf('EquipGroup');
        for (const r of rows) {
          const id = (r[idIdx] || '').trim();
          if (!id) continue;
          itemDB.names[id] = (r[nameIdx] || '').trim();
          itemDB.cats[id] = cat;
          if (priceIdx >= 0 && r[priceIdx]) itemDB.prices[id] = parseInt(r[priceIdx], 10) || 0;
          if (weightIdx >= 0 && r[weightIdx]) itemDB.weights[id] = (parseFloat(r[weightIdx]) || 0) / 10;   // ★ CSV = หน่วย ×10 (Bird Feather 10=1, Apple 20=2, Orange Potion 100=10)
          if (slotIdx >= 0 && r[slotIdx]) itemDB.slots[id] = r[slotIdx].trim();
          // ★ card prefix/postfix — เช่น Grand Peco → prefix "Anti-Magic" (+7 Anti-Magic Helm[1]) · Kobold → postfix "of Counter" (Brooch of Counter)
          if (prefixIdx >= 0 && (r[prefixIdx] || '').trim()) itemDB.cardPrefix[id] = (r[prefixIdx] || '').trim();
          if (postfixIdx >= 0 && (r[postfixIdx] || '').trim()) itemDB.cardPostfix[id] = (r[postfixIdx] || '').trim();
          if (slotCntIdx >= 0 && r[slotCntIdx] !== undefined && r[slotCntIdx] !== '') itemDB.slotCounts[id] = parseInt(r[slotCntIdx], 10) || 0;
          if (atkIdx >= 0 && r[atkIdx]) itemDB.attacks[id] = parseInt(r[atkIdx], 10) || 0;
          if (defIdx >= 0 && r[defIdx]) itemDB.defenses[id] = parseInt(r[defIdx], 10) || 0;
          if (mdefIdx >= 0 && r[mdefIdx]) itemDB.magicDefs[id] = parseInt(r[mdefIdx], 10) || 0;
          if (rankIdx >= 0 && r[rankIdx]) itemDB.wLevels[id] = parseInt(r[rankIdx], 10) || 0;
          if (minLvlIdx >= 0 && r[minLvlIdx] !== undefined && r[minLvlIdx] !== '') itemDB.reqLevels[id] = parseInt(r[minLvlIdx], 10) || 0;
          if (egIdx >= 0 && r[egIdx]) itemDB.equipGroups[id] = (r[egIdx] || '').trim();
          n++;
        }
      }
      for (let di = 0; di < descsFiles.length; di++) {
        const text = texts[files.length + di];
        if (!text) continue;
        Object.assign(itemDB.descs, parseDescs(text));
      }
      itemDB.loaded = true;
      try { localStorage.setItem(ITEMDB_CACHE_KEY, JSON.stringify({ v: 6, names: itemDB.names, prices: itemDB.prices, cats: itemDB.cats, slots: itemDB.slots, descs: itemDB.descs, weights: itemDB.weights, cardPrefix: itemDB.cardPrefix, cardPostfix: itemDB.cardPostfix, slotCounts: itemDB.slotCounts, attacks: itemDB.attacks, defenses: itemDB.defenses, magicDefs: itemDB.magicDefs, wLevels: itemDB.wLevels, reqLevels: itemDB.reqLevels, equipGroups: itemDB.equipGroups, groupInfo: itemDB.groupInfo })); } catch (e) {}
      log('🗃️ โหลด item DB v2 สำเร็จ: ' + n + ' รายการ + ' + Object.keys(itemDB.descs).length + ' descriptions');
    } catch (e) {
      log('⚠️ โหลด item DB v2 ล้มเหลว (' + e.message + ') — ใช้ชื่อเริ่มต้น');
      itemDB.loaded = true;
    }
  }
  // ชื่อ item จาก DB (fallback ไป CFG.itemNames หรือ item_<id>)
  function itemDisplayName(id) {
    const k = String(id);
    if (itemDB.names[k]) return itemDB.names[k];
    if (CFG.itemNames[id]) return CFG.itemNames[id];
    return 'item_' + id;
  }
  // ราคา item (buyPrice) — 0 ถ้าไม่มีข้อมูล
  function itemPrice(id) { return itemDB.prices[String(id)] || 0; }
  // ★★ น้ำหนัก real-time (delta-based) — ยืนยันจาก capture: ไม่มี packet น้ำหนักตอนเก็บของ
  //   server ส่งน้ำหนักจริงแค่ตอน 0x38 (เข้าเกม) — ตอนเก็บ/ขาย/ใช้ คำนวณจาก Weight ใน DB
  //   วิธี: delta = (count ใหม่ - เก่า) × Weight → บวก/ลบ playerWeight (anchor จาก server)
  function applyWeightDelta(itemId, oldCount, newCount) {
    const iw = itemDB.weights[String(itemId)];
    if (iw == null || playerWeight == null) return;
    playerWeight = Math.round((playerWeight + (newCount - oldCount) * iw) * 10) / 10;
    if (playerWeight < 0) playerWeight = 0;
  }

  // URL รูป item (lazy-load จาก GitHub raw)
  function itemIconUrl(id) {
    // ★ Card ใช้ card.gif แทนรูปตามไอดี (การ์ดทุดใบเหมือนกัน)
    const name = itemDisplayName(id);
    if (name.endsWith(' Card') || (id >= 4001 && id <= 4520)) return ITEMS_ICON_URL + 'card.gif';
    return ITEMS_ICON_URL + id + '.gif';
  }
  // ยอด zeny รวม session (จาก inventory จริง × buyPrice)
  function sessionZeny() {
    let total = 0;
    for (const [id, count] of inventory) total += (itemPrice(Number(id)) || 0) * count;
    return total;
  }

  // ============================================================
  //  ตั้งค่าเริ่มต้น — แก้ได้ที่นี่ หรือใช้คำสั่ง ASSIST.* จาก console
  // ============================================================
  const CFG = {
    // ---------- AUTO-HEAL ----------
    //  ★★ DEFAULT = OFF — ระบบยังไม่สมบูรณ์ อาจส่ง packet แปลกปลอมถ้าไม่มี item heal
    //     เปิดใช้เองด้วย ASSIST.healOn() หรือ ASSIST.setHealItems(...) (จะเปิดให้อัตโนมัติ)
    healEnabled: false,           // เปิดใช้ตอนเริ่มหรือไม่
    healAtPercent: 60,            // HP% ที่จะเริ่มใช้ยา (เช่น 60 = ต่ำกว่า 60% ใช้ยา)
    healItems: [501,502],                // ★ DEFAULT = ว่าง → จะไม่ส่ง packet heal ใด ๆ จนกว่าจะตั้ง item
    healMode: 'order',            // 'order' = ใช้ตัวเดิมจนหมดแล้วค่อยข้าม, 'random' = สุ่มทุกครั้ง
    healDelayMs: 200,             // ดีเลย์ขั้นต่ำระหว่างการใช้ item แต่ละครั้ง
    healCheckMs: 100,             // ความถี่ในการเช็ค HP
    healAtMax: false,             // true = ใช้ยาจนเต็มก่อนหยุด (ไม่ใช่แค่พ้น threshold)
    healExhaustedMs: 3000,        // ★ item ที่ "หมด" จะรออีก N ms ก่อนลองใหม่ (เผื่อเก็บ/ซื้อมาเพิ่ม)
    healItemEffectCheckMs: 300,   // รอ server ส่ง HP กลับ N ms หลังใช้ item แล้วค่อยเช็คผล

    // ---------- AUTO-BUFF (ใช้ไอเทมบัพเป็นระยะ — countdown) ----------
    //  mirror บอทหลัก autoBuff (config.json:402-441) — timer mode
    //  เก็บเวลาใช้ล่าสุดข้าม session (localStorage) กัน buff หายเมื่อ refresh
    buffEnabled: false,           // เปิดใช้ตอนเริ่มหรือไม่
    // ★ รายการ buff: [{itemId, intervalMin}] — intervalMin = ทุกกี่นาทีจะใช้ซ้ำ
    //   ตัวอย่าง: [{itemId:656, intervalMin:30}] = Awakening Potion ทุก 30 นาที
    buffItems: [{itemId:645, intervalMin:30}],                // ★ default ว่าง = ไม่ใช้ buff ใด ๆ
    // ★★ ไปรับบัพจากบอทอีกตัว (คู่บอท: ตัวฟาร์มย้อนกลับหาตัวบัพเป็นระยะ)
    buffVisitEnabled: false,
    buffVisitMap: '',             // แผนที่ที่บอทบัพประจำ (จุด Guard)
    buffVisitX: -999,
    buffVisitY: -999,
    buffVisitIntervalSec: 600,    // ทุกกี่วินาทีไปรับ (default 10 นาที)
    buffVisitWaitSec: 20,        // รอบอทบัพนานสุดกี่วินาที (ยืนรอรับ Heal/Buff)
    // ★★ AB REFRESH ผ่านเมนูเกม: ESC → Unstuck → รอรับบัพ → กลับจุดฟาร์มเดิม
    unstuckBuffEnabled: false,     // เปิดรอบกลับจุดเกิดรับบัพ AB
    unstuckBuffIntervalSec: 500,   // default 500 วินาที
    unstuckBuffWaitSec: 2,         // legacy compatibility — v4.188.1 ล็อกกลับหลัง Unstuck 2 วินาที
    unstuckBuffMenuDelayMs: 700,   // รอเมนู ESC เปิดก่อนคลิก Unstuck
    unstuckBuffSpawnTimeoutSec: 12,// รอการย้ายตำแหน่ง/แมปหลังคลิก Unstuck ก่อนถือว่าเกิดแล้ว
    unstuckBuffClickXRatio: null,  // ตำแหน่งปุ่ม Unstuck เทียบกับ canvas (0..1) — calibrate ครั้งเดียว
    unstuckBuffClickYRatio: null,
    unstuckPacketEnabled: true,     // ★ v4.187.7 compatibility flag — Direct Unstuck ถูกล็อกเป็น 0x73
    unstuckPacketHex: '73',          // ★ v4.187.7 fixed packet; ค่า localStorage เดิมจะถูก ignore
    buffCheckMs: 20000,            // ความถี่ในการเช็ค (1 วิ)
    buffRebuffDelayMs: 5000,      // รออย่างน้อย N ms ก่อนใช้ buff ตัวเดิมซ้ำ (กัน spurious)

    // ---------- AUTO-SKILL (ใช้สกิลตามเงื่อนไข — mirror bot.js autoSkill) ----------
    //  3 mode: targeted (Bash/Charge), AoE (Magnum Break), self-cast (Two-Hand Quicken)
    //  แต่ละ skill: {name, skillId, level, targeted, selfCast, intervalMin, mobCountMin,
    //                 maxUsesPerTarget, maxDistance, minDistance, spMin, cooldownMs}
    skillEnabled: false,          // ★ default OFF
    skills: [],                   // รายการ skill config
    disabledSkillIds: [],         // skillId ที่ toggle ปิดชั่วคราว
    buffOthersEnabled: false,     // ★★ บอทบัพให้ผู้เล่นอื่น — default OFF! ต้องเปิดเอง (กันบัพมั่วใส่คนแปลกหน้าตอนเดินผ่าน)

    // ---------- AUTO TRADE (incoming request) ----------
    // ★ packet ต้องยืนยันจาก Rayrag จริงก่อน — ห้ามเดา opcode
    tradeAcceptAll: false,         // รับคำขอ Trade ทุกคนอัตโนมัติ (เปิดได้หลัง calibrate)
    tradeRejectAll: false,         // ปฏิเสธ/Eject คำขอ Trade ทุกคนอัตโนมัติ (mutually exclusive)
    tradeRequestOpcode: 0x7e,      // verified Rayrag incoming Trade Request
    tradeRequestLen: 43,           // verified Rayrag Trade Request length
    tradeAcceptPacketHex: '78 01 78 00', // verified sequence marker; runtime sends two 2-byte packets
    tradeRejectPacketHex: '78 00 78 00', // verified sequence marker; runtime sends two 2-byte packets

    // ---------- MISC ----------
    autoClearConsoleMin: 10,       // ★ 0=off, >0=clear browser console ทุก N นาที (กัน log เยอะค้างหน่วย)
    chatPauseOnIncoming: true,     // ★ v4.189.27 nearby/whisper จากผู้เล่นอื่น → pause การเคลื่อนไหว/ต่อสู้ + manual quick reply

    // ---------- NAVIGATION (บันทึกเส้นทางเดิน + waypoint graph) ----------
    //  เก็บตำแหน่งที่ผู้เล่นคลิกเดิน → สร้าง waypoint graph → bot เดินตามเส้นทางจริง
    //  ★ ข้อมูลเก็บ localStorage (roAssistNav_<map>) + export/import + sync GitHub
    navRecording: false,          // ★ default OFF — เปิดเพื่อบันทึกตอนเดินเก็บข้อมูล
    navMergeRadius: 3,            // จุดที่อยู่ใกล้กัน <= N ช่อง = รวมเป็น node เดียว (dedup)
    navWanderUseNav: true,        // wander ใช้ nav แทนสุ่ม (ถ้ามีข้อมูลแมปนั้น)
    gatWanderEnabled: true,       // ★★ wander ใช้ตารางเดินได้ GAT ก่อน (ground truth — มีข้อมูลแมปนั้นเท่านั้น)
    navWanderMode: 'patrol',      // ★ 'patrol' = เดินตามลำดับ route ครบแล้วย้อนกลับ, 'graph' = wander สุ่มตาม graph

    // ---------- AUTO-REST (★ default OFF — นั่งพักเสี่ยงถ้ามีมอนรอบตัว) ----------
    //  เมื่อ HP ต่ำกว่า restHpPercent และไม่โดนรุม → นั่งพัก
    //  ฟื้นถึง restUntilPercent หรือหมดเวลา restMaxSec → ลุกยืนกลับฟาร์ม
    //  ★ โดนรุมระหว่างนั่ง → ลุกทันทีเพื่อตีตอบ
    restEnabled: true,
    restHpPercent: 40,            // HP ต่ำกว่า 30% → นั่งพัก
    restSpPercent: 0,            // ★★ SP% ต่ำกว่านี้ → นั่งพักด้วย (0 = ไม่สน SP) — สำหรับบอทบัพ
                                 //   ลุกเมื่อ HP และ SP ฟื้นถึง restUntilPercent ครบทั้งคู่ (ใช้ค่าเดียวกัน)
    restUntilPercent: 90,         // ฟื้นถึง 90% → ลุก
    restMaxSec: 40,               // นั่งนานสุด 60 วิ (กันค้าง — HP ไม่ขยับ = มีปัญหา)
    restDelayMs: 1000,            // ★ ดีเลย์ก่อนนั่งพักหลังเก็บของเสร็จ — กันดูเป็นบอท (นั่งทันที = ไม่ธรรมชาติ)

    // ---------- AUTO-RESPAWN ----------
    //  ตาย (0x24 DEATH) → ส่ง respawn packet (0x29) → กลับจุด save
    //  หลัง respawn → บังคับนั่งพักจนเลือดเต็ม → กลับฟาร์ม
    autoRespawnEnabled: true,
    autoRespawnDelayMs: 3000,     // รอ N ms หลังตายก่อนส่ง respawn (กันสแปม — ถ้า server lag)

    // ---------- TELEGRAM ALERT FILTERS ----------
    //   ★ ควบคุมว่าจะส่ง alert ประเภทไหนไป Telegram บ้าง

    // ---------- AUTO-SELL (★ default OFF) ----------
    //  trigger: ของเต็ม (0x20 'too full') OR ครบเวลา sellIntervalMin
    //  เลือก NPC + แมป เอง + เลือก item ที่จะขายเอง (default ไม่ขายอะไร)
    sellEnabled: true,
    sellNpcName: 'Tool Dealer',   // ชื่อ NPC (หาจาก entities kind=2)
    sellNpcMap: 'izlude_in',     // แมปที่ NPC อยู่ (ต้องตรงกับ Save Point หลัง Unstuck)
    sellNpcX: 116,                // ★ พิกัด X จุดเดินหลัง Unstuck (ตั้งใกล้ NPC)
    sellNpcY: 55,                 // ★ พิกัด Y จุดเดินหลัง Unstuck
    sellIntervalMin: 0,           // 0=off, >0=ขายทุก N นาที
    sellOnFull: true,             // ขายเมื่อของเต็ม (server ส่ง 'too full')
    sellItemIds: [908,909,910,911,918,919,920,921,924,926,928,940,943,946,949,950,951,955,960,961,962,1024,1052,7033,935,915,913,957,7032,902,1068,1067,948,907,1021,906,937,945,705,1023,1050,956,1057,963,914,905,511,711,721,1051,1054,1053,901,1094,1020,1019,7054,1022,7013,7094,7356,7317,7004,7049,1055,7064,967,912,1027,1096,7070,7358,7357,942,7359,953,1501,2221,1035,1032,1031,1013,1402,1916,1026,947,1014,1040,1034,1012,737,904,7031,1056,7007,903,7041,930,958,934,1059,1099,1098,7174,1025,1042,1017,7318,1028,1041,1061,1405,1408,2220,7119,923,7012,1063,7009,7002,931,7005,1095,1097,938,2297,1301,932,1505,1060,734,7069,7072,7066,7068,954,7156,7053,7158,7157,7106,7107,7001,7159,7124,7063,7111,7112,1038,7015,713,936,2303,1016,2304,1202,7154,7155,7153,7152,7126,1044,922,1116,1064,1201,1039,1602,1033,7067,1048,1062,944,7003,7006,1036,7123,1037,941,7030,7150,7149,7151,959],              // ★ item id ที่ติ๊กว่าจะขาย (default ว่าง = ไม่ขายอะไร)

    // ---------- AUTO-STORAGE (ฝากของเข้า Kafra) ----------
    //  ★ default OFF — เปิดเองใน config tab หรือ ASSIST.storageOn()
    //  mirror บอทหลัก config.bot.autoStorage (config.json:743-924)
    storageEnabled: true,        // เปิดใช้ตอนเริ่มหรือไม่
    kafraName: 'Kafra Staff',     // ชื่อ NPC Kafra (หาจาก entities kind=2)
    kafraMap: 'izlude',           // แมปที่ Kafra อยู่ (ต้องตรงกับ Save Point หลัง Unstuck)
    kafraMapX: 134,                 // พิกัดเดิน X หลัง Unstuck (0 = ใช้ sellNpcX/Y แทน)
    kafraMapY: 79,                 // พิกัดเดิน Y หลัง Unstuck
    kafraChoice: 1,               // index เมนู "Use Storage" (0=Save, 1=Use Storage, 2=Teleport)
    depositOnFull: true,          // ฝากเมื่อของเต็ม (server ส่ง 'too full')
    depositAfterSell: true,       // ★ chain: ฝากต่อทันทีหลังขายเสร็จ
    depositItemIds: [],           // ★ item id ที่จะฝาก (default ว่าง = ไม่ฝากอะไร)

    // ---------- FARM MAP (แมปฟาร์ม) ----------
    //  ใช้สำหรับ: (1) เผลอเดินเข้าวาร์ป → เปลี่ยนแมป → วาร์ปกลับอัตโนมัติ
    //             (2) กดปุ่ม "วาร์ปไปแมปฟาร์ม" เพื่อกลับทันที (manual)
    //  ★ farmMap ว่าง = ปิดฟีเจอร์ทั้งคู่ (mirror บอทหลัก autoTeleport.mapName)
    farmMap: 'iz_dun00',                  // ชื่อแมปฟาร์ม (เช่น 'cmd_fild01') — ว่าง = ไม่ใช้
    farmMapX: -999,               // พิกัด X ที่จะวาร์ปไป (-999 = random spawn ในแมปนั้น)
    farmMapY: -999,               // พิกัด Y
    warpBackToFarm: true,         // ถ้า currentMap เปลี่ยนจาก farmMap → วาร์ปกลับอัตโนมัติ
    // ★★ รายการแมปฟาร์มหมุนวนเมื่อตาย — [{map, x, y}, ...]
    //   ตายแต่ละครั้ง → หมุนไปแมปถัดไปในรายการ (วนกลับแมปแรก) — เหมาะกับแมปมอนแรง/แมปผู้เล่นเยอะ
    farmMaps: [],
    farmRotateOnDeath: false,     // toggle เปิด-ปิด ตายเปลี่ยนแมปฟาร์ม
    farmMapIdx: 0,                // ตำแหน่งปัจจุบันในรายการ (persist กัน reset ตอน refresh)
    fleeFromPlayers: false,       // ★★ วาร์ปหนีผู้เล่น — เจอผู้เล่นในแมป → วาร์ปหนีทันที
    fleeMode: 'changeMap',        // ★★ 'changeMap' = เปลี่ยนแมป | 'sameMap' = วาร์ปสุ่มในแมปเดิม
    fleeMaps: [],                 // ★★ รายการแผนที่สำรอง ['moc_fild04','moc_fild08',...]
    fleePlayerRadius: 30,         // ★★ ระยะตรวจจับผู้เล่น (ช่อง)
    fleeWarpCooldownSec: 5,       // ★★ คูลดาวน์วาร์ปหนีผู้เล่น (วินาที) — 0 = หนีรัวสุด (ตัวจำกัดธรรมชาติ = รอรู้ตำแหน่งตัวเองหลังวาร์ป)

    // ---------- AUTO-LOOT ----------
    lootEnabled: true,
    pickRadius: 2,                // ระยะ (ช่อง) จากตัวเรา ที่จะถือว่าของเป็นของเรา
    lootRespectOthers: true,      // ★★ ผู้เล่นอื่นยืนใกล้ drop กว่าเรา (ชัดเจน) → ไม่ยุ่ง + blacklist 60s
    combatWindowMs: 2500,         // ของตกต้องมาภายในเวลานี้หลังเราตี/ฆ่า
    lootDelayAfterDropMs: 600,      // ★ รอ N ms หลังของตก แล้วค่อยเริ่มเก็บ (0 = เก็บทันที, กันดูเป็นบอท)
    lootUseKillPos: true,         // ★ เช็ค item ใกล้พิกัดมอนที่เราฆ่า (นักธนูฆ่าไกล → ของตกไกล)
    pickRadiusKill: 2,            // ★ ระยะ (ช่อง) จากพิกัดมอนที่ตาย ที่จะถือว่าของเป็นของเรา (item drop ที่ตำแหน่งมอน ±1 ช่อง)
    attemptIntervalMs: 1200,      // ห่างระหว่างการลองเก็บชิ้นเดิม (1.2 วิ — รอ server เดินไปเก็บ)
    sendThrottleMs: 400,          // ห่างระหว่างคำสั่งเก็บทุกชิ้น (กันสแปม)
    maxAttempts: 4,               // เก็บไม่ได้ 6 ครั้ง → ปล่อย (นักธนูฆ่าไกล ตัวเดินไปเก็บนานขึ้น)
    itemMaxAgeMs: 30000,          // ของเก่ากว่านี้ → ทิ้งออกจากคิว
    lootTickMs: 300,

    // ---------- WARP-TO-LOOT (ฟีเจอร์รุนแรง — default OFF) ----------
    //  เมื่อเก็บของไม่ได้ครบ maxAttempts (server เงียบ = ติดกำแพง/หน้าผา)
    //  → วาร์ปไปที่พิกัดของไอเท็ม แล้วส่ง pickup อีกครั้ง
    //  ★ default OFF เพราะส่ง packet warp จริง — เปิดเองด้วย ASSIST.warpLootOn()
    warpLootEnabled: true,
    warpLootMaxOffsets: 3,        // ลองกี่ offset รอบไอเท็ม (กลาง + ±3 รอบข้าง) ก่อนปล่อยทิ้ง
    warpLootCooldownMs: 2000,     // ห่างขั้นต่ำระหว่างการวาร์ป (กันสแปม)
    warpLootPickupDelayMs: 1000,   // รอ server ย้ายตัวละครหลังวาร์ป ก่อนส่ง pickup

    // ---------- AUTO-COMBAT (★ default OFF — ส่ง attack packet จริง) ----------
    //  เปิดเองด้วย ASSIST.combatOn()
    //  targetWhitelist: [] = ตีทุกมอน kind=1; ['Poring', 4000] = ตีเฉพาะ (รองรับชื่อ + sprite id)
    //  ⚠️ ว่าง = ตีทุกมอน รวม MVP/มอนแรง → แนะนำให้ตั้ง whitelist หรือใช้ blacklist กันตาย
    combatEnabled: false,
    targetWhitelist: [],          // [] = ตีมอน kind=1 ทุกตัว; ['Poring', 4000] = เฉพาะ (รองรับชื่อ + sprite id)
    targetBlacklist: [],          // ไม่ตีมอนเหล่านี้ (ชื่อหรือ sprite id)
    fightBackBlacklisted: true,   // ★ โดนมอนใน blacklist ตี → ตีกลับไหม? (false = เคารพ blacklist เด็ดขาด แม้โดนตี)
    blacklistFleeEnabled: false,   // ★ โดนมอนใน targetBlacklist โจมตี → หนีในแมพด้วย Direct → Clip → Macro → Fly Wing
    teleportMacroEnabled: false,   // ★ Shared Fixed Macro: ใช้ทั้ง Warp Find + หนีมอน; HP/Blacklist ใช้เป็น fallback ก่อน Fly Wing
    normalAttackEnabled: true,    // ★★ โหมดเวทย์: ปิด = ไม่ส่ง ATTACK เลย (ใช้แต่สกิล — นักเวทย์ร่ายไกล ไม่โดนลากเข้าปะทะ)
    // ★★ GUARD MODE — ยืนประจำตำแหน่ง ไม่หามอนเอง ตีกลับเฉพาะมอนที่มาตีเรา
    //   เตรียมไว้สำหรับบอทบัพ (คอยประจำจุดใช้สกิลให้คนอื่น)
    guardEnabled: false,
    guardMap: '',            // แผนที่ประจำ (ว่าง = ยึดแมปที่เปิด guard)
    guardX: -999,
    guardY: -999,
    // ★★ Auto-Login / Auto-Refresh (เก็บใน localStorage ทั้งหมด — รอดจาก refresh)
    //   ⚠️ password เก็บแบบ plain text ใน localStorage ของเบราว์เซอร์ (เฉพาะ origin นี้)
    //      ห้ามใช้ในเครื่องส่วนรวม! และระบบจะไม่ส่งค่าเหล่านี้ไป monitor/feedback เด็ดขาด
    autoLoginEnabled: false,      // WS ต่อเกม → ล็อกอินเอง → เลือกตัวละครเอง
    autoLoginUser: '',
    autoLoginPass: '',
    autoLoginSlot: 0,             // slot ตัวละคร (เริ่มนับ 0 — slot แรก = 0)
    autoRefreshEnabled: false,    // packet เงียบ/WS หลุดนาน → refresh หน้า (แล้ว auto-login กลับมาเอง)
    autoRefreshStallSec: 180,     // ถือว่าค้างเมื่อไม่มี packet ต่อเนื่อง N วินาที
    attackRange: 2,               // ระยะโจมตี (ช่อง) — ใกล้กว่านี้สั่งตี, ไกลกว่าเดินไป
    rangedAttackRange: 8,         // 0 = ใช้ attackRange; >0 = นักธนูตีไกลได้ N ช่อง
    maxAcquireDistance: 30,       // ★ เลือกเป้า + ส่ง ATTACK ได้ในระยะนี้ (cap สูงสุด)
    searchRadii: [1,3,5, 10, 15, 20, 30], // ★ progressive search — ค้นจากรัศมีเล็กก่อน ถ้าเจอใช้เลย (mirror bot.js:3944)
    maxChaseDistance: 40,         // ★ เดินไล่ตามมอนได้สูงสุด N ช่อง (ไกลกว่านี้ abandon หาตัวอื่น)
    walkStepDistance: 16,         // ★ สั่งเดินทีละ N ช่อง (game click-walk cap 16 — เกินนี้ server ตัด + คนคลิกไม่ได้)
    maxWalkDistance: 15,          // (legacy — ใช้น้อย เพราะ server walk-and-attack เอง)
    combatTickMs: 200,            // tick loop (มี jitter ±25% เหมือนบอทหลัก)
    postCombatDelayMs: 800,      // ★ รอ N ms หลังสู้เสร็จ/เก็บของเสร็จ ก่อนทำอย่างอื่น (ดูเป็นธรรมชาติ)
    attackReIssueMs: 2000,        // ส่ง attack ซ้ำถ้า server เงียบนานกว่านี้ (เพิ่มจาก 2500 → pending เพิ่มช้าลง)
    attackAbandonMs: 5000,       // ★ ส่ง attack แล้ว server ไม่ตอบ N ms → abandon (เพิ่มจาก 8s → 20s รองรับ reset ล่าช้า)
    attackPendingMax: 3,          // ★ abandon ถ้า pending ≥ N (ลดจาก 8 → 4 ใกล้บอทหลัก ตัดมอนตีไม่ได้เร็วขึ้น)
    aggroKeepAliveMs: 15000,      // ★ มอน aggro เรา → ถือว่ายังสู้อยู่ N ms (กัน abandon ตอนมอนเดินมาหา)
    maxEngageSec: 40,             // abandon target ถ้า engage นานกว่านี้
    maxEngageSecSlow: 180,        // ★ abandon มอน "ตีช้า/เจาะไม่เข้า" (เห็ด/พืช) ถ้านานกว่านี้ (3 นาที)
    slowMonsterSubIds: [4010, 4011, 4013, 4017, 4041, 4030, 4106, 4153],  // ★ sub-ID ที่ตี damage 1
    // flee (วาร์ปหนี)
    mobFleeEnabled: true,         // ★ สวิตช์หลักหนีมอนรุม (รุม/aggro/มอนรอบ) — ปิดแล้วยังจำ threshold เดิม
    dangerFleeEnabled: true,      // ★ สวิตช์หลักหนีมอนอันตราย — ปิดแล้วยังจำรายชื่อ/ระยะเดิม
    fleeOnMobCount: 3,            // มอนรุม N ตัว (ที่ตีเรา) → วาร์ปหนี (0=off)
    fleeOnAggroCount: 5,          // มอนจับเราเป็นเป้า N ตัว → วาร์ปหนี (0=off)
    fleeOnProximityCount: 10,      // มอนอยู่รอบ N ตัวในระยะ → วาร์ปหนี (0=off)
    fleeOnProximityRadius: 8,
    fleeMobWindowMs: 5000,        // ช่วงเวลาที่นับว่ามอน "กำลังตีเรา"
    fleeCooldownMs: 3000,
    fleeMonsters: [],             // ★ มอนที่ต้องหนี (ชื่อหรือ sub-ID) — เจอในระยะ → วาร์ปหนีทันที
    fleeMonsterRadius: 20,        // ★ ระยะ (ช่อง) ที่ถ้าเจอมอนใน fleeMonsters → วาร์ปหนี
    // ★ v4.188.8 HP Emergency Flee
    hpFleeEnabled: false,          // HP ต่ำกว่า % ที่ตั้ง → หนีฉุกเฉิน
    hpFleePercent: 30,             // threshold 1-99
    hpFleeMode: 'sameMap',         // 'sameMap' = Direct/Clip/Wing fallback · 'unstuck' = 0x73
    // KS avoidance + ป้องกันแย่ง
    antiKS: true,                 // ไม่ตีมอนที่คนอื่นกำลังสู้ (default ON)
    antiKSCooldownMs: 5000,       // มอนที่ถูกตีโดยคนอื่น จะถูกข้ามไป N ms
    avoidOtherPlayers: true,      // ไม่ตีมอนที่อยู่ใกล้ผู้เล่นคนอื่น
    playerProximityRadius: 10,
    // target selection
    targetLowestHpFirst: true,    // ถูกรุม ≥2 ตัว → ตีเลือดน้อยสุดก่อน
    // stuck
    warpToMonster: false,         // ติดกำแพง → วาร์ปไปหามอน (toggle, default OFF)
    warpToMonsterCooldownMs: 10000,
    warpToMonsterMaxPerEntity: 2,
    stuckWarpOnAbandon: 0,        // abandon 3 ครั้งใน 60s → วาร์ปสุ่ม
    stepAsideOnAbandon: true,     // ★ abandon stuck → เดินหลีก 5-12 ช่อง (กันยืนนิ่ง)
    warpToBoss: false,            // ★ วาร์ปไปสู้ Boss เมื่อตรวจจับได้ (flag=4, toggle, default OFF)
    warpToMiniBoss: false,        // ★ วาร์ปไปสู้ Mini Boss เมื่อตรวจจับได้ (flag=3, toggle, default OFF)
    bossAlertRadius: 0,           // ★ ระยะที่จะ alert mini-boss (0 = ทุกระยะ)
    bossAlertRadius: 0,           // ★ ระยะที่จะ alert boss (0 = ทุกระยะ, เช่น 50 = ภายใน 50 ช่อง)
    // หามอน
    wanderEnabled: true,          // ไม่เจอมอน → สุ่มเดิน
    wanderMaxStep: 20,            // สุ่มระยะ ≤20 ช่อง
    wanderCooldownMs: 500,
    warpFindEnabled: false,       // ไม่เจอมอนนาน → วาร์ปสุ่ม (toggle, default OFF)
    warpFindUseFlyWing: false,    // ★ true = ใช้ Fly Wing itemId 601 (Rayrag) สำหรับ warp-find
    warpFindUseTeleportSkill: true,// ★ true = ใช้ Teleport Lv.1 (skillId 53 / Teleport Clip) สำหรับ warp-find
    noMonsterWarpSec: 30,

    // โหมดกรองของ: 'all' = เก็บหมด, 'only' = เก็บเฉพาะ, 'except' = ยกเว้น
    filter: { mode: 'except', onlyItems: [], exceptItems: [909,916,1302,1602,2302] },

    // ---------- ทั่วไป ----------
    verbose: true,
    itemNames: {
      501: 'Red Potion', 502: 'Yellow Potion', 503: 'White Potion',
      504: 'Blue Potion', 505: 'Wing of Fly', 601: 'Fly Wing',   // ★ Rayrag DB: Fly Wing = 601
      909: 'Jellopy', 916: 'Bird Feather', 512: 'Apple',
    },
  };

  // ★★ snapshot ค่า default ของ CFG ไว้ก่อนโหลดค่าจริง — สำหรับสลับ profile แบบ "แทนที่ทั้งชุด"
  //   (key ที่ profile ใหม่ไม่มี = กลับไป default ไม่ใช่ค้างจาก profile เดิม)
  const CFG_DEFAULTS = JSON.parse(JSON.stringify(CFG));
  // ★ โหลดค่าที่บันทึกไว้จาก localStorage (ทับ default)
  loadConfig();
  // ★ v4.188.7 verified Rayrag Trade protocol — ignore stale capture/calibration values from older versions
  CFG.tradeRequestOpcode = 0x7e;
  CFG.tradeRequestLen = 43;
  CFG.tradeAcceptPacketHex = '78 01 78 00';
  CFG.tradeRejectPacketHex = '78 00 78 00';
  // ★ v4.187.7: override legacy/captured value — Unstuck confirmed as 0x73 len=1
  CFG.unstuckPacketEnabled = true;
  CFG.unstuckPacketHex = '73';
  CFG.unstuckBuffWaitSec = 2; // ★ v4.188.1 fixed return delay compatibility
  loadBuffTimes();   // ★ โหลดเวลา buff ล่าสุดข้าม session
  loadSkillTimes();  // ★ โหลดเวลา skill ล่าสุดข้าม session

  // ---------- state ทั่วไป ----------
  let activeWS = null;                 // game socket (ใช้ส่งคำสั่ง)
  let gameServerUrl = '';              // ★ URL ของเซิร์ฟเวอร์เกม (เช่น wss://gamesea01.rayrag.com/ws)
  let playerId = null;                 // ไอดีตัวเรา
  let playerName = null;               // ★ ชื่อตัวเรา — guard กัน false ID change (mirror world.js:1235)
  // ★★ selfIdConfirmed — playerId ปัจจุบันยืนยันแล้วหรือยัง?
  //   true  = เห็น SPAWN ชื่อตรง / SELECT_CHAR (ชัวร์ว่าเป็นเรา)
  //   false = เพิ่งถูก claim จาก minimap dot 0x3c (ยังไม่รู้ว่า dot นั้นใคร)
  //   ใช้ตอนเปลี่ยน playerId: id เก่าที่ "ยังไม่ยืนยัน" ห้าม mark stale
  //   (บั๊ก: SELF-DETECT ฉก id คนตาม → พอแก้กลับ กลับ stale id คนตาม → มองไม่เห็น 5 นาที!)
  let selfIdConfirmed = false;
  let hpStatGraceUntil = 0;            // ★ grace period หลัง ID เปลี่ยน (ข้าม STAT HP ที่อาจผิด)
  const player = { x: null, y: null }; // ตำแหน่งตัวเรา

  // ---------- log buffer (สำหรับ panel log console) ----------
  const LOG_BUF_MAX = 500;
  const logBuf = [];
  function log(...a) {
    const msg = a.map(x => (typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })() : String(x))).join(' ');
    logBuf.push({ t: Date.now(), msg });
    while (logBuf.length > LOG_BUF_MAX) logBuf.shift();
    if (CFG.verbose) console.log('[ASSIST]', ...a);
  }
  // ★★ Debug log — แยกจาก log กิจกรรม: ข้อมูลระบบ/parse/detect ที่เยอะและเอาไว้วิเคราะห์
  //   (SPAWN dump, flee scan, SELF-DETECT, despawn guard, ฯลฯ)
  //   ดูได้ใน Log modal แท็บ "Debug"
  const DBG_BUF_MAX = 300;
  const dbgBuf = [];
  function dbg(...a) {
    const msg = a.map(x => (typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })() : String(x))).join(' ');
    dbgBuf.push({ t: Date.now(), msg });
    while (dbgBuf.length > DBG_BUF_MAX) dbgBuf.shift();
    if (CFG.verbose) console.log('[ASSIST·dbg]', ...a);
  }
  // ★ important log buffer — card drop + chat ที่พูดถึง bot
  const IMPORTANT_BUF_MAX = 200;
  const importantLogBuf = [];
  function logImportant(type, msg) {
    importantLogBuf.push({ t: Date.now(), type, msg });
    while (importantLogBuf.length > IMPORTANT_BUF_MAX) importantLogBuf.shift();
    log(msg);   // ส่งไป log ปกติด้วย
  }
  // ★ chat history buffer — เก็บแชทล่าสุดสำหรับ Monitor ในเครื่อง
  const CHAT_BUF_MAX = 50;
  const chatBuf = [];
  // ★ v4.189.27 Chat Alert + Pause — transient state, ไม่เขียนทับ config Combat/Warp/Wander
  let chatPauseActive = false;
  let chatPauseLast = null;   // {name,message,chatType,typeName,at,isTest}
  // ★★ บัพตามคำขอ — จำแชทล่าสุดของแต่ละคน (ชื่อ → ข้อความ+เวลา) เช็ค keyword ก่อนบัพ (buffChatKeyword)
  const chatReqBy = new Map();   // lowercase ชื่อผู้พูด → { msg, at }
  const nameOf = (id) => {
    const db = itemDisplayName(id);
    return db !== 'item_' + id ? `${db}(${id})` : (CFG.itemNames[id] ? `${CFG.itemNames[id]}(${id})` : `item_${id}`);
  };
  // ★★ ชื่อแสดงผลของ equipment ชิ้นจริง — "+7 Anti-Magic Helm[1]" / "Brooch of Counter"
  //   refine + card prefix/postfix ตามที่เกมแสดง (prefix/postfix จาก ItemsCards.csv)
  //   [N] ต่อท้าย = จำนวนช่องการ์ด (จากคอลัมน์ Slot) — ไม่มีช่อง (0) ไม่แสดง
  function equipDisplayName(rec) {
    const k = String(rec.id);
    let n = itemDB.names[k] || ('item_' + rec.id);
    const slc = itemDB.slotCounts[k];
    if (slc > 0) n += '[' + slc + ']';
    const ck = rec.card ? String(rec.card) : '';
    const pre = ck && itemDB.cardPrefix[ck] ? itemDB.cardPrefix[ck] + ' ' : '';
    const post = ck && itemDB.cardPostfix[ck] ? ' ' + itemDB.cardPostfix[ck] : '';
    return (rec.refine ? '+' + rec.refine + ' ' : '') + pre + n + post;
  }
  // ★★ สรุปสเตตัสอุปกรณ์สำหรับ tooltip — Attack/Defense/Weight/Weapon Level/Required Level/Jobs
  //   (อาชีพจาก EquipGroup → EquipmentGroups.csv: ใช้ display name ถ้ามี ไม่งั้นรวมรายชื่อ members)
  function equipStatDesc(id) {
    const k = String(id);
    const lines = [];
    const atk = itemDB.attacks[k];
    if (atk != null && itemDB.attacks[k] !== undefined) lines.push('⚔️ Attack: ' + atk);
    const df = itemDB.defenses[k], md = itemDB.magicDefs[k];
    if (df > 0 || md > 0) lines.push('🛡️ Defense: ' + (df || 0) + (md > 0 ? ' / M.Def ' + md : ''));
    const w = itemDB.weights[k];
    if (w) lines.push('⚖️ Weight: ' + w);
    const wl = itemDB.wLevels[k];
    if (wl > 0) lines.push('🔧 Weapon Level: ' + wl);
    const rl = itemDB.reqLevels[k];
    if (rl > 0) lines.push('📏 Required Level: ' + rl);
    const eg = itemDB.equipGroups[k];
    if (eg) {
      const gi = itemDB.groupInfo[eg];
      const jobs = gi ? (gi.display || gi.members.join(', ')) : eg;
      lines.push('👤 Jobs: ' + jobs);
    }
    return lines.join('\n');
  }

  // ★ per-item action: 'keep' | 'sell' | 'deposit' (เก็บ/ขาย/ฝาก — เลือกได้อย่างเดียว)
  //   เก็บไว้ใน sellItemIds/depositItemIds ที่มีอยู่แล้ว (deposit สำคัญกว่า sell ถ้าซ้ำ)
  function getItemAction(id) {
    if (CFG.depositItemIds.includes(id)) return 'deposit';
    if (CFG.sellItemIds.includes(id)) return 'sell';
    return 'keep';
  }
  // ★ วน toggle: keep → sell → deposit → keep (สำหรับปุ่มใน UI)
  function cycleItemAction(id) {
    const cur = getItemAction(id);
    // ลบจากทั้งสองก่อน
    CFG.sellItemIds = CFG.sellItemIds.filter(x => x !== id);
    CFG.depositItemIds = CFG.depositItemIds.filter(x => x !== id);
    if (cur === 'keep') { CFG.sellItemIds.push(id); log('💰', nameOf(id), '→ ขาย'); }
    else if (cur === 'sell') { CFG.depositItemIds.push(id); log('🏦', nameOf(id), '→ ฝาก'); }
    else { log('📦', nameOf(id), '→ เก็บ'); }
    saveConfigDebounced();   // ★ บันทึกถาวรจาก UI/การตั้งค่า
    return getItemAction(id);
  }

  // ---------- สถิติการฟาร์ม ----------
  const stats = {
    startTime: Date.now(),
    kills: 0,              // จำนวนที่ฆ่าได้ (นับจาก EXP gain)
    itemsLooted: 0,        // จำนวนชิ้นที่เก็บได้
    expGained: 0,          // EXP รวมที่ได้ (base+job delta)
    baseExpGained: 0,      // ★ Base EXP delta (session) — แยกจาก job
    jobExpGained: 0,       // ★ Job EXP delta (session)
    itemsByCount: new Map(), // itemId -> จำนวนที่เก็บได้
    pickupFails: 0,        // ครั้งที่พยายามเก็บแล้วล้มเหลว
    deaths: 0,             // ครั้งที่ตาย
    // ★ rolling windows (mirror world.js:66-67, bot.js:401-422)
    dealtWindow: [],       // [{t, damage}] — 10s rolling for DPS
    attackWindow: [],      // [{t}] — 10s rolling for ASPD (รวม miss)
    goldWindow: [],        // [{t, gold}] — 5min rolling for zeny/hour
    sessionDamageDealt: 0, // cumulative total damage (session)
    sessionAttacks: 0,     // cumulative total attacks (session)
    sessionGold: 0,        // cumulative total gold value (session)
  };
  function resetStats() {
    stats.startTime = Date.now();
    stats.kills = 0; stats.itemsLooted = 0; stats.expGained = 0; stats.baseExpGained = 0; stats.jobExpGained = 0;
    stats.itemsByCount = new Map(); stats.pickupFails = 0; stats.deaths = 0;
    stats.dealtWindow = []; stats.attackWindow = []; stats.goldWindow = [];
    stats.sessionDamageDealt = 0; stats.sessionAttacks = 0; stats.sessionGold = 0;
  }

  // ---------- HP tracking ----------
  //  ★★★ ทุก STAT(0x25) packet ของ player = HP update (หลักฐานจากบอทหลัก world.js:1605-1643)
  //    statType เป็นแค่ label วนๆ (83 ค่าต่อ session) ทุก packet มี (cur,max) อยู่ในช่วง HP เดียวกัน
  //    → รับทุกตัวเลย แค่ sanity check (0 ≤ cur ≤ max)
  //    (ก่อนหน้านี้ใช้เทคนิค "เก็บ max สูงสุด" → ผิด! ถ้า server ส่ง sub-stat ที่ max=6774 → ทับ hp.max
  //     → แสดง 549/6774 ทั้งที่ HP จริง 408)
  const hp = { cur: null, max: null };
  let hpStatAt = 0;   // ★ timestamp ที่ server ส่งค่า HP มาล่าสุด (0x25/SPAWN เท่านั้น — ไม่รวม local ดาเมจ)
                      //   ใช้คู่กับ heal: กันตัดสิน "ยาหมด" ตอน HP ค้างเพราะ server ยังไม่ส่งค่าใหม่ (gfix ส่งช้า)
  const sp = { cur: null, max: null };   // ★ SP สำหรับ autoSkill — ตรวจ spMin
  // ★ v4.189.10 — แยก HP จริงที่แสดง (server authoritative) ออกจากค่าประมาณฉุกเฉิน
  // hp.cur/hp.max จะถูกแก้เฉพาะจาก STAT/SPAWN/DEATH เท่านั้น เพื่อไม่ให้ drift จาก damage packet ซ้ำ
  let hpSafetyCur = null, hpSafetyMax = null, hpSafetyAt = 0;
  function syncHpSafety(cur, m) {
    if (cur == null || !(m > 0)) { hpSafetyCur = null; hpSafetyMax = null; hpSafetyAt = 0; return; }
    hpSafetyCur = Math.max(0, Math.min(m, cur)); hpSafetyMax = m; hpSafetyAt = nowMs();
  }
  function noteHpSafetyDamage(damage) {
    if (!(damage > 0) || hp.max == null || !(hp.max > 0)) return;
    if (hpSafetyCur == null || hpSafetyMax !== hp.max) { hpSafetyCur = hp.cur; hpSafetyMax = hp.max; }
    if (hpSafetyCur != null) { hpSafetyCur = Math.max(0, hpSafetyCur - damage); hpSafetyAt = nowMs(); }
  }
  function hpSafetyPct() {
    if (hpSafetyCur != null && hpSafetyMax > 0 && hpSafetyMax === hp.max) return (hpSafetyCur / hpSafetyMax) * 100;
    return hpPct();
  }
  // ★★ 0x25 STAT routing — สองสไตล์ server (จาก capture จริงทั้งคู่):
  //   · gfix-ro: statType เสถียรต่อ stat (6=HP) + ส่ง stat อื่นปน (มักค่าเต็ม 127/127)
  //   · rayrag:  statType เปลี่ยนทุก packet (48,127,124,...) แต่ทุก packet คือ HP จริง!
  //   → ห้าม lock ด้วย statType (เคย lock แล้ว rayrag ตายหมดทั้งกระดูน — HP ค้าง ปั้มยาหมดกระเป๋า)
  //   กลยุทธ์: ยึด "max ตรง anchor" เป็นหลัก + จำ type ที่เคย apply เป็น HP (ยอมรับค่าเต็มด้วย)
  //   + ถ้าเห็น HP จาก ≥3 type ต่างกัน = statType ไม่เสถียร → ยอมรับทุก type ที่ max ตรง (สไตล์ rayrag)
  const hpAppliedTypes = new Set();   // statType ที่เคย apply เป็น HP แล้ว
  let stat25Loose = false;            // true = statType ไม่เสถียร → ยอมรับทุก type ที่ max ตรง hp.max
  const statRouteLogged = new Set();
  // ★★ กันนับดาเมจซ้ำ — server บางตัว (gfix-ro) ส่งการตีเดียวกันทั้ง 0x0b และ 0x17 (ดาเมจเท่ากัน ห่าง ~0.5s)
  //   นับซ้ำ = HP ไหลเร็ว 2 เท่า → ชน 0 → ถูก reset เป็น null ("HP ?") → heal ไม่ทำงาน → ตาย
  //   key = victim + ดาเมจเท่ากัน ภายใน 900ms (rayrag ส่งอย่างเดียว → ไม่มีผลอะไร)
  const recentDmgApplied = new Map();   // victimId → { dmg, at }
  function dmgAlreadyApplied(victimId, damage) {
    const r = recentDmgApplied.get(victimId);
    const now = nowMs();
    if (r && r.dmg === damage && now - r.at < 900) return true;   // ซ้ำ (0x0b/0x17 คู่เดียวกัน)
    recentDmgApplied.set(victimId, { dmg: damage, at: now });
    return false;
  }
  // ★★ 0x0b damage offset — rayrag ใส่ damage @17 / gfix-ro @18 (ต่างกัน 1 byte — เคสจริง: gfix อ่าน @17 ได้ 4864 แทนที่จะเป็น 19 = ×256)
  //   เรียนรู้อัตโนมัติจากคู่ 0x17 ที่ส่งดาเมจจริงตามหลัง + persist ต่อ hostname (ข้าม session ไม่ต้องเรียนใหม่)
  const OB_DMG_KEY = 'roAssistObDmg_' + (location.hostname || 'x');
  let obDmgAt = 17;
  try { const _v = parseInt(localStorage.getItem(OB_DMG_KEY) || '', 10); if (_v === 17 || _v === 18) obDmgAt = _v; } catch (e) {}
  const last0bDmg = new Map();   // victimId → { d17, d18, at } — เก็บไว้ให้ 0x17 ที่มาทีหลังเทียบ calibrate
  function obDmgCalibrate(victimId, trueDamage) {
    const r = last0bDmg.get(victimId);
    if (!r || nowMs() - r.at > 1500) return;
    if (r.d17 === trueDamage && r.d18 !== trueDamage && obDmgAt !== 17) {
      obDmgAt = 17;
      try { localStorage.setItem(OB_DMG_KEY, '17'); } catch (e) {}
      log('🔧 0x0b damage offset → 17 (ยืนยันจากคู่ 0x17 — server', location.hostname + ')');
    } else if (r.d18 === trueDamage && r.d17 !== trueDamage && obDmgAt !== 18) {
      obDmgAt = 18;
      try { localStorage.setItem(OB_DMG_KEY, '18'); } catch (e) {}
      log('🔧 0x0b damage offset → 18 (ยืนยันจากคู่ 0x17 — server', location.hostname + ')');
    }
  }
  function applyStat(id, cur, m) {
    if (id !== playerId) return;
    if (!(m > 0) || cur < 0 || cur > m) return;          // sanity check
    const now = nowMs();
    // ★★ grace period หลัง ID เปลี่ยน — ข้าม STAT HP ที่อาจผิด (mirror world.js:1620-1626)
    if (hpStatGraceUntil && now < hpStatGraceUntil && hp.cur != null) {
      return;   // ยังอยู่ใน grace + มี HP เก่า → ข้าม (รอค่าจริง)
    }
    if (hpStatGraceUntil && now >= hpStatGraceUntil) hpStatGraceUntil = 0;   // หมด grace → consume
    // ★ respawn detection: HP จาก 0/ตาย → กลับมา > 0 = เกิดใหม่แล้ว
    if (isDead && cur > 0) {
      isDead = false;
      heal.clearExhausted();                            // ล้าง mark "หมด" ทั้งหมด เริ่มนับใหม่
      heal.allExhaustedLogged = false;
      // ★ v4.188.3 — ถ้าเกิดใหม่นี้มาจาก Auto Respawn ให้ Unstuck 0x73 1 ครั้งเสมอ
      // ลองส่งทันทีตอน HP > 0 ยืนยันว่าเกิดใหม่แล้ว; ถ้ายังส่งไม่ได้ combatLoop จะ retry จนสำเร็จ
      if (autoRespawnUnstuckPending) {
        if (sendDirectUnstuckPacket()) {
          autoRespawnUnstuckPending = false;
          autoRespawnUnstuckReadyAt = 0;
          log('💀 Auto Respawn สำเร็จ → Direct Unstuck 0x73 ครบ 1 ครั้ง');
        } else {
          autoRespawnUnstuckReadyAt = now + 200;
        }
      }
    }
    hp.cur = cur;
    hp.max = m;
    hpStatAt = now;
    syncHpSafety(cur, m);
  }
  const hpPct = () => (hp.cur != null && hp.max > 0) ? (hp.cur / hp.max) * 100 : null;
  const spPct = () => (sp.cur != null && sp.max > 0) ? (sp.cur / sp.max) * 100 : null;

  // ============================================================
  //  AUTO-HEAL
  // ============================================================
  //  ★ logic การเลือก item:
  //   - แต่ละ item มี "exhaustedUntil" = เวลาที่จะลองใช้ใหม่ได้
  //     (= 0 หรือ ผ่านไปแล้ว = ใช้ได้ปกติ)
  //   - 'order'  : เลือก item แรกสุดที่ "ใช้ได้" (ตามลำดับที่ตั้ง) → ใช้ซ้ำจนกว่าจะหมด
  //                พอหมด → mark exhaustedUntil = now + healExhaustedMs → ข้ามไปตัวถัดไปทันที
  //                พอหมดเวลา → ลองใหม่ → ถ้าเก็บมาเพิ่มก็ใช้ได้ทันที (ไม่ mark ถาวร)
  //   - 'random' : สุ่มเลือกเฉพาะ item ที่ "ใช้ได้" ตอนนั้น
  //   - ทุกครั้งที่ใช้ item → จำ HP ก่อนใช้ → รอ healItemEffectCheckMs → เช็คผล
  //     ถ้า HP ไม่ขยับ = หมด → mark exhaustedUntil + ข้าม delay → ใช้ตัวถัดไปทันที
  //   - ตอนตาย (isDead) → หยุด heal ทั้งหมด (กันนึกว่ายาหมดทั้งหมด)
  let isDead = false;
  let lastRespawnAt = 0;          // ★ timestamp ที่ส่ง respawn ล่าสุด (throttle)
  let postRespawnRest = false;    // ★ บังคับนั่งพักหลัง respawn จนกว่า HP จะเต็ม
  let autoRespawnUnstuckPending = false; // ★ v4.188.3: Auto Respawn สำเร็จแล้วต้องส่ง Direct Unstuck 0x73 ให้ครบ 1 ครั้ง
  let autoRespawnUnstuckReadyAt = 0;    // เวลาที่อนุญาต retry หากส่งทันทีตอนยืนยันเกิดใหม่ไม่สำเร็จ

  // ---------- AUTO-REST state ----------
  let isResting = false;          // กำลังนั่งพักอยู่
  let restUntil = 0;              // timestamp ที่จะลุก (กันค้าง — restMaxSec)
  let lastRestStandAt = 0;        // ★ เวลาลุกจากการนั่งล่าสุด — กันนั่ง-ลุกวนรัวตอน HP ค้าง (tracking พัง)
  const heal = {
    exhaustedUntil: new Map(),    // itemId -> timestamp ที่จะลองใช้ใหม่ได้
    lastUseAt: 0,                 // เวลาที่ใช้ item ครั้งล่าสุด
    pendingCheckAt: 0,            // เวลาที่ใช้ item ล่าสุด (รอเช็คผล)
    pendingItemId: null,          // item ที่รอเช็คผลอยู่
    pendingHpBefore: null,        // HP ก่อนใช้ item ล่าสุด
    pendingCountBefore: null,     // ★ จำนวนใน inventory ก่อนใช้ (ใช้ตัดสิน "ยาหมด" จากของจริง ไม่ใช่ HP ที่อาจค้าง)

    // item นี้ "ใช้ได้" ไหม (ไม่ถูก mark หมด + inventory ไม่ได้เป็น 0 ชัด ๆ)
    isAvailable(id, now) {
      const t = this.exhaustedUntil.get(id) || 0;
      if (now < t) return false;
      if (inventory.get(id) === 0) return false;   // ★ เห็นค่า 0 จาก 0x32 = หมดจริง
      return true;
    },
    // mark ว่า item หมด → รอ healExhaustedMs แล้วค่อยลองใหม่
    markExhausted(id, now) {
      this.exhaustedUntil.set(id, now + CFG.healExhaustedMs);
    },
    // เลือก item ถัดไปที่จะใช้ (ตามโหมด)
    pickNext(now) {
      const ids = CFG.healItems;
      if (!ids.length) return null;
      const avail = ids.filter(id => this.isAvailable(id, now));
      if (!avail.length) return null;                // ทุกตัว mark ว่าหมดอยู่
      if (CFG.healMode === 'random') {
        return avail[Math.floor(Math.random() * avail.length)];
      }
      return avail[0];                               // 'order' = ตัวแรกที่ใช้ได้
    },
    // ล้าง mark "หมด" ทั้งหมด (ใช้ตอน respawn / reset)
    clearExhausted() { this.exhaustedUntil.clear(); },
    // เคลียร์ pending (แยกจาก mark — แค่ล้างการรอเช็คผล)
    _clear() { this.pendingItemId = null; this.pendingHpBefore = null; this.pendingCheckAt = 0; this.pendingCountBefore = null; },
  };

  // ส่งคำสั่งใช้ item: packet 0x2f, [2f][item_id:4 LE][target:4 LE], target=FFFFFFFF (self)
  function sendUseItem(itemId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(9);
    b[0] = 0x2f;
    b[1] = itemId & 0xff; b[2] = (itemId >> 8) & 0xff;
    b[3] = (itemId >> 16) & 0xff; b[4] = (itemId >>> 24) & 0xff;
    b[5] = 0xff; b[6] = 0xff; b[7] = 0xff; b[8] = 0xff;   // target = FFFFFFFF (self)
    activeWS.send(b);
    return true;
  }

  // ตัวเช็ค HP และใช้ยา
  const healLoop = setInterval(() => {
    if (!CFG.healEnabled) return;
    // ★★ GUARD สำคัญ: ถ้าไม่มี item heal เลย → ห้ามทำอะไร (กันส่ง packet 0x2f ปลอม → ถูกตรวจจับเป็นบอท)
    if (!CFG.healItems.length) return;
    const now = Date.now();
    const pct = hpPct();
    if (pct == null || hp.cur == null) return;            // ยังไม่รู้ HP
    if (isDead) return;                                   // ★ ตายอยู่ → ห้าม heal
    if (isResting) return;                                // ★ กำลังนั่งพัก → ข้าม heal (ใช้ regen แทน ประหยัดยา)

    // ★ เช็คผลของ item ที่ใช้ครั้งก่อน — ฐานความจริงลำดับ: HP เพิ่ม > inventory หมด > ของถูกหัก > HP ไม่ขยับ
    //   ★★ กันกดยารัว (เคส gfix): server ส่ง 0x25 HP ช้า/เฉพาะตอนโดนดาเมจ → HP ค้าง
    //      เดิมตีความ "HP ไม่ขยับ = ยาหมด" ทันที → ไล่ mark ทุกขวด + ใช้ต่อเนื่องจนของหมด
    //      ตอนนี้: ถ้า server หักของออกจาก inventory (0x32) = ยาถูกใช้จริง → ไม่ mark ว่าหมด รอ delay ปกติ
    if (heal.pendingItemId != null && heal.pendingHpBefore != null &&
        now - heal.pendingCheckAt >= CFG.healItemEffectCheckMs) {
      const cntBefore = heal.pendingCountBefore;
      const cntNow = inventory.has(heal.pendingItemId) ? inventory.get(heal.pendingItemId) : null;
      const consumed = (cntBefore != null && cntNow != null && cntNow < cntBefore);
      if (hp.cur > heal.pendingHpBefore + 1) {
        // ★ ยาได้ผล — HP เพิ่มขึ้น
        heal._clear();
      } else if (cntNow === 0 && cntBefore > 0) {
        // ★★ ของหมดจริง (0x32 เห็น 0) → mark แล้วไปตัวถัดไปทันที
        log('💊', nameOf(heal.pendingItemId), 'หมด (inventory = 0)');
        heal.markExhausted(heal.pendingItemId, now);
        heal.lastUseAt = 0;
        heal._clear();
      } else if (consumed) {
        // ★★ server หักของแล้ว = ยาถูกใช้จริง — HP echo ช้า (gfix) → ไม่ mark หมด รอ healDelayMs ปกติแล้วใช้ใหม่ได้
        heal._clear();
      } else if (hpStatAt >= heal.pendingCheckAt) {
        // ★ มี HP ใหม่จาก server แล้ว + ของไม่หาย = ถูกปฏิเสธ → mark เดิม
        log('💊', nameOf(heal.pendingItemId), 'หมด (ใช้แล้ว HP ไม่ขยับ) → ใช้ตัวถัดไป');
        heal.markExhausted(heal.pendingItemId, now);
        heal.lastUseAt = 0;
        heal._clear();
      } else if (now - heal.pendingCheckAt > 5000) {
        // ★ รอเกิน 5 วิ ไม่มีข้อมูลอะไรเลย — ยอมแพ้ เคลียร์ pending (ไม่ mark) ไปรอบหน้า
        heal._clear();
      } else {
        // ★★ ยังไม่มีข้อมูลพอ — จบรอบนี้: ห้ามสรุปว่ายาหมด ห้ามใช้ตัวถัดไป (รอบหน้าค่อยเช็คอีก)
        return;
      }
    }

    // เงื่อนไขการใช้ยา — ใช้ได้เลยถ้า HP ยังต่ำ + ผ่าน delay (ไม่ต้องรอ pending เคลียร์)
    const belowThreshold = pct < CFG.healAtPercent;
    const notFull = CFG.healAtMax ? (hp.cur < hp.max) : belowThreshold;
    if (!notFull) return;
    if (now - heal.lastUseAt < Math.max(CFG.healDelayMs, 500)) return;   // throttle — floor 500ms กันค่าตั้งต่ำไปเผาของทั้งกระเป๋า

    const id = heal.pickNext(now);
    if (id == null) {
      // ทุกตัว mark ว่าหมดอยู่ → log ครั้งเดียวเมื่อเริ่มหมด (กัน spam)
      if (!heal.allExhaustedLogged) {
        log('⚠️ item heal ทุกตัวหมด/ไม่ได้ผล — รอเก็บ/ซื้อเพิ่ม');
        heal.allExhaustedLogged = true;
      }
      return;
    }
    heal.allExhaustedLogged = false;
    if (sendUseItem(id)) {
      heal.lastUseAt = now;
      heal.pendingItemId = id;
      heal.pendingHpBefore = hp.cur;                      // จำ HP ก่อนใช้ เพื่อเช็คผล
      heal.pendingCountBefore = inventory.has(id) ? inventory.get(id) : null;   // ★ จำจำนวนของก่อนใช้
      heal.pendingCheckAt = now;
      log('💉 ใช้', nameOf(id), `@ HP ${hp.cur}/${hp.max} (${pct.toFixed(0)}%)`, heal.pendingCountBefore != null ? '(มี ' + heal.pendingCountBefore + ')' : '');
    }
  }, CFG.healCheckMs);

  // ============================================================
  //  AUTO-BUFF — ใช้ไอเทมบัพเป็นระยะ (timer mode, mirror bot.js _maybeBuff:3505-3558)
  //    แต่ละ item มี intervalMin ของตัวเอง → ใช้ซ้ำเมื่อครบเวลา
  //    เก็บ lastBuffUse ข้าม session → refresh หน้าแล้ว buff ยังจำเวลาเดิม
  // ============================================================
  // ============================================================
  //  AUTO-BUFF OTHERS — บอทบัพให้ผู้เล่นอื่น (buffMode skills)
  //  ค้นผู้เล่นรอบตัว → ผ่านเงื่อนไข (ทุกคน/รายชื่อ + ระยะ + delay ซ้ำต่อคน) → ส่ง [1d][01]+playerId
  //  ★ แยกจาก combatLoop — ยืน Guard อยู่ก็บัพได้ ไม่ต้องมีมอน/ตีอะไร (เหมาะกับบอทบัพประจำจุด)
  //  ★ packet ยืนยันจาก capture จริง: Heal Lv10 กับ superogira0 = [1d][01][playerId:4][41][0a]
  // ============================================================
  const buffOthersLoop = setInterval(() => {
    if (chatPauseActive) return;
    if (!CFG.buffOthersEnabled) return;   // ★★ toggle เฉพาะ — default OFF ต้องเปิดเอง (กันบัพมั่ว)
    if (!CFG.skillEnabled || !CFG.skills || !CFG.skills.length) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    if (playerId == null) return;              // ต้องรู้ id ตัวเอง (ส่ง targetId)
    const knowPos = player.x != null;          // ★ ไม่รู้ตำแหน่ง → ค้นคนอื่นไม่ได้ แต่บัพตัวเองยังทำได้
    const now = nowMs();
    const disabled = Array.isArray(CFG.disabledSkillIds) ? CFG.disabledSkillIds : [];
    // ★★ SP-rest hysteresis — แก้ "บัพจน SP ต่ำแต่ไม่นั่งพัก":
    //   เดิม SP gate ของบัพเป็นค่า flat (spMin) ไม่ใช่ % → ช่วง spMin-ถึง-restSpPercent
    //   วน นั่ง→ลุกบัพ→นั่ง รัว ๆ SP ไม่เคยฟื้น (และการลุกไม่ set lastRestStandAt = นั่งซ้ำทันที)
    //   → SP% < restSpPercent: หยุดบัพทั้งหมด ให้ระบบพักนั่งจน SP% ≥ restUntilPercent ค่อยกลับมาบัพ
    if (CFG.restEnabled && CFG.restSpPercent > 0 && sp.cur != null && sp.max > 0) {
      const spPP = (sp.cur / sp.max) * 100;
      if (!buffSpResting && spPP < CFG.restSpPercent) {
        buffSpResting = true;
        log('🪑 SP', spPP.toFixed(0) + '% < ' + CFG.restSpPercent + '% → หยุดบัพ นั่งพักจน SP ' + CFG.restUntilPercent + '%');
      } else if (buffSpResting && spPP >= CFG.restUntilPercent) {
        buffSpResting = false;
        log('🪑 SP ฟื้น', spPP.toFixed(0) + '% ≥ ' + CFG.restUntilPercent + '% → กลับมาบัพต่อ');
      }
    }
    if (buffSpResting) return;   // กำลังพัก SP → ไม่หาเพื่อบัพ (ไม่ลุก)
    // ★ diagnostic — ทำไมไม่บัพ (เห็นผู้เล่นกี่คน / ตกมากี่เงื่อนไข) ทุก 5s ไป Debug log
    let _dbSeen = 0, _dbNameOk = 0, _dbRange = 0, _dbReady = 0, _dbHpOk = 0;
    for (const skill of CFG.skills) {
      if (!skill || !skill.buffMode || skill.skillId == null) continue;
      if (disabled.includes(skill.skillId)) continue;
      // cooldown ระหว่าง cast (สั้น ๆ กันยิงรัว)
      const lastUse = lastSkillUse.get(skill.skillId) || 0;
      const cooldown = skill.cooldownMs ?? 2000;
      if (now - lastUse < cooldown) continue;
      // SP gate
      const spMin = skill.spMin ?? 0;
      if (spMin > 0 && sp.cur != null && sp.cur < spMin) continue;
      // ★★ HP เป้าหมาย gate — Heal ให้คนอื่นเฉพาะเมื่อ HP คนนั้นต่ำกว่าเกณฑ์
      //   (targetHpBelowPct > 0 · 0/ว่าง = ไม่สน เหมาะกับบัพ Blessing ที่ให้ได้ตลอด)
      //   HP คนนั้นมาจาก SPAWN + อัปเดตจาก stat packet — ไม่รู้ค่า = ข้าม (กัน Heal คนเลือดเต็ม)
      const tgtHpBelow = Number(skill.targetHpBelowPct) || 0;
      // ★ ค้นผู้เล่นเป้าหมาย: kind=0 มีชื่อ ไม่ใช่เรา ไม่ใช่ ghost/beacon ปลอม
      const radius = skill.maxDistance > 0 ? skill.maxDistance : 9;
      const names = Array.isArray(skill.buffNames) ? skill.buffNames.map(n => String(n).toLowerCase().trim()).filter(Boolean) : [];
      const wantAll = skill.buffAll !== false && names.length === 0;   // default: ทุกคน (ถ้าไม่ได้ตั้งชื่อ)
      let best = null, bestD = Infinity;
      // ★★ รวมตัวเองเป็นผู้สมัครก่อนค้นคนอื่น — แก้ "บัพตัวเองไม่ทำงานถ้าไม่มีใครเข้ามา":
      //   เดิมบล็อกนี้อยู่หลัง if (!best) continue = ไม่เจอใคร → ข้ามทั้งสกิล → ตัวเองไม่ได้บัพ
      //   ★★ targetHpBelowPct คุมตัวเองด้วย — แก้ "Heal ตัวเองรัว ๆ ทั้งที่ HP เต็ม"
      //   (เดิม self ไม่สน HP เป้าหมาย = ยิงตามรอบ delay อย่างเดียว · HP เต็ม/ไม่รู้ค่า = ข้าม)
      if (skill.buffIncludeSelf) {
        let selfHpOk = true;
        if (tgtHpBelow > 0) {
          const spct = hpPct();
          selfHpOk = spct != null && spct < tgtHpBelow;
        }
        if (selfHpOk) {
          const perSkill2 = buffTargetUse.get(skill.skillId);
          const lastSelf = perSkill2 ? (perSkill2.get(playerId) || 0) : 0;
          const repeatMs2 = (Number(skill.repeatSec) > 0 ? Number(skill.repeatSec) : 300) * 1000;
          if (!(lastSelf > 0 && now - lastSelf < repeatMs2)) { best = { id: playerId, name: '(ตัวเอง)', x: player.x, y: player.y }; bestD = 0; }
        }
      }
      if (knowPos) {
      for (const e of entities.values()) {
        if (e.kind !== 0 || !e.alive || e.x == null || e.y == null) continue;
        if (e.id === playerId) continue;
        if (isStaleId(e.id, now)) continue;
        if (!e.name || !e.name.trim()) continue;          // ต้องมีชื่อจาก SPAWN (ไม่ใช่ dot ผี)
        _dbSeen++;
        if (!wantAll && !names.some(n => e.name.toLowerCase().includes(n))) continue;
        _dbNameOk++;
        // ★★ บัพตามคำขอ — ตั้ง buffChatKeyword ไว้ = ผู้เล่นต้องพิ่งแชทคำนั้นมา (ภายใน 60 วิ) ถึงจะบัพให้
        //   เช็คแบบ contains + ไม่สน case ("w heal" ตรงกับ "heal") · ว่าง = ไม่เช็ค (บัพตามเงื่อนไขอื่นอย่างเดียว)
        const chatKw = String(skill.buffChatKeyword || '').trim().toLowerCase();
        if (chatKw) {
          const cr = chatReqBy.get(e.name.trim().toLowerCase());
          if (!cr || now - cr.at > 60000 || !cr.msg.toLowerCase().includes(chatKw)) continue;
        }
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d > radius) continue;
        _dbRange++;
        if (tgtHpBelow > 0) {
          const tpct = (e.hp != null && e.hpMax > 0) ? (e.hp / e.hpMax) * 100 : null;
          if (tpct == null || tpct >= tgtHpBelow) continue;   // เลือดเต็ม/ไม่รู้ค่า → ไม่ Heal
        }
        _dbHpOk++;
        // delay ซ้ำต่อคน: ยังไม่ครบ repeatSec → ข้าม
        const perSkill = buffTargetUse.get(skill.skillId);
        const lastFor = perSkill ? (perSkill.get(e.id) || 0) : 0;
        const repeatMs = (Number(skill.repeatSec) > 0 ? Number(skill.repeatSec) : 300) * 1000;
        if (lastFor > 0 && now - lastFor < repeatMs) continue;
        _dbReady++;
        if (d < bestD) { bestD = d; best = e; }
      }
      }   // ★ จบ if (knowPos) — ไม่รู้ตำแหน่ง = ข้ามการค้นคนอื่น (ยังมีตัวเองเป็นผู้สมัครอยู่)
      if (now - (skill._lastBuffDbgAt || 0) > 5000) {
        skill._lastBuffDbgAt = now;
        dbg('🤝 buff scan: ' + (skill.name || skill.skillId) + ' — เห็นผู้เล่น ' + _dbSeen + ' · ผ่านชื่อ ' + _dbNameOk + ' · ในระยะ ' + _dbRange + (tgtHpBelow > 0 ? ' · HPเป้า<' + tgtHpBelow + '% ' + _dbHpOk : '') + ' · พร้อมบัพ ' + _dbReady + (best ? ' → ' + best.name : ' (ยังไม่มีเป้า)') + (knowPos ? '' : ' [ไม่รู้ตำแหน่ง—เฉพาะตัวเอง]'));
        _dbSeen = _dbNameOk = _dbRange = _dbReady = _dbHpOk = 0;
      }
      if (!best) continue;
      // ★★ กำลังนั่งพักอยู่ → ลุกมาบัพก่อน (SP ไม่ต้องฟื้นครบ — บัพเสร็จค่อยนั่งใหม่)
      //   ★ set lastRestStandAt ด้วย — กัน combatLoop นั่งซ้ำทันที (เดิมลืม set → นั่ง-ลุก flapping รัว ๆ)
      if (isResting) {
        if (sendStand()) { log('🪑 ลุกยืน: มี ' + (best.name || 'ผู้เล่น') + ' รอบัพ — บัพก่อนแล้วค่อยพักต่อ'); }
        isResting = false;
        lastRestStandAt = now;
      }
      // ★ ส่งสกิลให้ผู้เล่น — เลือก format ตามชนิดสกิล:
      //   ปกติ (Heal/Blessing): [1d][01][playerId:4][skillId:1][level:1] — ยืนยันจาก capture จริง
      //   สกิลพื้นที่ (Sanctuary/Pneuma/Safety Wall): [1d][04][x:2][y:2][skillId:1][level:1]
      //     ★★ ต้องส่ง "พิกัดของผู้เล่นเป้าหมาย" ไม่ใช่ playerId (เดิมส่ง targeted เสมอ = ground skill พัง)
      const isGroundBuff = !!skill.ground;
      if (isGroundBuff && (best.x == null || best.y == null)) continue;   // ★ ground skill ต้องรู้พิกัดเป้า — ไม่รู้ = รอ tick หน้า
      if (sendSkill(skill.skillId, skill.level || 1,
                    isGroundBuff ? null : best.id,
                    isGroundBuff ? Math.round(best.x) : null,
                    isGroundBuff ? Math.round(best.y) : null)) {
        lastSkillUse.set(skill.skillId, now);
        saveSkillTimesDebounced();
        if (!buffTargetUse.has(skill.skillId)) buffTargetUse.set(skill.skillId, new Map());
        buffTargetUse.get(skill.skillId).set(best.id, now);
        log('🤝 บัพให้', best.name + ':', skill.name || ('id=' + skill.skillId), 'Lv' + (skill.level || 1),
            isGroundBuff ? ('@ พื้น(' + Math.round(best.x) + ',' + Math.round(best.y) + ')') : ('@ dist ' + bestD.toFixed(1)),
            '(sp ' + (sp.cur != null ? sp.cur : '?') + ')');
        break;   // ทีละสกิลต่อ tick
      }
    }
  }, 1000);

  // ============================================================
  //  BUFF VISIT — บอทฟาร์มย้อนกลับไปรับบัพจากบอทบัพ (คู่บอท)
  //  IDLE(ครบกำหนด) → GOING(เดินถ้าใกล้/วาร์ปถ้าไกลหรือคนละแมป) → WAITING(ยืนรับ) → RETURN(กลับจุดฟาร์มเดิม)
  //  ★ จดจุดฟาร์มก่อนออก → รับเสร็จวาร์ปกลับแมป+พิกัดเดิม · gates: ไม่ชน sell/storage/rest/loot/เป้า
  // ============================================================
  let buffVisitState = 'IDLE';
  let buffVisitLastAt = 0;
  let buffVisitWaitUntil = 0;
  let buffVisitReturnTo = null;
  let buffVisitLastMoveAt = 0;
  let buffVisitLastWarpAt = 0;
  const buffVisitLoop = setInterval(() => {
    if (chatPauseActive && buffVisitState === 'IDLE') return;
    if (!CFG.buffVisitEnabled) return;
    if (typeof unstuckBuffAutoFinishPending !== 'undefined' && unstuckBuffAutoFinishPending) return; // ★ v4.189.0 AB Auto รอปิดงานมอนล่าสุด
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    if (playerId == null || player.x == null || !currentMap) return;
    if (sellState !== 'IDLE' || storageState !== 'IDLE') return;   // ห้ามชน routine
    if (typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE') return; // AB Refresh เป็นเจ้าของตัวละคร
    const now = nowMs();

    if (buffVisitState === 'IDLE') {
      if (!CFG.buffVisitMap) return;
      if (buffVisitLastAt === 0) { buffVisitLastAt = now; return; }   // เริ่มจับเวลาตอนเปิด (ไม่ยิงทันที)
      if (now - buffVisitLastAt < CFG.buffVisitIntervalSec * 1000) return;
      // ★★ ไปเฉพาะตอนว่างจริง: ไม่นั่งพัก / ไม่มีเป้า / ไม่โดนรุม / ของเก็บหมด / ไม่เดินตาม remote
      if (isResting || target || getMobAttackerCount() > 0) return;
      if (queue.size > 0 || warpQueue.size > 0) return;
      // ★ จดจุดฟาร์มปัจจุบัน (กลับมาเดิมหลังรับบัพ)
      buffVisitReturnTo = { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
      buffVisitState = 'GOING';
      buffVisitLastWarpAt = 0;
      const dV = Math.hypot(player.x - CFG.buffVisitX, player.y - CFG.buffVisitY);
      log('🔁 ครบกำหนดรับบัพ →', currentMap === CFG.buffVisitMap ? 'เดิน' : 'วาร์ป', 'ไปหาบอทบัพ', CFG.buffVisitMap, '@(', CFG.buffVisitX + ',' + CFG.buffVisitY + ')', currentMap === CFG.buffVisitMap ? '(ห่าง ' + dV.toFixed(0) + ' ช่อง)' : '');
      return;
    }

    if (buffVisitState === 'GOING') {
      if (currentMap === CFG.buffVisitMap) {
        const d = Math.hypot(player.x - CFG.buffVisitX, player.y - CFG.buffVisitY);
        if (d <= 4) {   // ★ ถึงจุดรับบัพ (ยืนใกล้บอทบัพให้อยู่ในรัศมีบัพ)
          buffVisitState = 'WAITING';
          buffVisitWaitUntil = now + CFG.buffVisitWaitSec * 1000;
          log('🔁 ถึงจุดรับบัพ — ยืนรอบอทบัพ', CFG.buffVisitWaitSec, 'วิ');
          return;
        }
        if (d > 60) {   // แมปเดียวกันแต่ไกล → วาร์ปเข้าใกล้
          if (now - buffVisitLastWarpAt > 5000) { buffVisitLastWarpAt = now; sendTeleport(CFG.buffVisitMap, CFG.buffVisitX, CFG.buffVisitY); }
          return;
        }
        if (now - buffVisitLastMoveAt > 1200) { buffVisitLastMoveAt = now; sendMove(CFG.buffVisitX, CFG.buffVisitY); }   // ใกล้ → เดิน
        return;
      }
      // ★ ผิดแมป (ยังไม่ถึง / วาร์ปล้ม) → วาร์ปไปแมปบัพ (ผ่าน teleport serializer)
      if (now - buffVisitLastWarpAt > 5000) { buffVisitLastWarpAt = now; sendTeleport(CFG.buffVisitMap, CFG.buffVisitX, CFG.buffVisitY); }
      return;
    }

    if (buffVisitState === 'WAITING') {
      // ★ ยืนรอรับบัพ — จนครบเวลา → กลับ (บอทบัพ Heal/Buff ใส่เราเองระหว่างนี้)
      if (now >= buffVisitWaitUntil) {
        buffVisitState = 'RETURN';
        buffVisitLastWarpAt = 0;
        log('🔁 รับบัพครบเวลา → กลับฟาร์ม', buffVisitReturnTo ? (buffVisitReturnTo.map + ' @(' + buffVisitReturnTo.x + ',' + buffVisitReturnTo.y + ')') : '');
      }
      return;
    }

    if (buffVisitState === 'RETURN') {
      if (!buffVisitReturnTo) { buffVisitState = 'IDLE'; buffVisitLastAt = now; return; }
      if (currentMap === buffVisitReturnTo.map) {
        const d = Math.hypot(player.x - buffVisitReturnTo.x, player.y - buffVisitReturnTo.y);
        if (d <= 4) {
          buffVisitState = 'IDLE';
          buffVisitLastAt = now;   // เริ่มนับรอบใหม่
          log('🔁 กลับจุดฟาร์มแล้ว — ทำงานต่อ (รอบหน้าอีก', CFG.buffVisitIntervalSec + 's)');
          return;
        }
        if (d > 60) {
          if (now - buffVisitLastWarpAt > 5000) { buffVisitLastWarpAt = now; sendTeleport(buffVisitReturnTo.map, buffVisitReturnTo.x, buffVisitReturnTo.y); }
          return;
        }
        if (now - buffVisitLastMoveAt > 1200) { buffVisitLastMoveAt = now; sendMove(buffVisitReturnTo.x, buffVisitReturnTo.y); }
        return;
      }
      if (now - buffVisitLastWarpAt > 5000) { buffVisitLastWarpAt = now; sendTeleport(buffVisitReturnTo.map, buffVisitReturnTo.x, buffVisitReturnTo.y); }
      return;
    }
  }, 1000);

  // ============================================================
  //  AB REFRESH VIA DIRECT UNSTUCK 0x73
  //  IDLE → DIRECT 0x73 → WAIT_RETURN_2S → RETURN
  //  ★ v4.188.1: จดแมป+พิกัดเดิม → Unstuck → ครบ 2 วิวาร์ปกลับทันที (ไม่รอ spawn/buff state)
  const UNSTUCK_RETURN_DELAY_MS = 2000;
  //  ★ ปุ่ม Unstuck เป็น Unity canvas จึง calibrate ตำแหน่งครั้งเดียวเป็น ratio (0..1)
  // ============================================================
  let unstuckBuffState = 'IDLE';
  let unstuckBuffLastAt = 0;
  let unstuckBuffManualRun = false;   // ★ v4.187.6: ▶ รับบัพตอนนี้ bypass Combat gate (explicit user action)
  let unstuckBuffReturnTo = null;
  let unstuckBuffStepAt = 0;
  let unstuckBuffWaitUntil = 0;
  let unstuckBuffSource = null;
  let unstuckBuffLastWarpAt = 0;
  let unstuckBuffNoPosWarned = false;
  // ★ v4.189.0 — เมื่อ AB Auto ครบเวลาระหว่างกำลังสู้: ปิดงาน target ปัจจุบัน + เก็บ loot ให้หมดก่อน Unstuck
  let unstuckBuffAutoFinishPending = false;
  let unstuckBuffFinishTargetId = null;
  let unstuckBuffLootSettleUntil = 0;
  function clearUnstuckBuffAutoFinishPending() {
    unstuckBuffAutoFinishPending = false;
    unstuckBuffFinishTargetId = null;
    unstuckBuffLootSettleUntil = 0;
  }
  let unstuckCaptureArmed = false;

  // ★★ v4.187.3 — จับ packet Unstuck จาก WebSocket OUT จริง (ไม่เดา opcode)
  let unstuckPacketCaptureActive = false;
  let unstuckPacketCaptureStartedAt = 0;
  let unstuckPacketCapturePackets = [];   // [{dt, opcode, len, hex}]
  let unstuckPacketCandidate = null;
  let unstuckPacketCaptureTimer = null;
  let unstuckPacketCaptureSnapshot = null;
  let unstuckPacketCaptureSource = null;
  const UNSTUCK_CAPTURE_MS = 12000;
  const UNSTUCK_CAPTURE_MAX = 40;

  function u8ToHex(u) {
    return Array.from(u || []).map(b => Number(b).toString(16).padStart(2, '0')).join(' ');
  }
  function hexToU8(hex) {
    try {
      const parts = String(hex || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length || parts.length > 512) return null;
      const vals = parts.map(x => parseInt(x, 16));
      if (vals.some(v => !Number.isFinite(v) || v < 0 || v > 255)) return null;
      return new Uint8Array(vals);
    } catch (_) { return null; }
  }

  // ★★ v4.189.20 — Kafra Cancel re-capture (temporary diagnostic)
  let kafraCancelCaptureActive = false;
  let kafraCancelCaptureStartedAt = 0;
  let kafraCancelCaptureClickAt = 0;
  let kafraCancelCaptureRecords = [];
  let kafraCancelCaptureTimer = null;
  let kafraCancelCaptureStopTimer = null;
  let kafraCancelCaptureSnapshot = null;
  const KAFRA_CANCEL_CAPTURE_MS = 15000;
  const KAFRA_CANCEL_CAPTURE_MAX = 120;

  function kafraCancelCaptureStatusText() {
    const head = kafraCancelCaptureActive
      ? '🔬 กำลังจับ Kafra Cancel — ตอนนี้กด Cancel ในเกม 1 ครั้ง'
      : 'สถานะ: ' + (kafraCancelCaptureRecords.length ? 'จับเสร็จแล้ว — ส่งภาพส่วนนี้มาให้ตรวจ' : 'รอเริ่มจับ packet');
    const rows = kafraCancelCaptureRecords.slice(-46).map(r => {
      if (r.kind === 'click') return '+' + r.dt + 'ms  🖱️ CLICK GAME @(' + r.x + ',' + r.y + ')  <<< CANCEL CLICK';
      const op = '0x' + r.opcode.toString(16).padStart(2,'0');
      const after = kafraCancelCaptureClickAt && r.abs >= kafraCancelCaptureClickAt ? '  ★AFTER-CLICK' : '';
      // OUT เก็บเต็มเพื่อวิเคราะห์คำสั่งจริง; IN ยาวมากตัดเฉพาะการแสดงผลแต่ record ภายในยังเต็ม
      const shown = r.dir === 'OUT' ? r.hex : (r.hex.length > 320 ? r.hex.slice(0,320) + ' …' : r.hex);
      return '+' + r.dt + 'ms  ' + r.dir + ' ' + op + ' len=' + r.len + after + ' [' + shown + ']';
    });
    return head + (rows.length ? '\n' + rows.join('\n') : '');
  }
  function updateKafraCancelCaptureUI() {
    const root = document.getElementById('__assist_root');
    if (!root) return;
    const el = root.querySelector('#__assist_kafra_cancel_capture_status');
    if (el) el.textContent = kafraCancelCaptureStatusText();
    const btn = root.querySelector('#__assist_kafra_cancel_capture');
    if (btn) btn.textContent = kafraCancelCaptureActive ? '⏹ หยุดจับ Kafra Cancel' : '🔬 จับ Kafra Cancel';
  }
  function captureKafraCancelPacket(dir, u) {
    if (!kafraCancelCaptureActive || !u || !u.length) return;
    const abs = nowMs();
    kafraCancelCaptureRecords.push({ kind:'packet', dir, abs, dt:Math.max(0, abs-kafraCancelCaptureStartedAt), opcode:u[0], len:u.length, hex:u8ToHex(u) });
    while (kafraCancelCaptureRecords.length > KAFRA_CANCEL_CAPTURE_MAX) kafraCancelCaptureRecords.shift();
    updateKafraCancelCaptureUI();
  }
  function pauseForKafraCancelCapture() {
    const keys = ['combatEnabled','lootEnabled','healEnabled','skillEnabled','buffEnabled','warpFindEnabled','wanderEnabled','fleeFromPlayers','restEnabled','warpLootEnabled'];
    kafraCancelCaptureSnapshot = {};
    for (const k of keys) { kafraCancelCaptureSnapshot[k] = CFG[k]; CFG[k] = false; }
    target = null; noMonsterSince = 0;
  }
  function restoreAfterKafraCancelCapture() {
    if (kafraCancelCaptureSnapshot) for (const [k,v] of Object.entries(kafraCancelCaptureSnapshot)) CFG[k] = v;
    kafraCancelCaptureSnapshot = null;
  }
  function stopKafraCancelCapture(reason) {
    if (!kafraCancelCaptureActive) return false;
    kafraCancelCaptureActive = false;
    if (kafraCancelCaptureTimer) { clearTimeout(kafraCancelCaptureTimer); kafraCancelCaptureTimer = null; }
    if (kafraCancelCaptureStopTimer) { clearTimeout(kafraCancelCaptureStopTimer); kafraCancelCaptureStopTimer = null; }
    document.removeEventListener('pointerdown', kafraCancelCaptureClickHandler, true);
    restoreAfterKafraCancelCapture();
    log('🏦🔬 จบ Kafra Cancel Capture (' + (reason || 'หยุด') + ') — ' + kafraCancelCaptureRecords.filter(r=>r.kind==='packet').length + ' packet');
    updateKafraCancelCaptureUI();
    return true;
  }
  function startKafraCancelCapture() {
    if (!activeWS || activeWS.readyState !== 1) { log('⚠️ Kafra Cancel Capture: ยังไม่ได้เชื่อม game WebSocket'); return false; }
    if (kafraCancelCaptureActive) { stopKafraCancelCapture('กดหยุด'); return true; }
    kafraCancelCaptureRecords = [];
    kafraCancelCaptureStartedAt = nowMs();
    kafraCancelCaptureClickAt = 0;
    kafraCancelCaptureActive = true;
    pauseForKafraCancelCapture();
    document.addEventListener('pointerdown', kafraCancelCaptureClickHandler, true);
    kafraCancelCaptureTimer = setTimeout(() => stopKafraCancelCapture('ครบ 15 วินาที'), KAFRA_CANCEL_CAPTURE_MS);
    log('🏦🔬 เริ่มจับ Kafra Cancel — กด Cancel ในเกม 1 ครั้ง (Auto Cancel ถูกปิดในเวอร์ชันทดลองนี้)');
    updateKafraCancelCaptureUI();
    return true;
  }
  function clearKafraCancelCapture() {
    if (kafraCancelCaptureActive) stopKafraCancelCapture('ล้าง');
    kafraCancelCaptureRecords = [];
    kafraCancelCaptureClickAt = 0;
    updateKafraCancelCaptureUI();
  }
  function kafraCancelCaptureClickHandler(e) {
    if (!kafraCancelCaptureActive) return;
    try { if (e.target && e.target.closest && e.target.closest('#__assist_root')) return; } catch (_) {}
    const abs = nowMs();
    kafraCancelCaptureClickAt = abs;
    kafraCancelCaptureRecords.push({ kind:'click', abs, dt:Math.max(0,abs-kafraCancelCaptureStartedAt), x:Math.round(e.clientX||0), y:Math.round(e.clientY||0) });
    while (kafraCancelCaptureRecords.length > KAFRA_CANCEL_CAPTURE_MAX) kafraCancelCaptureRecords.shift();
    updateKafraCancelCaptureUI();
    if (kafraCancelCaptureStopTimer) clearTimeout(kafraCancelCaptureStopTimer);
    kafraCancelCaptureStopTimer = setTimeout(() => stopKafraCancelCapture('เก็บหลังคลิกครบ 2500ms'), 2500);
  }
  // ★★ v4.189.29 — Market Index / parser จาก packet จริง
  const MARKET_INDEX_KEY = 'ro_assist_market_index_v1';
  const MARKET_INDEX_MAX_SHOPS = 0; // 0 = unlimited (v4.189.50)
  let marketShopIndex = new Map();      // key -> {map,vendorEntityId,responseShopId,shopName,sellerName,x,y,t,items}
  let marketLastOpenRequest = null;     // {entityId,t,source}
  let marketScanActive = false;
  let marketScanCancel = false;
  let marketScanWaiter = null;
  let marketScanSnapshot = null;
  let marketScanStatus = '';
  // ★ v4.189.44 — เดินไปจุดที่เคยเปิดร้านสำเร็จก่อนเปิดร้านที่เลือก
  let marketShopTravelActive = false;
  let marketShopTravelCancel = false;
  let marketPage = 1;
  const MARKET_PAGE_SIZE = 10;

  // ★ v4.189.37 — Auto Market Sweep
  let marketSweepActive = false;
  let marketSweepCancel = false;
  let marketSweepWaypoints = [];
  let marketSweepWaypointIdx = 0;
  let marketSweepCheckedIds = new Set();
  let marketSweepMode = ''; // 'saved' | 'pron-lower'
  const MARKET_SWEEP_MAX_WAYPOINTS = 260;
  const MARKET_SWEEP_RECENT_MS = 10000;
  // ★ v4.189.41 — ล้าง Sweep Zone เก่าที่เคยเก็บจาก v4.189.39
  try { localStorage.removeItem('ro_assist_market_sweep_zones_v1'); } catch (_) {}

  // ★ v4.189.47 — Saved Points + Built-in Market Presets
  // Saved Points = จุดที่ผู้ใช้บันทึกเอง (แก้/ล้างได้)
  // Preset = จุด Built-in ในสคริปต์ (ล้าง Saved Points แล้วไม่หาย)
  const MARKET_ROUTE_KEY = 'ro_assist_market_saved_points_v1';
  const MARKET_DEFAULT_POINTS_SEED_KEY = 'ro_assist_market_saved_points_defaults_seed_v1'; // legacy cleanup only
  const MARKET_BUILTIN_SWEEP_PRESETS = {
    prt_fild08: {
      id: 'pron-lower',
      name: 'กวาดตลาดล่างพรอน',
      points: [{"x":122,"y":371},{"x":121,"y":365},{"x":122,"y":350},{"x":122,"y":342},{"x":122,"y":330},{"x":124,"y":318},{"x":134,"y":314},{"x":137,"y":324},{"x":136,"y":336},{"x":136,"y":348},{"x":137,"y":360},{"x":137,"y":372},{"x":147,"y":373},{"x":148,"y":365},{"x":148,"y":353},{"x":149,"y":341},{"x":149,"y":333},{"x":148,"y":325},{"x":153,"y":319},{"x":156,"y":333},{"x":155,"y":341},{"x":153,"y":353},{"x":155,"y":365},{"x":156,"y":373},{"x":165,"y":365},{"x":164,"y":357},{"x":166,"y":353},{"x":168,"y":345},{"x":167,"y":337},{"x":168,"y":329},{"x":177,"y":324},{"x":180,"y":334},{"x":180,"y":346},{"x":180,"y":358},{"x":179,"y":366},{"x":183,"y":374},{"x":186,"y":370},{"x":186,"y":363},{"x":186,"y":351},{"x":187,"y":343},{"x":191,"y":335},{"x":192,"y":323},{"x":200,"y":346}]
    }
  };
  let marketRoutes = {};
  function marketNormalizeRouteMapName(mapName) {
    return String(mapName || '').split('\0')[0].trim().replace(/\.gat$/i, '');
  }
  function marketCleanRouteArray(arr) {
    return Array.isArray(arr) ? arr.filter(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))).map(p=>({x:Math.round(Number(p.x)),y:Math.round(Number(p.y))})) : [];
  }
  function marketPresetForMap(mapName=currentMap) {
    const key=marketNormalizeRouteMapName(mapName);
    const p=key && MARKET_BUILTIN_SWEEP_PRESETS[key];
    if(!p) return null;
    return { id:p.id, name:p.name, map:key, points:marketCleanRouteArray(p.points) };
  }
  function marketPresetRoute(mapName=currentMap) {
    const p=marketPresetForMap(mapName);
    return p ? p.points : [];
  }
  function marketCustomRoute(mapName=currentMap) {
    const key=marketNormalizeRouteMapName(mapName);
    return marketCleanRouteArray(key && marketRoutes[key]);
  }
  function marketLoadRoutes() {
    try {
      const x=JSON.parse(localStorage.getItem(MARKET_ROUTE_KEY)||'{}');
      if(x&&typeof x==='object') marketRoutes=x;
      let changed=false;
      for(const k of Object.keys(marketRoutes)){
        const nk=marketNormalizeRouteMapName(k);
        if(!nk || nk===k) continue;
        if(!Array.isArray(marketRoutes[nk]) || !marketRoutes[nk].length) marketRoutes[nk]=marketRoutes[k];
        delete marketRoutes[k]; changed=true;
      }
      if(changed) marketSaveRoutes();
    } catch(_) { marketRoutes={}; }
  }
  function marketSaveRoutes() { try { localStorage.setItem(MARKET_ROUTE_KEY, JSON.stringify(marketRoutes)); } catch(_) {} }
  function marketCleanupLegacyDefaultSeed() {
    try { localStorage.removeItem(MARKET_DEFAULT_POINTS_SEED_KEY); } catch(_) {}
  }
  function marketGetRecordedRoute(mapName=currentMap) {
    return marketCustomRoute(mapName);
  }
  function marketAddSavedPoint() {
    if(marketSweepActive || marketScanActive){ marketScanStatus='หยุด Scan/Sweep ก่อนบันทึกจุด'; updateMarketUI(); return false; }
    if(!currentMap || player.x==null || player.y==null){ log('⚠️ Market Point: ยังไม่รู้แมป/พิกัดตัวละคร'); return false; }
    const x=Math.round(player.x), y=Math.round(player.y);
    const mapKey=marketNormalizeRouteMapName(currentMap);
    if(!mapKey){ marketScanStatus='ยังไม่รู้ชื่อแมพ'; updateMarketUI(); return false; }
    let arr=marketRoutes[mapKey];
    if(!Array.isArray(arr)){ arr=[]; marketRoutes[mapKey]=arr; }
    if(arr.some(p=>Math.hypot(Number(p.x)-x,Number(p.y)-y)<2)){
      marketScanStatus='ℹ️ จุดนี้มีอยู่แล้ว @('+x+','+y+')'; updateMarketUI(); return false;
    }
    arr.push({x,y});
    if(arr.length>300) arr.splice(0,arr.length-300);
    marketSaveRoutes();
    marketScanStatus='📍 บันทึกจุด '+arr.length+' @('+x+','+y+')';
    log('📍 Market Point #'+arr.length+' '+currentMap+' @('+x+','+y+')');
    updateMarketUI(); return true;
  }
  function marketRemoveLastSavedPoint() {
    if(marketSweepActive || marketScanActive){ marketScanStatus='หยุด Scan/Sweep ก่อนแก้จุด'; updateMarketUI(); return false; }
    const mapKey=marketNormalizeRouteMapName(currentMap);
    const arr=mapKey && marketRoutes[mapKey];
    if(!Array.isArray(arr)||!arr.length){ marketScanStatus='ยังไม่มีจุดให้ลบ'; updateMarketUI(); return false; }
    const p=arr.pop(); if(!arr.length) delete marketRoutes[mapKey]; marketSaveRoutes();
    marketScanStatus='↩ ลบจุดล่าสุด @('+Math.round(p.x)+','+Math.round(p.y)+') แล้ว';
    log('↩ Market Point: ลบจุดล่าสุด '+currentMap+' @('+Math.round(p.x)+','+Math.round(p.y)+')');
    updateMarketUI(); return true;
  }
  function marketClearRecordedRoute(mapName=currentMap) {
    if(marketSweepActive || marketScanActive){ marketScanStatus='หยุด Scan/Sweep ก่อนล้างจุด'; updateMarketUI(); return false; }
    const mapKey=marketNormalizeRouteMapName(mapName);
    const count=marketCustomRoute(mapKey).length;
    if(mapKey && marketRoutes[mapKey]){ delete marketRoutes[mapKey]; marketSaveRoutes(); }
    marketScanStatus='🧹 ล้างจุดบันทึก '+count+' จุดของ '+(mapKey||'?')+' แล้ว · Preset ไม่ถูกลบ';
    log('🧹 Market Point: ล้าง Saved Points '+count+' จุด · '+(mapKey||'?')); updateMarketUI(); return true;
  }
  function marketBuildRouteWaypoints(points,maxPoints=300) {
    const pts=marketCleanRouteArray(points); if(!pts.length) return [];
    maxPoints=Math.max(1,Math.min(300,Number(maxPoints)||300));
    if(pts.length<=maxPoints) return pts.slice();
    const stride=Math.max(1,Math.ceil(pts.length/maxPoints)), out=[];
    for(let i=0;i<pts.length;i+=stride) out.push(pts[i]);
    const last=pts[pts.length-1]; if(!out.length||out[out.length-1].x!==last.x||out[out.length-1].y!==last.y) out.push(last);
    return out;
  }
  marketLoadRoutes();
  marketCleanupLegacyDefaultSeed();

  // ★ v4.189.30 — Shop-ID discovery
  // Shop open id (OUT 0x6b + u32) ไม่ใช่ player entity id; ต้องเรียนรู้จาก packet ที่ประกาศร้านตอนเข้าแมป
  const MARKET_DISCOVERY_KEY = 'ro_assist_market_shopid_signature_v1';
  const MARKET_PROBE_MAX = 2600;
  const MARKET_PROBE_TTL_MS = 180000;
  let marketProbePackets = [];          // {t,map,op,len,data}
  let marketShopIdSignature = null;     // {op,offset,fromEnd?,support,learnedAt}
  let marketSignatureEvidence = new Map(); // key -> Set(shopOpenId)
  let marketKnownOpenIds = new Set();

  function marketLoadDiscovery() {
    try {
      const x = JSON.parse(localStorage.getItem(MARKET_DISCOVERY_KEY) || 'null');
      if (x && Number.isInteger(x.op) && Number.isInteger(x.offset)) marketShopIdSignature = x;
    } catch (_) {}
    try {
      for (const sh of marketShopIndex.values()) if (sh && sh.vendorEntityId) marketKnownOpenIds.add(Number(sh.vendorEntityId) >>> 0);
    } catch (_) {}
  }
  function marketSaveDiscovery() {
    try { if (marketShopIdSignature) localStorage.setItem(MARKET_DISCOVERY_KEY, JSON.stringify(marketShopIdSignature)); } catch (_) {}
  }
  function marketProbeRemember(u) {
    if (!u || !u.length) return;
    // เก็บ packet ขาเข้าแบบ ring-buffer ตั้งแต่ document-start เพื่อใช้หาแหล่ง shopOpenId หลังผู้ใช้เปิดร้าน 1 ครั้ง
    try {
      const now = Date.now();
      marketProbePackets.push({ t: now, map: currentMap || '', op: u[0], len: u.length, data: new Uint8Array(u) });
      if (marketProbePackets.length > MARKET_PROBE_MAX) marketProbePackets.splice(0, marketProbePackets.length - MARKET_PROBE_MAX);
      while (marketProbePackets.length && now - marketProbePackets[0].t > MARKET_PROBE_TTL_MS) marketProbePackets.shift();
    } catch (_) {}
  }
  function marketU32LEBytes(id) { id >>>= 0; return [id&255,(id>>>8)&255,(id>>>16)&255,(id>>>24)&255]; }
  function marketFindIdHits(id) {
    const b = marketU32LEBytes(id), hits=[];
    for (const rec of marketProbePackets) {
      const u=rec.data; if (!u || u.length < 5) continue;
      for (let o=1; o<=u.length-4; o++) {
        if (u[o]===b[0] && u[o+1]===b[1] && u[o+2]===b[2] && u[o+3]===b[3]) {
          hits.push({op:rec.op,offset:o,len:rec.len,fromEnd:rec.len-(o+4),t:rec.t,map:rec.map});
        }
      }
    }
    return hits;
  }
  function marketLearnShopIdSource(id) {
    id = Number(id) >>> 0; if (!id) return;
    marketKnownOpenIds.add(id);
    const hits = marketFindIdHits(id);
    if (!hits.length) {
      dbg('🔎 Market Discovery: shopOpenId '+id.toString(16)+' ไม่พบใน probe ย้อนหลัง — น่าจะเริ่มเก็บหลังเข้าแมปแล้ว');
      return;
    }
    // ตัด packet noise ที่เราใช้เป็น movement/stat/radar อยู่แล้วก่อน; ถ้าเหลือว่างค่อยใช้ทั้งหมด
    let useful = hits.filter(h => ![0x07,0x25,0x3c,0x33,0x0d,0x0f].includes(h.op));
    if (!useful.length) useful = hits;
    for (const h of useful) {
      for (const mode of ['start','end']) {
        const off = mode==='start' ? h.offset : h.fromEnd;
        const key = h.op+':'+mode+':'+off;
        let set=marketSignatureEvidence.get(key); if(!set){set=new Set();marketSignatureEvidence.set(key,set);} set.add(id);
      }
    }
    // เลือก signature support สูงสุด; 1 ร้านใช้ provisional ได้ ถ้าผล candidate ไม่บวม, 2 ร้านขึ้นไปถือว่ายืนยัน
    let best=null;
    for (const [key,set] of marketSignatureEvidence) {
      const [opS,mode,offS]=key.split(':'); const cand={op:Number(opS),mode,offset:Number(offS),support:set.size};
      if (!best || cand.support>best.support) best=cand;
    }
    if (best) {
      const discovered = marketDiscoverIdsBySignature(best, 400);
      if (best.support >= 2 || (best.support >= 1 && discovered.length >= 2 && discovered.length <= 250)) {
        marketShopIdSignature={op:best.op,mode:best.mode,offset:best.offset,support:best.support,learnedAt:Date.now()};
        marketSaveDiscovery();
        marketScanStatus='เรียนรู้ Shop ID แล้ว · พบ candidate '+discovered.length+' ร้าน';
        log('✅ Market Discovery: signature IN 0x'+best.op.toString(16).padStart(2,'0')+' '+best.mode+'@'+best.offset+' · support '+best.support+' · candidate '+discovered.length);
      } else {
        marketScanStatus='กำลังเรียนรู้ Shop ID ('+best.support+'/2) · เปิดร้านอีก 1 ร้าน';
        log('🧭 Market Discovery: เจอ candidate signature แล้ว — เปิดร้านอีก 1 ร้านเพื่อยืนยัน');
      }
      renderMarketIndexUI();
    }
  }
  function marketReadIdBySignature(rec, sig) {
    if (!rec || !sig || rec.op!==sig.op || !rec.data) return 0;
    const u=rec.data;
    const off = sig.mode==='end' ? (u.length - 4 - sig.offset) : sig.offset;
    if (off < 1 || off+4>u.length) return 0;
    return u32(u, off) >>> 0;
  }
  function marketDiscoverIdsBySignature(sig, limit=300) {
    const out=[], seen=new Set(); const now=Date.now();
    for (const rec of marketProbePackets) {
      if (now-rec.t > MARKET_PROBE_TTL_MS) continue;
      if (currentMap && rec.map && rec.map!==currentMap) continue;
      const id=marketReadIdBySignature(rec,sig); if(!id || seen.has(id) || id===playerId) continue;
      seen.add(id); out.push(id); if(out.length>=limit) break;
    }
    return out;
  }

  function marketEsc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function marketDecodeUtf8(u, start, len) {
    try { return new TextDecoder('utf-8', {fatal:false}).decode(u.slice(start, start + len)).replace(/\0/g,'').trim(); }
    catch (_) { return ''; }
  }
  function marketLoadIndex() {
    try {
      const arr = JSON.parse(localStorage.getItem(MARKET_INDEX_KEY) || '[]');
      if (Array.isArray(arr)) for (const sh of (MARKET_INDEX_MAX_SHOPS > 0 ? arr.slice(-MARKET_INDEX_MAX_SHOPS) : arr)) {
        if (!sh || !Array.isArray(sh.items)) continue;
        const key = sh.key || ((sh.map||'?') + ':' + (sh.vendorEntityId || ('r'+sh.responseShopId)));
        marketShopIndex.set(key, {...sh, key});
      }
    } catch (_) {}
  }
  function marketSaveIndex() {
    try {
      let arr = [...marketShopIndex.values()].sort((a,b)=>(a.t||0)-(b.t||0));
      if (MARKET_INDEX_MAX_SHOPS > 0) arr = arr.slice(-MARKET_INDEX_MAX_SHOPS);
      localStorage.setItem(MARKET_INDEX_KEY, JSON.stringify(arr));
    } catch (_) {}
  }
  marketLoadIndex();
  marketLoadDiscovery();

  function marketObserveOutgoing(u) {
    if (!u || !u.length) return;
    if (u[0] === 0x6b && u.length === 5) {
      const entityId = u32(u, 1) >>> 0;
      const source = marketSweepActive ? 'sweep' : (marketScanActive ? 'scan' : (marketShopTravelActive ? 'select' : 'manual'));
      marketLastOpenRequest = {
        entityId, t: Date.now(), source,
        requestX: player.x != null ? Math.round(Number(player.x)) : null,
        requestY: player.y != null ? Math.round(Number(player.y)) : null
      };
      marketKnownOpenIds.add(entityId);
      if (source === 'manual') marketLearnShopIdSource(entityId);
    }
  }

  function marketParseShopPacket(u) {
    if (!u || u[0] !== 0x6b || u.length < 11) return null;
    try {
      const responseShopId = u32(u, 1);
      const titleLen = u16(u, 5);
      let p = 7;
      if (titleLen < 0 || p + titleLen + 4 > u.length) return null;
      const shopName = marketDecodeUtf8(u, p, titleLen); p += titleLen;
      const itemCount = u32(u, p); p += 4;
      if (itemCount > 500) return null;
      const items = [];
      for (let i=0; i<itemCount; i++) {
        if (p + 10 > u.length) break;
        const listingId = u32(u, p);
        const type = u[p + 4];
        const itemId = u32(u, p + 5);
        if (type === 1) {
          if (p + 15 > u.length) break;
          const qty = u16(u, p + 9);
          const price = u32(u, p + 11);
          items.push({listingId,type,itemId,qty,price});
          p += 15;
        } else if (type === 2) {
          if (p + 49 > u.length) break;
          const qty = u[p + 9] || 1;
          const refine = u[p + 12] || 0;
          const instanceId = u32(u, p + 13);
          const equipDataHex = u8ToHex(u.slice(p + 17, p + 45));
          const price = u32(u, p + 45);
          items.push({listingId,type,itemId,qty,price,refine,instanceId,equipDataHex});
          p += 49;
        } else {
          log('⚠️ Market parser: ไม่รู้ item record type=' + type + ' @' + p + ' — หยุด parse ร้านนี้');
          break;
        }
      }
      const req = (marketLastOpenRequest && Date.now() - marketLastOpenRequest.t < 2500) ? marketLastOpenRequest : null;
      const vendorEntityId = req ? req.entityId : 0;
      const ent = vendorEntityId ? entities.get(vendorEntityId) : null;
      const key = (currentMap || '?') + ':' + (vendorEntityId || ('r' + responseShopId));
      const prevShop = marketShopIndex.get(key);
      // ★ v4.189.44: requestX/Y คือจุดที่ส่ง 0x6b แล้ว server ตอบกลับสำเร็จ
      // จึงเป็น “จุดเปิดร้านได้จริง” ที่เชื่อถือได้กว่าการเดาพิกัด vendor
      const reqX = req && Number.isFinite(Number(req.requestX)) ? Math.round(Number(req.requestX)) : null;
      const reqY = req && Number.isFinite(Number(req.requestY)) ? Math.round(Number(req.requestY)) : null;
      const accessX = (reqX != null && reqY != null) ? reqX : (prevShop && prevShop.accessX != null ? prevShop.accessX : null);
      const accessY = (reqX != null && reqY != null) ? reqY : (prevShop && prevShop.accessY != null ? prevShop.accessY : null);
      const shop = {
        key, map: currentMap || '', vendorEntityId, responseShopId, shopName,
        sellerName: ent && ent.name ? ent.name : (prevShop && prevShop.sellerName ? prevShop.sellerName : ''),
        x: ent && ent.x != null ? ent.x : (prevShop && prevShop.x != null ? prevShop.x : null),
        y: ent && ent.y != null ? ent.y : (prevShop && prevShop.y != null ? prevShop.y : null),
        accessX, accessY, accessT: (reqX != null && reqY != null) ? Date.now() : (prevShop && prevShop.accessT ? prevShop.accessT : 0),
        t: Date.now(), items
      };
      marketShopIndex.set(key, shop);
      if (vendorEntityId) marketKnownOpenIds.add(vendorEntityId >>> 0);
      while (MARKET_INDEX_MAX_SHOPS > 0 && marketShopIndex.size > MARKET_INDEX_MAX_SHOPS) {
        const oldest=[...marketShopIndex.values()].sort((a,b)=>(a.t||0)-(b.t||0))[0];
        if (!oldest) break; marketShopIndex.delete(oldest.key);
      }
      marketSaveIndex();
      const low = items.length ? Math.min(...items.map(x=>x.price||0).filter(x=>x>0)) : 0;
      log('🛒 Market: ' + (shopName || '(ไม่มีชื่อร้าน)') + ' · ' + items.length + '/' + itemCount + ' รายการ' + (low ? ' · เริ่ม ' + low.toLocaleString() + 'z' : ''));
      if (marketScanWaiter && (!vendorEntityId || marketScanWaiter.entityId === vendorEntityId)) {
        const w = marketScanWaiter; marketScanWaiter = null; try { w.resolve(shop); } catch (_) {}
      }
      updateMarketUI();
      return shop;
    } catch (e) { log('⚠️ Market parser error: ' + e.message); return null; }
  }

  function marketObserveIncoming(u) {
    marketProbeRemember(u);
    if (u && u[0] === 0x6b) marketParseShopPacket(u);
  }
  function marketAllRows() {
    const rows=[];
    for (const sh of marketShopIndex.values()) for (const it of (sh.items||[])) rows.push({shop:sh,item:it});
    return rows;
  }
  function marketAgeText(t) {
    const sec=Math.max(0,Math.floor((Date.now()-(t||0))/1000));
    if (sec<60) return sec+'วิ'; if (sec<3600) return Math.floor(sec/60)+'น'; return (sec/3600).toFixed(1)+'ชม';
  }
  function marketClearIndex() {
    marketShopIndex.clear(); marketSaveIndex(); updateMarketUI(); log('🧹 ล้าง Market Index แล้ว');
  }

  // ★ v4.189.38 — Market Index ผูกกับแมพปัจจุบัน: เปลี่ยนแมพ = ล้างข้อมูลตลาดทันที
  function marketHandleMapChange(prevMap, nextMap, source) {
    if (!prevMap || !nextMap || prevMap === nextMap) return false;
    // ยกเลิกงาน Market ที่กำลังวิ่งอยู่ เพื่อไม่ให้ข้อมูลแมพเก่าถูกเติมกลับหลัง clear
    marketScanCancel = true;
    marketSweepCancel = true;
    marketShopTravelCancel = true;
    marketLastOpenRequest = null;
    marketScanWaiter = null;
    marketKnownOpenIds.clear();
    marketShopIndex.clear();
    marketSaveIndex();
    marketPage = 1;
    marketScanStatus = '';
    const panel = document.getElementById('__assist_market_panel');
    if (panel) {
      const inp = panel.querySelector('[data-market-search]');
      if (inp) inp.value = '';
      updateMarketUI();
    }
    log('🧹 Market: ออกจากแมพ ' + prevMap + ' → ' + nextMap + ' (' + (source || 'map change') + ') · ล้างดัชนีแล้ว');
    return true;
  }
  function marketFilteredRows(q) {
    q=String(q||'').trim().toLowerCase();
    let rows=marketAllRows();
    if (q) rows=rows.filter(r=>{
      const id=String(r.item.itemId);
      let nm=''; try { nm=String(nameOf(r.item.itemId)||''); } catch (_) {}
      return id.includes(q) || nm.toLowerCase().includes(q) || String(r.shop.shopName||'').toLowerCase().includes(q) || String(r.shop.sellerName||'').toLowerCase().includes(q);
    });
    rows.sort((a,b)=>(a.item.price||0)-(b.item.price||0) || (b.shop.t||0)-(a.shop.t||0));
    return rows;
  }
  function renderMarketIndexUI() {
    const panel=document.getElementById('__assist_market_panel'); if(!panel) return;
    const summary=panel.querySelector('[data-market-index-summary]');
    const body=panel.querySelector('[data-market-results]');
    const inp=panel.querySelector('[data-market-search]');
    const rows=marketFilteredRows(inp ? inp.value : '');
    const shops=marketShopIndex.size, listings=marketAllRows().length;
    const totalPages=Math.max(1,Math.ceil(rows.length/MARKET_PAGE_SIZE));
    marketPage=Math.max(1,Math.min(totalPages,marketPage||1));
    const pageStart=(marketPage-1)*MARKET_PAGE_SIZE;
    const pageRows=rows.slice(pageStart,pageStart+MARKET_PAGE_SIZE);
    if(summary) summary.textContent='ดัชนี: '+shops+' ร้าน · '+listings+' รายการ · พบ '+rows.length+' รายการ'+(marketScanStatus ? ' · '+marketScanStatus : '');
    const disc=panel.querySelector('[data-market-discovery]');
    if(disc){
      const n = marketShopIdSignature ? marketDiscoverIdsBySignature(marketShopIdSignature,300).length : 0;
      disc.textContent = marketShopIdSignature
        ? ('Shop-ID: ✅ learned · candidates '+n)
        : ('Shop-ID: ⚠️ ยังไม่ learned · เปิดร้านด้วยมือ 1 ร้านเพื่อ Calibration');
    }
    const pageInfo=panel.querySelector('[data-market-page-info]');
    if(pageInfo) pageInfo.textContent='หน้า '+marketPage+' / '+totalPages+' · '+rows.length+' รายการ';
    const prev=panel.querySelector('[data-market-page-prev]');
    const next=panel.querySelector('[data-market-page-next]');
    if(prev){ prev.disabled=marketPage<=1; prev.style.opacity=prev.disabled?'.4':'1'; prev.style.cursor=prev.disabled?'default':'pointer'; }
    if(next){ next.disabled=marketPage>=totalPages; next.style.opacity=next.disabled?'.4':'1'; next.style.cursor=next.disabled?'default':'pointer'; }
    if(!body) return;
    if(!rows.length){ body.innerHTML='<div style="padding:18px 10px;color:#777;text-align:center;font-size:10px">ยังไม่มีผล — เปิดร้านด้วยมือ 1 ร้าน หรือกด 🔄 สแกน</div>'; return; }
    const cheapestByItem=new Map();
    for(const r of rows){ const id=r.item.itemId; if(!cheapestByItem.has(id) || r.item.price < cheapestByItem.get(id)) cheapestByItem.set(id,r.item.price); }
    body.innerHTML=pageRows.map(r=>{
      const sh=r.shop,it=r.item; let nm='item_'+it.itemId; try { nm=nameOf(it.itemId)||nm; } catch(_){}
      const cheap=it.price===cheapestByItem.get(it.itemId);
      const pos=(sh.x!=null&&sh.y!=null)?('@'+Math.round(sh.x)+','+Math.round(sh.y)):'@?';
      const accessPos=(sh.accessX!=null&&sh.accessY!=null)?(' · เปิด@'+Math.round(sh.accessX)+','+Math.round(sh.accessY)):'';
      const refine = it.type===2 && it.refine ? (' +'+it.refine) : '';
      const openId = Number(sh.vendorEntityId || 0) >>> 0;
      const openDisabled = !openId || marketShopTravelActive;
      return '<div style="padding:7px 8px;border-bottom:1px solid #242434;font-size:10px">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
          +'<div style="min-width:0;flex:1"><div style="color:'+(cheap?'#ffd54f':'#e8e8e8')+';font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(cheap?'⭐ ':'')+marketEsc(nm)+refine+'</div><div style="color:#666;font-size:9px">ID '+it.itemId+(it.type===2?' · equip':'')+'</div></div>'
          +'<div style="text-align:right;flex:0 0 auto"><div style="color:#81c784;font-weight:700;font-size:11px">'+Number(it.price||0).toLocaleString()+'z</div><div style="color:#aaa;font-size:9px">×'+Number(it.qty||0).toLocaleString()+'</div></div>'
        +'</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:5px">'
          +'<div style="min-width:0;flex:1" title="'+marketEsc(sh.shopName)+'"><div style="color:#90caf9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+marketEsc(sh.shopName||'(ไม่มีชื่อร้าน)')+'</div><div style="color:#777;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+marketEsc(sh.sellerName||'seller ?')+' '+pos+accessPos+' · '+marketAgeText(sh.t)+'</div></div>'
          +'<button data-market-open-shop="'+openId+'" data-market-open-name="'+marketEsc(sh.shopName||'')+'" '+(openDisabled?'disabled':'')+' title="'+(!openId?'ไม่มี Shop Open ID':(sh.accessX!=null&&sh.accessY!=null?'เดินไปจุดที่เคยเปิดร้านสำเร็จ แล้วเปิดร้าน':'ลองเปิดร้านจากตำแหน่งปัจจุบัน'))+'" style="background:'+(!openDisabled?'#214a32':'#292929')+';color:'+(!openDisabled?'#a5d6a7':'#666')+';border:1px solid '+(!openDisabled?'#3f7c53':'#444')+';border-radius:5px;padding:5px 8px;font-size:9px;cursor:'+(!openDisabled?'pointer':'not-allowed')+';flex:0 0 auto">'+(marketShopTravelActive?'🚶…':'🛒 ไปเปิด')+'</button>'
        +'</div></div>';
    }).join('');
  }

  function marketScanPauseAutomation() {
    const keys=['combatEnabled','wanderEnabled','warpFindEnabled','lootEnabled','skillEnabled','buffEnabled','sellEnabled','storageEnabled','buffVisitEnabled','unstuckBuffEnabled'];
    marketScanSnapshot={}; for(const k of keys){ marketScanSnapshot[k]=CFG[k]; CFG[k]=false; } target=null; noMonsterSince=0;
  }
  function marketScanRestoreAutomation(){ if(marketScanSnapshot){for(const [k,v] of Object.entries(marketScanSnapshot)) CFG[k]=v;} marketScanSnapshot=null; }
  function marketSendShopOpen(entityId) {
    if(!activeWS || activeWS.readyState!==1) return false;
    const b=new Uint8Array(5); b[0]=0x6b; b[1]=entityId&255; b[2]=(entityId>>>8)&255; b[3]=(entityId>>>16)&255; b[4]=(entityId>>>24)&255;
    activeWS.send(b); return true;
  }
  function marketSendShopClose(){ if(!activeWS || activeWS.readyState!==1) return false; activeWS.send(new Uint8Array([0x6a])); return true; }

  // ★ v4.189.44 — เดินไป “จุดที่เคยเปิดร้านสำเร็จ” แล้วเปิดร้านให้ผู้ใช้ซื้อเอง
  function marketFindShopByOpenId(entityId) {
    entityId = Number(entityId) >>> 0;
    let best = null;
    for (const sh of marketShopIndex.values()) {
      if ((Number(sh.vendorEntityId || 0) >>> 0) !== entityId) continue;
      if (!best || (sh.t || 0) > (best.t || 0)) best = sh;
    }
    return best;
  }

  async function marketWalkToShopAccess(shop, shopName) {
    if (!shop || shop.accessX == null || shop.accessY == null) return {ok:true, skipped:true, reason:'no-access'};
    const tx=Math.round(Number(shop.accessX)), ty=Math.round(Number(shop.accessY));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return {ok:true, skipped:true, reason:'bad-access'};
    const startMap=currentMap;
    if (shop.map && startMap && shop.map !== startMap) return {ok:false, reason:'wrong-map'};
    const started=Date.now(); let lastProgress=Date.now(); let lx=player.x, ly=player.y;
    while (marketShopTravelActive && !marketShopTravelCancel) {
      if (currentMap !== startMap) return {ok:false,reason:'map-change'};
      if (player.x == null || player.y == null) { await marketSleep(300); continue; }
      const dist=Math.hypot(tx-player.x,ty-player.y);
      if (dist <= 3) return {ok:true,dist};
      if (lx != null && ly != null && Math.hypot(player.x-lx,player.y-ly) >= 1.5) { lastProgress=Date.now(); lx=player.x; ly=player.y; }
      if (Date.now()-started > 22000 || Date.now()-lastProgress > 7500) return {ok:false,reason:'stuck'};
      marketScanStatus='🚶 ไปเปิด '+(shopName||shop.shopName||'ร้าน')+' @('+tx+','+ty+') · เหลือ '+dist.toFixed(0)+' ช่อง';
      renderMarketIndexUI();
      routineWalkTowardPoint(tx,ty,'🛒 Market Shop');
      await marketSleep(450);
    }
    return {ok:false,reason:'cancel'};
  }

  async function marketTryOpenSelectedShop(entityId, shopName, timeoutMs=1800) {
    const waitShop = marketWaitShop(entityId, timeoutMs);
    marketLastOpenRequest = {
      entityId, t: Date.now(), source: 'select',
      requestX: player.x != null ? Math.round(Number(player.x)) : null,
      requestY: player.y != null ? Math.round(Number(player.y)) : null
    };
    if (!marketSendShopOpen(entityId)) {
      if (marketScanWaiter && marketScanWaiter.entityId === entityId) marketScanWaiter = null;
      return null;
    }
    log('🛒 Market: ขอเปิดร้าน ' + (shopName || '') + ' · shopId=' + entityId);
    return await waitShop;
  }

  async function marketOpenSelectedShop(entityId, shopName) {
    entityId = Number(entityId) >>> 0;
    if (!entityId) { log('❌ Market: ไม่มี Shop Open ID สำหรับร้านนี้'); return false; }
    if (marketScanActive || marketSweepActive || marketShopTravelActive) {
      marketScanStatus = marketShopTravelActive ? 'กำลังเดินไปอีกร้านอยู่' : 'กำลังสแกน/กวาดตลาดอยู่ — หยุดก่อนเปิดร้าน';
      renderMarketIndexUI();
      return false;
    }
    if (!activeWS || activeWS.readyState !== 1) {
      marketScanStatus = 'เปิดร้านไม่ได้: WebSocket เกมยังไม่พร้อม';
      renderMarketIndexUI();
      log('❌ Market: WebSocket เกมยังไม่พร้อม');
      return false;
    }

    const indexedShop=marketFindShopByOpenId(entityId);
    marketShopTravelActive=true; marketShopTravelCancel=false;
    marketScanPauseAutomation();
    updateMarketUI();
    try {
      // ถ้ามี access point ที่เคยยืนยันแล้ว ให้เดินไปก่อน ไม่ต้องลองยิงเปิดจากระยะไกล
      if (indexedShop && indexedShop.accessX != null && indexedShop.accessY != null) {
        const mv=await marketWalkToShopAccess(indexedShop,shopName);
        if (!mv.ok) {
          const why=mv.reason==='stuck'?'เดินไปจุดเปิดร้านไม่สำเร็จ':(mv.reason==='wrong-map'?'ร้านอยู่คนละแมพ':'ยกเลิกการเดิน');
          marketScanStatus='⚠️ '+why; renderMarketIndexUI();
          log('⚠️ Market: '+why+' · '+(shopName||entityId));
          return false;
        }
        await marketSleep(220);
      } else {
        marketScanStatus='ไม่มีจุดเปิดร้านที่บันทึกไว้ — ลองเปิดจากตำแหน่งปัจจุบัน…';
        renderMarketIndexUI();
      }

      let sh=await marketTryOpenSelectedShop(entityId,shopName,1800);
      // retry สั้น ๆ 1 ครั้ง กรณีเพิ่งเดินถึงแล้ว server/entity ยัง settle ไม่ทัน
      if (!sh && indexedShop && indexedShop.accessX != null && indexedShop.accessY != null && !marketShopTravelCancel) {
        marketScanStatus='ร้านยังไม่ตอบ — ลองเปิดซ้ำอีกครั้ง…'; renderMarketIndexUI();
        await marketSleep(450);
        sh=await marketTryOpenSelectedShop(entityId,shopName,1800);
      }
      if (!sh) {
        marketScanStatus = indexedShop && indexedShop.accessX != null
          ? 'ร้านไม่ตอบสนอง — อาจปิดร้าน/Shop ID หมดอายุ หรือจุดเดิมใช้ไม่ได้แล้ว'
          : 'ร้านไม่ตอบสนอง — ยังไม่มีจุดเปิดร้าน; สแกน/กวาดใหม่เพื่อบันทึกจุด';
        renderMarketIndexUI();
        log('⚠️ Market: เปิดร้านไม่สำเร็จ · shopId=' + entityId);
        return false;
      }
      marketScanStatus = 'เปิดร้านแล้ว: ' + (sh.shopName || shopName || ('#' + entityId));
      renderMarketIndexUI();
      log('✅ Market: เปิดร้านแล้ว — ' + (sh.shopName || shopName || entityId)
        + (sh.accessX != null ? ' · access@('+sh.accessX+','+sh.accessY+')' : ''));
      const panel = document.getElementById('__assist_market_panel');
      if (panel) setTimeout(() => { panel.style.display = 'none'; }, 120);
      return true;
    } finally {
      marketShopTravelActive=false; marketShopTravelCancel=false; marketScanWaiter=null;
      marketScanRestoreAutomation(); updateMarketUI();
    }
  }

  function marketWaitShop(entityId, timeoutMs) {
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{ if(marketScanWaiter && marketScanWaiter.entityId===entityId) marketScanWaiter=null; resolve(null); }, timeoutMs);
      marketScanWaiter={entityId,resolve:(shop)=>{clearTimeout(timer);resolve(shop);}};
    });
  }
  const marketSleep=(ms)=>new Promise(r=>setTimeout(r,ms));

  // Shop IDs ที่เพิ่งโผล่ใน packet ช่วงล่าสุด — ใช้ตอนเดินถึง sweep waypoint เพื่อลดการยิง candidate เก่าซ้ำ
  function marketDiscoverRecentIdsBySignature(sig, maxAgeMs, limit) {
    if (!sig) return [];
    maxAgeMs = Math.max(500, Number(maxAgeMs) || MARKET_SWEEP_RECENT_MS);
    limit = Math.max(1, Number(limit) || 300);
    const out=[], seen=new Set(); const now=Date.now();
    for (let i=marketProbePackets.length-1; i>=0; i--) {
      const rec=marketProbePackets[i];
      if (now-rec.t > maxAgeMs) break;
      if (currentMap && rec.map && rec.map!==currentMap) continue;
      const id=marketReadIdBySignature(rec,sig); if(!id || seen.has(id) || id===playerId) continue;
      seen.add(id); out.push(id); if(out.length>=limit) break;
    }
    out.reverse();
    return out;
  }

  function marketNearestWalkable(gx, gy, radius) {
    if (gatWalkable(gx, gy)) return {x:Math.round(gx),y:Math.round(gy)};
    radius=Math.max(1,Math.round(radius||6));
    for(let r=1;r<=radius;r++){
      for(let dx=-r;dx<=r;dx++){
        for(const dy of [-r,r]) if(gatWalkable(gx+dx,gy+dy)) return {x:Math.round(gx+dx),y:Math.round(gy+dy)};
      }
      for(let dy=-r+1;dy<=r-1;dy++){
        for(const dx of [-r,r]) if(gatWalkable(gx+dx,gy+dy)) return {x:Math.round(gx+dx),y:Math.round(gy+dy)};
      }
    }
    return null;
  }

  async function marketSweepMoveTo(wp, startMap, idx, total) {
    const started=Date.now(); let lastProgress=Date.now(); let lx=player.x, ly=player.y;
    while(!marketSweepCancel && marketSweepActive){
      if(currentMap!==startMap) return {ok:false,reason:'map-change'};
      if(player.x==null||player.y==null){ await marketSleep(350); continue; }
      const dist=Math.hypot(wp.x-player.x,wp.y-player.y);
      if(dist<=4) return {ok:true,dist};
      if(lx!=null&&ly!=null&&Math.hypot(player.x-lx,player.y-ly)>=2){ lastProgress=Date.now(); lx=player.x;ly=player.y; }
      if(Date.now()-started>18000 || Date.now()-lastProgress>6500) return {ok:false,reason:'stuck'};
      marketScanStatus='🗺️ เดิน '+(idx+1)+'/'+total+' → ('+wp.x+','+wp.y+') · เหลือ '+dist.toFixed(0)+' ช่อง · เจอ '+marketShopIndex.size+' ร้าน';
      renderMarketIndexUI();
      routineWalkTowardPoint(wp.x,wp.y,'🗺️ Market Sweep');
      await marketSleep(500);
    }
    return {ok:false,reason:'cancel'};
  }

  function marketNormalizeShopLimit(value) {
    if (value === Infinity) return Infinity;
    const raw = String(value == null ? 'all' : value).trim().toLowerCase();
    if (!raw || raw === 'all' || raw === 'ทั้งหมด' || raw === '0' || raw === 'infinity' || raw === '∞') return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : Infinity;
  }
  function marketShopLimitLabel(value) {
    const n = marketNormalizeShopLimit(value);
    return Number.isFinite(n) ? (n.toLocaleString() + ' ร้าน') : 'ทั้งหมด';
  }

  async function marketSweepScanRecent(maxShops) {
    if(!marketShopIdSignature) return {checked:0,found:0};
    maxShops = marketNormalizeShopLimit(maxShops);
    const recentLimit = Number.isFinite(maxShops) ? Math.max(400, maxShops) : Math.max(400, marketProbePackets.length);
    const ids=marketDiscoverRecentIdsBySignature(marketShopIdSignature,MARKET_SWEEP_RECENT_MS,recentLimit);
    let checked=0,found=0;
    for(const id0 of ids){
      if(marketSweepCancel || !marketSweepActive) break;
      if(marketShopIndex.size>=maxShops) break;
      const id=Number(id0)>>>0; if(!id||marketSweepCheckedIds.has(id)) continue;
      marketSweepCheckedIds.add(id); checked++;
      marketLastOpenRequest={entityId:id,t:Date.now(),source:'sweep'};
      const waitShop=marketWaitShop(id,600);
      if(!marketSendShopOpen(id)){ marketScanWaiter=null; break; }
      const sh=await waitShop;
      if(sh){ found++; marketSendShopClose(); await marketSleep(90); }
      await marketSleep(70);
    }
    return {checked,found};
  }

  async function marketSweepMap(maxShops, mode='saved') {
    if(marketShopTravelActive){ marketScanStatus='กำลังเดินไปเปิดร้านอยู่'; renderMarketIndexUI(); return false; }
    if(marketSweepActive){ marketSweepCancel=true; marketScanStatus='กำลังหยุดกวาดตลาด…'; renderMarketIndexUI(); return false; }
    if(marketScanActive){ marketScanStatus='กำลังสแกนร้านอยู่ — หยุดสแกนก่อนเริ่มกวาด'; renderMarketIndexUI(); return false; }
    if(!activeWS||activeWS.readyState!==1){ log('⚠️ Market Sweep: WebSocket เกมยังไม่พร้อม'); return false; }
    if(!currentMap||player.x==null||player.y==null){ log('⚠️ Market Sweep: ยังไม่รู้แมป/พิกัดตัวละคร'); return false; }
    if(!marketShopIdSignature){
      marketScanStatus='ยังไม่รู้ Shop-ID signature — เปิดร้านด้วยมือ 1 ร้านก่อนเริ่มกวาด'; renderMarketIndexUI();
      log('🧭 Market Sweep: ต้อง Calibration Shop ID ก่อน — เปิดร้านด้วยมือ 1 ร้าน'); return false;
    }
    maxShops=marketNormalizeShopLimit(maxShops);
    const startMap=currentMap;
    const preset = mode==='pron-lower' ? marketPresetForMap(startMap) : null;
    const routeLabel = preset ? preset.name : 'จุดที่บันทึก';
    const sourcePoints = preset ? preset.points : marketGetRecordedRoute(startMap);
    if(mode==='pron-lower' && !preset){ marketScanStatus='Preset กวาดตลาดล่างพรอน ใช้ได้เฉพาะ prt_fild08'; renderMarketIndexUI(); return false; }
    if(!sourcePoints.length){ marketScanStatus='ยังไม่มีจุดที่บันทึก — ไปยืนแต่ละจุดแล้วกด 📍 บันทึกจุด'; renderMarketIndexUI(); return false; }
    marketSweepActive=true; marketSweepCancel=false; marketSweepMode=mode; marketSweepCheckedIds=new Set(); marketSweepWaypointIdx=0;
    marketScanPauseAutomation();
    try{
      marketScanStatus='กำลังเตรียมจุดกวาดตลาด…'; renderMarketIndexUI();
      marketSweepWaypoints=marketBuildRouteWaypoints(sourcePoints,300);
      log('🗺️ Market Sweep เริ่ม — '+startMap+' · '+routeLabel+' '+marketSweepWaypoints.length+' จุด · limit '+marketShopLimitLabel(maxShops));
      let skipped=0,totalChecked=0;
      for(let i=0;i<marketSweepWaypoints.length;i++){
        marketSweepWaypointIdx=i;
        if(marketSweepCancel||currentMap!==startMap||marketShopIndex.size>=maxShops) break;
        const wp=marketSweepWaypoints[i];
        const mv=await marketSweepMoveTo(wp,startMap,i,marketSweepWaypoints.length);
        if(!mv.ok){
          if(mv.reason==='map-change'||mv.reason==='cancel') break;
          skipped++; log('⏭️ Market Sweep: ข้ามจุด '+(i+1)+'/'+marketSweepWaypoints.length+' @('+wp.x+','+wp.y+') — '+mv.reason); continue;
        }
        marketScanStatus='🗺️ จุด '+(i+1)+'/'+marketSweepWaypoints.length+' · โหลดร้าน… · เจอ '+marketShopIndex.size+' ร้าน'; renderMarketIndexUI();
        await marketSleep(700);
        const sr=await marketSweepScanRecent(maxShops); totalChecked+=sr.checked;
        marketScanStatus='🗺️ จุด '+(i+1)+'/'+marketSweepWaypoints.length+' · ตรวจ '+totalChecked+' candidate · เจอ '+marketShopIndex.size+' ร้าน · '+marketAllRows().length+' รายการ'; renderMarketIndexUI();
        await marketSleep(180);
      }
      const done=marketSweepCancel?'หยุดโดยผู้ใช้':(currentMap!==startMap?'หยุดเพราะเปลี่ยนแมป':(Number.isFinite(maxShops)&&marketShopIndex.size>=maxShops?'ครบ limit '+maxShops+' ร้าน':'ครบเส้นทาง'));
      marketScanStatus='ล่าสุด: '+done+' · '+marketShopIndex.size+' ร้าน · '+marketAllRows().length+' รายการ · ข้าม '+skipped+' จุด';
      log('✅ Market Sweep จบ — '+done+' · เจอ '+marketShopIndex.size+' ร้าน / '+marketAllRows().length+' รายการ · candidate '+totalChecked+' · ข้าม '+skipped+' จุด');
      return true;
    } finally {
      marketSweepActive=false; marketSweepCancel=false; marketSweepMode=''; marketScanWaiter=null; marketSweepWaypoints=[]; marketSweepWaypointIdx=0;
      marketScanRestoreAutomation(); renderMarketIndexUI(); updateMarketUI();
    }
  }

  async function marketScanVisible(maxShops) {
    if(marketShopTravelActive){ marketScanStatus='กำลังเดินไปเปิดร้านอยู่'; renderMarketIndexUI(); return false; }
    if(marketSweepActive){ marketScanStatus='กำลังกวาดตลาดอยู่ — หยุดกวาดก่อนสแกนรอบตัว'; renderMarketIndexUI(); return false; }
    if(marketScanActive){ marketScanCancel=true; marketScanStatus='กำลังหยุด…'; renderMarketIndexUI(); return false; }
    if(!activeWS || activeWS.readyState!==1){ log('⚠️ Market Scan: WebSocket เกมยังไม่พร้อม'); return false; }
    maxShops=marketNormalizeShopLimit(maxShops);

    // ★ v4.189.30: 0x6b ต้องใช้ Shop Open ID ไม่ใช่ player entity ID
    const discoveryLimit = Number.isFinite(maxShops) ? Math.max(300, maxShops) : Math.max(300, marketProbePackets.length);
    const discovered = marketShopIdSignature ? marketDiscoverIdsBySignature(marketShopIdSignature, discoveryLimit) : [];
    const ids=[]; const seen=new Set();
    for(const id of [...discovered, ...marketKnownOpenIds]){ const n=Number(id)>>>0; if(n && !seen.has(n)){seen.add(n);ids.push(n);} }

    if(!ids.length){
      marketScanStatus='ยังไม่รู้ Shop ID — Reload/เข้าแมปใหม่ แล้วเปิดร้านด้วยมือ 1 ร้านเพื่อ Calibration';
      renderMarketIndexUI();
      log('🧭 Market Scan: Shop Open ID ไม่ใช่ player entity ID จึงสแกนผู้เล่นตรงๆ ไม่ได้');
      log('   → Reload/เข้าแมปตลาดใหม่ด้วย v'+VERSION+' แล้วเปิดร้านด้วยมือ 1 ร้าน; Assist จะเรียนรู้แหล่ง Shop ID จาก packet ตอนเข้าแมป');
      return false;
    }

    marketScanActive=true; marketScanCancel=false; marketScanPauseAutomation();
    let found=0,checked=0; const max=Number.isFinite(maxShops)?Math.min(maxShops,ids.length):ids.length;
    marketScanStatus='เริ่มสแกน '+(Number.isFinite(maxShops)?('สูงสุด '+max+' ร้าน'):('ทั้งหมด '+max+' candidate')); renderMarketIndexUI();
    log('🔎 Market Scan เริ่ม — limit '+(Number.isFinite(maxShops)?(max+' ร้าน'):'ทั้งหมด')+(marketShopIdSignature?' · learned signature':' · known IDs'));
    try{
      for(let i=0;i<max;i++){
        if(marketScanCancel) break;
        const id=ids[i]; checked++;
        marketScanStatus='สแกน '+checked+'/'+max+' · เจอ '+found+' ร้าน'; renderMarketIndexUI();
        marketLastOpenRequest={entityId:id,t:Date.now(),source:'scan'};
        const waitShop=marketWaitShop(id,650);
        if(!marketSendShopOpen(id)) { marketScanWaiter=null; break; }
        const sh=await waitShop;
        if(sh){ found++; marketSendShopClose(); await marketSleep(100); }
        await marketSleep(100);
      }
    } finally {
      marketScanActive=false; marketScanCancel=false; marketScanWaiter=null; marketScanRestoreAutomation();
      marketScanStatus='ล่าสุด: ตรวจ '+checked+' · เจอ '+found+' ร้าน'; renderMarketIndexUI();
      log('✅ Market Scan จบ — ตรวจ '+checked+' / เจอ '+found+' ร้าน');
    }
    return true;
  }

  // ★ v4.189.33 — Market UI updater (Packet Capture removed)
  function updateMarketUI() {
    const panel = document.getElementById('__assist_market_panel');
    if (!panel) return;
    renderMarketIndexUI();
    const scanBtn = panel.querySelector('[data-market-scan]');
    const sweepBtn = panel.querySelector('[data-market-sweep]');
    const presetBtn = panel.querySelector('[data-market-preset-sweep]');
    const clearBtn = panel.querySelector('[data-market-index-clear]');
    const pointAddBtn = panel.querySelector('[data-market-point-add]');
    const pointClearBtn = panel.querySelector('[data-market-point-clear]');
    const routeTxt = panel.querySelector('[data-market-route-status]');
    const route=marketGetRecordedRoute();
    const preset=marketPresetForMap();
    if(routeTxt) routeTxt.textContent = route.length ? ('จุดที่บันทึก: ✅ '+route.length+' จุด · '+(marketNormalizeRouteMapName(currentMap)||'?')) : 'จุดที่บันทึก: 0 จุด';
    if(pointAddBtn){ pointAddBtn.disabled = marketSweepActive || marketScanActive || marketShopTravelActive; pointAddBtn.style.opacity=pointAddBtn.disabled?'.45':'1'; }
    if(pointClearBtn){ pointClearBtn.disabled = marketSweepActive || marketScanActive || marketShopTravelActive || !route.length; pointClearBtn.style.opacity=pointClearBtn.disabled?'.45':'1'; }
    if (scanBtn) {
      scanBtn.textContent = marketScanActive ? '⏹ หยุดสแกน' : '🔄 สแกนรอบตัว';
      scanBtn.disabled = marketSweepActive || marketShopTravelActive;
      scanBtn.style.opacity = scanBtn.disabled ? '.45' : '1';
    }
    if (sweepBtn) {
      const ownActive=marketSweepActive && marketSweepMode==='saved';
      sweepBtn.textContent = ownActive ? '⏹ หยุดกวาด' : '🗺️ กวาดตามจุดที่บันทึก';
      sweepBtn.disabled = marketScanActive || marketShopTravelActive || (marketSweepActive && !ownActive) || (!route.length && !ownActive);
      sweepBtn.style.opacity = sweepBtn.disabled ? '.45' : '1';
    }
    if (presetBtn) {
      const ownActive=marketSweepActive && marketSweepMode==='pron-lower';
      presetBtn.style.display = preset ? 'block' : 'none';
      if(preset) presetBtn.textContent = ownActive ? '⏹ หยุดกวาดตลาดล่างพรอน' : ('🗺️ '+preset.name+' · '+preset.points.length+' จุด');
      presetBtn.disabled = !preset || marketScanActive || marketShopTravelActive || (marketSweepActive && !ownActive);
      presetBtn.style.opacity = presetBtn.disabled ? '.45' : '1';
    }
    if (clearBtn) { clearBtn.disabled = marketScanActive || marketSweepActive || marketShopTravelActive; clearBtn.style.opacity = clearBtn.disabled ? '.45' : '1'; }
  }

  function openMarketPanel() {
    // ★ v4.189.38: เปิด Market ซ้ำในแมพเดิมต้องคงดัชนีไว้
    // ดัชนีจะถูกล้างเฉพาะตอน currentMap เปลี่ยนจริงเท่านั้น
    let panel = document.getElementById('__assist_market_panel');
    if (panel) {
      panel.style.display='flex';
      updateMarketUI();
      return;
    }
    panel = document.createElement('div');
    panel.id='__assist_market_panel';
    panel.style.cssText='position:fixed;right:12px;bottom:12px;width:min(23vw,420px);height:min(80vh,640px);min-width:min(220px,92vw);min-height:min(360px,72vh);max-width:520px;max-height:88vh;z-index:999999;background:#12121e;color:#e8e8e8;border:1px solid #3a3f4b;border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.65);display:flex;flex-direction:column;padding:9px;font-family:Segoe UI,system-ui,sans-serif;box-sizing:border-box;resize:both;overflow:hidden';
    panel.innerHTML=`
      <div data-market-resize-left title="ลากเพื่อปรับความกว้าง Market" style="position:absolute;left:0;top:10px;bottom:10px;width:8px;z-index:20;cursor:ew-resize;touch-action:none"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;flex:0 0 auto">
        <div><b style="color:#ffd54f;font-size:13px">🔎 Market</b> <span style="font-size:8px;color:#777">v${VERSION}</span></div>
        <button data-market-close style="background:none;border:none;color:#aaa;font-size:17px;cursor:pointer;padding:0 2px">✕</button>
      </div>
      <div style="background:#181824;border-radius:8px;padding:7px;min-height:0;display:flex;flex-direction:column;flex:1 1 auto;overflow:hidden">
        <input data-market-search placeholder="ค้นชื่อ / Item ID / ร้าน" style="width:100%;box-sizing:border-box;background:#0d0d15;color:#eee;border:1px solid #3a3f4b;border-radius:6px;padding:6px 7px;font-size:10px;margin-bottom:5px;flex:0 0 auto">
        <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px;flex:0 0 auto">
          <select data-market-limit title="จำนวนร้านสูงสุดที่จะเก็บ" style="width:88px;background:#0d0d15;color:#eee;border:1px solid #3a3f4b;border-radius:6px;padding:5px;font-size:9px">
            <option value="all" selected>ทั้งหมด</option>
            <option value="50">50 ร้าน</option>
            <option value="100">100 ร้าน</option>
            <option value="200">200 ร้าน</option>
            <option value="500">500 ร้าน</option>
          </select>
          <button data-market-scan style="flex:1;background:#124a3a;color:#80cbc4;border:1px solid #287a66;border-radius:6px;padding:5px 7px;cursor:pointer;font-size:9px">🔄 สแกนรอบตัว</button>
          <button data-market-index-clear title="ล้างดัชนี" style="background:#4a2020;color:#ef9a9a;border:1px solid #6a3030;border-radius:6px;padding:5px 7px;cursor:pointer;font-size:9px">🧹</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;flex:0 0 auto">
          <button data-market-point-add title="บันทึกตำแหน่งตัวละครปัจจุบันเป็นจุดกวาดตลาด" style="flex:1;background:#20382f;color:#a5d6a7;border:1px solid #416b59;border-radius:6px;padding:5px 6px;cursor:pointer;font-size:8px">📍 บันทึกจุด</button>
          <button data-market-point-clear title="ล้างเฉพาะจุดที่บันทึกเองของแมพนี้ (ไม่ลบ Preset)" style="background:#4a2020;color:#ef9a9a;border:1px solid #6a3030;border-radius:6px;padding:5px 7px;cursor:pointer;font-size:8px">🧹 ล้างจุด</button>
        </div>
        <div data-market-route-status style="font-size:8px;color:#a5d6a7;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">จุดที่บันทึก: 0 จุด</div>
        <button data-market-sweep style="width:100%;background:#263a58;color:#90caf9;border:1px solid #41688f;border-radius:6px;padding:6px 7px;cursor:pointer;font-size:9px;margin-bottom:4px;flex:0 0 auto">🗺️ กวาดตามจุดที่บันทึก</button>
        <button data-market-preset-sweep style="width:100%;background:#3b2f14;color:#ffd54f;border:1px solid #7d6424;border-radius:6px;padding:6px 7px;cursor:pointer;font-size:9px;margin-bottom:5px;flex:0 0 auto;display:none">🗺️ กวาดตลาดล่างพรอน · 43 จุด</button>
        <div data-market-index-summary style="font-size:8px;color:#90caf9;margin-bottom:2px;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">ดัชนี: 0 ร้าน · 0 รายการ</div>
        <div data-market-discovery style="font-size:8px;color:#b39ddb;margin-bottom:4px;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Shop-ID: กำลังรอเรียนรู้</div>
        <div data-market-results style="min-height:0;flex:1 1 auto;overflow:auto;background:#0b0b12;border-radius:6px;border:1px solid #20202e"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:6px;flex:0 0 auto">
          <button data-market-page-prev style="background:#242438;color:#ddd;border:1px solid #3a3f58;border-radius:6px;padding:5px 8px;font-size:9px">‹ ก่อนหน้า</button>
          <span data-market-page-info style="font-size:9px;color:#aaa;white-space:nowrap">หน้า 1 / 1</span>
          <button data-market-page-next style="background:#242438;color:#ddd;border:1px solid #3a3f58;border-radius:6px;padding:5px 8px;font-size:9px">ถัดไป ›</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    // ★ v4.189.30: Market panel อยู่นอก #__assist_root — ต้องกัน Unity canvas แย่ง mouse/focus เอง
    panel.addEventListener('mousedown', (e) => {
      e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const f=e.target && e.target.matches && e.target.matches('input,select,textarea') ? e.target : null;
      if(f) setTimeout(()=>{ try{ f.focus(); }catch(_){} },0);
    }, true);
    // bubble phase: ปล่อย target onclick ทำงานก่อน แล้วค่อยกัน event ไหลออกไปหา Unity/window
    panel.addEventListener('click', (e) => { e.stopPropagation(); }, false);

    // ★ v4.189.49: custom resize จากขอบซ้าย (native CSS resize มี handle หลักที่มุมขวาล่าง)
    const marketLeftResize = panel.querySelector('[data-market-resize-left]');
    if (marketLeftResize) {
      marketLeftResize.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = panel.getBoundingClientRect().width;
        try { marketLeftResize.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
          const viewportMax = Math.max(220, Math.min(520, window.innerWidth - 24));
          const viewportMin = Math.min(220, Math.max(160, window.innerWidth - 24));
          const nextWidth = Math.max(viewportMin, Math.min(viewportMax, startWidth + (startX - ev.clientX)));
          panel.style.width = Math.round(nextWidth) + 'px';
        };
        const onUp = (ev) => {
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);
          document.body.style.userSelect = '';
          try { marketLeftResize.releasePointerCapture(ev.pointerId); } catch (_) {}
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
      });
    }

    panel.querySelector('[data-market-close]').onclick=()=>{ panel.style.display='none'; };
    panel.querySelector('[data-market-search]').addEventListener('input', () => { marketPage=1; renderMarketIndexUI(); });
    panel.querySelector('[data-market-results]').addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-market-open-shop]') : null;
      if (!btn || btn.disabled) return;
      const id = Number(btn.getAttribute('data-market-open-shop')) >>> 0;
      const name = btn.getAttribute('data-market-open-name') || '';
      marketOpenSelectedShop(id, name);
    });
    panel.querySelector('[data-market-page-prev]').onclick=()=>{ if(marketPage>1){ marketPage--; renderMarketIndexUI(); } };
    panel.querySelector('[data-market-page-next]').onclick=()=>{ marketPage++; renderMarketIndexUI(); };
    panel.querySelector('[data-market-scan]').onclick=()=> marketScanVisible(panel.querySelector('[data-market-limit]').value);
    panel.querySelector('[data-market-point-add]').onclick=()=> marketAddSavedPoint();
    panel.querySelector('[data-market-point-clear]').onclick=()=> marketClearRecordedRoute();
    panel.querySelector('[data-market-sweep]').onclick=()=> marketSweepMap(panel.querySelector('[data-market-limit]').value, 'saved');
    panel.querySelector('[data-market-preset-sweep]').onclick=()=> marketSweepMap(panel.querySelector('[data-market-limit]').value, 'pron-lower');
    panel.querySelector('[data-market-index-clear]').onclick=()=> marketClearIndex();
    updateMarketUI();
    renderMarketIndexUI();
    if (!marketScanActive && !marketSweepActive) log('🔎 Market: เปิดหน้าต่าง · ดัชนีคงอยู่จนกว่าจะเปลี่ยนแมป');
  }

  // ★★ v4.188.6 — Trade Packet Capture / calibration (Rayrag-specific)
  let tradeCaptureActive = false;
  let tradeCaptureMode = '';       // 'accept' | 'reject'
  let tradeCaptureStartedAt = 0;
  let tradeCaptureRecords = [];    // packet + CLICK markers
  let tradeCaptureTimer = null;
  let tradeCaptureStopTimer = null;
  let tradeCaptureSnapshot = null;
  const TRADE_CAPTURE_MS = 12000;
  const TRADE_CAPTURE_MAX = 80;
  // incoming opcodes ที่ Assist รู้จักอยู่แล้ว — opcode นอกชุดนี้จะติด ★UNKNOWN ช่วยหา Trade request
  const TRADE_KNOWN_IN_OPS = new Set([0x00,0x03,0x06,0x07,0x0b,0x0f,0x12,0x14,0x17,0x18,0x19,0x1b,0x1d,0x20,0x22,0x24,0x25,0x27,0x2a,0x2c,0x30,0x32,0x36,0x38,0x3c,0x4d,0x51,0x52,0x53,0x5b]);

  function tradeCaptureStatusText() {
    const mode = tradeCaptureMode === 'accept' ? 'ACCEPT' : tradeCaptureMode === 'reject' ? 'EJECT/REJECT' : '-';
    const head = tradeCaptureActive
      ? '🔬 CAPTURE ' + mode + ' กำลังทำงาน — ให้ผู้เล่นอื่นกด Trade แล้วคลิก ' + (tradeCaptureMode === 'accept' ? 'Accept' : 'Reject/Eject') + ' ในเกม 1 ครั้ง'
      : 'สถานะ: ' + (tradeCaptureRecords.length ? 'มีข้อมูล capture ล่าสุด' : 'ยังไม่ได้จับ packet');
    const rows = tradeCaptureRecords.slice(-28).map(r => {
      if (r.kind === 'click') return '+' + r.dt + 'ms  🖱️ CLICK canvas @(' + r.x + ',' + r.y + ')';
      const op = '0x' + r.opcode.toString(16).padStart(2,'0');
      const unk = r.dir === 'IN' && !TRADE_KNOWN_IN_OPS.has(r.opcode) ? '  ★UNKNOWN' : '';
      const hex = r.hex.length > 220 ? r.hex.slice(0,220) + ' …' : r.hex;
      return '+' + r.dt + 'ms  ' + r.dir + ' ' + op + ' len=' + r.len + unk + ' [' + hex + ']';
    });
    return head + (rows.length ? '\n' + rows.join('\n') : '');
  }
  function updateTradeCaptureUI() {
    const root = document.getElementById('__assist_root');
    if (!root) return;
    const el = root.querySelector('#__assist_trade_capture_status');
    if (el) el.textContent = tradeCaptureStatusText();
  }
  function captureTradePacket(dir, u) {
    if (!tradeCaptureActive || !u || !u.length) return;
    const rec = { kind:'packet', dir, dt:Math.max(0, nowMs()-tradeCaptureStartedAt), opcode:u[0], len:u.length, hex:u8ToHex(u) };
    tradeCaptureRecords.push(rec);
    while (tradeCaptureRecords.length > TRADE_CAPTURE_MAX) tradeCaptureRecords.shift();
    updateTradeCaptureUI();
  }
  function snapshotAndPauseForTradeCapture() {
    const keys = ['combatEnabled','lootEnabled','healEnabled','skillEnabled','buffEnabled','warpFindEnabled','wanderEnabled','fleeFromPlayers','restEnabled','warpLootEnabled'];
    tradeCaptureSnapshot = {};
    for (const k of keys) { tradeCaptureSnapshot[k] = CFG[k]; CFG[k] = false; }
    target = null; noMonsterSince = 0;
  }
  function restoreAfterTradeCapture() {
    if (tradeCaptureSnapshot) for (const [k,v] of Object.entries(tradeCaptureSnapshot)) CFG[k] = v;
    tradeCaptureSnapshot = null;
  }
  function stopTradeCapture(reason) {
    if (!tradeCaptureActive) return false;
    tradeCaptureActive = false;
    if (tradeCaptureTimer) { clearTimeout(tradeCaptureTimer); tradeCaptureTimer = null; }
    if (tradeCaptureStopTimer) { clearTimeout(tradeCaptureStopTimer); tradeCaptureStopTimer = null; }
    restoreAfterTradeCapture();
    log('🤝 จบ Trade Capture (' + (reason || 'หยุด') + ') — ' + tradeCaptureRecords.filter(r=>r.kind==='packet').length + ' packet');
    updateTradeCaptureUI();
    return true;
  }
  function startTradeCapture(mode) {
    if (!activeWS || activeWS.readyState !== 1) { log('⚠️ Trade Capture: ยังไม่ได้เชื่อม game WebSocket'); return false; }
    if (tradeCaptureActive) stopTradeCapture('เริ่มรอบใหม่');
    tradeCaptureMode = mode === 'reject' ? 'reject' : 'accept';
    tradeCaptureRecords = [];
    tradeCaptureStartedAt = nowMs();
    tradeCaptureActive = true;
    snapshotAndPauseForTradeCapture();
    log('🔬 Trade Capture ' + (tradeCaptureMode === 'accept' ? 'ACCEPT' : 'EJECT/REJECT') + ' — ให้ผู้เล่นอื่นส่ง Trade แล้วคลิกปุ่มจริงในเกม 1 ครั้ง');
    tradeCaptureTimer = setTimeout(() => stopTradeCapture('ครบเวลา'), TRADE_CAPTURE_MS);
    updateTradeCaptureUI();
    return true;
  }
  function clearTradeCapture() {
    if (tradeCaptureActive) stopTradeCapture('ล้าง');
    tradeCaptureRecords = []; tradeCaptureMode = '';
    updateTradeCaptureUI();
  }
  function tradeCaptureCanvasClick(e) {
    if (!tradeCaptureActive) return;
    // ไม่เอาคลิกบน RO Assist เอง — ต้องเป็น click ที่ WebGL/game area
    try { if (e.target && e.target.closest && e.target.closest('#__assist_root')) return; } catch (_) {}
    const rec = {kind:'click', dt:Math.max(0,nowMs()-tradeCaptureStartedAt), x:Math.round(e.clientX||0), y:Math.round(e.clientY||0)};
    tradeCaptureRecords.push(rec);
    while (tradeCaptureRecords.length > TRADE_CAPTURE_MAX) tradeCaptureRecords.shift();
    updateTradeCaptureUI();
    // เก็บ packet หลัง click อีก 1.5s แล้วหยุดเอง
    if (tradeCaptureStopTimer) clearTimeout(tradeCaptureStopTimer);
    tradeCaptureStopTimer = setTimeout(() => stopTradeCapture('หลังคลิก 1.5s'), 1500);
  }
  // v4.188.7: Trade Capture listener removed — protocol verified

  // ★★ v4.188.7 — Auto Trade protocol verified from Rayrag capture
  // Incoming request: 0x7e len=43
  // Accept click: [78 01] then [78 00]
  // Eject click:  [78 00] then [78 00]
  function tradeModeReady(_mode) { return true; }
  let lastAutoTradeAt = 0;
  function handleAutoTradeInbound(u) {
    if (!u || u.length !== 43 || u[0] !== 0x7e) return false;
    if (!CFG.tradeAcceptAll && !CFG.tradeRejectAll) return false;
    const now = nowMs();
    if (now - lastAutoTradeAt < 1200) return false;
    if (!activeWS || activeWS.readyState !== 1) return false;
    lastAutoTradeAt = now;
    try {
      if (CFG.tradeAcceptAll) {
        activeWS.send(new Uint8Array([0x78, 0x01]));
        activeWS.send(new Uint8Array([0x78, 0x00]));
        log('🤝 Accept-All Trade → รับคำขอ Trade อัตโนมัติ');
      } else {
        activeWS.send(new Uint8Array([0x78, 0x00]));
        activeWS.send(new Uint8Array([0x78, 0x00]));
        log('🚫 Eject-All Trade → ปฏิเสธคำขอ Trade อัตโนมัติ');
      }
      return true;
    } catch (e) {
      log('⚠️ Auto Trade ส่ง packet ไม่สำเร็จ:', e && e.message ? e.message : e);
      return false;
    }
  }

  function captureUnstuckOutgoing(u) {
    if (!unstuckPacketCaptureActive || !u || !u.length) return;
    const rec = {
      dt: Math.max(0, nowMs() - unstuckPacketCaptureStartedAt),
      opcode: u[0], len: u.length, hex: u8ToHex(u)
    };
    unstuckPacketCapturePackets.push(rec);
    while (unstuckPacketCapturePackets.length > UNSTUCK_CAPTURE_MAX) unstuckPacketCapturePackets.shift();
    unstuckPacketCandidate = rec;
    dbg('🔬 Unstuck OUT +' + rec.dt + 'ms op=0x' + rec.opcode.toString(16).padStart(2,'0') + ' len=' + rec.len + ' :: ' + rec.hex.slice(0,180));
  }
  function snapshotAndPauseForUnstuckCapture() {
    const keys = ['combatEnabled','lootEnabled','healEnabled','skillEnabled','buffEnabled','warpFindEnabled','wanderEnabled','fleeFromPlayers','restEnabled','warpLootEnabled'];
    unstuckPacketCaptureSnapshot = {};
    for (const k of keys) { unstuckPacketCaptureSnapshot[k] = CFG[k]; CFG[k] = false; }
    target = null; noMonsterSince = 0;
    unstuckBuffState = 'CAPTURE_PACKET';
  }
  function restoreAfterUnstuckCapture() {
    if (unstuckPacketCaptureSnapshot) {
      for (const [k,v] of Object.entries(unstuckPacketCaptureSnapshot)) CFG[k] = v;
    }
    unstuckPacketCaptureSnapshot = null;
    if (unstuckBuffState === 'CAPTURE_PACKET') unstuckBuffState = 'IDLE';
  }
  function stopUnstuckPacketCapture(reason) {
    if (!unstuckPacketCaptureActive) return false;
    unstuckPacketCaptureActive = false;
    if (unstuckPacketCaptureTimer) { clearTimeout(unstuckPacketCaptureTimer); unstuckPacketCaptureTimer = null; }
    restoreAfterUnstuckCapture();
    const n = unstuckPacketCapturePackets.length;
    if (n > 0) {
      const c = unstuckPacketCandidate || unstuckPacketCapturePackets[n-1];
      log('🔬 จบ Capture Unstuck (' + (reason || 'หยุด') + ') — จับได้ ' + n + ' packet · Candidate: 0x' + c.opcode.toString(16).padStart(2,'0') + ' len=' + c.len + ' [' + c.hex + ']');
    } else log('⚠️ จบ Capture Unstuck (' + (reason || 'หยุด') + ') — ไม่พบ WebSocket OUT packet');
    return true;
  }
  function startUnstuckPacketCapture() {
    if (!activeWS || activeWS.readyState !== 1) { log('⚠️ ยังไม่ได้เชื่อมต่อ game WebSocket'); return false; }
    if (sellState !== 'IDLE' || storageState !== 'IDLE' || buffVisitState !== 'IDLE') {
      log('⚠️ ยังเริ่มจับ Unstuck ไม่ได้ — รอ sell/storage/buffVisit จบก่อน'); return false;
    }
    if (unstuckPacketCaptureActive) stopUnstuckPacketCapture('เริ่มรอบใหม่');
    unstuckPacketCapturePackets = [];
    unstuckPacketCandidate = null;
    unstuckPacketCaptureSource = currentMap && player.x != null ? {map:currentMap,x:player.x,y:player.y} : null;
    unstuckPacketCaptureStartedAt = nowMs();
    unstuckPacketCaptureActive = true;
    snapshotAndPauseForUnstuckCapture();
    log('🔬 เริ่มจับ Packet Unstuck ' + Math.round(UNSTUCK_CAPTURE_MS/1000) + ' วิ — automation ถูก pause ชั่วคราว');
    setTimeout(() => {
      if (!unstuckPacketCaptureActive) return;
      pressGameEscape();
      log('🔬 เปิด ESC แล้ว → กรุณาคลิก Unstuck จริง 1 ครั้งภายใน ' + Math.round(UNSTUCK_CAPTURE_MS/1000) + ' วิ');
    }, 350);
    unstuckPacketCaptureTimer = setTimeout(() => stopUnstuckPacketCapture('ครบเวลา'), UNSTUCK_CAPTURE_MS);
    return true;
  }
  function clearUnstuckPacketCapture() {
    if (unstuckPacketCaptureActive) stopUnstuckPacketCapture('ล้าง');
    unstuckPacketCapturePackets = [];
    unstuckPacketCandidate = null;
    CFG.unstuckPacketEnabled = false;
    CFG.unstuckPacketHex = '';
    saveConfigDebounced();
    log('🧹 ล้าง Capture/Direct Unstuck packet แล้ว — กลับไปใช้ ESC+ปุ่มแบบเดิม');
  }
  function acceptUnstuckPacketCandidate() {
    const c = unstuckPacketCandidate || (unstuckPacketCapturePackets.length ? unstuckPacketCapturePackets[unstuckPacketCapturePackets.length-1] : null);
    if (!c || !c.hex) { log('⚠️ ยังไม่มี Candidate — กด 🔬 จับ Packet Unstuck ก่อน'); return false; }
    CFG.unstuckPacketHex = c.hex;
    CFG.unstuckPacketEnabled = true;
    saveConfigDebounced();
    log('✅ ใช้ Candidate เป็น Direct Unstuck: opcode 0x' + c.opcode.toString(16).padStart(2,'0') + ' len=' + c.len + ' [' + c.hex + ']');
    return true;
  }
  // ★★ v4.187.7 — Direct Unstuck ที่ยืนยันจาก capture จริง: 0x73 len=1 [73]
  // ไม่อ่าน Candidate / localStorage เพื่อป้องกัน packet อื่น (เช่น 0x71) ถูกเลือกผิด
  const FIXED_UNSTUCK_PACKET = new Uint8Array([0x73]);
  function sendDirectUnstuckPacket() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    try {
      activeWS.send(FIXED_UNSTUCK_PACKET);
      log('🏠 ส่ง Direct Unstuck → 0x73 len=1 [73]');
      return true;
    } catch (e) { log('⚠️ ส่ง Direct Unstuck 0x73 ไม่สำเร็จ:', e && e.message); return false; }
  }
  const unstuckPacketCaptureWatcher = setInterval(() => {
    if (!unstuckPacketCaptureActive || !unstuckPacketCaptureSource) return;
    const movedMap = currentMap && currentMap !== unstuckPacketCaptureSource.map;
    const movedPos = player.x != null && Math.hypot(player.x - unstuckPacketCaptureSource.x, player.y - unstuckPacketCaptureSource.y) >= 6;
    if (movedMap || movedPos) stopUnstuckPacketCapture(movedMap ? 'ตรวจพบเปลี่ยนแมป' : 'ตรวจพบย้ายตำแหน่ง');
  }, 250);

  function gameCanvas() { return document.querySelector('canvas') || document.body; }
  function pressGameEscape() {
    try {
      const cv = gameCanvas();
      if (cv && cv.focus) { try { cv.focus(); } catch (_) {} }
      cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      return true;
    } catch (e) { dbg('⚠️ pressGameEscape:', e && e.message); return false; }
  }

  // ★ v4.189.56 — Fixed Teleport Macro ตามชุด Macro ภายนอก:
  // Alt↓ → 25ms → 1↓ → 25ms → 1↑ → 25ms → 2↓ → 25ms → 2↑ → 25ms → 3↓ → 25ms → 3↑ → 25ms → Alt↑
  // KeyboardEvent แบบ synthetic อาจมี keyCode=0 ในบาง browser จึง override getter ให้ Unity/Emscripten อ่านได้ครบ
  function dispatchGameKeyboardEvent(target, type, key, code, keyCode, altKey) {
    try {
      const ev = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, altKey: !!altKey });
      try { Object.defineProperty(ev, 'keyCode', { get: () => keyCode }); } catch (_) {}
      try { Object.defineProperty(ev, 'which',   { get: () => keyCode }); } catch (_) {}
      target.dispatchEvent(ev);
      return true;
    } catch (_) { return false; }
  }

  const TELEPORT_MACRO_STEP_MS = 25;
  const TELEPORT_MACRO_CONFIRM_MS = 650;
  let teleportMacroPending = null; // {owner,label,map,x,y,startedAt,sequenceDoneAt,onSuccess,onExhaust}

  function teleportMacroClear() { teleportMacroPending = null; }

  // ส่ง Macro คงที่ชุดเดียว โดย Alt ถูกกดค้างตลอดช่วง 1→2→3
  function pressGameTeleportMacroSequence(onDone) {
    try {
      const cv = gameCanvas();
      if (!cv) return false;
      if (cv.focus) { try { cv.focus(); } catch (_) {} }
      const events = [
        ['keydown', 'Alt', 'AltLeft', 18, true],
        ['keydown', '1', 'Digit1', 49, true],
        ['keyup',   '1', 'Digit1', 49, true],
        ['keydown', '2', 'Digit2', 50, true],
        ['keyup',   '2', 'Digit2', 50, true],
        ['keydown', '3', 'Digit3', 51, true],
        ['keyup',   '3', 'Digit3', 51, true],
        ['keyup',   'Alt', 'AltLeft', 18, false],
      ];
      events.forEach((args, i) => {
        setTimeout(() => {
          dispatchGameKeyboardEvent(cv, ...args);
          if (i === events.length - 1 && typeof onDone === 'function') {
            try { onDone(); } catch (_) {}
          }
        }, i * TELEPORT_MACRO_STEP_MS);
      });
      return true;
    } catch (e) { dbg('⚠️ pressGameTeleportMacroSequence:', e && e.message); return false; }
  }

  function startTeleportHotkeyMacro(owner, label, onExhaust, onSuccess) {
    if (CFG.teleportMacroEnabled !== true) return typeof onExhaust === 'function' ? !!onExhaust('Macro ปิด') : false;
    if (teleportMacroPending) return true; // มีระบบหนีอื่นกำลังครอง macro อยู่ → อย่ายิงซ้อน
    const p = { owner, label, map:currentMap, x:player.x, y:player.y, startedAt:nowMs(), sequenceDoneAt:0, onExhaust, onSuccess };
    teleportMacroPending = p;
    const ok = pressGameTeleportMacroSequence(() => {
      if (teleportMacroPending === p) p.sequenceDoneAt = nowMs();
    });
    if (!ok) {
      teleportMacroPending = null;
      return typeof onExhaust === 'function' ? !!onExhaust('ส่ง Hotkey Macro ไม่สำเร็จ') : false;
    }
    log('⌨️ ' + label + ' → Teleport Macro: Alt↓ → 1 → 2 → 3 → Alt↑ · 25ms/step');
    return true;
  }

  const teleportMacroWatcher = setInterval(() => {
    const p = teleportMacroPending;
    if (!p) return;
    const now = nowMs();
    const movedMap = !!currentMap && !!p.map && currentMap !== p.map;
    const movedPos = player.x != null && p.x != null && p.y != null && Math.hypot(player.x - p.x, player.y - p.y) >= 3;
    if (movedMap || movedPos) {
      teleportMacroPending = null;
      log('✅ ' + p.label + ': Teleport Macro สำเร็จ');
      try { if (typeof p.onSuccess === 'function') p.onSuccess(); } catch (_) {}
      return;
    }
    // รอให้ชุด key event ยิงครบก่อน แล้วค่อยเริ่มจับเวลา confirm เพื่อไม่ fallback เร็วเกินไป
    if (!p.sequenceDoneAt || now - p.sequenceDoneAt < TELEPORT_MACRO_CONFIRM_MS) return;
    teleportMacroPending = null;
    log('⚠️ ' + p.label + ': Teleport Macro ยิงครบแล้วแต่ไม่เห็นตำแหน่งเปลี่ยน → fallback ต่อ');
    try { if (typeof p.onExhaust === 'function') p.onExhaust('Hotkey Macro ไม่วาร์ป'); } catch (_) {}
  }, 50);
  function dispatchSyntheticClick(el, x, y) {
    if (!el) return false;
    try {
      if (el.focus) { try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} } }
      for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
        const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new E(t, {
          clientX: x, clientY: y, bubbles: true, cancelable: true,
          pointerId: 1, isPrimary: true, button: 0,
          buttons: t.endsWith('down') ? 1 : 0
        }));
      }
      return true;
    } catch (e) { dbg('⚠️ dispatchSyntheticClick:', e && e.message); return false; }
  }
  function clickGameCanvasRatio(rx, ry) {
    try {
      const cv = gameCanvas();
      if (!cv || !cv.getBoundingClientRect) return false;
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const x = r.left + Math.max(0, Math.min(1, Number(rx))) * r.width;
      const y = r.top + Math.max(0, Math.min(1, Number(ry))) * r.height;

      // ★ v4.187.2: ถ้าปุ่ม ESC/Unstuck เป็น DOM overlay ให้กด element จริงที่อยู่เหนือ canvas
      //   เดิมยิง event เข้า canvas อย่างเดียว → เมนู DOM รับคลิกไม่ได้แม้จำพิกัดถูก
      const hit = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      if (hit && !(hit.closest && hit.closest('#__assist_root'))) {
        const clickable = hit.closest ? hit.closest('button,[role="button"],a,input[type="button"],input[type="submit"],[onclick]') : null;
        const targetEl = clickable || (hit !== cv ? hit : null);
        if (targetEl && targetEl !== document.body && targetEl !== document.documentElement) {
          const label = ((targetEl.textContent || targetEl.value || targetEl.getAttribute?.('aria-label') || targetEl.title || '') + '').trim().replace(/\s+/g, ' ').slice(0, 60);
          dbg('🏠 Unstuck saved-point hit DOM:', targetEl.tagName, label || '(no text)');
          if (dispatchSyntheticClick(targetEl, x, y)) {
            // native .click() ช่วย DOM framework บางชนิดที่ฟัง click โดยตรง
            try { if (typeof targetEl.click === 'function') targetEl.click(); } catch (_) {}
            return true;
          }
        }
      }
      // Unity canvas / fallback
      return dispatchSyntheticClick(cv, x, y);
    } catch (e) { dbg('⚠️ clickGameCanvasRatio:', e && e.message); return false; }
  }
  function clickDomUnstuckIfPresent() {
    try {
      // ★ v4.187.2: match แบบ contains + aria/title/value และไม่ค้น UI ของ Assist เอง
      const sels = 'button,[role="button"],a,input[type="button"],input[type="submit"],[onclick]';
      const all = [...document.querySelectorAll(sels)].filter(el => !(el.closest && el.closest('#__assist_root')));
      const visible = (el) => {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        const st = getComputedStyle ? getComputedStyle(el) : null;
        return !!(r && r.width > 1 && r.height > 1 && (!st || (st.display !== 'none' && st.visibility !== 'hidden' && st.pointerEvents !== 'none')));
      };
      const b = all.find(el => {
        const txt = [el.textContent, el.value, el.getAttribute?.('aria-label'), el.getAttribute?.('title')]
          .filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
        return /unstuck/i.test(txt) && visible(el);
      });
      if (b) {
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        dbg('🏠 พบ DOM Unstuck โดยข้อความ → click', (b.textContent || b.value || '').trim());
        if (dispatchSyntheticClick(b, x, y)) {
          try { if (typeof b.click === 'function') b.click(); } catch (_) {}
          return true;
        }
      }
    } catch (e) { dbg('⚠️ clickDomUnstuckIfPresent:', e && e.message); }
    return false;
  }
  function resetUnstuckButton() {
    unstuckCaptureArmed = false;
    CFG.unstuckBuffClickXRatio = null;
    CFG.unstuckBuffClickYRatio = null;
    unstuckBuffNoPosWarned = false;
    // ถ้ากำลังทำ routine อยู่ ให้หยุดก่อนเพื่อไม่ใช้ตำแหน่งเก่าต่อ
    if (unstuckBuffState !== 'IDLE') {
      unstuckBuffState = 'IDLE';
      unstuckBuffLastAt = nowMs();
      unstuckBuffReturnTo = null;
      unstuckBuffSource = null;
      unstuckBuffWaitUntil = 0;
    }
    saveConfigDebounced();
    log('♻️ Reset ตำแหน่ง Unstuck แล้ว — กด “🎯 จำปุ่ม Unstuck” เพื่อบันทึกใหม่');
  }
  function calibrateUnstuckButton() {
    if (unstuckCaptureArmed) { log('🎯 กำลังรอคลิก Unstuck อยู่แล้ว — กด Reset หากต้องการยกเลิก'); return; }
    unstuckCaptureArmed = true;

    // ★ v4.187.2: ฟังที่ document capture phase ไม่ใช่เฉพาะ canvas
    //   รองรับทั้ง Unity canvas และเมนู ESC ที่เป็น DOM overlay
    let timer = null;
    const cleanup = () => {
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('mousedown', handler, true);
      if (timer) clearTimeout(timer);
    };
    const handler = (e) => {
      if (!unstuckCaptureArmed) { cleanup(); return; }
      // ไม่เอาคลิกที่ panel Assist เป็นตำแหน่ง Unstuck
      if (e.target && e.target.closest && e.target.closest('#__assist_root')) return;
      try {
        const cv = gameCanvas();
        const r = cv.getBoundingClientRect();
        if (!r.width || !r.height) throw new Error('canvas size = 0');
        // ต้องอยู่ในกรอบ canvas — เมนู DOM overlay ปกติก็ยังวางทับในกรอบนี้
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          log('⚠️ คลิกอยู่นอกพื้นที่เกม — กรุณาคลิกปุ่ม Unstuck ในหน้าต่างเกม');
          return;
        }
        unstuckCaptureArmed = false;
        CFG.unstuckBuffClickXRatio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        CFG.unstuckBuffClickYRatio = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        saveConfigDebounced();
        const label = e.target ? ((e.target.textContent || e.target.value || e.target.getAttribute?.('aria-label') || '') + '').trim().replace(/\s+/g, ' ').slice(0, 60) : '';
        log('✅ จำตำแหน่ง Unstuck แล้ว — x=' + CFG.unstuckBuffClickXRatio.toFixed(4) + ' y=' + CFG.unstuckBuffClickYRatio.toFixed(4) + (label ? ' · target=' + label : ''));
        cleanup();
      } catch (err) {
        unstuckCaptureArmed = false;
        cleanup();
        log('⚠️ บันทึกตำแหน่ง Unstuck ไม่สำเร็จ:', err && err.message);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('mousedown', handler, true);
    timer = setTimeout(() => {
      if (unstuckCaptureArmed) {
        unstuckCaptureArmed = false;
        cleanup();
        log('⚠️ หมดเวลาบันทึกตำแหน่ง Unstuck — กด “🎯 จำปุ่ม Unstuck” แล้วลองใหม่');
      }
    }, 30000);

    pressGameEscape();
    log('🎯 เปิดเมนู ESC แล้ว — คลิกปุ่ม Unstuck จริง 1 ครั้ง ระบบจะจำตำแหน่งจากทั้ง Canvas/DOM ให้');
  }
  function startUnstuckBuffNow(origin = 'manual') {
    // ★ v4.188.2: ปุ่มนี้สั่งรอบ AB ทันทีแบบ Auto Reset — ไม่ใช้ manual queue
    // ★ v4.189.0: กดปุ่มเอง = override การรอปิดงานมอนล่าสุด; Auto จะเรียกด้วย origin='auto' หลังเก็บของเสร็จ
    if (origin !== 'auto') clearUnstuckBuffAutoFinishPending();
    // จำจุดปัจจุบัน → Direct Unstuck 0x73 ทันที → 2s → กลับจุดเดิม → เริ่มนับรอบ Auto ใหม่
    if (!CFG.unstuckBuffEnabled) CFG.unstuckBuffEnabled = true;
    unstuckBuffManualRun = false;   // legacy flag: ปุ่มนี้ไม่ใช่ manual queued อีกต่อไป

    if (unstuckBuffState !== 'IDLE') {
      log('⏳ รอบรับบัพกำลังทำงานอยู่ (state=' + unstuckBuffState + ') — ไม่ส่ง Unstuck ซ้ำ');
      return false;
    }
    if (!activeWS || activeWS.readyState !== 1 || isDead || playerId == null || player.x == null || !currentMap) {
      log('⚠️ รับบัพตอนนี้: ยังส่ง Unstuck ไม่ได้ — WebSocket/ตัวละคร/ตำแหน่งยังไม่พร้อม');
      return false;
    }

    const now = nowMs();
    unstuckBuffReturnTo = { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
    unstuckBuffSource = { map: currentMap, x: player.x, y: player.y };
    unstuckBuffStepAt = now;
    unstuckBuffWaitUntil = 0;
    unstuckBuffLastWarpAt = 0;
    unstuckBuffNoPosWarned = false;
    target = null;
    noMonsterSince = 0;

    if (!sendDirectUnstuckPacket()) {
      abortUnstuckBuff('Direct Unstuck ส่งไม่สำเร็จ');
      return false;
    }

    clearUnstuckBuffAutoFinishPending();
    unstuckBuffState = 'WAIT_RETURN_2S';
    saveConfigDebounced();
    log('🏠 รับบัพตอนนี้ → Direct Unstuck ทันที (จำจุดกลับ ' + unstuckBuffReturnTo.map + ' @(' + unstuckBuffReturnTo.x + ',' + unstuckBuffReturnTo.y + ')) → กลับใน 2 วิ แล้วเริ่มนับ Auto ใหม่');
    return true;
  }
  function abortUnstuckBuff(reason) {
    log('⚠️ ยกเลิกรอบรับบัพ AB' + (reason ? ': ' + reason : ''));
    unstuckBuffState = 'IDLE';
    unstuckBuffLastAt = nowMs();
    unstuckBuffReturnTo = null;
    unstuckBuffSource = null;
    unstuckBuffWaitUntil = 0;
    unstuckBuffManualRun = false;
    clearUnstuckBuffAutoFinishPending();
  }
  const unstuckBuffLoop = setInterval(() => {
    if (chatPauseActive && unstuckBuffState === 'IDLE') return;
    if (!CFG.unstuckBuffEnabled) return;
    // ★ v4.188.2: Combat gate ใช้กับรอบ Auto ตอน IDLE เท่านั้น
    // ปุ่ม ▶ รับบัพตอนนี้ เริ่ม routine โดยตรงก่อนเข้าลูป จึงไม่ต้องมี manual bypass/queue
    if (unstuckBuffState === 'IDLE' && !CFG.combatEnabled) {
      unstuckBuffLastAt = 0;   // เริ่มจับเวลาใหม่เมื่อ Combat ON
      clearUnstuckBuffAutoFinishPending();
      return;
    }
    if (!activeWS || activeWS.readyState !== 1 || isDead) return;
    if (playerId == null || player.x == null || !currentMap) return;
    const now = nowMs();

    if (unstuckBuffState === 'IDLE') {
      if (unstuckBuffLastAt === 0) { unstuckBuffLastAt = now; return; }
      if (now - unstuckBuffLastAt < Math.max(30, CFG.unstuckBuffIntervalSec || 500) * 1000 && !unstuckBuffAutoFinishPending) return;

      // ★ v4.189.0: ครบเวลาแล้ว — ถ้ากำลังตี ให้ปิดงาน target ปัจจุบัน + เก็บของก่อน Unstuck
      // คง guard เฉพาะ routine ธุรกรรม/เดินทางที่ไม่ควรถูกตัดกลาง
      if (sellState !== 'IDLE' || storageState !== 'IDLE') return;
      if (typeof buffVisitState !== 'undefined' && buffVisitState !== 'IDLE') return;
      if (typeof postRespawnRest !== 'undefined' && postRespawnRest) return;

      if (!unstuckBuffAutoFinishPending) {
        unstuckBuffAutoFinishPending = true;
        unstuckBuffFinishTargetId = target && target.id != null ? target.id : null;
        unstuckBuffLootSettleUntil = 0;
        if (target) {
          const tm = entities.get(target.id);
          log('⏰ AB Auto ครบเวลา → ตีมอนตัวล่าสุดให้จบก่อน:', (tm && tm.name) || target.id.toString(16), 'แล้วเก็บของก่อน Unstuck');
        } else if (queue.size > 0 || warpQueue.size > 0) {
          log('⏰ AB Auto ครบเวลา → ไม่มี target แล้ว แต่มีของค้าง → เก็บให้หมดก่อน Unstuck');
        }
      }

      // ยังมี target ปัจจุบัน → ปล่อย combatLoop ตีตัวนี้ต่อ (แต่ห้ามเปลี่ยน/หา target ใหม่)
      if (target) return;
      // หลังมอนตายรอสั้น ๆ ให้ drop packet เข้าคิวก่อน แล้วค่อยตรวจคิวของ
      if (unstuckBuffLootSettleUntil && now < unstuckBuffLootSettleUntil) return;
      if (queue.size > 0 || warpQueue.size > 0) return;

      if (startUnstuckBuffNow('auto')) {
        log('⏰ AB Auto: ปิดงานมอนตัวล่าสุด + เก็บของเสร็จ → Direct Unstuck 0x73 ทันที');
      }
      return;
    }


    if (unstuckBuffState === 'WAIT_RETURN_2S') {
      // ★ v4.188.1: นับจากจังหวะส่ง Unstuck สำเร็จ ไม่ต้องรอยืนยัน spawn และไม่รอ AB timer เดิม
      if (now - unstuckBuffStepAt < UNSTUCK_RETURN_DELAY_MS) return;
      if (!unstuckBuffReturnTo) { abortUnstuckBuff('ไม่มีจุดฟาร์มเดิม'); return; }
      unstuckBuffState = 'RETURN';
      unstuckBuffLastWarpAt = now;
      log('⚡ ครบ 2 วิหลัง Unstuck → วาร์ปกลับทันที', unstuckBuffReturnTo.map, '@(', unstuckBuffReturnTo.x + ',' + unstuckBuffReturnTo.y + ')');
      sendTeleport(unstuckBuffReturnTo.map, unstuckBuffReturnTo.x, unstuckBuffReturnTo.y);
      return;
    }

    if (unstuckBuffState === 'RETURN') {
      if (!unstuckBuffReturnTo) { abortUnstuckBuff('ไม่มีจุดกลับ'); return; }
      if (currentMap === unstuckBuffReturnTo.map && player.x != null) {
        const d = Math.hypot(player.x - unstuckBuffReturnTo.x, player.y - unstuckBuffReturnTo.y);
        if (d <= 4) {
          unstuckBuffState = 'IDLE';
          unstuckBuffLastAt = now;
          unstuckBuffReturnTo = null;
          unstuckBuffSource = null;
          unstuckBuffManualRun = false;
          noMonsterSince = 0;
          log('✅ กลับจุดฟาร์มเดิมแล้ว → รีเซ็ตนับถอยหลัง Auto ใหม่ (รอบถัดไปอีก ' + Math.round((CFG.unstuckBuffIntervalSec || 500) / 60) + ' นาที)');
          return;
        }
      }
      if (now - unstuckBuffLastWarpAt > 5000) {
        unstuckBuffLastWarpAt = now;
        sendTeleport(unstuckBuffReturnTo.map, unstuckBuffReturnTo.x, unstuckBuffReturnTo.y);
      }
      return;
    }
  }, 500);

  const buffLoop = setInterval(() => {    if (chatPauseActive) return;
    if (!CFG.buffEnabled) return;
    if (!CFG.buffItems || !CFG.buffItems.length) return;
    if (isDead) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    const now = nowMs();
    for (const item of CFG.buffItems) {
      if (!item || !item.itemId || !item.intervalMin) continue;
      const intervalMs = item.intervalMin * 60 * 1000;
      const last = lastBuffUse.get(item.itemId) || 0;
      // ★ rebuffDelay: รออย่างน้อย N ms ก่อนใช้ซ้ำ (กัน spurious ถ้า server ล้าง buff)
      if (last > 0 && (now - last) < Math.min(intervalMs, CFG.buffRebuffDelayMs)) continue;
      // ★ ยังไม่ครบ interval → skip
      if (last > 0 && (now - last) < intervalMs) continue;
      if (sendUseItem(item.itemId)) {
        lastBuffUse.set(item.itemId, now);
        saveBuffTimesDebounced();
        const remainMin = item.intervalMin;
        log('✨ ใช้ buff', nameOf(item.itemId), '(ทุก', remainMin + 'นาที)');
      }
    }
  }, CFG.buffCheckMs);

  // ★ auto clear browser console — กัน log เยอะค้างหน่วย (0=off)
  let lastConsoleClearAt = Date.now();
  const consoleClearLoop = setInterval(() => {
    if (!CFG.autoClearConsoleMin || CFG.autoClearConsoleMin <= 0) return;
    if (Date.now() - lastConsoleClearAt >= CFG.autoClearConsoleMin * 60 * 1000) {
      try { console.clear(); } catch (_) {}
      lastConsoleClearAt = Date.now();
      log('🧹 clear console (ทุก ' + CFG.autoClearConsoleMin + ' นาที)');
    }
  }, 30000);   // เช็คทุก 30s

  // ============================================================
  //  AUTO-LOOT
  // ============================================================
  let lastCombatAt = 0, lastExpAt = 0, lastSendAt = 0;
  const recentDrops = new Map();       // dropId -> {dropId,x,y,itemId,t}
  const queue = new Map();             // dropId -> {dropId,itemId,x,y,attempts,lastAttemptAt,addedAt}
  // ★★ loot ownership — ของ drop จากมอนที่คนอื่นตี: server ตอบ 0x20 "unable to pick up yet"
  //   (จาก packet capture: request 0x52 เหมือนกันเป๊ะ แต่ของคนอื่น = ไม่มี 0x52 ตอบกลับ มีแต่ข้อความ)
  //   → เลิกลองทันที + blacklist ชั่วคราว กัน tryClaim ซ้ำวนลูป
  let lastPickupDropId = null;         // dropId ที่เพิ่งส่ง 0x52 ล่าสุด (map เข้ากับ 0x20 ที่ตามมา)
  let lastWhereReqAt = 0;              // ★ throttle ส่ง /where (0x37) เมื่อตำแหน่งหาย
  // ★★ beaconPlayerIds — id ที่เคยปรากฏบน radar ผู้เล่น (0x3c flag=1) = เป็น "ผู้เล่น" แน่นอน
  //   (มอนไม่มีบน radar — boss ใช้ flag 3/4) ใช้กันผู้เล่นถูกมองเป็นมอน (kind พลาด) → บอทตีคน!
  //   id -> lastSeenAt (TTL 5 นาที)
  const beaconPlayerIds = new Map();
  function isBeaconPlayer(id, now) {
    const t = beaconPlayerIds.get(id);
    if (t == null) return false;
    if (now - t > 300000) { beaconPlayerIds.delete(id); return false; }
    return true;
  }
  const dropBlacklist = new Map();     // dropId -> expireAt (60s — ของคนอื่น ไม่ต้องลองซ้ำ)
  let lastLootActivityAt = 0;          // ★ เวลาเก็บของสำเร็จล่าสุด — ใช้ดีเลย์ก่อนนั่งพัก (กันดูเป็นบอท)
  // ★ recent kill positions — จดพิกัดมอนที่เราฆ่า เพื่อเช็ค item drop ใกล้หรือไม่
  //   สำคัญสำหรับนักธนู: ยิงมอนตายไกล → ของตกที่พิกัดมอน ไม่ใช่ที่ตัวเรา
  const recentKillPos = [];            // [{x, y, t}] — ล่าสุด 20 ตำแหน่ง, TTL 15 วินาที
  const KILL_POS_TTL_MS = 15000;
  const KILL_POS_MAX = 20;
  // ★★ recentDeathPos — จุดตายของมอน "ทุกตัว" (รวมที่คนอื่นฆ่า) — TTL สั้น ๆ ตอนของ drop
  //   ใช้แยกของเรา/ของคนอื่น: drop ตกที่จุดตายมอน (±1 ช่อง) ถ้ามอนนั้นเราไม่ได้ตี = ของคนอื่นแน่
  const recentDeathPos = [];           // [{x, y, t, mine}]
  const DEATH_POS_TTL_MS = 4000;
  const DEATH_POS_MAX = 30;

  // ---------- WARP-TO-LOOT state ----------
  let currentMap = null;               // ชื่อแมปปัจจุบัน (จาก opcode 0x12) — จำเป็นสำหรับ warp
  let playerZeny = null;              // ★ เงินปัจจุบัน (จาก 0x38 MAP_DATA offset 9 — ส่งตอนเข้าแมป/วาร์ป)
  // ★★ น้ำหนัก (จาก 0x38 #2 — ยืนยันด้วย ground truth: sssddd max 3130, Orange 10, Red Herb 3)
  //   โครง: [maxWeight×10 :u32][f32?][curWeight×10 :u16] ก่อน inventory signature
  let playerWeight = null;
  let playerMaxWeight = null;
  let lastFarmWarpBackAt = 0;          // ★ throttle retry วาร์ปกลับแมปฟาร์ม (กันติดแมปผิด)
  let bossAlertedIds = new Set();       // ★ entity IDs ที่ alert boss ไปแล้ว (กันสแปม)
  let lastBossWarpAt = 0;              // ★ throttle วาร์ปไปหา boss
  const warpQueue = new Map();         // dropId -> {dropId,itemId,x,y,offsetIdx,warpAt,pickupSentAt}
  let lastWarpAt = 0;                  // throttle การวาร์ป
  let warpGuardUntil = 0;              // ★ ระยะหลังวาร์ป — รอ player pos อัปเดตก่อนคำนวณ dist
  let lastWarpPlayerPos = null;        // ★ player.x/y ก่อนวาร์ป (เช็คว่า pos เปลี่ยนไหม)
  let lastWarpTargetId = null;         // dropId ที่กำลังวาร์ปไป (เช็คผลจาก 0x2a)

  const u16 = (u, o) => u[o] | (u[o + 1] << 8);
  const u32 = (u, o) => ((u[o]) | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
  const i16 = (u, o) => { const v = u16(u, o); return v >= 0x8000 ? v - 0x10000 : v; };   // signed int16 LE (พิกัดติดลบได้)
  const dv = new DataView(new ArrayBuffer(4));
  const f32 = (u, o) => { dv.setUint32(0, u32(u, o), true); return dv.getFloat32(0, true); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const FAIL = 0xffffffff;

  function shouldLoot(itemId) {
    const f = CFG.filter;
    if (f.mode === 'only')   return f.onlyItems.includes(itemId);
    if (f.mode === 'except') return !f.exceptItems.includes(itemId);
    return true;
  }

  function syncU8(d) {
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    return null;
  }
  async function toU8(d) {
    const u = syncU8(d);
    if (u) return u;
    if (typeof Blob !== 'undefined' && d instanceof Blob) return new Uint8Array(await d.arrayBuffer());
    return null;
  }

  // ส่งคำสั่งเก็บของ: packet 0x52, [52][drop_id:4 LE]
  function sendPickup(dropId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5);
    b[0] = 0x52;
    b[1] = dropId & 0xff; b[2] = (dropId >> 8) & 0xff;
    b[3] = (dropId >> 16) & 0xff; b[4] = (dropId >>> 24) & 0xff;
    activeWS.send(b);
    return true;
  }

  // ★★ /where (0x37): ถามตำแหน่งแม่นยำจาก server — ตอบกลับเป็นแชทระบบ
  //   "You are at 126,77 on map izlude." (พิสูจน์จาก capture — OUT 37 00 00 00 → IN 0x2c จาก sender=ffffffff)
  //   ใช้เป็น oracle เมื่อตำแหน่งเราหาย (หลังวาร์ป/ติดค้าง) และเป็นเครื่องมือ verify พิกัด
  function sendWhere() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x37, 0x00, 0x00, 0x00]));
    return true;
  }

  // ★★★ AUTO-LOGIN — จาก packet capture (testmage):
  //   1) OUT [08][00 00 00 00][uLen:1][user][pLen:1][pass]
  //   2) IN  [00][02 00 00 00][type:2 = 2c 00][token:20]... ← session token สำหรับเลือกตัวละคร
  //   3) OUT [03][type:2][token:20][slot:1]  ← echo token + slot (slot แรก = 0x00)
  //   4) IN  [03][eid:4][len:2][mapname]    ← เข้าเกม (handler เดิมรับต่อ)
  let autoLoginPhase = 'idle';        // idle → waitingLogin → loginSent → acctOk → charSent → done / failed
  let autoLoginToken = null;          // Uint8Array 22 bytes ([type:2][token:20]) จาก IN 0x00
  let autoLoginAttemptAt = 0;         // กันส่งซ้ำ (1 ครั้งต่อ WS connection)
  let lastGamePacketAt = Date.now();  // ★ packet ล่าสุดจาก server — ใช้ตรวจ "ค้าง" (auto-refresh)
  let wsOpenedAt = 0;                 // ★ เวลาที่ WS เกมเปิดล่าสุด — ใช้ดูว่าค้างหน้า char select ไหน
  function sendLoginPacket(user, pass) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const uB = new TextEncoder().encode(user);
    const pB = new TextEncoder().encode(pass);
    if (!uB.length || !pB.length || uB.length > 24 || pB.length > 24) return false;
    const b = new Uint8Array(1 + 4 + 1 + uB.length + 1 + pB.length);
    let p = 0;
    b[p++] = 0x08;
    b[p++] = 0; b[p++] = 0; b[p++] = 0; b[p++] = 0;   // const 00 00 00 00 จาก capture
    b[p++] = uB.length; b.set(uB, p); p += uB.length;
    b[p++] = pB.length; b.set(pB, p);
    activeWS.send(b);
    return true;
  }
  function sendSelectCharPacket(token, slot) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(1 + token.length + 1);
    b[0] = 0x03; b.set(token, 1); b[b.length - 1] = slot & 0xff;
    activeWS.send(b);
    return true;
  }

  // ★ เขียน signed int16 LE ลง Uint8Array ที่ offset (รองรับค่าติดลบ เช่น -999)
  function writeI16LE(b, off, v) {
    const x = v & 0xffff;
    b[off] = x & 0xff; b[off + 1] = (x >> 8) & 0xff;
  }
  // ★ ส่งคำสั่งวาร์ป: packet 0x40, [40][len:2 LE][mapname UTF-8][x:i16 LE][y:i16 LE][00]
  //   x/y เป็น signed int16 (-999 = random) — format ยืนยันจากบอทหลักแล้ว
  // ★★ TELEPORT SERIALIZER — server รับ 0x40 ห่างกันอย่างน้อย ~3s (ยิงถี่ ตัวหลังถูกดรอปเงียบ!)
  //   เคสจริงจาก log: วาร์ปกลับฟาร์ม + เริ่มฝากวาร์ป + วาร์ปสุ่ม ภายใน 3 วิ → ตัวที่ 2-3 หาย
  //   → routine ค้าง "ไม่พบ NPC" เป็นนาที และ "ประกาศวาร์ปแต่ไม่ไปไหน"
  //   แก้: ยิงจริงทันทีถ้าห่างพอ ไม่งั้นเก็บ intent ล่าสุด (last-wins) แล้ว flush เมื่อครบ gap
  let lastTeleportSentAt = 0;
  let pendingTeleport = null;        // {mapName, x, y} — intent ล่าสุดที่รอส่ง
  const TELEPORT_MIN_GAP_MS = 3000;
  function actuallySendTeleport(mapName, x, y) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const mapBytes = new TextEncoder().encode(mapName);
    const b = new Uint8Array(1 + 2 + mapBytes.length + 2 + 2 + 1);
    let p = 0;
    b[p++] = 0x40;
    b[p++] = mapBytes.length & 0xff; b[p++] = (mapBytes.length >> 8) & 0xff;
    b.set(mapBytes, p); p += mapBytes.length;
    writeI16LE(b, p, Math.round(x)); p += 2;
    writeI16LE(b, p, Math.round(y)); p += 2;
    b[p] = 0x00;
    activeWS.send(b);
    lastTeleportSentAt = nowMs();
    // ★★★ อัปเดต player.x/y หลังวาร์ป — กันตำแหน่งค้างตลอดกาล (ทำเมื่อ "ส่งจริง" เท่านั้น)
    //   กรณี 1: วาร์ปไปพิกัดเฉพาะ (x,y ≠ -999) → อัปเดตทันที (เรารู้ปลายทาง)
    //   กรณี 2: วาร์ปสุ่ม (-999) → null ตำแหน่ง (ไม่รู้ปลายทาง → รอ server ส่ง pos ใหม่)
    if (x !== -999 && y !== -999 && x >= -500 && x <= 1000 && y >= -500 && y <= 1000) {
      player.x = Math.round(x); player.y = Math.round(y);
      warpGuardUntil = 0; lastWarpPlayerPos = null;   // รู้พิกัด → ไม่ต้อง guard
    } else {
      // ★★ วาร์ปสุ่ม → null ตำแหน่งทันที!
      //   เหตุผล: ตำแหน่งเก่าใช้ไม่ได้แล้ว (คนละแมป/จุด) → ถ้าไม่ null →
      //   บอทมองหามอนจากตำแหน่งเก่า → ไม่เจอ → "ไม่เจอมอน 3s" → วาร์ปอีก → วนลูป!
      player.x = null; player.y = null;
      warpGuardUntil = nowMs() + 3000;
      lastWarpPlayerPos = null;
    }
    return true;
  }
  function sendTeleport(mapName, x, y) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (!mapName) return false;
    // ★★ วาร์ปสุ่มในแมปเดิม (x=y=-999 + ชื่อแมปปัจจุบัน) → ยิงทันทีทุกครั้ง ไม่ต้องคิว!
    //   ทดสอบจริงจากผู้ใช้: ระบบในเกมวาร์ปสุ่มรัว ๆ ได้ 2-3 ครั้ง/วิ — กฎ gap 3 วิ ที่เคยเจอใช้กับ
    //   "วาร์ปข้ามแมปต่อเนื่อง" เท่านั้น (กลับฟาร์ม→ฝาก→สุ่ม ใน 3 วิ → ตัวหลังโดนดรอปขณะเปลี่ยนแมป)
    //   → เลี่ยงคิวเฉพาะ same-map random · วาร์ปพิกัด/ข้ามแมปของระบบ (ขาย/ฝาก/กลับฟาร์ม) ยังคุมตามเดิม
    const isSameMapRandom = (x === -999 && y === -999 && mapName === currentMap);
    if (!isSameMapRandom && nowMs() - lastTeleportSentAt < TELEPORT_MIN_GAP_MS) {
      pendingTeleport = { mapName, x, y };   // ★ intent ล่าสุดชนะ — รอ flush (ไม่ทิ้งเงียบ ๆ แบบ server)
      const waitS = Math.max(1, Math.ceil((lastTeleportSentAt + TELEPORT_MIN_GAP_MS - nowMs()) / 1000));
      log('🌀 teleport คิวไว้ — จะยิงในอีก ~' + waitS + ' วิ (วาร์ปข้ามแมปคุมห่าง ≥3 วิ · วาร์ปสุ่มในแมปเดิมยิงทันที) →', mapName);
      return true;
    }
    return actuallySendTeleport(mapName, x, y);
  }
  const teleportFlusher = setInterval(() => {
    if (!pendingTeleport) return;
    if (!activeWS || activeWS.readyState !== 1) { pendingTeleport = null; return; }
    if (nowMs() - lastTeleportSentAt < TELEPORT_MIN_GAP_MS) return;
    const t = pendingTeleport; pendingTeleport = null;
    if (actuallySendTeleport(t.mapName, t.x, t.y)) dbg('🌀 flush teleport ที่ค้าง →', t.mapName);
  }, 500);

  function tryClaim(d) {
    if (queue.has(d.dropId)) return;
    const dDropX = d.x, dDropY = d.y;   // ★ พิกัด drop (ใช้ใน foreign-drop check)
    // ★★ ของคนอื่น (เคยโดน "unable to pick up yet") → ข้าม + lazy cleanup ที่หมดอายุ
    const blUntil = dropBlacklist.get(d.dropId);
    if (blUntil != null) {
      if (Date.now() < blUntil) return;
      dropBlacklist.delete(d.dropId);
    }
    const now = Date.now();
    if (now - lastCombatAt > CFG.combatWindowMs) return;
    // ★ เช็คว่า item อยู่ใกล้เราหรือใกล้พิกัดมอนที่เราฆ่า
    const nearPlayer = (player.x != null && dist(player, d) <= CFG.pickRadius);
    // ★ nearKillPos: เช็คว่า item อยู่ใกล้พิกัดมอนที่เราฆ่าล่าสุดหรือไม่ (นักธนูยิงไกล)
    let nearKillPos = false;
    if (CFG.lootUseKillPos) {
      // cleanup expired entries
      while (recentKillPos.length > 0 && now - recentKillPos[0].t > KILL_POS_TTL_MS) recentKillPos.shift();
      const r = CFG.pickRadiusKill || 5;
      for (const k of recentKillPos) {
        if (Math.hypot(k.x - d.x, k.y - d.y) <= r) { nearKillPos = true; break; }
      }
    }
    // ★★ เก็บได้เลยถ้า: ของใกล้พิกัดมอนที่เราฆ่า (ชัวร์ — ฆ่าเอง) OR ตกที่ตัวเรา (r≤pickRadius)
    //   (ทั้งสองกรณีไม่ต้องดูใครใกล้กว่า — ของเราแน่ ๆ กันกรณีคน AFK ยืนใกล้จุดฆ่ามอนของเรา)
    if (!nearKillPos && !nearPlayer) {
      // ★★★ FOREIGN DROP — ของตกใกล้จุดตายของมอนที่เราไม่ได้ตี = ของคนอื่นแน่นอน
      //   (item drop ที่ตำแหน่งมอน ±1 ช่อง — ถ้ามอนนั้นไม่ใช่ที่เราตี เราไม่มีทางมีสิทธิ์)
      //   → ข้าม + blacklist ล่วงหน้า 60s (ไม่ต้องรอ server ปฏิเสธ / ไม่วาร์ปไปเก็บ!)
      //   ยกเว้น "ตีทับกัน": จุดตายนั้นใกล้จุดฆ่าของเรา ≤3 ช่อง หรือใกล้ตัวเรา ≤4 ช่อง
      //   → ก้ำกึ่ง ปล่อยไปลองเก็บชั้นถัดไป (server lock เป็นเกราะชั้นสุดท้าย)
      if (recentDeathPos.length) {
        const now2 = Date.now();
        while (recentDeathPos.length > 0 && now2 - recentDeathPos[0].t > DEATH_POS_TTL_MS) recentDeathPos.shift();
        for (const d of recentDeathPos) {
          if (d.mine) continue;   // มอนที่เราตีตาย → จัดการที่ nearKillPos แล้ว
          if (Math.hypot(d.x - dDropX, d.y - dDropY) <= 2) {
            // ตีทับกันไหม? — จุดตายเขาใกล้จุดฆ่าเรา หรือใกล้ตัวเรา
            let overlap = false;
            if (player.x != null && Math.hypot(d.x - player.x, d.y - player.y) <= 4) overlap = true;
            if (!overlap) {
              for (const k of recentKillPos) {
                if (Math.hypot(k.x - d.x, k.y - d.y) <= 3) { overlap = true; break; }
              }
            }
            if (!overlap) {
              dropBlacklist.set(d.dropId, now2 + 60000);
              dbg('🚫 ของตกที่จุดตายมอนที่เราไม่ได้ตี @(' + d.x + ',' + d.y + ') → ของคนอื่น — blacklist 60s');
              return;
            }
          }
        }
      }
      // ★★ fallback: เพิ่งได้ EXP + ของใกล้เราในรัศมีกว้างขึ้น (เผื่อของ scatter จากมอนเรา)
      //   เดิม: เพิ่งได้ EXP แล้ว claim ทุก drop ไม่สนระยะ → ฆ่ามอนพร้อมคนอื่น = ยึ่งของเขา!
      const nearExpWide = (now - lastExpAt) < 2000 && player.x != null && dist(player, d) <= CFG.pickRadius + 3;
      if (!nearExpWide) return;
      // ★★ ผู้เล่นคนอื่นยืนใกล้ของนี้กว่าเรา (ชัดเจน margin 1 ช่อง) → ของเขา — ไม่ยุ่ง
      //   + blacklist 60s กันมาเช็คซ้ำ (drop packet ไม่มี mob id จึงต้องใช้ระยะตัดสิน)
      if (CFG.lootRespectOthers && player.x != null) {
        const dMe = Math.hypot(player.x - d.x, player.y - d.y);
        for (const e of entities.values()) {
          if (e.kind !== 0 || !e.alive || e.x == null || e.id === playerId) continue;
          if (!e.name || !e.name.trim()) continue;   // ข้าม minimap dot (name='') — กันผี
          if (Math.hypot(e.x - d.x, e.y - d.y) + 1 < dMe) {
            dropBlacklist.set(d.dropId, Date.now() + 60000);
            return;
          }
        }
      }
    }
    if (!shouldLoot(d.itemId)) {
      dbg('⛔ ข้าม', nameOf(d.itemId), '(ตัวกรอง mode=' + CFG.filter.mode + ') drop', d.dropId);
      return;
    }
    queue.set(d.dropId, { dropId: d.dropId, itemId: d.itemId, x: d.x, y: d.y, attempts: 0, lastAttemptAt: 0, addedAt: now });
    log('🎯 คิวเก็บ', nameOf(d.itemId), 'drop', d.dropId, '@(', d.x.toFixed(1), d.y.toFixed(1) + ')');
  }
  function markCombat() { lastCombatAt = Date.now(); }

  // ---------- ประมวลผล packet ----------
  function handleIn(u) {
    if (!u.length) return;
    handleAutoTradeInbound(u);
    lastGamePacketAt = Date.now();   // ★★ auto-refresh watchdog — เกมส่งอะไรมา = ยังไม่ค้าง
    // ★★ Packet capture
    if (ASSIST._captureUntil && Date.now() < ASSIST._captureUntil) {
      ASSIST._captureBuf.push({ t: Date.now(), data: new Uint8Array(u) });
    } else if (ASSIST._captureUntil && Date.now() >= ASSIST._captureUntil) {
      ASSIST._captureUntil = 0;
      log('📡 Capture หมดเวลา — พิมพ์ ASSIST.captureStop() เพื่อดูผล');
    }
    const op = u[0];

    // 0x00 LOGIN_RESULT: [00][02 00 00 00][type:2][token:22]... — เกมเองหรือเราส่งก็ได้
    //   ★ token 22 bytes (ยืนยันจาก capture: echo กลับ 24 bytes = type 2 + token 22)
    //   เราจะส่ง SELECT_CHAR เองถ้า 2.5s เกมไม่เลือกตัวละครเอง (ดู handleOut — ถ้าเกมส่งเองเราจะยกเลิก)
    if (op === 0x00 && (autoLoginPhase === 'loginSent' || autoLoginPhase === 'observing') && u.length >= 29) {
      if (u[1] === 0x02) {
        autoLoginToken = u.slice(5, 29);   // [type:2][token:22] — echo กลับไปกับ SELECT_CHAR
        autoLoginPhase = 'acctOk';
        log('🤖 [auto-login] login ผ่าน (ได้ token) → เลือกตัวละคร slot', CFG.autoLoginSlot, 'ใน 2.5s (ถ้าเกมไม่เลือกเอง)');
        console.log('[ASSIST] 🤖 auto-login: login ผ่าน → เลือกตัวละครใน 2.5s');
        setTimeout(() => {
          if (autoLoginPhase === 'acctOk' && activeWS && activeWS.readyState === 1) {
            if (sendSelectCharPacket(autoLoginToken, CFG.autoLoginSlot)) {
              autoLoginPhase = 'charSent';
              log('🤖 [auto-login] ส่งเลือกตัวละครแล้ว (packet) — รอเข้าเกม...');
            }
          }
        }, 2500);
      } else if (autoLoginPhase === 'loginSent') {
        autoLoginPhase = 'failed';
        const hexHead = Array.from(u.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        log('⚠️ [auto-login] login ไม่สำเร็จ (head: ' + hexHead + ') — เช็ค username/password (หยุดลองรอบนี้)');
      }
      return;
    }

    // 0x25 STAT: HP/SP ของ entity → [25][eid:4][statType:4][cur:4][max:4][flag:1]
    //   ★★ ห้ามตั้ง playerId จากที่นี่! STAT ส่งมาให้หลาย entity (player + monster)
    //      entityId แรกที่ส่ง STAT อาจเป็น monster → playerId ผิด → player position ไม่อัปเดต
    //      playerId ต้องมาจาก SELECT_CHAR(0x03) หรือ SPAWN(flag=1) เท่านั้น
    if (op === 0x25 && u.length >= 18) {
      const id = u32(u, 1);
      const st = u32(u, 5);
      const cur = u32(u, 9), m = u32(u, 13);
      // ★★ statType routing — ยึด max-anchor เป็นหลัก ไม่ยึด statType (เปลี่ยนทุก packet บน rayrag):
      //   · max ตรง sp.max (จาก 0x27) ล้วน ๆ → SP
      //   · max ตรง hp.max + (เคย apply type นี้แล้ว / ค่าไม่เต็ม / stat25Loose) → HP
      //   · เต็มจาก type ใหม่ = stat ขยะของ gfix (เต็มเสมอ) → ข้าม
      //   · level-up (max โตขึ้น + cur ≥ เดิม) → ยอมรับเป็น HP ใหม่
      if (id === playerId && m > 0 && cur >= 0 && cur <= m) {
        const hpKnown = hp.max != null && hp.max > 0;
        const spKnown = sp.max != null && sp.max > 0;
        const maxIsHp = hpKnown && m === hp.max;
        const levelUpLike = hpKnown && m > hp.max && cur >= (hp.cur || 0) && !(spKnown && m === sp.max);
        if (spKnown && m === sp.max && !maxIsHp) {
          sp.cur = cur;   // SP (gfix)
        } else if (stat25Loose && maxIsHp) {
          applyStat(id, cur, m);
        } else if (hpAppliedTypes.has(st) && maxIsHp) {
          applyStat(id, cur, m);   // type ที่เคยยืนยันเป็น HP แล้ว — ยอมรับทั้งค่าเต็ม
        } else if ((maxIsHp || !hpKnown || levelUpLike) && (cur < m || hp.cur == null)) {
          applyStat(id, cur, m);
          hpAppliedTypes.add(st);
          if (!stat25Loose && hpAppliedTypes.size >= 3) {
            stat25Loose = true;
            dbg('🧬 0x25 statType ไม่เสถียร (เห็น HP จาก ≥3 type) → ยอมรับทุก type ที่ max ตรง hp.max (สไตล์ rayrag)');
          }
        } else if (!statRouteLogged.has('j' + st)) {
          statRouteLogged.add('j' + st);
          dbg('⏳ 0x25 statType', st, '=', cur + '/' + m, 'เต็ม+type ใหม่ — ข้าม (กัน stat ขยะ gfix)');
        }
      }
    }
    // 0x27 SP_UPDATE: SP ปัจจุบัน + max ของ player (regen ทุก 6s)
    //   ★ mirror world.js:468-477 — STAT (0x25) ส่งแค่ HP ไม่มี SP → SP ต้องอ่านจาก 0x27 เท่านั้น
    //   [27][sp:4][spMax:4] (9 bytes)
    else if (op === 0x27 && u.length >= 9) {
      sp.cur = u32(u, 1);
      sp.max = u32(u, 5);
    }
    // 0x07 MOVE: ตำแหน่ง entity (ทั้ง player + monster/NPC)
    //   ★ player ใช้ i16 (offset 5/7) เหมือน monster เพื่อให้ระบบพิกัดตรงกัน (combat คำนวณระยะ/ทิศได้แม่น)
    //   ★ VALID_COORD: พิกัด Ragnarok อยู่ในช่วง [-500, 1000] — ค่านอกนี้ = parse ผิด → ปฏิเสธ
    else if (op === 0x07 && u.length >= 9) {
      const id = u32(u, 1);
      const x = i16(u, 5), y = i16(u, 7);
      // sanity check: พิกัดต้องอยู่ในช่วงแผนที่ (-500 ถึง 1000) — กัน garbage จาก parse ผิด
      const valid = (x >= -500 && x <= 1000 && y >= -500 && y <= 1000);
      if (!valid) return;   // พิกัดผิดปกติ → ข้ามทั้ง packet
      // ★ (D) stalePlayerIds check — กัน phantom entity จาก oldPlayerId (mirror world.js:1562)
      if (isStaleId(id, nowMs())) return;
      if (playerId != null && id === playerId) {
        player.x = x; player.y = y;
        // ★ ซิงค์ entities[playerId] ให้ตรง player.x/y (กัน entity ค้างที่ค่าผิด)
        const pe = entities.get(playerId);
        if (pe) { pe.x = x; pe.y = y; pe.kind = 0; pe.alive = true; pe._lastSeenAt = nowMs(); }
        else { entities.set(playerId, { id, kind: 0, x, y, alive: true, _lastSeenAt: nowMs() }); }
      } else {
        const e = entities.get(id);
        if (e) { e.x = x; e.y = y; e._lastSeenAt = nowMs(); e._despawnPendingAt = 0; }   // ★ ขยับ = ยังอยู่ (ยกเลิก pending despawn)
        // ★★ entity ใหม่จาก MOVE_UPDATE ที่ไม่เคย SPAWN — ไม่รู้ว่าเป็นอะไร!
        //   ★ อาจเป็น "มอน" ที่เดินเข้ามาจากนอกจอ/มอนมากินของ (SPAWN ยังไม่มาถึง)
        //   → tag _src='move' และห้ามนับเป็นผู้เล่นใน flee (เคยแอบดิสเป็น player → หนีผี)
        //   ถ้าเป็น player จริง เดี๋ยว beacon 0x3c flag=1 จะยืนยันให้ (_src='beacon')
        //   ★★ ยกเว้น: id ที่ sweeper เพิ่งลบ (โดน 1b หลอกขณะยืนนิ่ง) → คืนสถานะเดิมจาก SPAWN แทนผี kind=0
        else {
          const rd = recentlyDespawned.get(id);
          const rdOk = rd && nowMs() < rd.expireAt && !(rd.kind === 1 && isBeaconPlayer(id, nowMs()));
          if (rdOk) {
            recentlyDespawned.delete(id);
            entities.set(id, { id, kind: rd.kind, sub: rd.sub, name: rd.name, x, y, alive: true, _lastSeenAt: nowMs(), _src: 'restore', ...(rd.isBoss ? { _isBoss: true } : {}), ...(rd.isMiniBoss ? { _isMiniBoss: true } : {}) });
            if (rd.kind === 1) dbg('♻️ คืนสถานะมอน', rd.name || id.toString(16), '(โดน 1b ลบไปแล้วกลับมาเคลื่อนที่ — ไม่เป็นผี)');
          } else { entities.set(id, { id, kind: 0, x, y, alive: true, _lastSeenAt: nowMs(), name: '', _src: 'move' }); }
        }
      }
    }
    // 0x0b ATTACK_RESULT: ถ้าตัวเราเป็นคนตี → กำลังสู้
    // ★★ 0x0b จัดการใน handler เต็มด้านล่าง (บรรทัด ~1570) — อย่าดักที่นี่!
    //   (เดิม: else if ที่นี่ดัก 0x0b ไปก่อน → handler เต็ม (mobAttackers/damage/AUTO-DETECT) ไม่ทำงาน!)
    // 0x22 EXP: ได้รับ EXP (solo/party/event ใช้ opcode เดียวกัน)
    //   format: [22][baseTotal:4][baseDelta:4][jobTotal:4][jobDelta:4] (17 bytes)
    //   ★ delta=0 = zone-in sync → ไม่นับ session EXP (mirror world.js:985)
    //   ★★ ไม่นับ kills ที่นี่ — 0x22 มาทุกครั้งที่ได้ EXP (รวม party/event)
    //      kills นับใน 0x0f ENTITY_ACTION action=3 (มอนตายจริง) เท่านั้น
    else if (op === 0x22) {
      lastExpAt = Date.now(); markCombat();
      if (u.length >= 17) {
        const baseDelta = u32(u, 5);    // offset 5 = baseDelta (unsigned — mirror protocol.js:726)
        const jobDelta  = u32(u, 13);   // offset 13 = jobDelta
        const gain = (baseDelta > 0 ? baseDelta : 0) + (jobDelta > 0 ? jobDelta : 0);
        if (gain > 0) stats.expGained += gain;
        // ★ แยก Base/Job EXP (สำหรับ monitor) — mirror world.js:990-991
        if (baseDelta > 0) stats.baseExpGained += baseDelta;
        if (jobDelta > 0) stats.jobExpGained += jobDelta;
      }
      // ★ จดพิกัดมอนที่เราฆ่า — ใช้ target หรือ entity ล่าสุดที่เราตี
      //   สำคัญสำหรับนักธนู: ยิงมอนตายไกล → ของตกที่พิกัดมอน ไม่ใช่ที่ตัวเรา
      let killX = null, killY = null;
      if (target && target.x != null) { killX = target.x; killY = target.y; }
      else if (target) {
        // target อาจถูก abandon แล้ว → หาจาก entity ล่าสุดที่เราตี (_lastEngagedByMeAt)
        let bestT = 0;
        for (const e of entities.values()) {
          if (e._lastEngagedByMeAt && e._lastEngagedByMeAt > bestT && e.x != null) {
            bestT = e._lastEngagedByMeAt; killX = e.x; killY = e.y;
          }
        }
      }
      if (killX != null && killY != null) {
        recentKillPos.push({ x: killX, y: killY, t: Date.now() });
        while (recentKillPos.length > KILL_POS_MAX) recentKillPos.shift();
      }
      for (const d of recentDrops.values()) tryClaim(d);
    }
    // 0x51 ITEM_DROP: ของตก
    else if (op === 0x51 && u.length >= 15) {
      const d = { dropId: u32(u, 1), x: f32(u, 5), y: f32(u, 9), itemId: u16(u, 13), t: Date.now() };
      recentDrops.set(d.dropId, d);
      tryClaim(d);
    }
    // 0x52 PICKUP result (เช็คทั้ง queue ปกติ + warpQueue)
    else if (op === 0x52 && u.length >= 9) {
      const picker = u32(u, 1), dropId = u32(u, 5);
      const it = queue.get(dropId);
      const wit = warpQueue.get(dropId);   // ★ อาจมาจาก warpQueue หลังวาร์ปไปเก็บ
      // ★★ เช็คว่า "เรา" เป็นคนเก็บ (picker === playerId) ไม่ใช่แค่ "ใครบางคนเก็บ"
      //   ปัญหา: คนอื่นเก็บการ์ด → server ส่ง picker = คนอื่น → บอทเข้าใจว่าเก็บได้เอง!
      if (picker !== FAIL && picker === playerId) {
        if (it) { queue.delete(dropId); }
        if (wit) { warpQueue.delete(dropId); log('✨ วาร์ปไปเก็บสำเร็จ:', nameOf(wit.itemId), 'drop', dropId); }
        const itemId = (it || wit).itemId;
        stats.itemsLooted++;
        stats.itemsByCount.set(itemId, (stats.itemsByCount.get(itemId) || 0) + 1);
        // ★ zeny/hour tracking — buyPrice × count (mirror bot.js:401-422)
        const price = itemPrice(itemId);
        if (price > 0) {
          stats.goldWindow.push({ t: nowMs(), gold: price });
          stats.sessionGold += price;
        }
        log('✅ เก็บได้', nameOf(itemId), 'drop', dropId);
        lastLootActivityAt = Date.now();   // ★ จำเวลาไว้ — นั่งพักได้หลังดีเลย์ restDelayMs
        if (lastPickupDropId === dropId) lastPickupDropId = null;   // ★ สำเร็จแล้ว — เลิก map รอ 0x20
        // ★ Card detection — เก็บการ์ดได้ → log สำคัญ
        const itemName = itemDisplayName(itemId);
        if (itemName.endsWith(' Card') || (itemId >= 4001 && itemId <= 4520)) {
          logImportant('card', '🃏 เก็บการ์ดได้! ' + itemName + ' (' + itemId + ')');
        }
        // ★ v4.187.9 Fast retarget: เก็บของชิ้นสุดท้ายเสร็จ → ปลด combat cooldown ทันที
        //   combat loop จะหาเป้าใหม่ใน tick ถัดไป (~combatTickMs) โดยไม่รอ postCombatDelayMs
        if (queue.size === 0 && warpQueue.size === 0) {
          combatCooldownUntil = nowMs();
        }
      } else {
        // server ตอบ FAIL ชัดเจน → ของอาจถูกมอนเก็บไปแล้ว → ลด attempts ที่เหลือให้เหลือ 1 (ลองอีกทีเดียวแล้วปล่อย)
        stats.pickupFails++;
        if (it) {
          if (it.attempts >= CFG.maxAttempts - 1) {
            queue.delete(dropId);
            log('🚫 ปล่อย', nameOf(it.itemId), 'drop', dropId, '(server ตอบ FAIL', it.attempts, 'ครั้ง — ของอาจถูกเก็บไปแล้ว)');
          }
        }
        // wit ไม่ delete ที่นี่ → warpLoop จะจัดการ offset ถัดไป
      }
    }
    // 0x24 DEATH: player ตาย → ล็อค isDead (ห้าม heal ตอนตาย) + รีเซ็ต HP
    else if (op === 0x24 && u.length >= 5 && playerId != null && u32(u, 1) === playerId) {
      isDead = true;
      hp.cur = 0;
      stats.deaths++;
      // ★★ วิเคราะห์ต้นเหตุการตาย — จาก target ที่กำลังสู้ + มอนที่ตีเราล่าสุด (0x0b victim=player)
      //   มอนที่ตีล่าสุด (ใหม่สุดก่อน) = ฆาตกรที่มีโอกาสสูงสุด · กรองเฉพาะที่ตีเราใน 10s ท้าย
      const nowD = nowMs();
      let cause = '';
      if (target) {
        const te = entities.get(target.id);
        cause = 'สู้กับ ' + ((te && te.name) || target.id.toString(16));
      }
      const attackers = [...mobAttackers.entries()]
        .filter(([, t]) => nowD - t < 10000)
        .sort((a, b) => b[1] - a[1])                       // ใหม่สุดก่อน
        .map(([mid]) => { const e = entities.get(mid); return e ? (e.name || mid.toString(16)) : null; })
        .filter(Boolean);
      const uniqAtk = [...new Set(attackers)].slice(0, 3);  // ชื่อซ้ำรวมเป็นตัวเดียว สูงสุด 3
      if (uniqAtk.length > 0) {
        cause = (cause ? cause + ' · ' : '') + 'ตีเราล่าสุด: ' + uniqAtk.join(', ');
      }
      const posInfo = currentMap ? ' @ ' + currentMap + (player.x != null ? ' (' + Math.round(player.x) + ',' + Math.round(player.y) + ')' : '') : '';
      // ★★ ขึ้น Log สำคัญ + Telegram (type=flee ครอบ "หนี/ตาย" อยู่แล้ว)
      logImportant('flee', '☠️ ตาย — ' + (cause || 'ไม่ทราบสาเหตุ') + posInfo);
      // ★★ ตายเปลี่ยนแมปฟาร์ม — หมุนไปแมปถัดไปในรายการ (วนกลับ)
      //   เปลี่ยน CFG.farmMap ทันที → หลัง respawn พักเลือดเต็ม ระบบ farm-guard วาร์ปไปแมปใหม่เอง
      if (CFG.farmRotateOnDeath && Array.isArray(CFG.farmMaps) && CFG.farmMaps.length > 0) {
        CFG.farmMapIdx = ((CFG.farmMapIdx || 0) + 1) % CFG.farmMaps.length;
        const fe = CFG.farmMaps[CFG.farmMapIdx];
        if (fe && fe.map) {
          CFG.farmMap = fe.map;
          CFG.farmMapX = (fe.x != null && fe.x !== '') ? fe.x : -999;
          CFG.farmMapY = (fe.y != null && fe.y !== '') ? fe.y : -999;
          saveConfigDebounced();
          log('♻️ ตาย → หมุนแมปฟาร์มไป:', fe.map, '(' + (CFG.farmMapIdx + 1) + '/' + CFG.farmMaps.length + ') @(', CFG.farmMapX + ',' + CFG.farmMapY + ')');
        }
      }
      target = null;   // ★ ตายแล้วเลิกไล่เป้าเดิม
      // ★ ล้างเวลา buff — ตายแล้ว buff หายหมด → ใช้ใหม่ได้ทันทีหลัง respawn (mirror bot.js:743-746)
      if (lastBuffUse.size > 0) { lastBuffUse.clear(); saveBuffTimesDebounced(); }
      // ★ ล้างเวลา skill + per-target uses (mirror bot.js:744-747)
      if (lastSkillUse.size > 0) { lastSkillUse.clear(); saveSkillTimesDebounced(); }
      skillUsesOnTarget.clear();
      log('☠️ ตัวละครตาย — หยุด heal จนกว่าจะ respawn');
    }
    // 0x12 MAP_NAME: ชื่อแมปปัจจุบัน → เก็บไว้ใช้สำหรับ warp
    //   format: [12][len:2 LE][mapname UTF-8]
    //   ★ ตรวจ "ออกจากแมปฟาร์ม" → วาร์ปกลับอัตโนมัติ (mirror bot.js:1226-1235)
    else if (op === 0x12 && u.length >= 3) {
      const len = u16(u, 1);
      if (u.length >= 3 + len) {
        const name = new TextDecoder().decode(u.slice(3, 3 + len));
        if (name && name !== currentMap) {
          const prevMap = currentMap;
          if (prevMap) marketHandleMapChange(prevMap, name, 'MAP_NAME');
          currentMap = name;
          log('🗺️ แมป:', name, player.x != null ? '@(' + Math.round(player.x) + ',' + Math.round(player.y) + ')' : '(pos ยังไม่รู้)');
          // ★★★ clear entities ของแมปเก่า — กัน monster ค้างติดมาแมปใหม่ (mirror world.js:293-306)
          //   ปัญหา: ไม่ clear → Merman/Strouf จากแมปเก่ายังค้าง → บอทพยายามตีมอนที่ไม่มีจริง
          //   ★★ ห้ามเก็บ myEntry ไว้! (บั๊กหนีตัวเองข้ามแมปวนลูป)
          //   เหตุ 1: entry เก่ามีตำแหน่งแมปเก่า → flee block sync กลับเป็น player.x/y
          //     → บอทคิดว่ายืนอยู่พิกัดแมปเก่าทั้งที่วาร์ปไปแล้ว
          //   เหตุ 2: entities.has(playerId) = true → SELF-DETECT (post-warp) ไม่ทำงาน
          //     → dot จริงของเรา (id ใหม่) ใน minimap แมปใหม่ถูกนับเป็น "ผู้เล่นคนอื่น"
          //     → หนีตัวเองรัว ๆ ข้ามแมป (วาร์ปส่วนใหญ่ล้ม = ยิ่งวนยิ่งหนี)
          entities.clear();
          monsterAggro.clear(); mobAttackers.clear();
          // ★ ต่อ warpGuard ใหม่ — แมปเพิ่งเปลี่ยน entityId ใหม่ ให้ SELF-DETECT จับ dot ตัวเองจาก minimap ได้
          //   (กัน server ช้า ส่ง minimap มาหลัง guard 3s จาก teleport หมดแล้ว → dot เรากลายเป็นผี)
          warpGuardUntil = nowMs() + 3000;
          target = null;
          queue.clear(); recentDrops.clear();   // ★★ เคลียร์ loot แมปเก่า (กันเก็บของจากแมปเดิม)
          dbg('🧹 ล้าง entities + loot แมปเก่า (เปลี่ยนแมป)');
          bossAlertedIds.clear();   // ★ ล้าง boss alert cache (เริ่มนับใหม่ในแมปใหม่)
          navWanderReset();   // ★ เปลี่ยนแมป → reset wander state (ล้าง target เก่า)
          navPatrolReset();   // ★ reset patrol state ด้วย
          // ★ warp-back-to-farm: ออกจากแมปฟาร์ม → วาร์ปกลับ
          //   เงื่อนไข: warpBackToFarm=on AND farmMap ไม่ว่าง AND ตอนนี้ไม่ใช่ farmMap
          //   ★★ ไม่จำกัดแค่ "มาจาก farmMap" — ถ้าอยู่แมปผิดก็วาร์ปกลับเสมอ (กันติดแมปอื่น)
          //   ยกเว้น: อยู่ใน sell/storage routine (sellNpcMap/kafraMap) — ไม่วาร์ปกลับ
          //   ★★★ guard เพิ่ม (จาก log จริง — วาร์ปปิงปองรัว ๆ + ตายซ้ำ):
          //   1. Guard เปิด → combatLoop guard branch คุมแมปเอง (0x12 ดึงไป farmMap สู้กับ
          //      Guard ดึงมา guardMap ไม่จบ — กรณี farmMap ≠ guardMap เช่น prt_fild07 vs pay_fild07)
          //   2. เพิ่งตาย/กำลังพักหลัง respawn → ห้าม warp กลับทันที (เคยวาร์ปกลับไปตก
          //      จุดมอนเดิมด้วย HP 2% → ตายซ้ำใน 3 วิ) — รอ postRespawnRest พักจบก่อน
          //      แล้ว combatLoop farm-guard จะวาร์ปกลับเอง (throttle 5s + รอพักเรียบร้อย)
          //   3. กำลังขาย/ฝากอยู่ → ห้ามแทรก warp กลาง routine
          //   4. ★ กำลังไปรับบัพจากบอทอีกตัว (buffVisit) และแมปนี้คือแมปจุดรับ → ห้ามดึงกลับ
          //      (ไม่งั้นวาร์ปปิงปอง farm-guard vs buffVisit เหมือนเคส Guard)
          if (CFG.warpBackToFarm && CFG.farmMap && name !== CFG.farmMap
              && name !== CFG.sellNpcMap && name !== CFG.kafraMap
              && !(CFG.guardEnabled && CFG.guardMap)
              && !(typeof buffVisitState !== 'undefined' && buffVisitState !== 'IDLE' && name === CFG.buffVisitMap)
              && !(typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE')
              && !isDead
              && !(typeof postRespawnRest !== 'undefined' && postRespawnRest)
              && !(typeof sellState !== 'undefined' && sellState !== 'IDLE')
              && !(typeof storageState !== 'undefined' && storageState !== 'IDLE')) {
            log('🌀 อยู่แมปผิด (' + name + '≠' + CFG.farmMap + ') → วาร์ปกลับ');
            sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
            lastFarmWarpBackAt = nowMs();
          }
        }
      }
    }
    // 0x03 SELECT_CHAR: server ตอบหลังเลือกตัวละคร — ★ ฝัง mapName (MAP_NAME ไม่ส่งตอน login ครั้งแรก)
    //   format: [03][eid:4][len:2][mapname null-terminated]
    else if (op === 0x03 && u.length >= 7) {
      const eid = u32(u, 1);
      // ★ auto-login: SELECT_CHAR ตอบกลับ = เข้าเกมสำเร็จ
      if (autoLoginPhase === 'charSent' || autoLoginPhase === 'clientSelect') {
        autoLoginPhase = 'done';
        log('🤖 [auto-login] เข้าเกมสำเร็จ! (slot', CFG.autoLoginSlot + ') — ระบบทำงานต่ออัตโนมัติ');
        console.log('[ASSIST] 🤖 auto-login: เข้าเกมสำเร็จ! ✅');
      }
      // ★★ SELECT_CHAR = คำตอบตรงจาก server ตอนผู้ใช้กดเลือกตัวละคร → authoritative เสมอ
      //   เดิม: อัปเดตเฉพาะตอน playerId == null → logout แล้ว login ตัวใหม่ → playerId ค้างเป็นตัวเก่า
      //   → SPAWN ของตัวใหม่โดน guard "ชื่อ ≠ playerName เก่า" บล็อค → HP/ตำแหน่งไม่อัปเดตตลอด!
      if (eid) {
        if (playerId !== eid) {
          if (playerId != null) {
            log('🔄 สลับตัวละคร: player_id', playerId.toString(16), '→', eid.toString(16), '(จาก SELECT_CHAR)');
            stalePlayerIds.set(playerId, nowMs() + 300000);
          } else {
            log('👤 player_id =', eid.toString(16), '(จาก SELECT_CHAR)');
          }
          // reset ทุกอย่างที่ผูกกับตัวละครเก่า — ตัวใหม่เริ่มสะอาด
          entities.clear(); monsterAggro.clear(); mobAttackers.clear();
          playerName = null;          // ★ ชื่อเก่าใช้ไม่ได้ — ให้ SPAWN ตัวใหม่ตั้งชื่อใหม่
                                    //   (ไม่ reset แล้ว guard ชื่อจะบล็อค SPAWN self ของตัวใหม่!)
          hp.cur = null; hp.max = null;
          sp.cur = null; sp.max = null;
          player.x = null; player.y = null;
          isDead = false; postRespawnRest = false; isResting = false;
          autoRespawnUnstuckPending = false; autoRespawnUnstuckReadyAt = 0; // สลับตัวละคร → ห้าม carry pending จากตัวเก่า
          playerId = eid; selfIdConfirmed = true;
        } else if (!playerName) {
          // ตัวเดิม re-login แต่ยังไม่รู้ชื่อ — ปล่อยให้ SPAWN ตั้ง
        }
      }
      const mapLen = u16(u, 5);
      if (u.length >= 7 + mapLen && mapLen > 0) {
        let name = new TextDecoder().decode(u.slice(7, 7 + mapLen));
        name = name.split('\0')[0];   // ตัดที่ null terminator
        if (name && name !== currentMap) {
          const prevMap = currentMap;
          if (prevMap) marketHandleMapChange(prevMap, name, 'SELECT_CHAR');
          currentMap = name;
          log('🗺️ แมป:', name, '(จาก SELECT_CHAR)');
        }
      }
    }
    // 0x2a WARP_FAIL: server บอกว่าพิกัดวาร์ป invalid (กำแพง/น้ำ) → warpLoop จะลอง offset ถัดไป
    //   format: [2a][02]
    else if (op === 0x2a && u.length >= 2) {
      if (lastWarpTargetId != null) {
        const wit = warpQueue.get(lastWarpTargetId);
        if (wit) {
          log('⚠️ วาร์ป fail (พิกัด invalid) → ลอง offset ถัดไป:', nameOf(wit.itemId));
          wit.offsetIdx++;              // บังคับ offset ถัดไปใน warpLoop
          wit.warpAt = 0;               // ให้ warpLoop วาร์ปใหม่ได้เลย (ผ่าน cooldown)
        }
        lastWarpTargetId = null;
      }
    }
    // 0x36 DESPAWN_REASON: [36][eid:4][reason:4] — reason=2 = entity ถูกเก็บไป (โดย player หรือมอน loot)
    //   ★ สำคัญ: ถ้าของที่เรารอเก็บถูกมอน loot (เช่น Poring กินของ) → ลบออกจาก queue ทันที ไม่ต้องลองเก็บเปล่าๆ
    else if (op === 0x36 && u.length >= 9) {
      const eid = u32(u, 1);
      const reason = u32(u, 5);
      // ★★ reason=5: คู่กับ 1b เสมอ (จาก capture) = มอนยังอยู่ แค่เปลี่ยน state — ยืนยัน entity
      if (reason === 5) {
        const e5 = entities.get(eid);
        if (e5) { e5._despawnPendingAt = 0; e5._lastSeenAt = nowMs(); }
      }
      if (reason === 2) {
        // ของถูกเก็บไป → ลบจาก queue/recentDrops/warpQueue
        if (queue.has(eid)) {
          const it = queue.get(eid);
          queue.delete(eid);
          log('🗑️ ของหายไป:', nameOf(it.itemId), 'drop', eid, '(ถูกเก็บไปแล้ว — อาจโดยมอน loot)');
        }
        recentDrops.delete(eid);
        warpQueue.delete(eid);
      }
    }
    // ============== SELL / INVENTORY packets ==============
    // 0x32 INVENTORY_UPDATE (IN) — mirror protocol.js:1217-1281
    //   โครงสร้างจริง (19B): [32][03][invId:4=itemId×2][02 00][seqId:4][invId:4][count_enc:2][flag:1]
    //   offset: 0=op 1=sub 2..5=invId 6..7=const(02 00) 8..11=seqId 12..15=invId repeat 16..17=count_enc 18=flag
    //   itemId = invId >>> 1   (bit-packed: bit 0 = identified flag)
    //   count  = count_enc >>> 1  (bit-packed: bit 0 = flag; real = count_enc/2)
    //   หลักฐาน: Heart of Mermaid 160 → 0x0140=320; Meat 11 → 0x0016=22; Poison Spore 18 → 0x0024=36
    else if (op === 0x32 && u.length >= 6) {
      const sub = u[1];
      if (sub === 3 && u.length >= 18) {
        // ★ stackable: set count ตรงจาก server (รองรับทั้งเพิ่ม/ลด/ใช้)
        const invId = u32(u, 2);
        const itemId = invId >>> 1;
        // ★ count_enc อยู่ offset 16-17 (protocol.js:1270-1278)
        const countEnc = u16(u, 16);
        const count = countEnc >>> 1;
        if (itemId > 0 && itemId < 50000) {
          const prevCnt = inventory.get(itemId);
          applyWeightDelta(itemId, prevCnt || 0, count);
          inventory.set(itemId, count);   // SET ตรงจาก server (แม่นยำเสมอ)
          // ★ จดว่า "เก็บได้ใน session นี้" เมื่อจำนวนเพิ่มขึ้น (หรือเห็นครั้งแรก) — สำหรับแท็บสถิติ
          if (prevCnt == null || count > prevCnt) sessionPickups.set(itemId, Date.now());
          // ★ ฝาก stackable สำเร็จจริง (จำนวนลดจาก server) — สำหรับสรุปผลตอนปิด storage
          if (typeof storageMoveQueue !== 'undefined' && storageState === 'MOVE_ITEMS' && prevCnt != null && count < prevCnt) {
            for (const q of storageMoveQueue) if (!q.isEquipment && q.itemId === itemId) q._confirmed = true;
          }
        }
      } else if (sub === 5 && u.length >= 15) {
        // ★ equipment add (sub=5): itemId @ offset 12 (2B LE) bit-packed >>> 1
        //   slotId @ offset 2 (4B LE) bit-packed >>> 1 — mirror protocol.js:1237-1248
        //   ★★ track slotId สำหรับฝากเข้า storage (storage ต้องการ slotId ไม่ใช่ itemId)
        const itemId = u16(u, 12) >>> 1;
        const slotId = u32(u, 2) >>> 1;   // เช่น Bow(1701) slot 20010 → offset2 = 40020
        if (itemId > 0 && itemId < 50000) {
          inventory.set(itemId, (inventory.get(itemId) || 0) + 1);
          // ★★ เพิ่มเข้า equipmentList ทันที (ถอดจากคาฟรา / เก็บ equipment จากพื้น)
          //   ยืนยันจาก capture: ถอด Chain(1520)/Boots(2405) จากคาฟรา → 0x56 ตอบ itemId ตามด้วย 0x32-05
          equipmentList.push({ id: itemId, worn: false, card: 0, refine: 0 });
          invDataVer++;
          sessionPickups.set(itemId, Date.now());   // ★ เก็บ/ได้มาใน session นี้
          // ★ track slot id ของแต่ละชิ้น (mirror world.js:773-777)
          if (slotId > 0) {
            const slots = equipmentSlots.get(itemId) || [];
            if (!slots.includes(slotId)) slots.push(slotId);
            equipmentSlots.set(itemId, slots);
            verifiedEquipSlots.add(slotId);   // ★ ยืนยันแน่จาก server (ต่างจาก @28 ของ login block)
          }
          dbg('⚔️ +equipment:', nameOf(itemId), '(slot', slotId + ') — รายการ equip อัปเดต');
        }
      } else if (sub !== 3 && sub !== 5 && u.length >= 7 && u.length <= 14) {
        // ★★ equipment removal (drop/sell/move to storage) — 12B packet
        //   โครงสร้าง: [32][sub][slotId×2:4][02 00][...] (protocol.js:1256-1264)
        //   ใช้ล้าง slot id ออกจาก equipmentSlots กัน stale slot
        const rawSlot = u32(u, 1);
        if (rawSlot > 0) {
          const slotId = rawSlot >>> 1;
          if (slotId > 0 && slotId < 100000) {
            for (const [itemId, slots] of equipmentSlots) {
              const idx = slots.indexOf(slotId);
              if (idx >= 0) {
                slots.splice(idx, 1);
                const cur = inventory.get(itemId) || 0;
                if (cur > 1) inventory.set(itemId, cur - 1);
                else inventory.delete(itemId);
                if (slots.length === 0) equipmentSlots.delete(itemId);
                // ★★ ลบออกจาก equipmentList 1 ชิ้น (ฝากเข้าคาฟรา/ขาย/ทิ้ง — เฉพาะชิ้นที่ server ยืนยัน)
                const eqIdx = equipmentList.findIndex(x => x.id === itemId);
                if (eqIdx >= 0) equipmentList.splice(eqIdx, 1);
                invDataVer++;
                inventoryFull = false;   // ★ server ยืนยันมีของออกจริง = slot ว่างแน่นอน
                // ★ ทำเครื่องหมายว่ารายการฝากชิ้นนี้สำเร็จจริง (สำหรับสรุปผลตอนปิด storage)
                if (typeof storageMoveQueue !== 'undefined' && storageState === 'MOVE_ITEMS') {
                  for (const q of storageMoveQueue) if (q.isEquipment && q.invId === slotId) q._confirmed = true;
                }
                break;
              }
            }
          }
        }
      }
      // ★ sub อื่น ๆ → ไม่ track (protocol.js:1265 ทิ้ง)
    }
    // 0x30 EQUIP_CHANGE (IN): [30][invIdx:1][4e 00 00][equipSlot:1][res:1] — ผลการสวมใส่/ถอด
    //   ★ capture 18 ครั้ง: slot นิ่งต่อชนิดของ — 4=อาวุธ (Chain/Masamune), 7=รองเท้า (Boots)
    //   ★ ชุด equipment รวม (สวมใส่+ในถุง) ไม่เปลี่ยน → equipmentList ไม่ต้องแก้
    //     ตามมาเสมอด้วย 0x31 (stat) + 0x38 resend (น้ำหนัก+inventory แม่น)
    else if (op === 0x30 && u.length >= 7 && u[2] === 0x4e) {
      const invIdx = u[1], eqSlot = u[5];
      const slotName = ({ 0: 'เสื้อ', 1: 'หมวก', 2: 'หมวกกลาง', 3: 'หมวกล่าง', 4: 'อาวุธ', 5: 'โล่', 6: 'ผ้าคลุม', 7: 'รองเท้า', 8: 'แหวน', 9: 'แหวน 2' })[eqSlot] || ('slot ' + eqSlot);
      const o = lastOutEquip;
      const recentOut = o && Date.now() - o.at < 3000;
      // ★ จับคู่ด้วย idx — การสวมใส่ "แทนที่" มาเป็นคู่ (ชิ้นเก่าถอด idx อื่น + ชิ้นใหม่ใส่ idx ตรงกับ OUT)
      const matchOut = recentOut && o.idx === invIdx;
      // ★★ อัปเดตรายการถุง real-time — invIdx = bag slot id & 0xFF
      //   (ยืนยันจาก capture: Chain 20011=0x4E2B → idx 0x2B=43 ✓ · Boots 20012 → 44 ✓)
      //   สวม → หายจากถุง · ถอด → กลับมาในถุง (เฉพาะชิ้นที่รู้ slot id จาก sub=5)
      let wantWorn = null;
      if (matchOut) wantWorn = (o.action === 1);
      else if (recentOut && o.action === 1) wantWorn = false;   // ข้อความคู่ของ swap = ชิ้นเก่าถูกถอดออก
      if (wantWorn !== null) {
        // ★ หาชิ้นจาก slot low-byte — เช็คทั้ง equipmentSlots (ของ sub=5) และ slotId ใน record (ของ login)
        let rec = null, slotFull = null;
        for (const [iid, slots] of equipmentSlots) {
          const f = slots.find(s => (s & 0xff) === invIdx);
          if (f != null) { slotFull = f; rec = equipmentList.find(x => x.id === iid && x.slotId === f) || equipmentList.find(x => x.id === iid); break; }
        }
        if (!rec) {
          rec = equipmentList.find(x => x.slotId != null && (x.slotId & 0xff) === invIdx && x.worn !== wantWorn)
             || equipmentList.find(x => x.slotId != null && (x.slotId & 0xff) === invIdx);
          if (rec) slotFull = rec.slotId;
        }
        if (rec && rec.worn !== wantWorn) {
          if (rec.slotId != null) slotFull = rec.slotId;
          rec.worn = wantWorn;
          if (wantWorn) {
            // ★ สวม → ออกจากถุง: ถอด slot ออกจาก equipmentSlots (กันส่งฝากแล้วโดน "equipped")
            if (slotFull != null) {
              const ss = equipmentSlots.get(rec.id);
              if (ss) { const si = ss.indexOf(slotFull); if (si >= 0) ss.splice(si, 1); if (ss.length === 0) equipmentSlots.delete(rec.id); }
            }
          } else if (slotFull != null) {
            // ★ ถอด → กลับเข้าถุง: คืน slot เดิม (ยืนยัน: สวม/ถอดใช้ idx เดิมซ้ำ)
            const ss = equipmentSlots.get(rec.id) || [];
            if (!ss.includes(slotFull)) ss.push(slotFull);
            equipmentSlots.set(rec.id, ss);
          }
          invDataVer++;
        }
      }
      if (matchOut) {
        log(o.action === 1 ? ('⚔️ สวมใส่ → ' + slotName) : ('🧤 ถอด ' + slotName), '(inv#' + invIdx + ')');
        lastOutEquip = null;
      } else if (!recentOut) {
        dbg('⚔️ equip-change slot ' + eqSlot + ' (inv#' + invIdx + ')');
      }
    }
    // 0x20 SYS_MESSAGE: detect "too full" → inventoryFull (mirror world.js:264-279)
    else if (op === 0x20 && u.length >= 2) {
      try {
        const msg = new TextDecoder('utf8', { fatal: false }).decode(u.slice(1)).toLowerCase();
        if (msg.includes('too full') || msg.includes('inventory is full') || msg.includes('cannot carry') || msg.includes('กระเป๋าเต็ม')) {
          if (!inventoryFull) log('🎒 ของเต็ม! (inventory full)');
          inventoryFull = true;
        }
        // ★★ loot ownership — "You are unable to pick up this item yet."
        //   = ของ drop จากมอนที่คนอื่นตี (server ล็อคให้เจ้าของ) — request 0x52 ถูกปฏิเสธเงียบ ๆ
        //   → เลิกลองทันที + blacklist 60s กันวนลูป (capture: บอทเคยยิง 0x52 ซ้ำ 5 ครั้งเปล่า ๆ)
        if (msg.includes('unable to pick up') && lastPickupDropId != null) {
          const dropId = lastPickupDropId;
          const it = queue.get(dropId);
          queue.delete(dropId);
          dropBlacklist.set(dropId, Date.now() + 60000);
          stats.pickupFails++;
          log('🔒 ของของคนอื่น (server ล็อค "unable to pick up yet") — ปล่อย', it ? nameOf(it.itemId) : 'item', 'drop', dropId, '(blacklist 60s)');
          lastPickupDropId = null;
        }
        if (msg.includes('could not complete sale') || msg.includes('do not match')) {
          // sell failed signal — ★★ จบเลย ไม่รอ timeout 15s (เดิมแค่ log แล้วค้างใน state SELL)
          if (sellState === 'SELL') {
            // ★★ ล้มเหลว → ลองส่งซ้ำ 1 รอบแบบ equipment อ้าง itemId ตรง ๆ (เหมือนช่องทาง 0x5b)
            if (pendingSellEquip.length > 0 && !sellEqRetryMode) {
              sellEqRetryMode = true;
              const retryItems2 = (lastSellSentItems && lastSellSentItems.length ? lastSellSentItems : []).map(i => i.realId == null ? i : { itemId: i.realId, count: 1 });
              log('🔁 ขายไม่ผ่าน (server ปฏิเสธ) → ลองส่งใหม่โดย equipment อ้าง itemId ตรง ๆ', pendingSellEquip.length, 'ชิ้น');
              sendSellItems(retryItems2);
              sellStateAt = nowMs();   // รอผลรอบลองใหม่ (ยังอยู่ state SELL)
              return;
            }
            log('⚠️ ขายของล้มเหลว (server ปฏิเสธ)');
            pendingSellEquip = []; sellEquipRoundSent = false; sellEqRetryMode = false;
            sendSellClose();
            sellState = 'WARP_BACK'; sellStateAt = nowMs();
          }
        }
        // ★ ฝากของที่กำลังสวมอยู่ — server ปฏิเสธเงียบ ๆ (เคสจริง: slot id เลื่อนไปโดนชิ้นที่สวม)
        if (msg.includes("while it's equipped") || msg.includes('while equipped')) {
          log('⚠️ ฝากไม่ได้: ชิ้นนั้นกำลังถูกสวมอยู่ (Cannot store while equipped)');
        }
      } catch (e) {}
    }
    // 0x2c CHAT: [2c][sender:4][msg_len:2][msg][name_len:2][name][chat_type:1]
    //   chatType: 0=nearby, 1=shout, 2=whisper (mirror protocol.js:1113-1128)
    //   ★ ตรวจคำว่า bot/บอท/บอต → log สำคัญ
    else if (op === 0x2c && u.length >= 7) {
      try {
        let p = 1;
        const sender = u32(u, p); p += 4;
        const msgLen = u16(u, p); p += 2;
        if (p + msgLen > u.length) return;
        const message = new TextDecoder('utf8', { fatal: false }).decode(u.slice(p, p + msgLen));
        p += msgLen;
        let name = '';
        if (p + 2 <= u.length) {
          const nameLen = u16(u, p); p += 2;
          if (p + nameLen <= u.length) {
            name = new TextDecoder('utf8', { fatal: false }).decode(u.slice(p, p + nameLen));
            p += nameLen;
          }
        }
        let chatType = -1;
        if (p < u.length) chatType = u[p];
        const typeNames = { 0: 'ใกล้', 1: 'ตะโกน', 2: 'กระซิบ' };
        const typeName = typeNames[chatType] || ('type' + chatType);
        // ★★ /where response (sender=ffffffff = server) — ตำแหน่งแม่นยำจาก server
        //   "You are at 126,77 on map izlude." → อัปเดต player.x/y ทันที (oracle พิสูจน์แล้วจาก capture)
        if (sender === 0xffffffff) {
          const wm = message.match(/^You are at (-?\d+),\s*(-?\d+) on map (\S+?)\.?$/);
          if (wm) {
            const wx = parseInt(wm[1], 10), wy = parseInt(wm[2], 10);
            if (wx >= -500 && wx <= 1000 && wy >= -500 && wy <= 1000) {
              player.x = wx; player.y = wy;
              const whereMap = wm[3];
              if (whereMap && whereMap !== currentMap) {
                const prevMap = currentMap;
                dbg('📍 /where ยืนยันแมป ' + whereMap + ' (เดิม ' + (currentMap || '?') + ') → อัปเดต currentMap');
                if (prevMap) marketHandleMapChange(prevMap, whereMap, '/where');
                currentMap = whereMap;
              }
              if (playerId != null) {
                const pe = entities.get(playerId);
                if (pe) { pe.x = wx; pe.y = wy; pe._lastSeenAt = nowMs(); }
              }
              dbg('📍 /where → (' + wx + ',' + wy + ') แมป ' + whereMap);
            }
          }
        }
        // ★ เก็บลง chat history buffer (สำหรับ monitor)
        chatBuf.push({ t: Date.now(), type: typeName, chatType, sender: name || '?', message });
        while (chatBuf.length > CHAT_BUF_MAX) chatBuf.shift();
        // ★ จำแชทล่าสุดของผู้พูด — สำหรับ "บัพตามคำขอ" (buffChatKeyword) + เก็บกวาดเก่า ๆ กัน map โต
        if (name && name.trim()) {
          chatReqBy.set(name.trim().toLowerCase(), { msg: message, at: Date.now() });
          if (chatReqBy.size > 64) { const _cut = Date.now() - 120000; for (const [k, v] of chatReqBy) if (v.at < _cut) chatReqBy.delete(k); }
        }
        // ★ v4.189.27 nearby/whisper จากผู้เล่นอื่น → แจ้งเตือน + pause; ไม่ตอบอัตโนมัติ
        if (CFG.chatPauseOnIncoming && sender !== 0xffffffff && (chatType === 0 || chatType === 2)
            && name && name.trim() && (!playerName || name.trim().toLowerCase() !== String(playerName).trim().toLowerCase())) {
          triggerChatPause(name.trim(), message, chatType, typeName, false);
        }
        // ★ ตรวจคำต้องห้าม
        const lower = message.toLowerCase();
        if (lower.includes('bot') || message.includes('บอท') || message.includes('บอต')) {
          logImportant('chat', '💬 [' + typeName + '] ' + (name || '?') + ': ' + message);
        }
        // ★ ส่งแชท nearby/whisper ทุกข้อความไป Telegram (ถ้าเปิด toggle)
        else {
          const alertMsg = '💬 [' + typeName + '] ' + (name || '?') + ': ' + message;
        }
      } catch (e) {}
    }
    // 0x38 MAP_DATA: zone-enter data — ★ มี zeny ที่ offset 9 (u32LE)
    //   format: [38][u32:?][u32:?][u32:ZENY][...rest...] (mirror protocol.js:1415-1421)
    //   ★ ส่งตอนเข้าแมป/วาร์ป — เป็นแหล่งเดียวที่บอก zeny ปัจจุบัน
    //   ★★ ตัวที่สอง (หลัง SELECT_CHAR) มี INVENTORY เริ่มต้นท้าย packet!
    //   (จาก capture เปรียบเทียบ 3 ครั้ง: ว่าง / Orange Potion 502×1 / +Red Herb 507×2)
    //   โครง: ...[น้ำหนัก:2] + signature `05 00 02 00 0e 04 00 02 00 00` + [prelude 5B]
    //   + รายการ [id×4 :u32][count×4 :u16] จน id=0 — เช่น d8 07 00 00 = 2008 = 502×4 ✓
    else if (op === 0x38 && u.length >= 13) {
      const zeny = u32(u, 9);
      if (zeny != null && zeny !== playerZeny) {
        playerZeny = zeny;
      }
      // ★★★ parse inventory เริ่มต้น + น้ำหนัก (generalize — ทดสอบผ่าน capture จริง 4 ไฟล์)
      //   anchor: [01|02 00 00 00][maxW×10 :u32][f32 0.9x][curW×10 :u16] (prefix ต่างกันตามตัวละคร)
      //   รายการ: [id×4 :u32][count×4 :u16] — จุดเริ่ม validation-scan + จบสะอาด (idEnc=0)
      //   กันข้อผิดพลาด: เพดาน id ≤ 12000 (ของจริงสูงสุด 7033) + ตัด phantom (id<100 แต่ count>500)
      //   ยืนยัน: ว่าง [] · 502×1 · 502×1+507×2 · testmage 55 ชนิด 1397 ชิ้น 3147.8/3820 ✓ 4/4
      for (let i = 10; i < u.length - 16; i++) {
        // ★ byte แรก = count/type — เจอได้ทั้ง 01/02 (เข้าแมป) และ 06/08 (resend หลังสวมใส่/ถอด/คาฟรา)
        //   → รับ 0x01-0x20 (ไม่รับ 0 = กันตัดเข้าก้อน stat ที่เป็นเลข 0)
        if (u[i] < 0x01 || u[i] > 0x20 || u[i+1] || u[i+2] || u[i+3]) continue;
        const _mw = u32(u, i + 4);
        if (_mw % 10 !== 0 || _mw < 1000 || _mw > 999990) continue;
        // ★ f32 สัดส่วน ~0.04-0.99 → exponent byte = 3d/3e/3f (เดิมรับ 3f เท่านั้น — หลุดเคส < 0.5)
        if (u[i + 11] < 0x3d || u[i + 11] > 0x3f) continue;
        const _cw = u16(u, i + 12);
        if (_cw > _mw) continue;   // น้ำหนักมีทศนิยม (3147.8 → 31478) ไม่เช็ค %10
        // ★★ server ส่ง 0x38 ซ้ำทุกครั้งหลังสวมใส่/ถอด/ฝาก-ถอดคาฟรา → re-sync น้ำหนักแม่น (แก้ delta drift)
        if (_cw / 10 !== playerWeight || _mw / 10 !== playerMaxWeight) invDataVer++;
        playerMaxWeight = _mw / 10; playerWeight = _cw / 10;
        const tryParse = (s) => {
          let p = s; const items = [];
          while (p + 6 <= u.length) {
            const idE = u32(u, p); if (idE === 0) return items;
            if (idE % 4) return null;
            const cE = u16(u, p + 4); const id = idE >>> 2, c = cE >>> 2;
            if (id <= 0 || id > 12000 || c <= 0 || c > 30000 || cE % 4) return null;
            if (id < 100 && c > 500) return items;   // phantom จากก้อน equipment ต่อท้าย
            items.push([id, c]); p += 6;
          }
          return null;
        };
        let items = null;
        for (let s = i + 14; s < i + 60; s++) { const r = tryParse(s); if (r && r.length >= 1) { items = r; break; } }
        if (items && items.length > 0) {
          for (const [iid, c] of items) inventory.set(iid, c);
          dbg('🎒 inventory เริ่มต้น: ' + items.length + ' รายการ (' + items.reduce((s2, x) => s2 + x[1], 0) + ' ชิ้น) — ' + items.slice(0, 8).map(([id, c]) => nameOf(id) + '×' + c).join(', ') + (items.length > 8 ? ' ฯลฯ' : ''));
        }
        break;   // เจอ anchor น้ำหนักแล้ว — ไม่ต้องไล่ต่อ
      }

      // ★★ EQUIPMENT INVENTORY — ก้อน 0x13880 (stride 44) — สแกนแบบ "อิสระ" จาก anchor น้ำหนัก
      //   เพราะบางตัวละคร anchor ไม่ match (เช่น maxW=31284 หาร 10 ไม่ลงตัว) → เดิมหลุดทั้งก้อน!
      //   ★★ มีเฉพาะตอนเข้าเกม — 0x38 resend หลังสวมใส่/ถอด/คาฟราไม่มีก้อนนี้ → ไม่ล้างของเดิม
      if (u.length > 100) {
        let eqStart = -1;
        for (let q = 10; q < u.length - 44; q++) {
          if (u32(u, q) === 0x13880) { eqStart = q; break; }
        }
        if (eqStart >= 0) {
          equipmentList.length = 0;
          invDataVer++;
          // ★★ login = ความจริงชุดใหม่ → ล้าง slot id เก่าก่อน (relogin จัดเลขใหม่หมด)
          equipmentSlots.clear();
          // ★ pass 1: อ่าน records ทั้งหมด — inst = 0x13880 + 4×i (ไม่จำกัดขอบ 0x13900 เดิม
          //   เพราะมีตัวละครถือ 59 ชิ้น → inst ไปถึง 0x13968)
          //   ก้อน = สวมอยู่ + ในถุง รวมกัน · u8@11>>2 = refine · u32@28>>2 = card id
          let ep = eqStart;
          const recs = [];
          while (ep + 44 <= u.length) {
            const inst = u32(u, ep);
            if (inst < 0x13880 || (inst - 0x13880) % 4 !== 0) break;
            const idE2 = u32(u, ep + 4);
            if (idE2 === 0 || idE2 % 4 !== 0) break;
            const eqId = idE2 >>> 2;
            if (eqId <= 0 || eqId > 12000) break;
            const f28 = u32(u, ep + 28);
            const cardId = f28 >> 2;
            const refineE = u[ep + 11] >> 2;
            recs.push({
              id: eqId,
              worn: false,
              card: (cardId >= 4001 && cardId <= 4600) ? cardId : 0,
              refine: refineE > 1 ? refineE : 0,
              inst,
              // ★★★ slot id ยึด "inst ของชิ้นเอง" — capture ยืนยัน: ตัวเกมขาย 0x4E25(20005) ให้ชิ้น inst 0x13894
              //   และหลังขาย/ฝาก server resend ก้อนโดย "คง inst เดิม" (มีช่องว่าง ไม่เรียงใหม่!)
              //   → ตำแหน่งในก้อนเลื่อน แต่ slot จริงของชิ้นไม่เปลี่ยน — สูตรเดิม (20000+ตำแหน่ง)
              //   เพี้ยนทั้งชุดหลังมีของถูกเอาออก → ขายโดนปฏิเสธ + 0x32 removal หา slot ไม่เจอ (UI ค้าง)
              slotId: 20000 + (inst - 0x13880) / 4,
            });
            ep += 44;
          }
          // ★★★ pass 2: "หาง" ท้ายก้อน = รายการ inst ของของที่กำลังสวมอยู่ (0 = ช่องว่าง
          //   เช่น ช่องโล่ตอนถือดาบ 2 มือ) — ตัวชี้รายการถูกตำแหน่งสวมใส่แบบแน่นอน
          //   ยืนยัน 4/4 captures: testmage สวม 6 ชิ้นตรงเป๊ะ · superogira0 9 ชิ้น · ไม่สวม = ไม่มี
          //   ★★ หา record จาก inst ตรง ๆ (เดิมใช้ดัชนี array — พังกับก้อน resend ที่มีช่องว่าง:
          //     inst 0x138d4 = ดัชนี 21 แต่ในก้อนใหม่มีแค่ 6 แถว → recs[21] undefined → worn หาย)
          const recByInst = new Map(recs.map(r => [r.inst, r]));
          for (let o = ep; o <= u.length - 4; o++) {
            const v = u32(u, o);
            if (v >= 0x13880 && (v - 0x13880) % 4 === 0) {
              const r2 = recByInst.get(v);
              if (r2) r2.worn = true;
            }
          }
          // ★★ pass 3: ลงทะเบียน slot (คำนวณจาก inst แล้วใน pass 1)
          //   ★ ของที่สวมก็ยังถือ slot ของตัวเอง (ไม่หายไปไหน) — ยืนยันจาก server error
          //   "Cannot store an item while it's equipped" + สวม/ถอดกลับมาที่ slot เดิมเสมอ
          //   → เก็บ slotId ไว้ใน record ทุกชิ้น แต่ลงทะเบียนให้ฝาก/ขายได้เฉพาะชิ้นที่ไม่ได้สวม
          for (let bi = 0; bi < recs.length; bi++) {
            const r = recs[bi];
            if (!r.worn) {
              const slots2 = equipmentSlots.get(r.id) || [];
              if (!slots2.includes(r.slotId)) slots2.push(r.slotId);
              equipmentSlots.set(r.id, slots2);
            }
            equipmentList.push(r);
          }
          if (equipmentList.length > 0) {
            const wornN = equipmentList.filter(x => x.worn).length;
            dbg('⚔️ equipment: ' + equipmentList.length + ' ชิ้น (สวม ' + wornN + ' · ในถุง ' + (equipmentList.length - wornN) + ') — ในถุง: ' + equipmentList.filter(x => !x.worn).slice(0, 6).map(x => equipDisplayName(x)).join(', '));
          }
        }
      }
    }
    // ★ 0x3c ENTITY_LIST / MINIMAP MARKER
    //   capture ยืนยัน: u16 @1 = จำนวนระเบียน แล้วตามด้วย [id:4][x:2][y:2][flag:1] × count
    //   flag: 1=player, 3=MiniBoss, 4=Boss, 5=Warp portal
    //   v4.187.1: ใช้ parser เดียวทุก count (เดิม handler เก่ารับเฉพาะ 1/4/7/13 และดัก handler ใหม่ด้านล่าง)
    else if (op === 0x3c && u.length >= 3) {
      const count = u16(u, 1);
      const now = nowMs();
      if (count > 0 && count <= 200) {
        let p = 3;
        for (let i = 0; i < count && p + 9 <= u.length; i++, p += 9) {
          const id = u32(u, p);
          const x = i16(u, p + 4), y = i16(u, p + 6);
          const flag = u[p + 8];
          if (!id || id === 0xffffffff || x < -500 || x > 1000 || y < -500 || y > 1000) continue;
          if (flag === 5) {
            entities.set(id, { id, kind: 2, x, y, alive: true, _lastSeenAt: now, _despawnPendingAt: 0, _isWarp: true, name: 'Warp' });
            continue;
          }
          if (flag === 1) {
            // radar เป็นหลักฐาน player ที่แรงที่สุด: force kind=0 และกันถูกนับ/ตีเป็นมอน
            beaconPlayerIds.set(id, now);
            if (id === playerId) { player.x = x; player.y = y; }
            if (!isStaleId(id, now)) {
              const e = entities.get(id);
              if (e) { e.kind = 0; e.x = x; e.y = y; e.alive = true; e._lastSeenAt = now; e._despawnPendingAt = 0; e._src = 'beacon'; }
              else { entities.set(id, { id, kind: 0, x, y, alive: true, _lastSeenAt: now, _despawnPendingAt: 0, name: '', _src: 'beacon' }); }
            }
            continue;
          }
          if (flag === 3 || flag === 4) {
            const isRealBoss = flag === 4;
            const m = upsertMonsterEvidence(id, x, y, now, 'minimap', { isBoss: isRealBoss, isMiniBoss: !isRealBoss });
            if (!m) continue;
            if (!m.name) m.name = isRealBoss ? 'Boss' : 'Mini Boss';
            if (!bossAlertedIds.has(id)) {
              bossAlertedIds.add(id);
              const dist = (player.x != null) ? Math.hypot(x - player.x, y - player.y).toFixed(0) : '?';
              const label = isRealBoss ? '👑 Boss' : '👹 Mini Boss';
              log(label + '! entity', id.toString(16), '@(', x, y, ') ห่าง', dist, 'ช่อง');
              logImportant('card', label + ' ที่ (' + x + ', ' + y + ') ห่าง ' + dist + ' ช่อง');
            }
            const warpEnabled = isRealBoss ? CFG.warpToBoss : CFG.warpToMiniBoss;
            if (warpEnabled && player.x != null && now - lastBossWarpAt > 10000) {
              const d = Math.hypot(x - player.x, y - player.y);
              if (d > 10) {
                log((isRealBoss ? '👑 Boss' : '👹 Mini Boss') + ' → วาร์ปไปสู้ @(', x, y, ') ห่าง', d.toFixed(0), 'ช่อง');
                sendTeleport(currentMap, x, y);
                lastBossWarpAt = now;
              }
            }
          }
        }
      }
    }
    // 0x4d NPC_DIALOG (mirror world.js:441-449)
    //   sub=1 = บทพูด (text) → กด Next ไปต่อ
    //   sub=2 = choice list (menu) → เลือก choice
    //   ★ ใช้ร่วมกับทั้ง sell (Tool Dealer) และ storage (Kafra)
    else if (op === 0x4d && u.length >= 6) {
      const sub = u[1];
      // --- SELL: TALK → เลือก Sell (choice 1) ---
      if (sub === 2 && sellState === 'TALK') {
        log('💰 ได้ NPC dialog choices → เลือก Sell');
        sendNpcSelect(1);
        sellState = 'SELECT_SELL'; sellStateAt = nowMs();
      }
      // --- STORAGE: TALK_KAFRA (บทพูด) → กด Next ---
      else if (storageState === 'TALK_KAFRA') {
        if (sub === 1) {
          log('🏦 Kafra บทพูด → กด Next');
          sendNpcNext();
          storageState = 'SELECT_STORAGE'; storageStateAt = nowMs();
        } else if (sub === 2) {
          // Kafra ส่ง menu ตรงๆ (ไม่มี intro) → เลือก Use Storage
          const choice = CFG.kafraChoice != null ? CFG.kafraChoice : 1;
          log('🏦 Kafra menu → เลือก Use Storage (choice', choice + ')');
          sendNpcSelect(choice);
          storageState = 'STORAGE_OPENED'; storageStateAt = nowMs();
        }
      }
      // --- STORAGE: SELECT_STORAGE (menu) → เลือก Use Storage ---
      else if (sub === 2 && storageState === 'SELECT_STORAGE') {
        const choice = CFG.kafraChoice != null ? CFG.kafraChoice : 1;
        log('🏦 Kafra menu → เลือก Use Storage (choice', choice + ')');
        sendNpcSelect(choice);
        storageState = 'STORAGE_OPENED'; storageStateAt = nowMs();
      }
    }
    // 0x53 SELL_OPEN: sell menu opened → ส่ง sellItems
    else if (op === 0x53 && sellState === 'SELECT_SELL') {
      // ★★ diagnostic: dump โครงสร้าง 0x53 SELL_OPEN (ร้านรับซื้ออะไรบ้าง?) —
      //   format จริงยังไม่เคยถอด และ 0x57 แบบ slot id โดนปฏิเสธตลอด → เก็บหลักฐานใน log ทุกครั้ง
      try {
        const hexDump = Array.from(u.slice(0, Math.min(u.length, 160))).map(b => b.toString(16).padStart(2, '0')).join(' ');
        log('📥 SELL_OPEN len=' + u.length + ' (ส่งต่อเพื่อไข้ format): ' + hexDump);
      } catch (e) {}
      // ★ สร้างรายการขาย — แยก equipment vs stackable (mirror bot.js _buildSellItems:1141-1171)
      //   equipment: ส่ง slot ID (20000+) count=1 ทีละชิ้น — เหมือน storageMove
      //   stackable: ส่ง itemId + count ปกติ
      // ★★ แยกเป็น 2 packet: stackable ก่อน → equipment ทีหลัง
      //   เคสจริงจาก log: ปนกันใน packet เดียว → server ปฏิเสธทั้งก้อน ("could not complete sale")
      //   3 ครั้งติด ของไม่ถูกขายเลย — แยกแล้ว stackable ยังขายได้แม้ equipment จะ fail
      const stackItems = [], eqItems = [];
      let noSlotSkipped = 0;
      for (const id of CFG.sellItemIds) {
        const eqSlots = equipmentSlots.get(id);
        if (eqSlots && eqSlots.length > 0) {
          // ★ equipment — ขายจาก slot สูง→ต่ำ (กัน index shift เหมือน storage)
          //   ★★ ตรวจ equipmentSlots ก่อน inventory — ของ login ไม่เคยเข้า inventory map
          const sorted = [...eqSlots].sort((a, b) => b - a);
          for (const slotId of sorted) eqItems.push({ itemId: slotId, realId: id, count: 1 });
          continue;
        }
        if (equipmentList.some(x => x.id === id)) { noSlotSkipped++; continue; }   // equipment ไม่รู้ slot id — ข้าม
        const stock = inventory.get(id) || 0;
        if (stock <= 0) continue;
        // ★ stackable — itemId + count จริง (server ปฏิเสธถ้า count ไม่ตรง)
        stackItems.push({ itemId: id, count: stock });
      }
      if (noSlotSkipped > 0) log('⚠️ ข้าม equipment', noSlotSkipped, 'ชนิดจากการขาย (ไม่รู้ slot id)');
      if (stackItems.length === 0 && eqItems.length === 0) {
        log('⚠️ ไม่มีของที่จะขาย (sellItemIds ว่าง หรือ inventory ไม่มี)');
        sendSellClose();   // ★★ ปิด sell dialog ก่อน warp (กัน warp ไม่ไป)
        sellState = 'WARP_BACK'; sellStateAt = nowMs();
      } else {
        pendingSellEquip = eqItems; sellEqRetryMode = false;
        // ★★★ ส่ง "ก้อนเดียวรวมทุกอย่าง" — capture ยืนยัน: server ปิด sell dialog อัตโนมัติ
        //   หลังขายสำเร็จ 1 ครั้ง (5b 01 → 38 resend → 4d 03 close) → แบ่ง 2 รอบแบบเดิม
        //   คือรอบ equipment ยิงใส่ dialog ที่ปิดไปแล้ว หายเงียบ ๆ
        //   (เคสจริง: ขาย stackable ได้ 299z แต่ equipment 0 ชิ้น ทั้งที่ slot ถูกต้อง)
        //   ส่วน v4.150 เคยโดนปฏิเสธก้อนปน คือ slot id เพี้ยนจากบั๊กตำแหน่ง (แก้แล้ว v4.177)
        //   ไม่ใช่เพราะปนกัน — ตัวเกมเองก็ขาย 17 ชิ้นรวมก้อนเดียวมาแล้ว
        sellEquipRoundSent = true;   // ไม่มีรอบสองอีกต่อไป
        const all = [
          ...stackItems,
          ...eqItems.map(e => ({ itemId: e.itemId, realId: e.realId, count: 1 })),
        ];
        lastSellSentItems = all;
        log('💰 ขายของ', all.length, 'รายการ' + (stackItems.length > 0 && eqItems.length > 0 ? ' (' + stackItems.length + ' stackable + ' + eqItems.length + ' equipment)' : '') + ':',
            all.map(i => {
              if (i.realId == null) return nameOf(i.itemId) + '×' + i.count;
              const rec = equipmentList.find(x => x.id === i.realId);
              return (rec ? equipDisplayName(rec) : nameOf(i.realId)) + ' (slot ' + i.itemId + ')';
            }).join(', '));
        sendSellItems(all);
        sellState = 'SELL'; sellStateAt = nowMs();
      }
    }
    // 0x5b SELL_RESULT: [5b][flag:1] flag>0 = success
    else if (op === 0x5b && u.length >= 2 && sellState === 'SELL') {
      log('📥 SELL_RESULT:', Array.from(u).map(b => b.toString(16).padStart(2, '0')).join(' '));
      if (u[1] > 0) {
        // ★★ ไม่มีรอบสอง — server ปิด dialog อัตโนมัติหลังขายสำเร็จ (capture: 5b 01 → 38 → 4d 03)
        log('✅ ขายของสำเร็จ!' + (pendingSellEquip.length > 0 ? ' (รวม equipment ' + pendingSellEquip.length + ' ชิ้น)' : ''));
        // ล้าง inventory tracking ของ sold items (mirror bot.js:1767)
        for (const id of CFG.sellItemIds) inventory.delete(id);
        for (const eq of pendingSellEquip) {
          const slots = equipmentSlots.get(eq.realId);
          if (slots) {
            const si = slots.indexOf(eq.itemId);
            if (si >= 0) slots.splice(si, 1);
            if (slots.length === 0) equipmentSlots.delete(eq.realId);
          }
          // ★ ลบจาก equipmentList ด้วย (server ส่ง 0x32 removal ยืนยัน แต่กัน race)
          const ei = equipmentList.findIndex(x => x.id === eq.realId);
          if (ei >= 0) equipmentList.splice(ei, 1);
        }
        invDataVer++;
        pendingSellEquip = []; sellEquipRoundSent = false; sellEqRetryMode = false;
        inventoryFull = false;
        lastSellAt = nowMs();
        // ★ chain → storage: ถ้าเปิด depositAfterSell และมีของฝาก → ฝากต่อ (mirror bot.js:1773-1781)
        //   ใช้ sellReturnTo เป็นจุดกลับของ storage ด้วย (เพราะอยู่ในเมืองอยู่แล้ว → วาร์ปไป Kafra ใกล้ ๆ)
        if (CFG.storageEnabled && CFG.depositAfterSell && CFG.depositItemIds.length > 0) {
          let hasDeposit = false;
          for (const id of CFG.depositItemIds) { if ((inventory.get(id) || 0) > 0) { hasDeposit = true; break; } }
          if (hasDeposit) {
            const retTo = sellReturnTo;   // จดก่อน sell clear
            sellState = 'IDLE'; sellReturnTo = null;   // clear sell ก่อนเริ่ม storage
            startStorage('หลังขาย', retTo);
            return;
          }
        }
      } else {
        // ★★ ล้มเหลว → ลองส่งซ้ำ 1 รอบ: รายการเดิมทั้งก้อน แต่ equipment อ้าง itemId ตรง ๆ แทน slot id
        //   (ปลอดภัย: itemId = ชนิดเดียวกับที่ mark ขายไว้ — server เลือก instance เอง)
        if (pendingSellEquip.length > 0 && !sellEqRetryMode) {
          sellEqRetryMode = true;
          const retryItems = (lastSellSentItems && lastSellSentItems.length ? lastSellSentItems : []).map(i => i.realId == null ? i : { itemId: i.realId, count: 1 });
          log('🔁 ขายไม่ผ่าน (SELL_RESULT flag=0) → ลองส่งใหม่โดย equipment อ้าง itemId ตรง ๆ', pendingSellEquip.length, 'ชิ้น');
          sendSellItems(retryItems);
          sellState = 'SELL'; sellStateAt = nowMs();   // รอผลรอบลองใหม่
          return;
        }
        log('⚠️ ขายของล้มเหลว (SELL_RESULT flag=0)' + (pendingSellEquip.length > 0 ? ' — ลอง itemId ตรง ๆ แล้วก็ไม่ผ่าน' : ''));
        pendingSellEquip = []; sellEquipRoundSent = false; sellEqRetryMode = false;
        sendSellClose();   // ★★ ปิด dialog ก่อน warp
      }
      sellState = 'WARP_BACK'; sellStateAt = nowMs();
    }
    // ============== COMBAT packets ==============
    // 0x06 SPAWN: สร้าง/อัปเดต entity (kind=0 player/1 monster/2 NPC)
    //   layout: [06][flag:1][type:4][0f][id:4][sub:4][?:4][z:i32][nameLen:4][name][kind:1][class:2][x:i32][y:i32][hp:u32][hpMax:u32]
    //   ★ name เริ่มที่ offset 27 (หลัง z@19-22 + nameLen@23-26) ไม่ใช่ 19!
    //   nameLen (u32 @23) ใช้ได้สำหรับ ASCII แต่ผิดสำหรับ UTF-8 ไทย → scan สำรอง
    else if (op === 0x06 && u.length >= 27) {
      try {
        const flag = u[1];
        const id = u32(u, 7);            // offset 7 (ข้าม marker 0x0f @6)
        const sub = u32(u, 11);          // offset 11
        // ★ flag=1 = SPAWN ตัวเอง → ใช้หา/อัปเดต playerId (mirror world.js:1230-1281)
        //   ★★ CRITICAL guard: flag=1 ไม่ได้แปลว่าเป็นเราเสมอ! (mirror world.js:1230-1244)
        //   ปัญหา: SPAWN flag=1 ของผู้เล่นอื่นถูกมองเป็นตัวเรา → playerId ทับเป็นคนอื่น
        //   → STAT ของคนอื่นเข้ามาอัปเดต hp → กดยารัว ๆ
        //   แก้: เช็คชื่อต้องตรงกับ playerName (defense-in-depth)
        if (flag === 1) {
          if (playerId == null) {
            playerId = id; log('👤 player_id =', id.toString(16), '(จาก SPAWN flag=1)');
          } else if (playerId !== id) {
            // ★★ guard: ถ้าเรารู้ชื่อตัวเองแล้ว และชื่อใน packet นี้ไม่ตรง → เป็นคนอื่น → ไม่ทับ playerId
            //   (กัน false ID change ในที่คนเยอะ — mirror world.js:1235-1238)
            if (playerName && name && name !== playerName) {
              log('⚠️ flag=1 แต่ชื่อ "' + name + '" ≠ "' + playerName + '" → ไม่ใช่เรา → ข้าม');
            } else {
              // ID เปลี่ยนจริง (respawn/warp) → track oldId + clear + grace period
              dbg('🔄 player_id เปลี่ยน:', playerId.toString(16), '→', id.toString(16));
              // ★ stale เฉพาะ id เก่าที่ยืนยันแล้ว (id ที่ claim จาก minimap อาจเป็นของคนอื่น)
              if (selfIdConfirmed) stalePlayerIds.set(playerId, nowMs() + 300000);  // stale 5 นาที
              entities.clear();
              monsterAggro.clear(); mobAttackers.clear();
              playerId = id;
              selfIdConfirmed = true;
              // ★★ reset HP เฉพาะ respawn/warp (รู้ชื่อตัวเองแล้ว) — ไม่ใช้ตอนเข้าเกมครั้งแรก
              //   แยกด้วย playerName: ครั้งแรกยังไม่รู้ชื่อ → HP เริ่ม null อยู่แล้ว ไม่ต้อง reset
              //   (เดิมเช็ค flag===1 ซ้อนใน if(flag===1) = dead code — else ไม่มีวันทำงาน)
              if (playerName) {
                hpStatGraceUntil = nowMs() + 3000;
                hp.cur = null; hp.max = null;   // reset กันค่าเก่าทับ (respawn/warp เท่านั้น)
              } else {
                log('   (เข้าเกมครั้งแรก — ไม่ตั้ง grace)');
              }
              // ★★ รีเซ็ตตำแหน่ง — ID เปลี่ยน = อยู่ที่ใหม่แน่ๆ ตำแหน่งเดิมใช้ไม่ได้แล้ว
              player.x = null; player.y = null;
              warpGuardUntil = nowMs() + 3000; lastWarpPlayerPos = null;
            }
          }
        }
        // z @ 19-22 (i32 signed) — ข้าม
        const nameLenField = u32(u, 23); // nameLen @ 23 (u32 — น่าเชื่อถือไม่ได้สำหรับ UTF-8 ไทย)
        // ★★ หา nameEnd แบบ "ลองหลายตำแหน่ง → เลือกอันที่พิกัด valid" — ทนชื่อไทย/UTF-8
        //   บั๊กเดิม: ชื่อไทย (เช่น @_นักเวท_@) ทำ nameLen คลาด → nameEnd เพี้ยน → พิกัด/HP = null ทั้ง packet
        //   candidates: (1) 27+nameLenField ตรงตาม field  (2) ทุกจุด pattern [00 00][kind≤2]
        const dec = (ne) => { try { return new TextDecoder('utf8', { fatal: false }).decode(u.slice(27, ne)); } catch (e) { return ''; } };
        const kindAt = (ne) => (u[ne] === 0 && u[ne + 1] === 0) ? u[ne + 2] : u[ne];
        const parseFields = (ne) => {
          // data เริ่ม ne+3: x @ +3, y @ +7 (i32 signed), hp @ +12, hpMax @ +16
          if (u.length < ne + 20) return null;
          let rx = u32(u, ne + 3); rx = rx > 0x7fffffff ? rx - 0x100000000 : rx;
          let ry = u32(u, ne + 7); ry = ry > 0x7fffffff ? ry - 0x100000000 : ry;
          const coordOk = (rx >= -500 && rx <= 1000 && ry >= -500 && ry <= 1000);
          const v3 = u32(u, ne + 12), v4 = u32(u, ne + 16);
          const hpOk = (v3 > 0 && v3 <= v4);
          return { x: coordOk ? rx : null, y: coordOk ? ry : null, sHp: hpOk ? v3 : null, sHpMax: hpOk ? v4 : null, coordOk };
        };
        const cands = [];
        if (nameLenField > 0 && nameLenField < 64) cands.push(27 + nameLenField);
        // ★ ทุก offset ที่ byte=0 (จุดจบชื่อ/อาจเป็น terminator) — จริงๆ terminator เป็น 00 เดี่ยว
        //   (pattern เดิม [00 00][≤2] ไม่ตรงโครงสร้างจริง: [name][00][03][00][x:4]...)
        for (let i = 27; i < u.length - 2; i++) {
          if (u[i] === 0) cands.push(i);
        }
        let nameEnd = (nameLenField > 0 && nameLenField < 64) ? 27 + nameLenField : (cands.length ? cands[0] : u.length);
        let kind = -1, x = null, y = null, sHp = null, sHpMax = null;
        let _picked = false;
        for (const c of cands) {
          const k = kindAt(c);
          if (k < 0 || k > 2) continue;
          const f = parseFields(c);
          if (f && f.coordOk) { nameEnd = c; kind = k; x = f.x; y = f.y; sHp = f.sHp; sHpMax = f.sHpMax; _picked = true; break; }
        }
        if (!_picked) {
          // ไม่มี candidate ไหนพิกัด valid → ใช้อันแรกที่ kind valid (พิกัด/HP อาจ null เหมือนพฤติกรรมเดิม)
          for (const c of cands) {
            const k = kindAt(c);
            if (k < 0 || k > 2) continue;
            const f = parseFields(c);
            nameEnd = c; kind = k;
            if (f) { x = f.x; y = f.y; sHp = f.sHp; sHpMax = f.sHpMax; }
            break;
          }
        }
        const name = dec(nameEnd);
          // ★★ SPAWN parse fail — entity หายจากการตรวจจับของเรา (มอนอยู่ตรงหน้าแต่หาไม่เจอ!)
          if (kind < 0 || kind > 2) {
            if (Date.now() - lastSpawnFailDbgAt > 3000) {
              lastSpawnFailDbgAt = Date.now();
              const hexF = Array.from(u.slice(0, 40)).map(b => b.toString(16).padStart(2, '0')).join(' ');
              dbg('⚠️ SPAWN parse fail (id=' + id.toString(16) + ' len=' + u.length + ') — entity นี้จะหายจาก radar! hex: ' + hexF);
            }
          }
          if (kind >= 0 && kind <= 2) {
          // ★★ x/y/sHp/sHpMax parse แล้วด้านบน (parseFields ลองหลาย nameEnd — ทนชื่อไทย)
          const existing = entities.get(id) || {};
          // ★★ guard: id ที่เคยบน radar ผู้เล่น = ผู้เล่นแน่นอน — ห้าม parse พลาดทำให้เป็นมอน
          //   (เคยเกิดจริง: SPAWN ของผู้เล่นถูกอ่าน kind=1 → บอทหันไปตีผู้เล่น!)
          if (kind === 1 && isBeaconPlayer(id, nowMs())) {
            dbg('⚠️ SPAWN ของผู้เล่น ' + (name || id.toString(16)) + ' ถูกอ่าน kind=1 → แก้เป็น 0 (id เคยบน radar)');
            kind = 0;
          }
          if (kind === 0 && name && name.trim()) beaconPlayerIds.set(id, nowMs());
          // ★★ DEBUG: log SPAWN ของ kind=0 (ผู้เล่น) — เช็คว่า server ส่ง player ผ่าน SPAWN ไหม
          if (kind === 0 && id !== playerId) {
            dbg('👤 SPAWN player: id=' + id.toString(16) + ' name="' + name + '" @(' + x + ',' + y + ') flag=' + flag);
          }
          entities.set(id, {
            id, kind, sub, name,
            x: x != null ? x : (existing.x != null ? existing.x : null),
            y: y != null ? y : (existing.y != null ? existing.y : null),
            hp: sHp != null ? sHp : existing.hp,
            hpMax: sHpMax != null ? sHpMax : existing.hpMax,
            alive: true, _lastSeenAt: nowMs(),
            _lastEngagedByOtherAt: existing._lastEngagedByOtherAt || 0,
            _lastDamageAt: existing._lastDamageAt || 0,
          });
          // ★ (C) SPAWN อัปเดต player.x/y + HP ด้วย (mirror world.js:1289-1292) — กัน stale หลังวาร์ป
          //   ★★ SPAWN มี hp/hpMax ของตัวเรา! (จาก packet capture: 5e 00 00 00 5e 00 00 00 = 94/94)
          //   → apply ทันที ไม่ต้องรอ STAT (แก้ HP ไม่รู้ตอนเข้าเกมครั้งแรก)
          if (id === playerId && x != null) {
            player.x = x; player.y = y;
            // ★★ ไม่เช็ค grace — SPAWN HP ผูก id===playerId จาก packet สด = เชื่อถือได้เสมอ
            //   (grace มีไว้กัน STAT เก่าของ ID อื่นเท่านั้น — applyStat เช็ค id อยู่แล้ว)
            if (sHp != null && sHpMax != null && sHpMax > 0) {
              hp.cur = sHp; hp.max = sHpMax; hpStatAt = nowMs(); syncHpSafety(sHp, sHpMax);
            }
          }
          // ★★★ DEBUG: SPAWN ตัวเรา — ★ พิมพ์หลัง apply แล้ว (ยืนยันค่าจริงใน object)
          //   + dump bytes หลัง hpMax (nameEnd+20) — สำรวจว่ามี SP แฝงท้าย packet ไหม
          //   (ผลวิเคราะห์: หลัง hpMax เป็นก้อน data ตัวละคร 58 bytes ไม่มี sp/spMax ชัด — SP ใช้ 0x27 อย่างเดียว)
          if (id === playerId) {
            let extra = '';
            if (u.length > nameEnd + 20) {
              const tb = u.slice(nameEnd + 20);
              const vals = [];
              for (let i = 0; i + 4 <= tb.length; i += 4) vals.push(u32(tb, i));
              extra = ' | pktLen=' + u.length + ' after-hpMax u32[' + vals.join(', ') + '] sp(0x27)=' + (sp.cur != null ? sp.cur + '/' + sp.max : '?');
            } else {
              extra = ' | pktLen=' + u.length + ' (จบพอดีที่ hpMax)';
            }
            const ok = (hp.cur === sHp && hp.max === sHpMax);
            dbg('👤 SPAWN self: name="' + name + '" @(' + x + ',' + y + ') hp=' + sHp + '/' + sHpMax + (ok ? ' ✅ applied → ' + hp.cur + '/' + hp.max : ' ⚠️ ไม่ apply (hp.cur=' + hp.cur + ')') + extra);
          }
          // ★★★ SPAWN SELF-DETECT: flag=2 + ชื่อตรง playerName → นี่คือตัวเรา! (แก้วนลูปหลังวาร์ปในแมปเดิม)
          //   หลังวาร์ปสุ่ม entityId เปลี่ยน → SPAWN มาพร้อมชื่อของเรา → update playerId + position!
          //   ถ้าไม่ update → player.x/y ค้างที่ตำแหน่งเก่า → บอทตี entity เก่าที่อยู่ไกล → pending สูง → วนลูป!
          if (id !== playerId && name && playerName && name === playerName && x != null) {
            log('🔄 SPAWN SELF-DETECT: playerId', playerId.toString(16), '→', id.toString(16), '(ชื่อตรง:', name + ')');
            const oldId = playerId;
            playerId = id;
            // ★ stale เฉพาะ id เก่าที่ยืนยันแล้ว — ถ้าเก่าคือ id ที่ 0x3c ฉกมา (ยังไม่ยืนยัน)
            //   มันอาจเป็น id ของผู้เล่นคนอื่น! ห้าม stale กันมองไม่เห็นเขา 5 นาที
            if (selfIdConfirmed) {
              stalePlayerIds.set(oldId, nowMs() + 300000);
            } else {
              log('   (id เก่ายังไม่ยืนยัน (จาก minimap) — ไม่ stale กันติดผู้เล่นคนอื่น)');
            }
            selfIdConfirmed = true;   // ชื่อตรงเป๊ะ = ตัวเราแน่นอน
            entities.delete(oldId);
            player.x = x; player.y = y;
          }
          // ★ เก็บ playerName — ใช้เป็น guard กัน false ID change (mirror world.js:1235)
          if (id === playerId && name && !playerName) {
            playerName = name; selfIdConfirmed = true; log('👤 player_name =', name);
          }
        }
      } catch (e) { /* SPAWN parse error ข้าม */ }
    }
    // 0x07 MOVE_UPDATE: อัปเดตตำแหน่ง entity — merge แล้วใน handler 0x07 ด้านบน (player + entity)
    // 0x14 ENTITY_POS: [14][id:4][x:2][y:2]
    // ★ v4.187.1: packet นี้เป็นหลักฐาน entity ฝั่งมอน; ถ้า id เคยเข้ามาเป็น ghost จาก 0x07 ให้ promote กลับเป็น kind=1
    //   แต่ id ที่ 0x3c ยืนยันว่าเป็นผู้เล่นจะถูก isBeaconPlayer บล็อกเสมอ
    else if (op === 0x14 && u.length >= 9) {
      const id = u32(u, 1);
      const x = i16(u, 5), y = i16(u, 7);
      const now = nowMs();
      if (x >= -500 && x <= 1000 && y >= -500 && y <= 1000) {
        if (id === playerId) {
          player.x = x; player.y = y;
          const pe = entities.get(id);
          if (pe) { pe.kind = 0; pe.x = x; pe.y = y; pe.alive = true; pe._lastSeenAt = now; pe._despawnPendingAt = 0; }
        } else {
          const before = entities.get(id);
          const wasMoveGhost = !!(before && before.kind === 0 && before._src === 'move');
          const m = upsertMonsterEvidence(id, x, y, now, 'pos14');
          if (m && wasMoveGhost && m.kind === 1) dbg('👁️ 0x14 ยืนยัน ghost → monster:', m.name || id.toString(16), '@(' + x + ',' + y + ')');
        }
      }
    }
    // 0x0b ATTACK_RESULT IN: [0b][attacker:4][target:4]...[damage:4 @17 ถ้ามี]
    //   ★ มอนตีเรา (รวม miss damage=0) + เราตีมอน — แหล่งเดียวที่บอก attacker identity!
    //   ★★ 0x26 = HP REGEN ไม่ใช่ attack (ส่งทุก ~6s ค่าเดิมซ้ำๆ) — ไม่ process
    // 0x0b ATTACK_RESULT: [0b][attackerId:4][victimId:4]...[damage optional @17]
    //   ★★ มอนตีเรา (รวม miss damage=0) + เราตีมอน — แหล่งเดียวที่บอก attacker!
    //   ★★★ 0x26 ไม่ใช่ attack — มันคือ HP REGEN (ส่งทุก ~6s, ค่าเดิมซ้ำๆ, HP เพิ่มขึ้น)
    else if (op === 0x0b && u.length >= 9 && playerId != null) {
      let attacker, victimId, damage;
      attacker = u32(u, 1); victimId = u32(u, 5);
      damage = u.length >= 22 ? (obDmgAt === 17 ? u32(u, 17) : u32(u, 18)) : 0;   // ★ offset ตาม server (rayrag@17 / gfix@18)
      if (u.length >= 22) last0bDmg.set(victimId, { d17: u32(u, 17), d18: u32(u, 18), at: nowMs() });
      // ★ gfix-ro ส่งการตีเดียวกันทั้ง 0x0b + 0x17 → นับดาเมจครั้งเดียว (mark ตรงนี้ ใช้ทั้ง monster + player)
      const dmgDup0b = damage > 0 && dmgAlreadyApplied(victimId, damage);
      // ★ markCombat เมื่อเราเป็นคนตี (ย้ายมาจาก handler เก่าบรรทัด 931)
      // ★★ attacker=เรา = ผลการร่าย/โจมตีออกมาแล้ว (รวม AoE สกิลพื้น เช่น Thunderstorm) → ปลดล็อก cast
      if (u32(u, 1) === playerId) { markCombat(); castingUntil = 0; castingSkillId = null; }
      const now = nowMs();
      // ★★★ SUPER DEBUG — log ทุก 0x0b packet (ทุก 2s) เพื่อยืนยันว่า handler ทำงาน
      if (now - (lastDamageDebugAt || 0) > 2000) {
        lastDamageDebugAt = now;
        console.log('[ASSIST][0x0b] ENTERED handler: attacker=' + attacker.toString(16) + ' victim=' + victimId.toString(16) + ' playerId=' + playerId.toString(16) + ' match=' + (victimId === playerId) + ' dmg=' + damage + ' len=' + u.length);
      }
      // ★ DEBUG: ถ้ากำลังตี target อยู่ → log packet จริงเพื่อหาสาเหตุ reset ไม่ทำงาน
      if (target && CFG.verbose) {
        const isOur = (attacker === playerId);
        const isTgt = (victimId === target.id);
        if (!isOur && !isTgt && victimId !== playerId && victimId !== 0) {
          // packet ไม่ match ทั้ง playerId ทั้ง target.id → น่าสงสัย
          console.log('[ASSIST][debug] ATTACK_RESULT ไม่ match: attacker=' + attacker.toString(16) + ' victim=' + victimId.toString(16) + ' target=' + target.id.toString(16) + ' playerId=' + playerId.toString(16) + ' len=' + u.length + ' dmg=' + damage);
        }
      }
      // เราตีมอน → ลด HP มอน + reset pending + mark combat
      //   ★ reset pending เฉพาะ damage > 0 (miss ไม่ reset — กันค้างตีมอนที่ตีไม่ได้)
      //   ★ reset pending ถ้า victimId = target ปัจจุบัน (แม้ attacker ไม่ตรง playerId — กัน playerId ผิด)
      //   ★ ถ้าไม่มี entity ใน map → สร้างเลย (กัน _lastDamageAt ไม่ถูก stamp)
      const isOurAttack = (attacker === playerId && victimId !== playerId && victimId !== 0);
      const isTargetHit = (target && victimId === target.id && victimId !== 0 && victimId !== playerId);
      if (isOurAttack || isTargetHit) {
        let m = entities.get(victimId);
        if (!m) { m = { id: victimId, kind: 1, alive: true }; entities.set(victimId, m); }   // สร้างถ้าไม่มี
        m._lastDamageAt = now;
        if (damage > 0 && !dmgDup0b && m.hp != null && m.hpMax != null) m.hp = Math.max(0, m.hp - damage);
        // ★ reset pending เฉพาะ damage > 0 (mirror bot.js:343) — miss (damage=0) ไม่ reset
        if (damage > 0 && target && target.id === victimId) { target.lastAttackResultAt = now; target.pendingAttacks = 0; target.firstAttackAt = 0; stuckAbandonCount = 0; stuckAbandonHistory = []; }
        markCombat();
        // ★ DPS/ASPD tracking — นับทุกครั้งที่เราตี (isOurAttack หรือ target โดน)
        //   isOurAttack = server ส่ง 0x0b บอกว่าเราตี, isTargetHit = target ของเราโดน damage
        //   (server บางตัวส่ง 0x17 แทน 0x0b → isOurAttack ไม่เป็น true → ใช้ isTargetHit ด้วย)
        if (isOurAttack || isTargetHit) {
          const t = nowMs();
          stats.attackWindow.push({ t });
          stats.sessionAttacks++;
          if (damage > 0) {
            stats.dealtWindow.push({ t, damage });
            stats.sessionDamageDealt += damage;
          }
          // ★ claim: เราตีมอนตัวนี้ → ยึดสิทธิ์ (mirror world.js:825-836)
          if (!m._claimedByMe && !m._lastEngagedByOtherAt) {
            m._claimedByMe = true; m._claimedAt = t;
          } else if (m._claimedByMe) {
            // renew claim
          }
          m._lastEngagedByMeAt = t;
        }
      }
      // ★★ AUTO-DETECT playerId: ถ้า 0x0b มาซ้ำๆ โดย victim = ID เดิม (ไม่ใช่ playerId ปัจจุบัน)
      //   → ID นั้นคือตัวเรา → อัปเดต playerId (SELECT_CHAR/SPAWN อาจให้ค่าผิด)
      //   ★★★ gate 1: playerId ปัจจุบัน "ยืนยันแล้ว" (ชื่อตรง/SELECT_CHAR) → ห้าม AUTO-DETECT
      //     (บั๊กจริง: เกิดใหม่กลางเมือง คนตี Target Dummy กันรัว → victim=dummy โดนนับ 3 ครั้ง
      //      → AUTO-DETECT ฉก id dummy เป็น playerId → HP เรากลายเป็น 100000/100000 ของ dummy!)
      //   ★★★ gate 2: attacker ต้องเป็น "มอน" (kind=1) เท่านั้น — คนตี entity อื่น ≠ เราโดนมอนตี
      else if (op === 0x0b && victimId !== playerId && victimId !== 0 && victimId !== attacker && attacker !== playerId
               && !selfIdConfirmed) {
        const atkEnt = entities.get(attacker);
        if (atkEnt && atkEnt.kind === 1) {
        _victimIdCount = _victimIdCount || new Map();
        const cnt = (_victimIdCount.get(victimId) || 0) + 1;
        _victimIdCount.set(victimId, cnt);
        // ★ เก็บแค่ 10s — clear เก่า
        if (now - (_victimIdCountAt || 0) > 10000) { _victimIdCount.clear(); _victimIdCount.set(victimId, 1); }
        _victimIdCountAt = now;
        // ★ ถ้า victim ID เดิมโดนตี ≥ 3 ครั้งใน 10s → น่าจะเป็นเรา (มอนตีคนอื่นไม่ถี่ขนาดนี้ต่อ ID เดียว)
        if (cnt >= 3) {
          const oldId = playerId;
          playerId = victimId;
          if (selfIdConfirmed) stalePlayerIds.set(oldId, now + 300000);
          selfIdConfirmed = true;   // โดนมอนตีซ้ำ 3 ครั้งใน 10s = ตัวเราแน่
          entities.delete(oldId);   // ★★ ลบ entity เก่า (กันค้างเป็น "player" → หนีตัวเอง)
          _victimIdCount.clear();
          dbg('🔄 AUTO-DETECT playerId:', oldId != null ? oldId.toString(16) : '?', '→', playerId.toString(16), '(โดนมอนตีซ้ำ', cnt, 'ครั้ง)');
        }
        }
      }
      // มอนตีเรา → mark mobAttacker + ★★ ลด HP ทันที (ไม่รอ STAT!)
      else if (victimId === playerId || (victimId === 0 && attacker !== playerId)) {
        // ★★★ attacker id ผิดปกติ (0 / ffffffff = server ไม่บอกผู้โจมตีจริง เช่น damage ทางอ้อม)
        //   ห้าม track เป็นมอน! (บั๊กจริง: สร้าง ghost "ffffffff" ยืนทับเรา dist 0.0 →
        //   defensive เลือกเป็นเป้า → ตีไม่โดน pending 9+ → isTargetStillEngaged บล็อก abandon
        //   → บอทยืนนิ่งนาน รอแต่วาร์ปหนีรุม)
        const attackerKnown = attacker !== 0 && attacker !== 0xffffffff;
        if (attackerKnown) mobAttackers.set(attacker, now);
        markCombat();
        // ★★★ ผู้โจมตีเรา = มอนแน่นอน (ยกเว้นผู้เล่นบน radar) — แก้ ghost ทันที!
        //   มอน linked-aggro (เช่น Condor ช่วยกัน) เดินเข้ามาทาง 0x07 ก่อน SPAWN
        //   → ถูกสร้างเป็น kind=0 _src='move' → targeting มองไม่เห็น + defensive retarget ข้าม
        //   → โดนรุมทั้งที่ไม่ตีกลับ (จาก log จริง: โดนตี 1→2→3→5 แล้ววาร์ปหนี)
        if (attackerKnown && !isBeaconPlayer(attacker, now)) {
          const am = entities.get(attacker);
          if (am && am.kind !== 1) {
            am.kind = 1; am._src = 'attack';
            dbg('🛠️ แก้ entity ผู้โจมตีเป็นมอน:', am.name || attacker.toString(16), '(เข้ามาทาง 0x07 ก่อน SPAWN)');
          } else if (!am && player.x != null) {
            // ยังไม่มี entity เลย — สร้างเป็นมอนไว้ก่อน (ตำแหน่งใกล้เรา — โจมตีเราอยู่แล้ว)
            entities.set(attacker, { id: attacker, kind: 1, x: player.x, y: player.y, alive: true, _lastSeenAt: nowMs(), name: '', _src: 'attack' });
            dbg('🛠️ สร้าง entity ผู้โจมตี (ยังไม่เคยเห็น):', attacker.toString(16));
          }
        }
        // ★ v4.189.10 — ห้ามหัก hp.cur จาก damage packet: hp.cur เป็นค่าจริงจาก server เท่านั้น
        // ใช้ safety estimate เฉพาะกรณี victimId ระบุตัวเราแน่ ๆ; victimId=0 กำกวมจึงไม่หัก
        if (victimId === playerId && damage > 0 && !dmgDup0b) noteHpSafetyDamage(damage);
      }
      // ★★ DEBUG: log เมื่อ player โดนตี (ทุก 2s — กัน spam)
      if (now - (lastDamageDebugAt || 0) > 2000 && victimId === playerId) {
        lastDamageDebugAt = now;
        const hex = Array.from(u.slice(0, Math.min(u.length, 25))).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log('[ASSIST][dmg] 0x0b victim=player attacker=' + attacker.toString(16) + ' dmg=' + damage + (damage === 0 ? ' (MISS)' : '') + ' → mobAttackers.set | ' + hex);
      }
      // คนอื่นตีมอน → mark engaged (KS avoidance)
      else if (attacker !== playerId && victimId !== playerId && victimId !== 0) {
        const m = entities.get(victimId);
        if (m && m.kind === 1) m._lastEngagedByOtherAt = now;
      }
    }
    // 0x17 DAMAGE_V2: [17][victimId:4][damage:4][x:2][y:2][flag:1] (14 bytes)
    //   ★ server ส่ง damage ของมอนที่เราตีผ่าน packet นี้ (ไม่ใช่ 0x0b!)
    //   ★★ อ่านเฉพาะ damage + victimId เท่านั้น — ไม่อัปเดต x/y (กัน bug ตำแหน่งมอนเสีย)
    //   heuristic: victim เป็นมอน = เราตี (mirror world.js:889-946)
    else if (op === 0x17 && u.length >= 9 && playerId != null) {
      const victimId = u32(u, 1);
      const damage = u32(u, 5);
      // ★ calibrate 0x0b offset — 0x17 มาทีหลังพร้อมดาเมจจริง → เทียบ d17/d18 ที่เพิ่งเก็บไว้
      if (damage > 0) obDmgCalibrate(victimId, damage);
      // ★ gfix-ro ส่งการตีเดียวกันทั้ง 0x0b + 0x17 → นับดาเมจครั้งเดียว
      const dmgDup17 = damage > 0 && dmgAlreadyApplied(victimId, damage);
      // ★★ DEBUG: player โดนดาเมจผ่าน 0x17 → log + ★★ ลด HP ทันที!
      if (victimId === playerId) {
        const nowD = nowMs();
        // ★ v4.189.10 — UI/Heal ใช้ HP จริงจาก server; damage packet ใช้แค่ safety estimate สำหรับหนีฉุกเฉิน
        if (damage > 0 && !dmgDup17) noteHpSafetyDamage(damage);
        if (nowD - (lastDamageDebugAt || 0) > 2000) {
          lastDamageDebugAt = nowD;
          const hex = Array.from(u.slice(0, Math.min(u.length, 20))).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log('[ASSIST][dmg] 0x17 DAMAGE_V2 player! dmg=' + damage + ' HP→' + hp.cur + '/' + hp.max + ' | ' + hex);
        }
      }
      // victim = player → ข้าม (โดนตี จัดการใน 0x0b แล้ว)
      if (victimId !== playerId && victimId !== 0) {
        const now = nowMs();
        let m = entities.get(victimId);
        if (!m) { m = { id: victimId, kind: 1, alive: true }; entities.set(victimId, m); }
        m._lastDamageAt = now;
        // ★★ ลด HP มอนตาม damage (server นี้ส่ง damage ผ่าน 0x17 เท่านั้น — ไม่มี 0x0b)
        //   ต่างจากบอทหลักที่ไม่ลดใน 0x17 เพราะกัน double-count กับ 0x0b
        //   แต่ server rayrag ส่งแค่ 0x17 → ต้องลดที่นี่
        if (damage > 0 && !dmgDup17 && m.hp != null && m.hpMax != null) {
          m.hp = Math.max(0, m.hp - damage);
        }
        // ★★ heuristic: เราเป็นคนตีหรือคนอื่น?
        //   0x17 ไม่มี attacker field → ใช้ "เราส่ง ATTACK ใส่มอนตัวนี้ภายใน 2 วินาทีไหม?" เป็นตัววัด
        //   ถ้าใช่ = เราตี (DPS/claim/reset pending)
        //   ถ้าไม่ใช่ = คนอื่นตี → stamp _lastEngagedByOtherAt (anti-KS)
        const weAttackedThis = (lastAttackSentTarget === victimId && (now - lastAttackSentAt) < 2000);
        if (weAttackedThis) {
          // ★ เราตี — DPS/ASPD tracking + claim
          stats.attackWindow.push({ t: now });
          stats.sessionAttacks++;
          if (damage > 0) {
            stats.dealtWindow.push({ t: now, damage });
            stats.sessionDamageDealt += damage;
            if (target && target.id === victimId) {
              target.lastAttackResultAt = now; target.pendingAttacks = 0; target.firstAttackAt = 0;
              stuckAbandonCount = 0; stuckAbandonHistory = [];
            }
          }
          // ★ claim: ถ้าเราตีมอนตัวนี้ก่อนคนอื่น → claim (mirror world.js:825-836)
          if (!m._claimedByMe && !m._lastEngagedByOtherAt) {
            m._claimedByMe = true; m._claimedAt = now;
          } else if (m._claimedByMe) {
            // มี claim อยู่แล้ว → renew
          } else if (m._lastEngagedByOtherAt && (now - m._lastEngagedByOtherAt > CFG.antiKSCooldownMs)) {
            // anti-KS cooldown หมดแล้ว → claim ใหม่ได้
            m._claimedByMe = true; m._claimedAt = now;
          }
          m._lastEngagedByMeAt = now;
        } else {
          // ★ คนอื่นตีมอนตัวนี้ → stamp anti-KS (mirror world.js:864-872)
          m._lastEngagedByOtherAt = now;
          if (!m._claimedByMe) m._claimedByMe = false;   // คนอื่นตีก่อน → เราไม่ claim
        }
        markCombat();
      }
    }
    // 0x18 MONSTER_SKILL: [18][srcId:4][dstId:4][skillId:2]... → aggro tracking
    //   ★ mirror world.js:988-1004 — aggro tracking (dstId=player)
    //   ★★ ไม่อัปเดต x/y (offset ไม่แน่นอน → เคยทำให้ตำแหน่งมอนเสีย → dist กระโดด)
    //      ตำแหน่งมอนอัปเดตจาก 0x07 MOVE / 0x06 SPAWN / 0x14 ENTITY_POS เท่านั้น
    //   ★★★ srcId=เรา = "เริ่มร่าย" (cast start) — ถอดจาก capture: [skillId:1][level:1]@9-10 + castTime f32@16
    //      (Cold Bolt Lv5=1.437s, Fireball Lv5=0.819s) → ต่ออายุ castingUntil ให้ตรงเวลาร่ายจริงของ server
    else if (op === 0x18 && u.length >= 11 && playerId != null) {
      const srcId = u32(u, 1), dstId = u32(u, 5);
      if (dstId === playerId) { monsterAggro.set(srcId, nowMs()); markCombat(); }
      // ★ srcId=เรา = เริ่มร่าย — ต่ออายุ castingUntil ด้วยเวลาร่ายจริงจาก server
      if (srcId === playerId && u.length >= 20) {
        const ct = f32(u, 16);
        if (ct > 0 && ct < 30) {
          castingSkillId = u[9];
          castingUntil = nowMs() + ct * 1000 + 300;
          // ★ เรียนรู้เวลาร่าย (persist) — server บอกค่าปัจจุบันทุกครั้ง: DEX เพิ่ม/ใส่ของ/อัปเลเวลสกิล → อัปเดตเองทันที
          if (castTimes.get(u[9]) !== ct) {
            const _old = castTimes.get(u[9]);
            castTimes.set(u[9], ct); saveCastTimes();
            if (_old != null) log('🎬 เวลาร่ายเปลี่ยน: skill', u[9], _old.toFixed(2) + 's → ' + ct.toFixed(2) + 's (stat/อุปกรณ์/เลเวลสกิลเปลี่ยน?)');
          }
          dbg('🎬 เริ่มร่าย skill', u[9], 'Lv' + u[10], ct.toFixed(2) + 's → บล็อกสกิลถึง ' + (castingUntil - nowMs()) + 'ms');
        }
      }
    }
    // 0x19 CAST_START (ground): [19][srcId:4][x:2][y:2][skillId:1][level:1]...[castTime f32@17] — Thunderstorm เริ่มร่าย
    else if (op === 0x19 && u.length >= 18 && playerId != null) {
      if (u32(u, 1) === playerId) {
        const ct = f32(u, 17);
        if (ct > 0 && ct < 30) {
          castingSkillId = u[9];
          castingUntil = nowMs() + ct * 1000 + 300;
          if (castTimes.get(u[9]) !== ct) {
            const _old = castTimes.get(u[9]);
            castTimes.set(u[9], ct); saveCastTimes();
            if (_old != null) log('🎬 เวลาร่ายเปลี่ยน: skill', u[9], _old.toFixed(2) + 's → ' + ct.toFixed(2) + 's (stat/อุปกรณ์/เลเวลสกิลเปลี่ยน?)');
          }
          dbg('🎬 เริ่มร่าย (พื้น) skill', u[9], 'Lv' + u[10], ct.toFixed(2) + 's');
        }
      }
    }
    // 0x1d SKILL (IN): [1d][sub:1][srcId:4][dstId:4]... → antiKS
    //   ★ mirror world.js:234-246 — antiKS: player อื่น cast skill ใส่มอน
    //   ★★ ไม่อัปเดต x/y (offset ไม่แน่นอน — เหมือน 0x18)
    else if (op === 0x1d && u.length >= 10 && playerId != null) {
      const srcId = u32(u, 2), dstId = u32(u, 6);
      // ★ srcId=เรา = ร่ายเสร็จ + ดาเมจออกแล้ว → ปลดล็อกสกิลถัดไปได้ทันที (ไม่ต้องรอ margin)
      if (srcId === playerId) { castingUntil = 0; castingSkillId = null; }
      if (srcId !== playerId && dstId !== playerId && dstId !== 0) {
        const m = entities.get(dstId);
        if (m && m.kind === 1) m._lastEngagedByOtherAt = nowMs();
      }
    }
    // 0x0f ENTITY_ACTION: action=3 = มอนตายจริง (authoritative)
    //   ★ นับ kills ที่นี่ ไม่ใช่ใน 0x22 EXP (mirror world.js:964 — sessionKills++ ที่นี่)
    else if (op === 0x0f && u.length >= 6 && u[5] !== 3) {
      // ★ 0x0f action≠3 = emote/ท่าทางของ entity (จาก capture: มอนแสดงอารมณ์) — ยืนยันว่ายังอยู่
      const eo = entities.get(u32(u, 1));
      if (eo) { eo._despawnPendingAt = 0; eo._lastSeenAt = nowMs(); }
    }
    else if (op === 0x0f && u.length >= 6 && u[5] === 3) {
      const id = u32(u, 1);
      const e = entities.get(id);
      if (e) {
        e.alive = false;
        // ★ ถ้าเป็น boss/mini boss ที่ตาย → ล้าง bossAlertedIds เพื่อ alert ใหม่ตอนเกิดใหม่
        if (e._isMiniBoss || e._isBoss) { bossAlertedIds.delete(id); log((e._isBoss ? '👑 Boss' : '👹 Mini Boss') + ' ตาย — จะ alert ใหม่เมื่อเกิดใหม่'); }
      }
      entities.delete(id);
      // ★ นับ kill — ถ้าเป็นมอน (kind=1) และเรามี target หรือ mobAttacker ตัวนี้
      if (e && e.kind === 1) {
        stats.kills++;
        // ★★ จดจุดตายทุกตัว (รวมของคนอื่น) — ใช้แยกความเป็นเจ้าของ drop
        const mine = !!(e._lastEngagedByMeAt && nowMs() - e._lastEngagedByMeAt < 10000);
        if (e.x != null) {
          recentDeathPos.push({ x: e.x, y: e.y, t: Date.now(), mine });
          while (recentDeathPos.length > DEATH_POS_MAX) recentDeathPos.shift();
        }
      }
      if (target && target.id === id) {
        if (typeof unstuckBuffAutoFinishPending !== 'undefined' && unstuckBuffAutoFinishPending) {
          // ★ v4.189.0: มอนตัวล่าสุดตายแล้ว — กันช่องว่างก่อน DROP packet มาถึง
          unstuckBuffLootSettleUntil = nowMs() + 600;
          log('🏠 AB Auto: มอนตัวล่าสุดตาย → รอของตก 0.6 วิ แล้วเก็บให้หมดก่อน Unstuck');
        }
        abandonTarget('ฆ่าได้', false); target = null;
        // ★ v4.187.9: รอ drop packet สั้น ๆ ก่อนหาเป้าใหม่
        //   ถ้ามีของตก queue จะบล็อก combat จนเก็บหมด; พอชิ้นสุดท้ายเก็บสำเร็จจะปลด cooldown ทันที
        combatCooldownUntil = nowMs() + 250;
      }
    }
    // 0x1b DESPAWN: entity หาย (มี false-despawn guard)
    //   ★★ false despawn = server ส่ง DESPAWN แต่มอนยังไม่ตาย → ไม่ลบ
    //   mirror bot.js:304-307 + world.js:1596-1612
    else if (op === 0x1b && u.length >= 5) {
      const id = u32(u, 1);
      const e = entities.get(id);
      if (e) {
        const now = nowMs();
        // guard 1: ตีโดนภายใน 3s → ไม่ลบ
        const recentDamage = e._lastDamageAt && now - e._lastDamageAt < 3000;
        // guard 2: ★★ เป็น target ปัจจุบัน + ส่ง attack ไปแล้วภายใน 5s (ยังไม่โดน แต่อาจกำลังเดินเข้า)
        const recentAttack = target && target.id === id && target.firstAttackAt && now - target.firstAttackAt < 5000;
        if (recentDamage) {
          dbg('🛡️ false despawn guard: มอน', e.name || id.toString(16), 'โดนดาเมจ', (now - e._lastDamageAt) + 'ms ที่แล้ว → ไม่ลบ');
        } else if (recentAttack) {
          dbg('🛡️ false despawn guard: target', e.name || id.toString(16), 'ส่ง attack', (now - target.firstAttackAt) + 'ms ที่แล้ว → ไม่ลบ');
        } else {
          // ★★★ ไม่ลบทันที! — mark pending แล้วรอ grace 6.5s (sweeper ลบให้ถ้าไม่มีอะไรมายืนยัน)
          //   การค้นพบจาก capture จริง: server ส่ง 1b + 36(reason=5) เป็นประจำทุก ~5s
          //   กับมอนที่ยังเดินอยู่ (client ยัง render!) — ลบทันที = สร้าง ghost kind=0
          //   จาก MOVE ถัดไป → มอนหายจาก targeting ("มอนอยู่รอบตัวแต่หาไม่เจอ")
          //   ตัวยืนยันว่ายังอยู่: 0x07 MOVE / 0x36 reason=5 / 0x0f emote — ตัวไหนมาก่อน grace คือยังอยู่
          e._despawnPendingAt = Date.now();
        }
      }
    }
  }
  function handleOut(u) {
    if (!u.length) return;
    if (u[0] === 0x0b) markCombat();
    // ★★ auto-login: เกม client ส่ง SELECT_CHAR (0x03) เอง (session เดิม/พิมพ์ผ่านคีย์บอร์ดจำลอง)
    //   → เลิกแผนที่เราจะส่งเอง (กันส่งซ้ำซ้อน server อาจงง)
    if (u[0] === 0x03 && autoLoginPhase === 'acctOk') {
      autoLoginPhase = 'clientSelect';
      log('🤖 [auto-login] เกม client เลือกตัวละครเองแล้ว — ไม่แทรก (รอเข้าเกม)');
    }
    // ★ ดัก click-move (0x07) ของผู้เล่น → บันทึก trail (ถ้า navRecording=on)
    //   บอทสั่งเอง (sendMove) จะตั้ง navBotMoving=true ก่อน → ข้ามไม่บันทึก
    if (u[0] === 0x07 && u.length >= 5) {
      const mx = i16(u, 1), my = i16(u, 3);
      // ★★ ไม่อัปเดต player.x/y จาก outgoing MOVE!
      //   จาก packet capture: ถ้าคลิกไปพื้นที่เดินไม่ได้ → server เงียบ → ไม่ส่ง MOVE_UPDATE
      //   ถ้าอัปเดต optimistic → player.x/y ผิด → คำนวณระยะผิด → บอทเดินผิดทิศ
      //   แก้: รอ server ส่ง MOVE_UPDATE (0x07 IN) เท่านั้น → ยืนยันตำแหน่งจริง
      //   (mirror บอทหลัก — world.js ไม่อัปเดต position จาก outgoing move)
      if (!navBotMoving && CFG.navRecording) {
        navRecordMove(mx, my);
      }
      navBotMoving = false;   // reset flag (บอทสั่งครั้งเดียว)
    }
    // ★ ดัก equip/unequip (0x30) ที่ client ส่ง — จำทิศทางไว้ให้ IN 0x30 ใช้
    //   [30][invIdx:1][4e 00 00][action:1] — action 01=สวมใส่, 00=ถอด (ยืนยันจาก capture 18 ครั้ง)
    if (u[0] === 0x30 && u.length >= 7) {
      lastOutEquip = { idx: u[1], action: u[6], at: Date.now() };
    }
  }

  // ---------- loop เก็บของ ----------
  const lootLoop = setInterval(() => {
    if (chatPauseActive) return;
    if (!CFG.lootEnabled) return;
    if (typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE') return;
    // ★ ห้ามเก็บของตอนขาย/ฝาก — อยู่คนละแมป (คิวเก็บ cross-map พังตำแหน่ง + ยิง pickup พลาด)
    if (typeof sellState !== 'undefined' && (sellState !== 'IDLE' || storageState !== 'IDLE')) return;
    const now = Date.now();
    for (const [id, it] of queue) {
      if (now - it.addedAt > CFG.itemMaxAgeMs) { queue.delete(id); log('⌛ หมดอายุ drop', id); }
    }
    for (const [id, d] of recentDrops) if (now - d.t > 4000) recentDrops.delete(id);

    // ทิ้งชิ้นที่ครบ maxAttempts — ถ้าเปิด warpLoot ให้ย้ายไป warpQueue แทนที่จะปล่อยทิ้ง
    for (const [id, it] of queue) {
      if (it.attempts >= CFG.maxAttempts) {
        queue.delete(id);
        if (CFG.warpLootEnabled && currentMap) {
          // ★ ย้ายไป warpQueue เพื่อวาร์ปไปเก็บ (น่าจะติดกำแพง/หน้าผา)
          warpQueue.set(id, { dropId: id, itemId: it.itemId, x: it.x, y: it.y, offsetIdx: 0, warpAt: 0, pickupSentAt: 0 });
          log('🌀 เก็บไม่ได้ครบ', it.attempts, 'ครั้ง → วาร์ปไปเก็บ:', nameOf(it.itemId), 'drop', id);
        } else {
          log('🚫 ปล่อย', nameOf(it.itemId), 'drop', id, '(ล้มเหลว', it.attempts, 'ครั้ง ไม่มีผลจาก server)');
        }
      }
    }

    const eligible = [];
    for (const it of queue.values()) {
      if (it.attempts >= CFG.maxAttempts) continue;
      if (now - it.lastAttemptAt < CFG.attemptIntervalMs) continue;
      // ★ รอ lootDelayAfterDropMs หลังของตก ก่อนเริ่มเก็บ (addedAt = ตอนของตกเข้าคิว)
      //   ★★ แต่ละ drop จะมี delay ต่างกันเล็กน้อย (±200ms jitter — กันดูเป็นบอท)
      if (it.delayAfterDrop == null) it.delayAfterDrop = CFG.lootDelayAfterDropMs + (Math.random() * 400 - 200);
      if (now - it.addedAt < it.delayAfterDrop) continue;
      eligible.push(it);
    }
    if (!eligible.length) return;
    // ★★ sendThrottle กับ jitter ±200ms ด้วย — กันสแปมแต่ไม่ตายตัว
    if (now - lastSendAt < (CFG.sendThrottleMs + (Math.random() * 400 - 200))) return;

    eligible.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);
    const it = eligible[0];
    if (sendPickup(it.dropId)) {
      it.lastAttemptAt = now; it.attempts++; lastSendAt = now;
      lastPickupDropId = it.dropId;   // ★ จำไว้เผื่อ server ตอบ 0x20 "unable to pick up yet"
      log('📨 ลองเก็บ', nameOf(it.itemId), 'drop', it.dropId, '(ครั้ง', it.attempts + '/' + CFG.maxAttempts + ')');
    }
  }, CFG.lootTickMs);

  // ============================================================
  //  WARP-TO-LOOT loop — วาร์ปไปเก็บของที่เก็บไม่ได้ (ติดกำแพง/หน้าผา)
  // ============================================================
  //  offset pattern: กลาง → เหนือ3 → ตอ3 → ใต้3 → ตต3 (เหมือนบอทหลัก)
  const WARP_OFFSETS = [[0,0,'กลาง'], [0,-3,'เหนือ3'], [3,0,'ตอ3'], [0,3,'ใต้3'], [-3,0,'ตต3']];
  const warpLoop = setInterval(() => {
    if (chatPauseActive) return;
    if (!CFG.warpLootEnabled) return;
    if (!currentMap) return;                          // ไม่รู้แมป → ไม่วาร์ป (กัน packet ผิด)
    // ★ ห้ามวาร์ปไปเก็บของตอนขาย/ฝาก (warp ตีกับ warp ของ routine — server ดรอปตัวหลัง)
    if (typeof sellState !== 'undefined' && (sellState !== 'IDLE' || storageState !== 'IDLE')) return;
    const now = Date.now();

    for (const [id, wit] of warpQueue) {
      // ครบ offset ทั้งหมดแล้วยัง fail → ปล่อยทิ้ง
      if (wit.offsetIdx >= Math.min(CFG.warpLootMaxOffsets, WARP_OFFSETS.length)) {
        warpQueue.delete(id);
        log('🚫 ปล่อย', nameOf(wit.itemId), 'drop', id, '(วาร์ปครบ', wit.offsetIdx, 'offset แล้วยังไม่ได้)');
        continue;
      }

      // ถ้ายังไม่ได้วาร์ปในรอบนี้ และผ่าน cooldown แล้ว → วาร์ป
      if (wit.warpAt === 0 && now - lastWarpAt >= CFG.warpLootCooldownMs) {
        const off = WARP_OFFSETS[wit.offsetIdx] || [0, 0, '?'];
        const tx = Math.round(wit.x + off[0]);
        const ty = Math.round(wit.y + off[1]);
        if (sendTeleport(currentMap, tx, ty)) {
          wit.warpAt = now;
          wit.pickupSentAt = 0;
          lastWarpAt = now;
          lastWarpTargetId = id;
          log('🌀 วาร์ปไปเก็บ', nameOf(wit.itemId), '@(', tx, ty, ') offset', off[2]);
        }
        return;   // วาร์ปทีละชิ้นต่อรอบ
      }

      // หลังวาร์ปแล้วรอ warpLootPickupDelayMs → ส่ง pickup อีกครั้ง
      if (wit.warpAt !== 0 && wit.pickupSentAt === 0 && now - wit.warpAt >= CFG.warpLootPickupDelayMs) {
        if (sendPickup(id)) {
          wit.pickupSentAt = now;
          log('📨 ลองเก็บหลังวาร์ป', nameOf(wit.itemId), 'drop', id);
        }
        return;
      }

      // ถ้าส่ง pickup ไปแล้ว แต่รอนานเกินไป (server เงียบ = วาร์ปไปที่ไม่ดี) → offset ถัดไป
      if (wit.pickupSentAt !== 0 && now - wit.pickupSentAt > 3000) {
        wit.offsetIdx++;
        wit.warpAt = 0;
        wit.pickupSentAt = 0;
        log('⏭️', nameOf(wit.itemId), 'ยังไม่ได้หลังวาร์ป → offset ถัดไป');
        return;
      }
    }
  }, CFG.lootTickMs);

  // ============================================================
  //  ROUTINE WALK HELPER — ใช้สำหรับ Sell / Kafra หลัง Direct Unstuck
  //  priority: GAT A* → NAV waypoint → เดินตรงเป็นช่วง ≤ MOVE_MAX_DIST
  // ============================================================
  function routineWalkTowardPoint(tx, ty, tag) {
    if (player.x == null || player.y == null) return { arrived:false, sent:false, mode:'no-pos' };
    tx = Math.round(Number(tx)); ty = Math.round(Number(ty));
    const dist = Math.hypot(tx - player.x, ty - player.y);
    if (dist <= 3) return { arrived:true, sent:false, mode:'arrived', dist };

    let wx = tx, wy = ty, mode = 'direct';
    try {
      if (currentMap && typeof gatCache !== 'undefined' && gatCache.has(currentMap)) {
        const path = gatFindPath(tx, ty, 12000);
        if (path && path.length > 1) {
          let best = 1;
          for (let i = path.length - 1; i >= 1; i--) {
            const p = path[i];
            if (Math.hypot(p.x - player.x, p.y - player.y) <= MOVE_MAX_DIST && gatLineWalkable(player.x, player.y, p.x, p.y)) { best = i; break; }
          }
          wx = path[best].x; wy = path[best].y; mode = 'GAT';
        }
      }
      if (mode === 'direct' && typeof navNavigateTo === 'function') {
        const wp = navNavigateTo(tx, ty);
        if (wp) { wx = wp.x; wy = wp.y; mode = 'NAV'; }
      }
    } catch (_) {}

    // game click-walk มีเพดานระยะ — clamp ทุก fallback ให้อยู่ในช่วงปลอดภัย
    const wd = Math.hypot(wx - player.x, wy - player.y);
    if (wd > MOVE_MAX_DIST) {
      const step = MOVE_MAX_DIST;
      const a = Math.atan2(wy - player.y, wx - player.x);
      wx = player.x + Math.cos(a) * step;
      wy = player.y + Math.sin(a) * step;
    }
    const sent = sendMove(wx, wy);
    if (sent) dbg((tag || '🚶 Routine') + ' เดิน ' + mode + ' @(' + Math.round(wx) + ',' + Math.round(wy) + ') เหลือ ' + dist.toFixed(0) + ' ช่อง');
    return { arrived:false, sent, mode, dist };
  }

  // ★ v4.189.5: หลัง Direct Unstuck ตำแหน่งใน memory ยังเป็นจุดก่อนวาร์ป
  // ถ้าเอาค่านั้นไป clamp sendMove จะส่งก้าวจากจุดเก่า → server ปฏิเสธ จนผู้ใช้คลิกเองแล้วได้ MOVE_UPDATE ใหม่
  // แก้: invalidate พิกัดเก่า + ใช้ /where เป็น authoritative position oracle ก่อนเริ่มเดิน
  function invalidatePositionAfterRoutineUnstuck() {
    player.x = null; player.y = null;
    if (playerId != null) {
      const me = entities.get(playerId);
      if (me) { me.x = null; me.y = null; }
    }
    lastWhereReqAt = 0;
  }
  function requestRoutinePosition(tag, now) {
    if (player.x != null && player.y != null) return true;
    if (now - (lastWhereReqAt || 0) >= 700) {
      if (sendWhere()) {
        lastWhereReqAt = now;
        dbg((tag || '🚶 Routine') + ' รอพิกัดหลัง Unstuck → ส่ง /where');
      }
    }
    return false;
  }

  // ★ v4.189.7: หลัง Unstuck server จะปลด movement state เมื่อคำสั่งเดินแรกห่าง >~10 ช่อง
  // ผู้ใช้ทดสอบจริงว่าคลิกใกล้ 1–3 ช่องไม่ขยับ แต่คลิกไกลเกิน 10 ช่องแล้ว automation เดินต่อได้
  // จึงใช้ "long wake move" 12–15 ช่อง (ยังไม่เกิน MOVE_MAX_DIST=16) แล้วรอ MOVE_UPDATE ยืนยัน
  function newRoutineWakeState() {
    return { baseX:null, baseY:null, startedAt:0, lastSendAt:0, attempt:0, confirmed:false };
  }
  function resetRoutineWakeState(w) {
    if (!w) return;
    w.baseX = null; w.baseY = null; w.startedAt = 0; w.lastSendAt = 0; w.attempt = 0; w.confirmed = false;
  }
  function routineWakeMove(w, tx, ty, tag, now) {
    if (!w || player.x == null || player.y == null) return false;
    if (w.baseX == null || w.baseY == null) {
      w.baseX = player.x; w.baseY = player.y; w.startedAt = now; w.lastSendAt = 0; w.attempt = 0; w.confirmed = false;
      try { if (currentMap && !gatCache.has(currentMap)) gatLoad(currentMap); } catch (_) {}
    }
    // server MOVE_UPDATE มาแล้ว = ปลุก movement สำเร็จ
    if (Math.hypot(player.x - w.baseX, player.y - w.baseY) >= 0.60) {
      if (!w.confirmed) log((tag || '🚶 Routine') + ' Long Wake Move สำเร็จ @(' + Math.round(player.x) + ',' + Math.round(player.y) + ') → เริ่มเดินเส้นทาง');
      w.confirmed = true;
      return true;
    }
    if (now - w.lastSendAt < 350) return false;

    // ทิศแรกมุ่งไปเป้าหมาย จากนั้นหมุน ±45/90/135/180 องศา
    const vx = Number(tx) - player.x, vy = Number(ty) - player.y;
    const baseAngle = Math.atan2(vy, vx);
    const angleOffsets = [0, Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, 3*Math.PI/4, -3*Math.PI/4, Math.PI];
    // ทดสอบจริงต้อง >10 ช่อง; สลับ 12–15 เพื่อผ่าน threshold แต่ไม่เกิน click cap 16
    const wakeDistances = [13, 15, 12, 14];
    const dist = wakeDistances[Math.floor(w.attempt / angleOffsets.length) % wakeDistances.length];
    let chosen = null;

    for (let k = 0; k < angleOffsets.length; k++) {
      const idx = (w.attempt + k) % angleOffsets.length;
      const a = baseAngle + angleOffsets[idx];
      const cx = Math.round(player.x + Math.cos(a) * dist);
      const cy = Math.round(player.y + Math.sin(a) * dist);
      let ok = true;
      try {
        if (currentMap && gatCache.has(currentMap)) {
          ok = !!gatWalkable(cx, cy) && !!gatLineWalkable(player.x, player.y, cx, cy);
        }
      } catch (_) {}
      if (ok) { chosen = {x:cx, y:cy}; break; }
    }

    if (!chosen) {
      // ถ้า GAT หาเส้นตรง 12–15 ช่องไม่ได้ ให้ลองทิศเป้าหมายโดยตรง; sendMove จะ clamp ที่ 16 เอง
      const a = baseAngle + angleOffsets[w.attempt % angleOffsets.length];
      chosen = { x:Math.round(player.x + Math.cos(a) * dist), y:Math.round(player.y + Math.sin(a) * dist) };
    }

    w.attempt++; w.lastSendAt = now;
    if (sendMove(chosen.x, chosen.y)) {
      dbg((tag || '🚶 Routine') + ' Long Wake Move #' + w.attempt + ' ระยะ~' + dist + ' → (' + chosen.x + ',' + chosen.y + ')');
    }
    // ถ้ายังไม่ขยับหลายรอบ ขอ /where ซ้ำ เผื่อพิกัด authoritative เปลี่ยนแต่ MOVE_UPDATE หลุด
    if (w.attempt % 8 === 0 && now - (lastWhereReqAt || 0) >= 700) {
      if (sendWhere()) lastWhereReqAt = now;
    }
    return false;
  }
  let sellWakeMove = newRoutineWakeState();
  let storageWakeMove = newRoutineWakeState();

  // ★ v4.189.16: route watchdog สำหรับขาเดิน Sell/Kafra
  // ปัญหาจริง: หลัง Long Wake สำเร็จ ถ้า step ถัดไปชนกำแพง sendMove() ยังคืน true แต่ตัวไม่ขยับ
  // เดิมจึงยิงพิกัดเดิมซ้ำไปเรื่อย ๆ. ตอนนี้ตรวจ progress แล้วอ้อมด้วย long detour อัตโนมัติ.
  function newRoutineRouteState() {
    return { lastX:null, lastY:null, lastProgressAt:0, lastSendAt:0, stuckCount:0, detourIdx:0 };
  }
  function resetRoutineRouteState(r) {
    if (!r) return;
    r.lastX = null; r.lastY = null; r.lastProgressAt = 0; r.lastSendAt = 0; r.stuckCount = 0; r.detourIdx = 0;
  }
  let sellRouteState = newRoutineRouteState();
  let storageRouteState = newRoutineRouteState();

  function routineWalkStable(tx, ty, tag, route, now) {
    if (player.x == null || player.y == null) return { arrived:false, sent:false, mode:'no-pos', dist:Infinity };
    tx = Math.round(Number(tx)); ty = Math.round(Number(ty));
    const dist = Math.hypot(tx - player.x, ty - player.y);
    // จุดตั้งเป็น navigation anchor ไม่ต้องเหยียบเป๊ะ — ภายใน ~5 ช่องถือว่าเข้าพื้นที่ NPC แล้ว
    if (dist <= 5) return { arrived:true, sent:false, mode:'arrived', dist };

    if (route.lastX == null || route.lastY == null) {
      route.lastX = player.x; route.lastY = player.y; route.lastProgressAt = now; route.lastSendAt = 0;
    } else {
      const moved = Math.hypot(player.x - route.lastX, player.y - route.lastY);
      if (moved >= 0.65) {
        route.lastX = player.x; route.lastY = player.y; route.lastProgressAt = now; route.stuckCount = 0; route.detourIdx = 0;
      }
    }

    // ถ้า 1.4s แล้วยังไม่ขยับหลังส่งเดิน → อย่ายิงเส้นเดิมซ้ำ ให้ long-detour 12–15 ช่อง
    if (now - route.lastProgressAt >= 1400 && now - route.lastSendAt >= 650) {
      const base = Math.atan2(ty - player.y, tx - player.x);
      const offs = [Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, 3*Math.PI/4, -3*Math.PI/4, Math.PI, 0];
      const ds = [13, 15, 12, 14];
      const d = ds[route.stuckCount % ds.length];
      let chosen = null;
      for (let k = 0; k < offs.length; k++) {
        const off = offs[(route.detourIdx + k) % offs.length];
        const a = base + off;
        const cx = Math.round(player.x + Math.cos(a) * d);
        const cy = Math.round(player.y + Math.sin(a) * d);
        let ok = true;
        try {
          if (currentMap && gatCache.has(currentMap)) ok = !!gatWalkable(cx, cy) && !!gatLineWalkable(player.x, player.y, cx, cy);
        } catch (_) {}
        if (ok) { chosen = {x:cx, y:cy}; route.detourIdx = (route.detourIdx + k + 1) % offs.length; break; }
      }
      if (!chosen) {
        const a = base + offs[route.detourIdx++ % offs.length];
        chosen = {x:Math.round(player.x + Math.cos(a) * d), y:Math.round(player.y + Math.sin(a) * d)};
      }
      route.stuckCount++; route.lastSendAt = now;
      const sent = sendMove(chosen.x, chosen.y);
      if (sent) log((tag || '🚶 Routine') + ' ทางเดิมไม่ขยับ → อ้อม #' + route.stuckCount + ' @(' + chosen.x + ',' + chosen.y + ')');
      return { arrived:false, sent, mode:'DETOUR', dist };
    }

    if (now - route.lastSendAt < 450) return { arrived:false, sent:false, mode:'throttle', dist };
    const r = routineWalkTowardPoint(tx, ty, tag);
    if (r.sent) route.lastSendAt = now;
    return r;
  }

  // ============================================================
  //  AUTO-SELL — state machine
  //  IDLE → UNSTUCK_TO_NPC → WAKE_MOVE → WALK_TO_POINT → MOVE_TO_NPC → TALK → SELECT → SELL → WARP_BACK/WAIT_COMBAT_RETURN
  // ============================================================
  // หา NPC จาก entities (kind=2 + ชื่อตรง) — mirror world.js:1948-1959
  function findSellNpc() {
    const target = (CFG.sellNpcName || '').toLowerCase();
    for (const e of entities.values()) {
      if (e.kind === 2 && e.alive && e.x != null && e.name && e.name.toLowerCase().includes(target)) return e;
    }
    return null;
  }
  function setSellState(s) { sellState = s; sellStateAt = nowMs(); }
  let sellWarped = false;        // legacy flag (คงไว้เพื่อ compatibility; v4.189.4 ขาไปใช้ Unstuck+เดิน)
  let sellWarpRetries = 0;       // legacy retry counter
  let sellMoveLastAt = 0;        // throttle เดินไปจุด/NPC
  let sellTravelStartedAt = 0;   // เวลาส่ง Unstuck สำหรับขาไปขาย
  let pendingSellEquip = [];     // ★ equipment รอขายรอบสอง (แยก packet กัน server ปฏิเสธทั้งก้อน)
  let sellEquipRoundSent = false;
  let sellEqRetryMode = false;   // ★ true = รอบลองส่ง equipment แบบ itemId ตรง ๆ (slot id โดนปฏิเสธ — ไม่เคยสำเร็จเลยตั้งแต่ v4.150)
  let lastSellSentItems = [];    // ★ รายการที่ส่งล่าสุด (สำหรับ retry เปลี่ยน equipment เป็น itemId)
  function startSellTravel(reason, returnTo) {
    if (!currentMap || player.x == null || player.y == null) { log('⚠️ เริ่มขายไม่ได้ — ยังไม่รู้แมพ/พิกัดตัวละคร'); return false; }
    sellReturnTo = returnTo || { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
    sellWarpRetries = 0; pendingSellEquip = []; sellEquipRoundSent = false; sellEqRetryMode = false;
    sellNpcId = null; sellNpcRetryAt = 0; sellMoveLastAt = 0; resetRoutineWakeState(sellWakeMove); resetRoutineRouteState(sellRouteState);
    if (!sendDirectUnstuckPacket()) { sellReturnTo = null; log('⚠️ เริ่มขายไม่ได้ — ส่ง Direct Unstuck 0x73 ไม่สำเร็จ'); return false; }
    invalidatePositionAfterRoutineUnstuck();
    sellTravelStartedAt = nowMs();
    setSellState('UNSTUCK_TO_NPC');
    log('💰 เริ่มขายของ (' + reason + ') → Unstuck 0x73 → รอ 2 วิ → เดินไป ' + CFG.sellNpcMap + ' @(' + CFG.sellNpcX + ',' + CFG.sellNpcY + ')');
    return true;
  }
  function abortSell(reason) {
    log('⚠️ ยกเลิกขาย:', reason);
    sellState = 'IDLE'; sellStateAt = 0;
    // พยายามวาร์ปกลับถ้ามี returnTo
    if (sellReturnTo && sellReturnTo.map) { sendTeleport(sellReturnTo.map, sellReturnTo.x, sellReturnTo.y); }
    sellReturnTo = null;
  }
  // สร้าง trigger check + state machine ใน loop เดียว
  const sellLoop = setInterval(() => {
    if (chatPauseActive && sellState === 'IDLE') return;
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    if (typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE') return;
    if (typeof unstuckBuffAutoFinishPending !== 'undefined' && unstuckBuffAutoFinishPending) return;
    const now = nowMs();

    // === trigger (เฉพาะ IDLE) ===
    //   ★★ การ์ดกัน race อยู่ "ข้างใน" trigger เท่านั้น — ห้ามบล็อคทั้ง loop!
    //   (เคยเป็น deadlock: sell รอ storage จบ / storage รอ sell จบ จน watchdog ตายทั้งคู่)
    if (sellState === 'IDLE') {
      if (!CFG.sellEnabled) return;
      if (storageState !== 'IDLE') return;   // storage กำลังทำ → ไม่ trigger ขาย
      let shouldSell = false; let reason = '';
      // trigger 1: ของเต็ม
      if (CFG.sellOnFull && inventoryFull && CFG.sellItemIds.length > 0) { shouldSell = true; reason = 'ของเต็ม'; }
      // trigger 2: ครบเวลา
      if (CFG.sellIntervalMin > 0 && CFG.sellItemIds.length > 0 && lastSellAt > 0 && (now - lastSellAt >= CFG.sellIntervalMin * 60000)) {
        shouldSell = true; reason = 'ครบ ' + CFG.sellIntervalMin + ' นาที';
      }
      if (shouldSell && currentMap && player.x != null) {
        startSellTravel(reason, null);
      }
      return;
    }

    // === watchdog: เดินจาก Save Point อาจไกลกว่าเดิม → ให้เวลา state ละ 120s ===
    if (sellState !== 'WAIT_COMBAT_RETURN' && now - sellStateAt > 120000) { abortSell('timeout (' + sellState + ' 120s)'); return; }

    // === state machine ===
    if (sellState === 'UNSTUCK_TO_NPC') {
      // ให้ server ย้ายตัวก่อนเล็กน้อย แล้วถามตำแหน่งจริงด้วย /where
      if (now - sellTravelStartedAt < 700) return;
      if (!requestRoutinePosition('💰 Sell', now)) return;
      if (currentMap !== CFG.sellNpcMap) {
        if (now - sellTravelStartedAt > 12000) {
          abortSell('Unstuck แล้วอยู่แมพ ' + (currentMap || '?') + ' แต่ NPC อยู่ ' + CFG.sellNpcMap + ' — ตั้ง Save Point ให้ตรงแมพ NPC ก่อน');
        }
        return;
      }
      try { if (currentMap && !gatCache.has(currentMap)) gatLoad(currentMap); } catch (_) {}
      resetRoutineWakeState(sellWakeMove);
      setSellState('WAKE_MOVE');
      log('💰 ได้พิกัด Save Point จริง @(' + Math.round(player.x) + ',' + Math.round(player.y) + ') → ปลุกการเดินไกล 12–15 ช่องก่อนเข้าทางไปจุดขาย');
      routineWakeMove(sellWakeMove, CFG.sellNpcX, CFG.sellNpcY, '💰 Sell', now);
      return;
    }
    if (sellState === 'WAKE_MOVE') {
      if (currentMap !== CFG.sellNpcMap) { abortSell('หลุดจากแมพ NPC ระหว่าง Wake Move (' + currentMap + ' ≠ ' + CFG.sellNpcMap + ')'); return; }
      if (routineWakeMove(sellWakeMove, CFG.sellNpcX, CFG.sellNpcY, '💰 Sell', now)) {
        setSellState('WALK_TO_POINT');
        sellMoveLastAt = 0; resetRoutineRouteState(sellRouteState);
        routineWalkStable(CFG.sellNpcX, CFG.sellNpcY, '💰 Sell', sellRouteState, now);
      }
      return;
    }
    if (sellState === 'WALK_TO_POINT') {
      if (currentMap !== CFG.sellNpcMap) { abortSell('หลุดจากแมพ NPC ระหว่างเดิน (' + currentMap + ' ≠ ' + CFG.sellNpcMap + ')'); return; }
      // ถ้า NPC โหลดเข้าระยะแล้ว ไม่ต้องฝืนเดินแตะ anchor ให้เป๊ะ — เปลี่ยนไปหา NPC ทันที
      const seenNpc = findSellNpc();
      if (seenNpc && seenNpc.x != null && Math.hypot(seenNpc.x - player.x, seenNpc.y - player.y) <= 18) {
        sellNpcId = seenNpc.id; resetRoutineRouteState(sellRouteState); setSellState('MOVE_TO_NPC');
        log('💰 เห็น NPC แล้ว → เข้าหา', seenNpc.name, '@(', seenNpc.x, seenNpc.y + ')');
        routineWalkStable(seenNpc.x, seenNpc.y, '💰 Sell NPC', sellRouteState, now);
        return;
      }
      const r = routineWalkStable(CFG.sellNpcX, CFG.sellNpcY, '💰 Sell', sellRouteState, now);
      if (r.arrived) {
        const npc = findSellNpc();
        if (npc) { sellNpcId = npc.id; resetRoutineRouteState(sellRouteState); setSellState('MOVE_TO_NPC'); log('💰 ถึงพื้นที่จุดขายแล้ว → พบ', npc.name, '@(', npc.x, npc.y + ')'); }
        else {
          if (!sellNpcRetryAt) sellNpcRetryAt = now;
          if (now - sellNpcRetryAt > 12000) { abortSell('ถึงพื้นที่จุดที่กำหนดแล้วแต่ไม่พบ NPC ' + CFG.sellNpcName); sellNpcRetryAt = 0; }
        }
      } else sellNpcRetryAt = 0;
      return;
    }
    if (sellState === 'MOVE_TO_NPC') {
      const npc = sellNpcId ? entities.get(sellNpcId) : null;
      if (!npc || !npc.alive || npc.x == null) {
        // NPC หาย → ลองหาใหม่ — ★★ retry ถี่ๆ ไม่ abort ทันที (entities อาจโหลดช้า)
        const found = findSellNpc();
        if (found) { sellNpcId = found.id; }
        else {
          if (!sellNpcRetryAt) sellNpcRetryAt = now;
          if (now - sellNpcRetryAt > 10000) { abortSell('ไม่พบ NPC ' + CFG.sellNpcName + ' (retry 10s)'); sellNpcRetryAt = 0; return; }
          return;   // ยังไม่เจอ → รอ tick ถัดไป
        }
        sellNpcRetryAt = 0;
      }
      if (player.x != null) {
        const d = Math.hypot(npc.x - player.x, npc.y - player.y);
        if (d <= 4) {
          // ใกล้แล้ว → คุย NPC
          if (now - sellStateAt > 900) { sendNpcTalk(sellNpcId); setSellState('TALK'); log('💰 คุย NPC', npc.name); }
        } else {
          routineWalkStable(npc.x, npc.y, '💰 Sell NPC', sellRouteState, now);
        }
      }
      return;
    }
    if (sellState === 'TALK') {
      // รอ 0x4d sub=2 (handler จะเปลี่ยน state) — ถ้า 5s ไม่มา → คุยใหม่
      if (now - sellStateAt > 5000) { sendNpcTalk(sellNpcId); sellStateAt = now; log('💰 รอ dialog นาน → คุยใหม่'); }
      return;
    }
    if (sellState === 'SELECT_SELL') {
      // รอ 0x53 SELL_OPEN (handler จะเปลี่ยน state) — ถ้า 5s ไม่มา → abort
      if (now - sellStateAt > 5000) { abortSell('ไม่ได้รับ SELL_OPEN'); }
      return;
    }
    if (sellState === 'SELL') {
      // รอ 0x5b SELL_RESULT (handler จะเปลี่ยน state) — ถ้า 15s ไม่มา → abort
      if (now - sellStateAt > 15000) { abortSell('ไม่ได้รับ SELL_RESULT'); }
      return;
    }
    if (sellState === 'WARP_BACK') {
      // รอ 2s หลังขายเสร็จ แล้วค่อยตัดสินใจกลับฟาร์มตาม Combat
      if (now - sellStateAt > 2000) {
        if (!sellReturnTo) { setSellState('IDLE'); return; }
        if (!CFG.combatEnabled) {
          setSellState('WAIT_COMBAT_RETURN');
          log('💰 ขายเสร็จแล้ว · Combat OFF → รออยู่เมืองก่อน (กด Combat ON แล้วค่อยวาร์ปกลับฟาร์ม)');
          return;
        }
        sendTeleport(sellReturnTo.map, sellReturnTo.x, sellReturnTo.y);
        log('💰 ขายเสร็จ + Combat ON → วาร์ปกลับ', sellReturnTo.map);
        sellReturnTo = null;
        setSellState('IDLE');
      }
      return;
    }
    if (sellState === 'WAIT_COMBAT_RETURN') {
      if (!sellReturnTo) { setSellState('IDLE'); return; }
      if (!CFG.combatEnabled) return;
      sendTeleport(sellReturnTo.map, sellReturnTo.x, sellReturnTo.y);
      log('💰 Combat ON → วาร์ปกลับฟาร์มหลังขาย', sellReturnTo.map);
      sellReturnTo = null;
      setSellState('IDLE');
      return;
    }
  }, 250);

  // ============================================================
  //  AUTO-STORAGE — state machine (mirror bot.js:1816-2047)
  //  IDLE → UNSTUCK_TO_KAFRA → WAKE_MOVE → WALK_TO_KAFRA_POINT → MOVE_TO_KAFRA → TALK_KAFRA → SELECT_STORAGE
  //       → STORAGE_OPENED → MOVE_ITEMS → CLOSE_STORAGE (Kafra Cancel [4F 05 00 00 00]) → WAIT_COMBAT_RETURN/กลับฟาร์ม → IDLE
  // ============================================================
  function findKafraNpc() {
    const target = (CFG.kafraName || '').toLowerCase();
    for (const e of entities.values()) {
      if (e.kind === 2 && e.alive && e.x != null && e.name && e.name.toLowerCase().includes(target)) return e;
    }
    return null;
  }
  function setStorageState(s) { storageState = s; storageStateAt = nowMs(); }
  function abortStorage(reason) {
    log('⚠️ ยกเลิกฝาก:', reason);
    sendStorageClose();   // ★★ ปิด dialog ก่อน (กัน warp ไม่ไป)
    storageState = 'IDLE'; storageStateAt = 0;
    storageMoveQueue = []; storageMoveIdx = 0; storageKafraCancelSent = false;
    if (storageReturnTo && storageReturnTo.map) { sendTeleport(storageReturnTo.map, storageReturnTo.x, storageReturnTo.y); }
    storageReturnTo = null;
  }
  // ★ เริ่มฝากของ — จด returnTo → Direct Unstuck → เดินไปจุด Kafra
  let storageWarped = false;     // legacy flag (v4.189.4 ขาไปไม่ใช้ Direct Teleport)
  let storageWarpRetries = 0;
  let storageTravelStartedAt = 0;
  function startStorage(reason, returnTo) {
    const kx = (CFG.kafraMapX && CFG.kafraMapX > 0) ? CFG.kafraMapX : CFG.sellNpcX;
    const ky = (CFG.kafraMapY && CFG.kafraMapY > 0) ? CFG.kafraMapY : CFG.sellNpcY;
    if (!currentMap || player.x == null || player.y == null) { log('⚠️ เริ่มฝากไม่ได้ — ยังไม่รู้แมพ/พิกัดตัวละคร'); return false; }
    storageReturnTo = returnTo || { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
    storageWarpRetries = 0; storageNpcId = null; kafraNpcRetryAt = 0; storageLastMoveAt = 0; storageKafraCancelSent = false; resetRoutineWakeState(storageWakeMove); resetRoutineRouteState(storageRouteState);
    if (!sendDirectUnstuckPacket()) { storageReturnTo = null; log('⚠️ เริ่มฝากไม่ได้ — ส่ง Direct Unstuck 0x73 ไม่สำเร็จ'); return false; }
    invalidatePositionAfterRoutineUnstuck();
    storageTravelStartedAt = nowMs();
    setStorageState('UNSTUCK_TO_KAFRA');
    log('🏦 เริ่มฝากของ (' + reason + ') → Unstuck 0x73 → รอ 2 วิ → เดินไป ' + CFG.kafraMap + ' @(' + kx + ',' + ky + ')');
    return true;
  }
  // ★ สร้าง queue ของที่จะฝาก — แยก equipment vs stackable (mirror bot.js:1947-1987)
  function buildDepositQueue() {
    const queue = [];
    let noSlotSkipped = 0;
    for (const itemId of CFG.depositItemIds) {
      const eqSlots = equipmentSlots.get(itemId);
      if (eqSlots && eqSlots.length > 0) {
        // ★★ equipment — ฝากจาก slot สูง→ต่ำ (กัน index shift) ทีละชิ้น amount=1
        //   ★★ ตรวจ equipmentSlots ก่อน inventory — ของ equipment จาก login ไม่เคยเข้า
        //   inventory map เลย (เดิมเช็ค stock>0 ก่อน → ของ login ถูกข้ามไปเงียบ ๆ!)
        const sorted = [...eqSlots].sort((a, b) => b - a);
        for (const slotId of sorted) queue.push({ itemId, amount: 1, invId: slotId, isEquipment: true, verified: verifiedEquipSlots.has(slotId) });
        continue;
      }
      if (equipmentList.some(x => x.id === itemId)) {
        // equipment ที่ยังไม่รู้ slot id (เพิ่งสวม/ถอดกลางเซสชัน) — ข้าม รอเข้าเกมใหม่
        noSlotSkipped++;
        continue;
      }
      // ★ stackable — ทั้งกองทีเดียว (moveId = itemId)
      const stock = inventory.get(itemId) || 0;
      if (stock <= 0) continue;
      queue.push({ itemId, amount: stock, invId: itemId, isEquipment: false });
    }
    if (noSlotSkipped > 0) log('⚠️ ข้าม equipment', noSlotSkipped, 'ชนิด (ไม่รู้ slot id — รอเข้าเกมใหม่จะถูกต้อง)');
    return queue;
  }
  const storageLoop = setInterval(() => {
    if (chatPauseActive && storageState === 'IDLE') return;
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    if (typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE') return;
    if (typeof unstuckBuffAutoFinishPending !== 'undefined' && unstuckBuffAutoFinishPending) return;
    const now = nowMs();

    // === trigger (IDLE เท่านั้น) ===
    //   ★★ การ์ดกัน race อยู่ "ข้างใน" trigger เท่านั้น — ห้ามบล็อคทั้ง loop (กัน deadlock เหมือน sellLoop)
    if (storageState === 'IDLE') {
      if (!CFG.storageEnabled) return;
      if (sellState !== 'IDLE') return;   // sell กำลังทำ → ไม่ trigger ฝาก (chain หลัง sell เสร็จอยู่แล้ว)
      let shouldDeposit = false; let reason = '';
      // trigger 1: ของเต็ม (เหมือน sell แต่ฝากแทน)
      if (CFG.depositOnFull && inventoryFull && CFG.depositItemIds.length > 0) { shouldDeposit = true; reason = 'ของเต็ม'; }
      if (shouldDeposit && currentMap && player.x != null) startStorage(reason, null);
      return;
    }

    // === watchdog: เดินจาก Save Point อาจไกล → ให้เวลา state ละ 120s ===
    if (storageState !== 'WAIT_COMBAT_RETURN' && now - storageStateAt > 120000) { abortStorage('timeout (' + storageState + ' 120s)'); return; }

    if (storageState === 'UNSTUCK_TO_KAFRA') {
      if (now - storageTravelStartedAt < 700) return;
      if (!requestRoutinePosition('🏦 Kafra', now)) return;
      if (currentMap !== CFG.kafraMap) {
        if (now - storageTravelStartedAt > 12000) {
          abortStorage('Unstuck แล้วอยู่แมพ ' + (currentMap || '?') + ' แต่ Kafra อยู่ ' + CFG.kafraMap + ' — ตั้ง Save Point ให้ตรงแมพ Kafra ก่อน');
        }
        return;
      }
      try { if (currentMap && !gatCache.has(currentMap)) gatLoad(currentMap); } catch (_) {}
      resetRoutineWakeState(storageWakeMove);
      setStorageState('WAKE_MOVE');
      const kx = (CFG.kafraMapX && CFG.kafraMapX > 0) ? CFG.kafraMapX : CFG.sellNpcX;
      const ky = (CFG.kafraMapY && CFG.kafraMapY > 0) ? CFG.kafraMapY : CFG.sellNpcY;
      log('🏦 ได้พิกัด Save Point จริง @(' + Math.round(player.x) + ',' + Math.round(player.y) + ') → ปลุกการเดินไกล 12–15 ช่องก่อนเข้าทางไป Kafra');
      routineWakeMove(storageWakeMove, kx, ky, '🏦 Kafra', now);
      return;
    }
    if (storageState === 'WAKE_MOVE') {
      if (currentMap !== CFG.kafraMap) { abortStorage('หลุดจากแมพ Kafra ระหว่าง Wake Move (' + currentMap + ' ≠ ' + CFG.kafraMap + ')'); return; }
      const kx = (CFG.kafraMapX && CFG.kafraMapX > 0) ? CFG.kafraMapX : CFG.sellNpcX;
      const ky = (CFG.kafraMapY && CFG.kafraMapY > 0) ? CFG.kafraMapY : CFG.sellNpcY;
      if (routineWakeMove(storageWakeMove, kx, ky, '🏦 Kafra', now)) {
        setStorageState('WALK_TO_KAFRA_POINT');
        storageLastMoveAt = 0; resetRoutineRouteState(storageRouteState);
        routineWalkStable(kx, ky, '🏦 Kafra', storageRouteState, now);
      }
      return;
    }
    if (storageState === 'WALK_TO_KAFRA_POINT') {
      if (currentMap !== CFG.kafraMap) { abortStorage('หลุดจากแมพ Kafra ระหว่างเดิน (' + currentMap + ' ≠ ' + CFG.kafraMap + ')'); return; }
      const kx = (CFG.kafraMapX && CFG.kafraMapX > 0) ? CFG.kafraMapX : CFG.sellNpcX;
      const ky = (CFG.kafraMapY && CFG.kafraMapY > 0) ? CFG.kafraMapY : CFG.sellNpcY;
      // ถ้า Kafra ถูกโหลดแล้วในระยะใกล้ ให้เข้าหา Kafra เลย ไม่ต้องแตะ anchor ก่อน
      const seenKafra = findKafraNpc();
      if (seenKafra && seenKafra.x != null && Math.hypot(seenKafra.x - player.x, seenKafra.y - player.y) <= 18) {
        storageNpcId = seenKafra.id; resetRoutineRouteState(storageRouteState); setStorageState('MOVE_TO_KAFRA');
        log('🏦 เห็น Kafra แล้ว → เข้าหา', seenKafra.name, '@(', seenKafra.x, seenKafra.y + ')');
        routineWalkStable(seenKafra.x, seenKafra.y, '🏦 Kafra NPC', storageRouteState, now);
        return;
      }
      const r = routineWalkStable(kx, ky, '🏦 Kafra', storageRouteState, now);
      if (r.arrived) {
        const npc = findKafraNpc();
        if (npc) { storageNpcId = npc.id; resetRoutineRouteState(storageRouteState); setStorageState('MOVE_TO_KAFRA'); log('🏦 ถึงพื้นที่จุด Kafra แล้ว → พบ', npc.name, '@(', npc.x, npc.y + ')'); }
        else {
          if (!kafraNpcRetryAt) kafraNpcRetryAt = now;
          if (now - kafraNpcRetryAt > 12000) { abortStorage('ถึงพื้นที่จุดที่กำหนดแล้วแต่ไม่พบ Kafra ' + CFG.kafraName); kafraNpcRetryAt = 0; }
        }
      } else kafraNpcRetryAt = 0;
      return;
    }
    if (storageState === 'MOVE_TO_KAFRA') {
      const npc = storageNpcId ? entities.get(storageNpcId) : null;
      if (!npc || !npc.alive || npc.x == null) {
        // ★★ retry ถี่ๆ ไม่ abort ทันที (entities อาจโหลดช้า)
        const found = findKafraNpc();
        if (found) { storageNpcId = found.id; }
        else {
          if (!kafraNpcRetryAt) kafraNpcRetryAt = now;
          if (now - kafraNpcRetryAt > 10000) { abortStorage('ไม่พบ Kafra ' + CFG.kafraName + ' (retry 10s)'); kafraNpcRetryAt = 0; return; }
          return;
        }
        kafraNpcRetryAt = 0;
      }
      if (player.x != null) {
        const d = Math.hypot(npc.x - player.x, npc.y - player.y);
        if (d <= 4) {
          if (now - storageStateAt > 900) { sendNpcTalk(storageNpcId); setStorageState('TALK_KAFRA'); log('🏦 คุย Kafra', npc.name); }
        } else {
          routineWalkStable(npc.x, npc.y, '🏦 Kafra NPC', storageRouteState, now);
        }
      }
      return;
    }
    // TALK_KAFRA / SELECT_STORAGE จัดการโดย 0x4d handler (packet-driven)
    if (storageState === 'TALK_KAFRA') {
      // รอ dialog — ถ้านานเกินไป คุยใหม่
      if (now - storageStateAt > 5000) { sendNpcTalk(storageNpcId); storageStateAt = now; log('🏦 รอ dialog นาน → คุยใหม่'); }
      return;
    }
    if (storageState === 'SELECT_STORAGE') {
      // รอ menu — ถ้านานเกินไป คุยใหม่
      if (now - storageStateAt > 5000) { abortStorage('ไม่ได้รับเมนู Kafra'); }
      return;
    }
    if (storageState === 'STORAGE_OPENED') {
      // ★ build queue + เริ่มฝาก
      storageMoveQueue = buildDepositQueue();
      storageMoveIdx = 0;
      if (storageMoveQueue.length === 0) {
        log('🏦 ไม่มีของที่จะฝาก → ปิด storage');
        sendStorageClose();
        storageKafraCancelSent = false;
        setStorageState('CLOSE_STORAGE');
      } else {
        const total = storageMoveQueue.length;
        const types = storageMoveQueue.filter(q => q.isEquipment).length;
        log('🏦 เปิด storage แล้ว → ฝาก', total, 'รายการ' + (types ? ' (' + types + ' equipment)' : ''));
        setStorageState('MOVE_ITEMS');
      }
      return;
    }
    if (storageState === 'MOVE_ITEMS') {
      // ★ ส่งของทีละชิ้น (รอ 800ms ระหว่างชิ้น กัน server บล็อก)
      if (now - storageLastMoveAt < 800) return;
      if (storageMoveIdx >= storageMoveQueue.length) {
        // ★★ สรุปผลจริง — นับเฉพาะชิ้นที่ server ตอบกลับมายืนยัน (0x32)
        //   แก้เคส: ส่งครบทุกชิ้นแล้วขึ้น "ฝากครบแล้ว" ทั้งที่ server ปฏิเสธเงียบ ๆ ทั้งหมด
        const okN = storageMoveQueue.filter(q => q._confirmed).length;
        const failN = storageMoveQueue.length - okN;
        log('🏦 ฝากเสร็จ: สำเร็จ ' + okN + '/' + storageMoveQueue.length + (failN > 0 ? ' ⚠️ ไม่ตอบ ' + failN + ' ชิ้น (server ปฏิเสธ/สวมอยู่)' : ' ✅'));
        log('🏦 ปิด storage');
        sendStorageClose();
        storageKafraCancelSent = false;
        setStorageState('CLOSE_STORAGE');
        return;
      }
      const item = storageMoveQueue[storageMoveIdx];
      const moveId = item.isEquipment ? item.invId : item.itemId;
      log('🏦 ฝาก', nameOf(item.itemId) + (item.isEquipment ? ' (slot ' + item.invId + (item.verified === false ? ' ?' : '') + ')' : ' ×' + item.amount));
      sendStorageMove(moveId, item.amount);
      // ★ optimistic: ลบ slot + ลด inventory count (server จะส่ง 0x32 removal ยืนยัน)
      //   ★★ เฉพาะ slot id ที่ verified (จาก sub=5) — ตัวจาก login block (@28) ถ้า decode ผิด
      //      แล้ว server ปฏิเสธ จะได้ไม่ลบของหลอก ๆ (รอ 0x32 removal เป็นตัวชี้ขาด)
      if (item.isEquipment && item.verified === false) {
        // ข้าม optimistic — รอ server ยืนยัน
      } else if (item.isEquipment) {
        const slots = equipmentSlots.get(item.itemId);
        if (slots) {
          const i = slots.indexOf(item.invId);
          if (i >= 0) slots.splice(i, 1);
          if (slots.length === 0) equipmentSlots.delete(item.itemId);
        }
        const cur = inventory.get(item.itemId) || 0;
        if (cur > 1) inventory.set(item.itemId, cur - 1);
        else inventory.delete(item.itemId);
        // ★★ ลบจาก equipmentList ด้วย — removal ของ server จะหา slot ไม่เจอแล้ว (เราลบก่อน)
        const eqIdx = equipmentList.findIndex(x => x.id === item.itemId);
        if (eqIdx >= 0) equipmentList.splice(eqIdx, 1);
        invDataVer++;
      } else {
        inventory.delete(item.itemId);   // stackable ทั้งกอง
      }
      storageMoveIdx++;
      storageLastMoveAt = now;
      return;
    }
    if (storageState === 'CLOSE_STORAGE') {
      // ★ v4.189.21: หลัง Storage Close ให้เลือกเมนู Kafra ข้อ 5 = Cancel ด้วย packet ที่จับจริง
      if (!storageKafraCancelSent && now - storageStateAt > 700) {
        if (sendKafraCancel()) {
          storageKafraCancelSent = true;
          log('🏦 กด Cancel เมนู Kafra [4F 05 00 00 00] หลังฝากเสร็จ');
        }
        return;
      }
      // ให้ client/server มีเวลาปิดเมนู แล้วค่อยตัดสินใจกลับฟาร์มตาม Combat
      if (storageKafraCancelSent && now - storageStateAt > 1700) {
        if (inventoryFull) { inventoryFull = false; log('🎒 คลายสถานะของเต็ม (ฝากของเรียบร้อย)'); }
        storageKafraCancelSent = false;
        if (storageReturnTo && !CFG.combatEnabled) {
          setStorageState('WAIT_COMBAT_RETURN');
          log('🏦 ฝากเสร็จแล้ว · Combat OFF → รออยู่เมืองก่อน (กด Combat ON แล้วค่อยวาร์ปกลับฟาร์ม)');
          return;
        }
        if (storageReturnTo) {
          sendTeleport(storageReturnTo.map, storageReturnTo.x, storageReturnTo.y);
          log('🏦 ฝากเสร็จ + Combat ON → วาร์ปกลับ', storageReturnTo.map);
          storageReturnTo = null;
        }
        setStorageState('IDLE');
      }
      return;
    }
    if (storageState === 'WAIT_COMBAT_RETURN') {
      if (!storageReturnTo) { setStorageState('IDLE'); return; }
      if (!CFG.combatEnabled) return;
      sendTeleport(storageReturnTo.map, storageReturnTo.x, storageReturnTo.y);
      log('🏦 Combat ON → วาร์ปกลับฟาร์มหลังฝาก', storageReturnTo.map);
      storageReturnTo = null;
      setStorageState('IDLE');
      return;
    }
  }, 1000);
  // ---------- entity tracker ----------
  //  kind: 0=player, 1=monster, 2=NPC (จาก SPAWN)
  const entities = new Map();    // id -> {id,kind,sub,name,x,y,hp,hpMax,alive,_lastEngagedByOtherAt,_lastDamageAt}
  // ★★ recentlyDespawned — จำ entity ที่ sweeper เพิ่งลบ (เก็บ kind/sub/name ไว้ชั่วคราว)
  //   ปัญหา: มอนยืนนิ่งโดน 1b mark → ไม่มี 0x07/0x0f มายืนยันใน 2s → sweeper ลบทิ้ง
  //   ทั้งที่ยังอยู่บนจอ → พอขยับ 0x07 สร้างใหม่เป็น kind=0 ผี → หาไม่เจอ ("มอนอยู่รอบตัวแต่บอทบอกไม่เจอมอน")
  //   แก้: ขยับกลับมา → คืนสถานะที่ SPAWN เคยยืนยัน (ไม่ใช่การเดา id ใหม่ — ปลอดภัยเท่าเดิม)
  const recentlyDespawned = new Map();   // id -> {kind, sub, name, isBoss, isMiniBoss, expireAt}
  // ★ v4.187.1 MONSTER SENSOR FUSION
  // 1b จาก server มี false-despawn เป็นระยะกับมอนที่ client ยัง render อยู่
  // ใช้ grace > รอบ false signal (~5s) เพื่อให้ packet ยืนยันรอบถัดไปมีเวลายกเลิก pending
  const MONSTER_DESPAWN_GRACE_MS = 6500;
  const TARGET_REACQUIRE_MS = 600;
  function upsertMonsterEvidence(id, x, y, now, src, extra = null) {
    if (!id || id === 0xffffffff || id === playerId) return null;
    if (isStaleId(id, now) || isBeaconPlayer(id, now)) return null;
    let e = entities.get(id);
    // ถ้าเคยเป็นมอนที่เพิ่งถูก sweeper ลบ ให้คืน sub/name เดิมก่อน
    if (!e) {
      const rd = recentlyDespawned.get(id);
      if (rd && now < rd.expireAt && rd.kind === 1) {
        recentlyDespawned.delete(id);
        e = { id, kind: 1, sub: rd.sub, name: rd.name || '', x, y, alive: true, _lastSeenAt: now, _src: 'restore',
          ...(rd.isBoss ? { _isBoss: true } : {}), ...(rd.isMiniBoss ? { _isMiniBoss: true } : {}) };
        entities.set(id, e);
      }
    }
    if (!e) {
      e = { id, kind: 1, x, y, alive: true, _lastSeenAt: now, name: '', _src: src || 'evidence' };
      entities.set(id, e);
    } else {
      // named player/NPC ที่มีหลักฐานอยู่แล้ว ห้าม promote เป็นมอนจาก packet ตำแหน่งลอย ๆ
      if (e.kind === 2 || (e.kind === 0 && e.name && e.name.trim())) {
        e.x = x; e.y = y; e._lastSeenAt = now; e._despawnPendingAt = 0;
        return e;
      }
      e.kind = 1;
      e.x = x; e.y = y; e.alive = true; e._lastSeenAt = now; e._despawnPendingAt = 0;
      if (!e._src || e._src === 'move') e._src = src || 'evidence';
    }
    if (extra && extra.isBoss) e._isBoss = true;
    if (extra && extra.isMiniBoss) e._isMiniBoss = true;
    return e;
  }
  const monsterAggro = new Map(); // monsterId -> timestamp (มอนจับเราเป็นเป้า)
  const stalePlayerIds = new Map(); // oldPlayerId -> expireAt (กัน phantom entity จาก ID เก่า, 5 นาที)
  function isStaleId(id, now) {
    const exp = stalePlayerIds.get(id);
    if (!exp) return false;
    if (now >= exp) { stalePlayerIds.delete(id); return false; }
    return true;
  }
  const mobAttackers = new Map(); // monsterId -> timestamp (มอนตีเรา)

  // ---------- AUTO-SELL + AUTO-STORAGE state + inventory ----------
  const inventory = new Map();
  // ★★ equipmentList — ชิ้น equipment แยกเป็น record {id, worn, card, refine}
  //   ลำดับตาม login block (ก้อน 0x13880) · worn/card/refine decode จาก record 44B
  const equipmentList = [];
  const equipmentSlots = new Map(); // ★ itemId -> [slotId, slotId, ...] — ได้จาก 0x32 sub=5 เท่านั้น
  const verifiedEquipSlots = new Set(); // ★ slotId ที่ยืนยันแน่ (จาก 0x32 sub=5)
  const sessionPickups = new Map();   // ★ itemId -> เวลาที่เก็บได้ล่าสุด (เฉพาะของที่เก็บใน session นี้ — แท็บสถิติ)
  let invDataVer = 0;          // ★ version ของ inventory/equipment — bump ทุกครั้งที่ข้อมูลเปลี่ยน (modal live-refresh)
  let lastOutEquip = null;     // ★ OUT 0x30 ล่าสุด {idx, action, at} — ให้ IN 0x30 รู้ทิศทาง สวมใส่/ถอด
  let inventoryFull = false;      // true เมื่อ server ส่ง "too full" (0x20)
  let sellState = 'IDLE';         // IDLE|UNSTUCK_TO_NPC|WAKE_MOVE|WALK_TO_POINT|MOVE_TO_NPC|TALK|SELECT_SELL|SELL|WARP_BACK|WAIT_COMBAT_RETURN
  let sellNpcRetryAt = 0;         // ★ NPC retry — กัน abort ทันทีเมื่อ entities โหลดช้า
  let sellStateAt = 0;            // timestamp เข้า state (watchdog)
  let sellReturnTo = null;        // {map,x,y} ที่จะวาร์ปกลับหลังขาย
  let sellNpcId = null;           // NPC entity id (หาจาก entities)
  let lastSellAt = 0;             // throttle interval
  // ---------- AUTO-STORAGE state (mirror bot.js:1817-1824) ----------
  let storageState = 'IDLE';      // IDLE|UNSTUCK_TO_KAFRA|WAKE_MOVE|WALK_TO_KAFRA_POINT|MOVE_TO_KAFRA|TALK_KAFRA|SELECT_STORAGE|STORAGE_OPENED|MOVE_ITEMS|CLOSE_STORAGE|WAIT_COMBAT_RETURN
  let kafraNpcRetryAt = 0;        // ★ Kafra retry — กัน abort ทันทีเมื่อ entities โหลดช้า
  let storageStateAt = 0;         // timestamp เข้า state (watchdog)
  let storageReturnTo = null;     // {map,x,y} ที่จะวาร์ปกลับหลังฝาก
  let storageNpcId = null;        // Kafra entity id
  let storageMoveQueue = [];      // [{itemId, amount, invId, isEquipment}]
  let storageMoveIdx = 0;         // index ใน queue ที่กำลังส่ง
  let storageLastMoveAt = 0;      // throttle MOVE_TO_KAFRA + MOVE_ITEMS
  let storageKafraCancelSent = false; // ★ หลังปิด storage ส่ง Kafra Cancel [4F 05 00 00 00] 1 ครั้งก่อนวาร์ปกลับ
  let storageKafraCaptureHoldLogged = false; // ★ v4.189.20 temporary capture hold
  let noMonsterSince = 0;        // timestamp ที่เริ่มไม่เจอมอน
  let lastWanderAt = 0;
  let lastNavLogTag = '';   // ★ track last nav log target (กัน spam log)
  let lastFleeAt = 0;
  let lastWarpFindAt = 0;        // throttle warpFind กัน spam
  let lastTargetSwitchAt = 0;    // throttle การสลับ target (กันสลับบ่อย)

  // ---------- combat target state ----------
  let target = null;             // {id, x, y, acquiredAt, engageAt, lastAttackAt, lastAttackResultAt, pendingAttacks, stuckCount, warpCount}
  let lastWalkPos = null;        // {x,y} สำหรับ stuck detection
  let stuckWalkCount = 0;
  let stuckAbandonCount = 0;
  let stuckAbandonHistory = [];  // timestamps ใน 60s
  const warpToMonsterCount = new Map(); // entityId -> count

  // ---------- combat helpers ----------
  function nowMs() { return Date.now(); }

  // whitelist/blacklist matching (รองรับทั้งชื่อ + sprite id แบบ number)
  function matchList(entity, list) {
    if (!list || !list.length) return false;
    return list.some(e => {
      if (typeof e === 'number') return entity.sub === e;
      return entity.name && entity.name.toLowerCase() === String(e).toLowerCase();
    });
  }
  function isTargetable(m, now) {
    if (!m || !m.alive) return false;
    if (m.kind !== 1) return false;                       // ตีเฉพาะ monster
    if (m.x == null || m.y == null) return false;
    if (isStaleId(m.id, now)) return false;               // ★ skip stale player IDs (phantom)
    // ★ ข้ามมอนที่เพิ่ง abandon (กันเลือกตัวเดิมซ้ำทันที → วนลูป)
    const ab = abandonCooldown.get(m.id);
    if (ab && now < ab) return false;
    if (ab && now >= ab) abandonCooldown.delete(m.id);    // หมดอายุ → ล้าง
    // ★★ ห้ามตีผู้เล่นเด็ดขาด — id ที่เคยบน radar ผู้เล่น (beacon) = ผู้เล่น แม้ kind จะเพี้ยนเป็น 1
    if (isBeaconPlayer(m.id, now)) return false;
    // ★ ผ่อน guard: ต้องเคยเห็น SPAWN (มี sub) หรืออยู่ใกล้ตัวเรามาก (≤12 ช่อง — NPC มักนิ่ง ไม่ใช่อันตราย)
    //   กัน ghost entity ไกลๆ แต่ยอมรับมอนใกล้ที่อาจยังไม่ได้ SPAWN
    if (m.sub == null) {
      if (player.x == null) return false;
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > 12) return false;                           // ghost ไกล → ข้าม (รอ SPAWN)
    }
    if (matchList(m, CFG.targetBlacklist)) return false;
    if (CFG.targetWhitelist.length && !matchList(m, CFG.targetWhitelist)) return false;
    // anti-KS: ข้ามมอนที่คนอื่นตีอยู่ — ★ ยกเว้นถ้าเรา claim แล้ว (mirror world.js:1855 !e._claimedByMe)
    if (CFG.antiKS && !m._claimedByMe && m._lastEngagedByOtherAt && now - m._lastEngagedByOtherAt < CFG.antiKSCooldownMs) return false;
    // avoid players: ข้ามมอนที่อยู่ใกล้ผู้เล่นคนอื่น — ★ ยกเว้นถ้าเรา claim (mirror world.js:1851 !e._claimedByMe)
    if (CFG.avoidOtherPlayers && !m._claimedByMe) {
      for (const e of entities.values()) {
        // ★ ต้องมี name ด้วย (mirror world.js:1777) — กัน ghost entity kind=0 ที่ไม่มีชื่อ
        if (e.kind === 0 && e.alive && e.id !== playerId && e.x != null && e.name && !isStaleId(e.id, now)) {
          if (Math.hypot(e.x - m.x, e.y - m.y) <= CFG.playerProximityRadius) return false;
        }
      }
    }
    return true;
  }
  function getMonsters(now) {
    const out = [];
    for (const m of entities.values()) {
      if (isTargetable(m, now || nowMs())) out.push(m);
    }
    return out;
  }
  function countMonsters(radius) {
    if (player.x == null) return 0;
    const now = nowMs();
    let n = 0;
    for (const m of entities.values()) {
      if (m.kind !== 1 || !m.alive || m.x == null) continue;
      if (isStaleId(m.id, now)) continue;   // ★ skip stale player IDs (mirror world.js:1904)
      if (isBeaconPlayer(m.id, now)) continue; // ★ v4.187.1 defense-in-depth: radar-confirmed player ไม่นับเป็นมอน
      if (Math.hypot(m.x - player.x, m.y - player.y) <= radius) n++;
    }
    return n;
  }
  // ★★ นับผู้เล่นคนอื่นที่อยู่ใกล้ — รวมทั้ง SPAWN (มีชื่อ) และ 0x3c minimap (ไม่มีชื่อ)
  function countNearbyPlayers(radius) {
    if (player.x == null) return 0;
    const now = nowMs();
    let n = 0;
    for (const e of entities.values()) {
      if (e.kind !== 0 || !e.alive || e.x == null) continue;
      if (e.id === playerId) continue;       // ยกเว้นตัวเอง
      if (isStaleId(e.id, now)) continue;
      if (!e.name || !e.name.trim()) {
        // ★★ ผู้เล่นจาก 0x3c minimap beacon (ไม่มีชื่อ) — นับเฉพาะ radius=0 (นับทุกคนในแมป)
        //   ★★ เชื่อเฉพาะ _src='beacon' เท่านั้น! (radar ของ server ระบุชัดว่าเป็น player)
        //   _src='move' (0x07 ghost ไม่เคย SPAWN) อาจเป็น "มอน" เดินจากนอกจอ/มอนมากินของ
        //   → เคยแอบดิสเป็น player ทำให้หนีผี (โผล่ห่าง 1.4 ช่องกลางกอง loot)
        if (radius !== 0) continue;
        if (e._src !== 'beacon') continue;
        //   กันผี/ตัวเอง: dot ต้อง fresh ≤30s (คนออกจากแมปแล้ว dot หยุดมา → ไม่นับทับ)
        //   + ตำแหน่งตรงเราเป๊ะ (dist<1) = dot ตัวเราเอง → ข้าม
        if (!e._lastSeenAt || now - e._lastSeenAt > 30000) continue;
        if (Math.hypot(e.x - player.x, e.y - player.y) < 1) continue;
        n++;
        continue;
      }
      // ★★ ข้ามชื่อขยะ (ไม่มีตัวอักษร/ตัวเลขที่อ่านได้) — spawn parse ผิด
      if (!/[a-zA-Z0-9\u0E00-\u0E7F]/.test(e.name)) continue;
      if (radius > 0 && Math.hypot(e.x - player.x, e.y - player.y) > radius) continue;  // radius=0 = นับทุกคนในแมป
      n++;
    }
    return n;
  }
  // ★★ เลือกแผนที่สำรองถัดไป (ข้ามแผนที่ปัจจุบัน)
  function pickNextFleeMap() {
    const maps = (CFG.fleeMaps || []).filter(m => m && m !== currentMap);
    if (!maps.length) return null;
    const next = maps[fleeMapIdx % maps.length];
    fleeMapIdx++;
    return next;
  }
  // นับมอนที่ aggro เรา (MONSTER_SKILL dstId=player) ที่ยังมีอยู่จริง — สำหรับ UI/แสดงผล
  function getAggroCount(radius) {
    const now = nowMs();
    let n = 0;
    for (const [id, t] of monsterAggro) {
      if (now - t > (CFG.aggroKeepAliveMs || 10000)) { monsterAggro.delete(id); continue; }
      const m = entities.get(id);
      if (!m || !m.alive || m.x == null) { monsterAggro.delete(id); continue; }
      if (isStaleId(id, now)) { monsterAggro.delete(id); continue; }
      if (player.x != null && radius && Math.hypot(m.x - player.x, m.y - player.y) > radius) continue;
      n++;
    }
    return n;
  }
  // ★ getThreatCount = max(aggro, nearby) — สำหรับ flee logic (mirror world.js:1018-1044)
  function getThreatCount(radius) {
    return Math.max(getAggroCount(radius), radius ? countMonsters(radius) : 0);
  }
  function getMobAttackerCount(radius) {
    const now = nowMs();
    let n = 0;
    for (const [id, t] of mobAttackers) {
      if (now - t >= CFG.fleeMobWindowMs) { mobAttackers.delete(id); continue; }   // หมดอายุ → ลบ
      if (isStaleId(id, now)) { mobAttackers.delete(id); continue; }              // stale player ID → ลบ
      const m = entities.get(id);
      if (!m || !m.alive || m.x == null) { mobAttackers.delete(id); continue; }   // entity หาย → ลบ
      // ถ้าระบุ radius → นับเฉพาะในรัศมี (เหมือน aggro)
      if (radius && player.x != null && Math.hypot(m.x - player.x, m.y - player.y) > radius) continue;
      n++;
    }
    return n;
  }
  // คำนวณ HP% (default 1.0 ถ้าไม่รู้)
  function monsterHpPct(m) { return (m.hpMax && m.hpMax > 0 && m.hp != null) ? m.hp / m.hpMax : 1.0; }
  // เลือกมอนใกล้สุด ในรัศมีที่กำหนด (default = maxAcquireDistance)
  function findNearestMonster(now, radius) {
    if (player.x == null) return null;
    const cap = (radius != null) ? radius : CFG.maxAcquireDistance;
    let best = null, bestD = Infinity;
    for (const m of getMonsters(now)) {
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > cap) continue;   // ★ เกินรัศมีที่กำหนด → ข้าม
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? { m: best, dist: bestD } : null;
  }
  // เลือกมอน HP% ต่ำสุด (tiebreak = ระยะ) ในรัศมีที่กำหนด
  function findLowestHpMonster(now, radius) {
    if (player.x == null) return null;
    const cap = (radius != null) ? radius : CFG.maxAcquireDistance;
    let best = null, bestHp = 2, bestD = Infinity;
    for (const m of getMonsters(now)) {
      const hp = monsterHpPct(m);
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > cap) continue;   // ★ เกินรัศมีที่กำหนด → ข้าม
      if (hp < bestHp || (hp === bestHp && d < bestD)) { bestHp = hp; bestD = d; best = m; }
    }
    return best ? { m: best, dist: bestD, hpPct: bestHp } : null;
  }

  // ---------- combat encoders ----------
  // ATTACK OUT: [0b][target_id:4]
  let lastAttackSentAt = 0;        // ★ timestamp ที่เราส่ง ATTACK ล่าสุด
  let lastAttackSentTarget = null; // ★ targetId ที่เราส่ง ATTACK ใส่
  function sendAttack(targetId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5);
    b[0] = 0x0b;
    b[1] = targetId & 0xff; b[2] = (targetId >> 8) & 0xff;
    b[3] = (targetId >> 16) & 0xff; b[4] = (targetId >>> 24) & 0xff;
    activeWS.send(b);
    lastAttackSentAt = nowMs();    // ★ track เพื่อ heuristic anti-KS ใน 0x17
    lastAttackSentTarget = targetId;
    return true;
  }
  // ★ SKILL OUT (mirror protocol.js:223-248):
  //   targeted (sub=01): [1d][01][targetId:4][skillId:1][level:1]  — Bash, Charge Attack
  //   AoE/self (sub=05): [1d][05][skillId:2 LE][level:1]           — Magnum Break, Two-Hand Quicken
  // ★ SKILL OUT (mirror protocol.js:223-248 + capture Arrow Shower):
  //   targeted (sub=01): [1d][01][targetId:4][skillId:1][level:1]  — Bash, Charge Arrow
  //   ground (sub=04):   [1d][04][x:2][y:2][skillId:1][level:1]    — Arrow Shower (เลือกพื้นที่)
  //   AoE/self (sub=05): [1d][05][skillId:2 LE][level:1]           — Magnum Break, Quicken
  function sendSkill(skillId, level, targetId, groundX, groundY) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (targetId != null) {
      // ★ targeted: [1d][01][targetId:4][skillId:1][level:1]
      const b8 = new Uint8Array(8);
      b8[0] = 0x1d; b8[1] = 0x01;
      b8[2] = targetId & 0xff; b8[3] = (targetId >> 8) & 0xff;
      b8[4] = (targetId >> 16) & 0xff; b8[5] = (targetId >>> 24) & 0xff;
      b8[6] = skillId & 0xff;
      b8[7] = level & 0xff;
      activeWS.send(b8);
    } else if (groundX != null && groundY != null) {
      // ★ ground-targeted: [1d][04][x:2 LE][y:2 LE][skillId:1][level:1]
      const b = new Uint8Array(8);
      b[0] = 0x1d; b[1] = 0x04;
      b[2] = groundX & 0xff; b[3] = (groundX >> 8) & 0xff;
      b[4] = groundY & 0xff; b[5] = (groundY >> 8) & 0xff;
      b[6] = skillId & 0xff;
      b[7] = level & 0xff;
      activeWS.send(b);
    } else {
      // ★ AoE/self-cast: [1d][05][skillId:2 LE][level:1]
      const b = new Uint8Array(5);
      b[0] = 0x1d; b[1] = 0x05;
      b[2] = skillId & 0xff; b[3] = (skillId >> 8) & 0xff;
      b[4] = level & 0xff;
      activeWS.send(b);
    }
    // ★ cast lock: ใช้เวลาร่ายที่เรียนรู้จาก server (0x18/0x19) — ยังไม่รู้ = provisional สั้น (สกิล instant)
    //   สกิล instant → completion (0x1d/0x0b) มาปลดล็อกเองเร็ว ๆ / เวลาร่ายจริงจะยืดให้เองเมื่อ 0x18 มาถึง
    lastSkillSentAt = nowMs();
    lastSkillCastMs = (castTimes.get(skillId) || 0.3) * 1000 + 300;
    castingUntil = nowMs() + lastSkillCastMs;
    castingSkillId = skillId;
    dbg('📤 sendSkill id', skillId, 'Lv', level, targetId != null ? '→ target ' + targetId.toString(16) : (groundX != null ? '→ พื้น (' + groundX + ',' + groundY + ')' : '→ self/AoE'));
    return true;
  }
  // ★★ ระยะร่ายสกิล — ใช้ตอนปิดตีปกติ (โหมดเวทย์): เดินเข้าหามอนแค่พอระยะนี้ ไม่เข้าปะทะ
  //   = maxDistance มากสุดของสกิลโจมตีที่เปิดอยู่ (targeted/ground เท่านั้น — self/ally/buff ไม่นับ)
  //   ไม่มีสกิลไหนตั้ง maxDistance → คืน 0 (caller ใช้ maxAcquireDistance แทน — เดินเข้าเท่าเดิม)
  function getCastRange() {
    let r = 0;
    const disabled = Array.isArray(CFG.disabledSkillIds) ? CFG.disabledSkillIds : [];
    for (const s of (CFG.skills || [])) {
      if (!s || s.skillId == null || s.buffMode) continue;
      if (disabled.includes(s.skillId)) continue;
      if (!(s.targeted || s.ground)) continue;           // เฉพาะสกิลที่เล็งเป้า/พื้นที่
      if (s.selfCast || s.ally) continue;
      const md = Number(s.maxDistance) || 0;
      if (md > r) r = md;
    }
    return r;
  }
  // ★ Auto-Skill tracking (mirror bot.js:48-56)
  const lastSkillUse = new Map();        // skillId → timestamp (cooldown)
  const skillUsesOnTarget = new Map();   // skillId → Map<targetId, count> (maxUsesPerTarget)
  const buffTargetUse = new Map();       // skillId → Map<playerId, lastAt> — delay บัพซ้ำต่อคน (buffMode)
  let buffSpResting = false;             // ★ hysteresis: SP% ต่ำ → พักบัพทั้งหมด จน SP ฟื้นถึง restUntilPercent ค่อยกลับมา
  // ★★ CAST TRACKING — จับการร่ายจริงจาก server (ถอดจาก capture: Fire/Cold/Lightning Bolt, Fireball, Thunderstorm)
  //   เริ่มร่าย targeted: 0x18 IN srcId=เรา · เริ่มร่าย ground: 0x19 IN srcId=เรา · เสร็จ: 0x1d IN srcId=เรา / 0x0b attacker=เรา
  //   ระหว่างร่าย → ห้ามยิงสกิลใหม่ทับ (เดิมยิงรัวจนบางตัวไม่ติด เสีย cooldown เปล่า)
  let castingUntil = 0;        // timestamp ที่คาดว่าร่ายเสร็จ (castTime จริง + margin 300ms)
  let castingSkillId = null;   // skillId ที่กำลังร่าย (debug)
  const groundModeFixWarned = new Set();   // ★ skillId ที่เตือน "โหมดพื้นถูกแก้ให้" แล้ว (กัน log ซ้ำ)
  // ★★ เรียงคิวสกิลด้วยเวลาร่ายที่ "เรียนรู้" จาก server — 0x18/0x19 บอก castTime ทุกครั้งที่ร่าย
  //   เคสจริง: สกิลกลางคิว (Cold Bolt) ถูกยิงกลางการร่ายตัวก่อนหน้า → server ทิ้งเงียบ
  //   (log บอก "ใช้สกิล" แต่ SP ไม่ถูกหัก ไม่มีดาเมจ) → บังคับช่วงห่างตามเวลาร่ายจริง + persist ข้าม session
  let lastSkillSentAt = 0, lastSkillCastMs = 0;
  const castTimes = new Map();          // skillId → castTime (วินาที) — เรียนรู้จาก 0x18/0x19
  const CAST_TIMES_KEY = 'roAssistCastTimes_v1';
  function loadCastTimes() { try { const o = JSON.parse(localStorage.getItem(CAST_TIMES_KEY) || '{}'); for (const k of Object.keys(o)) castTimes.set(Number(k), Number(o[k]) || 0); } catch (e) {} }
  function saveCastTimes() { try { const o = {}; for (const [k, v] of castTimes) o[k] = v; localStorage.setItem(CAST_TIMES_KEY, JSON.stringify(o)); } catch (e) {} }
  loadCastTimes();
  // persist skill times ข้าม session
  const SKILL_TIMES_KEY = 'roAssistSkillTimes_v1';
  function loadSkillTimes() {
    try {
      const raw = localStorage.getItem(SKILL_TIMES_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [id, ts] of Object.entries(obj)) lastSkillUse.set(Number(id), Number(ts) || 0);
      log('✨ โหลดเวลา skill ล่าสุด:', lastSkillUse.size, 'รายการ');
    } catch (e) {}
  }
  function saveSkillTimes() {
    try {
      const obj = {};
      for (const [id, ts] of lastSkillUse) obj[id] = ts;
      localStorage.setItem(SKILL_TIMES_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  let skillSaveTimer = null;
  function saveSkillTimesDebounced() {
    if (skillSaveTimer) clearTimeout(skillSaveTimer);
    skillSaveTimer = setTimeout(saveSkillTimes, 1000);
  }
  // MOVE OUT (click-move): [07][x:i16][y:i16] (signed)
  // ★ game cap: คลิกสั่งเดินได้ไกลสุด ~16 ช่องจากตัว (คลิก 20 → เดินแค่ 16 — ยืนยันจากผู้ใช้ทดสอบจริง)
  //   คำสั่งเกิน 16 = ผู้เล่นสั่งไม่ได้ (fingerprint บอท) → clamp ฝั่งเรา สั่งเป็นจุดบนเส้นตรงเดิมระยะ 16 พอดี
  const MOVE_MAX_DIST = 16;
  function sendMove(x, y) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (player.x != null && player.y != null) {
      const dx = x - player.x, dy = y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > MOVE_MAX_DIST) { x = player.x + dx / d * MOVE_MAX_DIST; y = player.y + dy / d * MOVE_MAX_DIST; }
    }
    const b = new Uint8Array(5);
    b[0] = 0x07;
    writeI16LE(b, 1, Math.round(x));
    writeI16LE(b, 3, Math.round(y));
    navBotMoving = true;   // ★ flag: บอทสั่งเอง → handleOut ข้ามไม่บันทึก trail
    activeWS.send(b);
    return true;
  }
  // วาร์ปสุ่มในแมปปัจจุบัน (x=y=-999)
  function sendRandomWarp() {
    if (!currentMap) { log('⚠️ วาร์ปหนี: ยังไม่รู้ชื่อแมป'); return false; }
    return sendTeleport(currentMap, -999, -999);
  }
  // ★ v4.189.57 — Warp Find ใช้ Shared Teleport Macro ได้ด้วย
  //   Macro ON = ลอง Macro ก่อน; ถ้าไม่วาร์ป fallback ไปวิธีเดิม (Fly Wing / Teleport Clip / Direct)
  function sendWarpFindBaseMethod(manualTest) {
    // Fly Wing mode — Rayrag DB ในเกมใช้ Item ID 601
    if (CFG.warpFindUseFlyWing) {
      const FLY_WING_ID = 601;
      const stock = inventory.has(FLY_WING_ID) ? (inventory.get(FLY_WING_ID) || 0) : 0;
      if (stock <= 0) {
        log('⚠️ WarpFind: Fly Wing (601) หมด/ไม่พบใน Inventory → รอ ไม่ส่ง packet');
        return false;
      }
      if (sendUseItem(FLY_WING_ID)) {
        log('🪽 WarpFind → ใช้ Fly Wing (601) · เหลือก่อนใช้ ' + stock + ' ชิ้น');
        return true;
      }
      return false;
    }

    if (!CFG.warpFindUseTeleportSkill) return sendRandomWarp();
    if (sp.cur != null && sp.cur < 30) { dbg('🌀 WarpFind Teleport: SP ต่ำกว่า 30 → รอ'); return false; }
    if (typeof castingUntil !== 'undefined' && nowMs() < castingUntil) return false;
    if (sendSkill(53, 1, null, null, null)) {
      log('🌀 WarpFind → ใช้ Teleport Lv.1 (skillId 53 / Teleport Clip)');
      return true;
    }
    return false;
  }

  function sendWarpFind(opts) {
    const manualTest = !!(opts && opts.manualTest);
    // Auto WarpFind ต้อง Combat ON; ปุ่มทดสอบ manual bypass gate นี้
    if (!manualTest && !CFG.combatEnabled) { dbg('🛑 WarpFind ถูกบล็อก: Combat OFF'); return false; }
    if (!activeWS || activeWS.readyState !== 1) {
      if (manualTest) log('❌ WarpFind Test: WebSocket เกมยังไม่พร้อม');
      return false;
    }

    if (CFG.teleportMacroEnabled === true) {
      const started = startTeleportHotkeyMacro('warpfind', 'Warp Find',
        (reason) => {
          log('↪️ WarpFind Macro ไม่สำเร็จ' + (reason ? ' · ' + reason : '') + ' → fallback วิธีวาร์ปเดิม');
          return sendWarpFindBaseMethod(manualTest);
        },
        () => { lastWarpFindAt = nowMs(); }
      );
      if (started) return true;
    }
    return sendWarpFindBaseMethod(manualTest);
  }

  // ★ v4.189.26 — Manual Warp Find diagnostic
  function testWarpFindNow() {
    const now = nowMs();
    const baseMode = CFG.warpFindUseFlyWing ? 'Fly Wing 601' : (CFG.warpFindUseTeleportSkill ? 'Teleport Clip skillId 53' : 'Direct random warp');
    const mode = CFG.teleportMacroEnabled === true ? ('Fixed Macro → ' + baseMode + ' fallback') : baseMode;
    const wingStock = inventory.has(601) ? (inventory.get(601) || 0) : 0;
    const autoCooldownLeft = Math.max(0, 3000 - (now - lastWarpFindAt));
    const before = { map: currentMap, x: player.x, y: player.y };
    log('🧪 WarpFind Test — mode=' + mode + ' | Combat=' + (CFG.combatEnabled ? 'ON' : 'OFF') + ' | WarpFind=' + (CFG.warpFindEnabled ? 'ON' : 'OFF') + ' | noMonster=' + CFG.noMonsterWarpSec + 's | autoCD=' + autoCooldownLeft + 'ms | SP=' + (sp.cur == null ? '?' : sp.cur) + ' | Wing=' + wingStock);
    if (!CFG.warpFindEnabled) log('ℹ️ WarpFind Test: ปุ่ม Auto วาร์ปหามอนยัง OFF — Test จะลองวาร์ปให้ แต่ Auto จะไม่ทำงานจนกว่าจะเปิด');
    if (!CFG.combatEnabled) log('ℹ️ WarpFind Test: Combat ยัง OFF — Test bypass ชั่วคราว แต่ Auto WarpFind จะถูกบล็อก');
    if (!currentMap) { log('❌ WarpFind Test: ยังไม่รู้ชื่อแมป'); return false; }
    if (player.x == null || player.y == null) { log('❌ WarpFind Test: ยังไม่รู้พิกัดตัวละคร'); return false; }
    if (sellState !== 'IDLE' || storageState !== 'IDLE') { log('❌ WarpFind Test: กำลัง Sell/Storage อยู่ — ยกเลิกทดสอบ'); return false; }
    const ok = sendWarpFind({ manualTest: true });
    if (!ok) {
      if (CFG.teleportMacroEnabled === true) log('❌ WarpFind Test: Macro เริ่มไม่ได้ — ดู Debug Log');
      else if (CFG.warpFindUseFlyWing && wingStock <= 0) log('❌ WarpFind Test: ไม่มี Fly Wing 601');
      else if (CFG.warpFindUseTeleportSkill && sp.cur != null && sp.cur < 30) log('❌ WarpFind Test: SP ต่ำกว่า 30 — Teleport Clip ใช้ไม่ได้');
      else if (CFG.warpFindUseTeleportSkill && typeof castingUntil !== 'undefined' && now < castingUntil) log('❌ WarpFind Test: กำลังติด cast lock อีก ' + Math.max(0, castingUntil - now) + 'ms');
      else log('❌ WarpFind Test: ส่งคำสั่งไม่สำเร็จ — ดู Debug Log เพิ่มเติม');
      return false;
    }
    log('📤 WarpFind Test: ส่งคำสั่ง ' + mode + ' แล้ว — รอตรวจตำแหน่ง ~1.8s');
    setTimeout(() => {
      const mapChanged = before.map && currentMap && before.map !== currentMap;
      const moved = before.x != null && before.y != null && player.x != null && player.y != null ? Math.hypot(player.x - before.x, player.y - before.y) >= 2 : false;
      if (mapChanged || moved) log('✅ WarpFind Test: เห็นการวาร์ปแล้ว → ' + (currentMap || '?') + ' @(' + Math.round(player.x) + ',' + Math.round(player.y) + ')');
      else log('⚠️ WarpFind Test: ส่งคำสั่งสำเร็จ แต่ยังไม่เห็นตำแหน่งเปลี่ยนหลัง 1.8s — ถ้าในเกมไม่วาร์ปจริงให้ส่ง Log บรรทัดนี้มา');
    }, 1800);
    return true;
  }

  // ★★ v4.188.8 — HP Emergency Flee
  // sameMap priority: Direct/Database TP (0x40) → Teleport Clip (skill 53) → Fixed Hotkey Macro (Alt↓ 1→2→3 Alt↑) → Fly Wing (601)
  // Direct TP intentionally respects TELEPORT_MIN_GAP_MS here; if still in gap, skip immediately to Clip.
  let hpFleeLatched = false;
  let hpFleePendingClip = null;   // {map,x,y,startedAt}
  let hpFleeNextTryAt = 0;
  const HP_FLEE_CLIP_FALLBACK_MS = 450;
  const HP_FLEE_RETRY_MS = 1500;

  function hpFleeClearCombat() {
    target = null;
    monsterAggro.clear();
    mobAttackers.clear();
    noMonsterSince = 0;
  }
  function hpFleeUseFlyWing(reason) {
    const FLY_WING_ID = 601;
    const stock = inventory.has(FLY_WING_ID) ? (inventory.get(FLY_WING_ID) || 0) : 0;
    if (stock <= 0) {
      log('⚠️ HP Flee: ไม่มี Fly Wing (601)' + (reason ? ' · ' + reason : ''));
      hpFleeNextTryAt = nowMs() + HP_FLEE_RETRY_MS;
      return false;
    }
    if (!sendUseItem(FLY_WING_ID)) {
      hpFleeNextTryAt = nowMs() + HP_FLEE_RETRY_MS;
      return false;
    }
    log('🪽 HP Flee → Fly Wing (601) · เหลือก่อนใช้ ' + stock + ' ชิ้น' + (reason ? ' · ' + reason : ''));
    hpFleeClearCombat();
    hpFleeLatched = true;
    hpFleePendingClip = null;
    return true;
  }
  function hpFleeTryMacroThenWing(reason) {
    return startTeleportHotkeyMacro('hp', 'HP Flee',
      (macroReason) => hpFleeUseFlyWing([reason, macroReason].filter(Boolean).join(' · ')),
      () => { hpFleeClearCombat(); hpFleeLatched = true; hpFleePendingClip = null; lastFleeAt = nowMs(); }
    );
  }
  function hpFleeTryClipThenWing() {
    // SP ที่รู้ชัดว่าต่ำกว่า 30 = ข้าม Clip ไป Hotkey Macro แล้วค่อย Wing
    if (sp.cur != null && sp.cur < 30) {
      log('⚡ HP Flee: SP < 30 → ข้าม Teleport Clip ไป Hotkey Macro');
      return hpFleeTryMacroThenWing('SP ไม่พอใช้ Clip');
    }
    if (typeof castingUntil !== 'undefined' && nowMs() < castingUntil) {
      return hpFleeTryMacroThenWing('กำลัง cast อยู่');
    }
    const src = { map: currentMap, x: player.x, y: player.y, startedAt: nowMs() };
    if (!sendSkill(53, 1, null, null, null)) return hpFleeTryMacroThenWing('ส่ง Teleport Clip ไม่สำเร็จ');
    hpFleePendingClip = src;
    hpFleeNextTryAt = nowMs() + HP_FLEE_CLIP_FALLBACK_MS;
    log('📎 HP Flee → ลอง Teleport Clip (skillId 53) · ถ้าไม่วาร์ปใน ~' + HP_FLEE_CLIP_FALLBACK_MS + 'ms จะลอง Hotkey Macro');
    hpFleeClearCombat();
    return true;
  }
  function hpFleeSameMap() {
    const now = nowMs();
    // Priority 1: Direct/Database teleport packet 0x40, but only when local teleport gap is ready.
    const dbReady = !!currentMap && (now - lastTeleportSentAt >= TELEPORT_MIN_GAP_MS);
    if (dbReady) {
      log('❤️ HP Flee → Direct/Database TP ก่อน (0x40 same-map random)');
      if (sendRandomWarp()) {
        hpFleeClearCombat();
        hpFleeLatched = true;
        hpFleePendingClip = null;
        return true;
      }
      log('⚠️ HP Flee: Direct TP ส่งไม่สำเร็จ → fallback Teleport Clip');
    } else {
      const left = Math.max(0, TELEPORT_MIN_GAP_MS - (now - lastTeleportSentAt));
      dbg('❤️ HP Flee: Direct TP ยังติด gap ' + left + 'ms → fallback Clip ทันที');
    }
    // Priority 2 → 3
    return hpFleeTryClipThenWing();
  }
  function triggerHpEmergencyFlee(pct) {
    if (!CFG.hpFleeEnabled || isDead || pct == null || pct <= 0) return false;
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (CFG.hpFleeMode === 'unstuck') {
      log('❤️ HP ต่ำ ' + pct.toFixed(1) + '% < ' + CFG.hpFleePercent + '% → 🏠 Unstuck ฉุกเฉิน');
      if (sendDirectUnstuckPacket()) {
        hpFleeClearCombat();
        hpFleeLatched = true;
        hpFleePendingClip = null;
        return true;
      }
      hpFleeNextTryAt = nowMs() + HP_FLEE_RETRY_MS;
      return false;
    }
    log('❤️ HP ต่ำ ' + pct.toFixed(1) + '% < ' + CFG.hpFleePercent + '% → 🌀 หนีในแมพ');
    return hpFleeSameMap();
  }
  const hpEmergencyFleeLoop = setInterval(() => {
    if (chatPauseActive) return;
    if (!CFG.hpFleeEnabled) { hpFleeLatched = false; hpFleePendingClip = null; return; }
    // ★ ถ้ากำลังหนีผู้เล่น/Hotkey Macro อยู่ ให้ชุดนั้นเป็นเจ้าของการวาร์ปก่อน กัน packet ชนกัน
    if (playerFleePending) return;
    if (teleportMacroPending) return;
    const now = nowMs();
    const pct = hpSafetyPct();
    if (pct == null || hp.max <= 0 || isDead) return;

    // re-arm only after HP clearly recovered; hysteresis prevents threshold flapping.
    if (pct >= Math.min(100, Number(CFG.hpFleePercent || 30) + 5)) {
      hpFleeLatched = false;
      hpFleePendingClip = null;
      hpFleeNextTryAt = 0;
      return;
    }

    // Clip trial: if position changed, it worked. Otherwise fallback to Wing after a short confirmation window.
    if (hpFleePendingClip) {
      const p = hpFleePendingClip;
      const movedMap = !!currentMap && !!p.map && currentMap !== p.map;
      const movedPos = player.x != null && p.x != null && Math.hypot(player.x - p.x, player.y - p.y) >= 3;
      if (movedMap || movedPos) {
        log('✅ HP Flee: Teleport Clip สำเร็จ');
        hpFleePendingClip = null;
        hpFleeLatched = true;
        return;
      }
      if (now - p.startedAt >= HP_FLEE_CLIP_FALLBACK_MS) {
        hpFleePendingClip = null;
        hpFleeTryMacroThenWing('Clip ไม่ตอบสนอง/ไม่มี Clip');
      }
      return;
    }

    if (hpFleeLatched || now < hpFleeNextTryAt) return;
    const threshold = Math.max(1, Math.min(99, Number(CFG.hpFleePercent) || 30));
    if (pct < threshold) triggerHpEmergencyFlee(pct);
  }, 100);

  // ★★ v4.189.2 — Player Flee fallback เมื่อ Direct ข้ามแมพติด teleport gap
  // ลำดับ: Direct target-map พร้อม → ไปทันที
  //        Direct ยังติด gap → Teleport Clip → (450ms ไม่ย้าย) Fly Wing → รอ gap → target-map
  function playerFleeClearCombat() {
    target = null;
    monsterAggro.clear();
    mobAttackers.clear();
    noMonsterSince = 0;
  }
  function playerFleeClearOldWorld() {
    entities.clear();
    queue.clear();
    recentDrops.clear();
    playerFleeClearCombat();
  }
  function playerFleeUseWing(reason) {
    const FLY_WING_ID = 601;
    const stock = inventory.has(FLY_WING_ID) ? (inventory.get(FLY_WING_ID) || 0) : 0;
    if (stock <= 0) {
      log('⚠️ หนีผู้เล่น: ไม่มี Fly Wing (601)' + (reason ? ' · ' + reason : '') + ' → รอ Direct เปลี่ยนแมพ');
      return false;
    }
    if (!sendUseItem(FLY_WING_ID)) {
      log('⚠️ หนีผู้เล่น: ส่ง Fly Wing ไม่สำเร็จ' + (reason ? ' · ' + reason : '') + ' → รอ Direct เปลี่ยนแมพ');
      return false;
    }
    log('🪽 หนีผู้เล่น → Fly Wing (601) · เหลือก่อนใช้ ' + stock + ' ชิ้น' + (reason ? ' · ' + reason : ''));
    playerFleeClearOldWorld();
    return true;
  }
  function playerFleeTryClip(nextMap, nearby) {
    const now = nowMs();
    // SP ที่รู้แน่ว่าต่ำกว่า 30 หรือกำลังร่ายอยู่ → ข้าม Clip ไป Wing ทันที
    if (sp.cur != null && sp.cur < 30) {
      playerFleePending = { phase:'mapwait', map:nextMap, srcMap:currentMap, x:player.x, y:player.y, startedAt:now, nearby };
      playerFleeUseWing('SP < 30 ใช้ Clip ไม่พอ');
      return true;
    }
    if (typeof castingUntil !== 'undefined' && now < castingUntil) {
      playerFleePending = { phase:'mapwait', map:nextMap, srcMap:currentMap, x:player.x, y:player.y, startedAt:now, nearby };
      playerFleeUseWing('กำลัง cast อยู่');
      return true;
    }
    const p = { phase:'clip', map:nextMap, srcMap:currentMap, x:player.x, y:player.y, startedAt:now, nearby };
    if (!sendSkill(53, 1, null, null, null)) {
      playerFleePending = { ...p, phase:'mapwait' };
      playerFleeUseWing('ส่ง Teleport Clip ไม่สำเร็จ');
      return true;
    }
    playerFleePending = p;
    playerFleeClearCombat();
    log('📎 หนีผู้เล่น → Direct เปลี่ยนแมพยังติด gap จึงใช้ Teleport Clip ก่อน · ถ้าไม่ย้ายใน ~' + PLAYER_FLEE_CLIP_FALLBACK_MS + 'ms จะใช้ Fly Wing');
    return true;
  }
  function playerFleeStartChangeMap(nextMap, nearby) {
    if (!nextMap || !activeWS || activeWS.readyState !== 1) return false;
    const now = nowMs();
    const directReady = now - lastTeleportSentAt >= TELEPORT_MIN_GAP_MS;
    if (directReady) {
      log('🏃 หนีผู้เล่น ' + nearby + ' คน → Direct เปลี่ยนแมพไป ' + nextMap);
      logImportant('flee', '🏃 หนีผู้เล่น ' + nearby + ' คน → ' + nextMap);
      // Flee มี priority สูง — ยกเลิก intent วาร์ปเก่าที่อาจรออยู่ เพื่อไม่ให้ยิงแทรกหลังหนี
      pendingTeleport = null;
      CFG.farmMap = nextMap;
      saveConfigDebounced();
      if (sendTeleport(nextMap, -999, -999)) {
        playerFleeClearOldWorld();
        fleeCooldownUntil = now + CFG.fleeWarpCooldownSec * 1000;
        playerFleePending = null;
        return true;
      }
      // Direct ส่งไม่ได้จริง (เช่น socket race) → fallback ทันที
      log('⚠️ หนีผู้เล่น: Direct เปลี่ยนแมพส่งไม่สำเร็จ → fallback Clip/Wing');
    } else {
      const left = Math.max(0, TELEPORT_MIN_GAP_MS - (now - lastTeleportSentAt));
      log('⚡ หนีผู้เล่น: Direct เปลี่ยนแมพยังติด gap ~' + left + 'ms → หนีในแมพทันทีด้วย Clip/Wing แล้วค่อยเปลี่ยนแมพ');
    }
    // อย่าเรียก sendTeleport(nextMap) ตอนยังติด gap เพราะ serializer จะคิวแบบเงียบ;
    // เราต้องหนีทันทีด้วย Clip/Wing ก่อน แล้วค่อยยิง Direct เองเมื่อ gap พร้อม
    pendingTeleport = null;
    return playerFleeTryClip(nextMap, nearby);
  }
  const playerFleeFallbackLoop = setInterval(() => {
    if (chatPauseActive) return;
    const p = playerFleePending;
    if (!p) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    const now = nowMs();

    if (p.phase === 'clip') {
      const movedMap = !!currentMap && !!p.srcMap && currentMap !== p.srcMap;
      const movedPos = player.x != null && p.x != null && Math.hypot(player.x - p.x, player.y - p.y) >= 3;
      if (movedMap || movedPos) {
        log('✅ หนีผู้เล่น: Teleport Clip สำเร็จ → รอ Direct เปลี่ยนแมพ ' + p.map);
        p.phase = 'mapwait';
        p.startedAt = now;
        playerFleeClearOldWorld();
      } else if (now - p.startedAt >= PLAYER_FLEE_CLIP_FALLBACK_MS) {
        p.phase = 'mapwait';
        p.startedAt = now;
        playerFleeUseWing('Clip ไม่ตอบสนอง/ไม่มี Clip');
      }
      return;
    }

    if (p.phase === 'mapwait') {
      // ถ้าถึงแมพเป้าหมายจากเหตุอื่นแล้ว ถือว่าจบ
      if (currentMap && currentMap === p.map) {
        playerFleePending = null;
        fleeCooldownUntil = now + CFG.fleeWarpCooldownSec * 1000;
        return;
      }
      if (now - lastTeleportSentAt < TELEPORT_MIN_GAP_MS) return;
      pendingTeleport = null;
      CFG.farmMap = p.map;
      saveConfigDebounced();
      log('🗺️ หนีผู้เล่น → Direct พร้อมแล้ว เปลี่ยนไปแมพสำรอง ' + p.map);
      if (sendTeleport(p.map, -999, -999)) {
        playerFleeClearOldWorld();
        fleeCooldownUntil = now + CFG.fleeWarpCooldownSec * 1000;
        playerFleePending = null;
      }
    }
  }, 100);

  // SIT/STAND OUT: [0e][state:1] (1=นั่ง, 0=ยืน) — format ยืนยันจากบอทหลัก protocol.js:381
  function sendSit() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x0e, 0x01]));
    return true;
  }
  function sendStand() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x0e, 0x00]));
    return true;
  }
  // ★ RESPAWN OUT: [29][00] — respawn กลับจุด save หลังตาย (2 bytes)
  //   format ยืนยันจากบอทหลัก protocol.js:356-360 (enc.respawn() = Buffer.from([0x29, 0x00]))
  function sendRespawn() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x29, 0x00]));
    return true;
  }
  // ★ CHAT OUT: [2c][msg_len:2 LE][msg UTF-8][chat_type:1]
  //   chatType: 0=nearby, 1=shout, 2=whisper (mirror protocol.js:362-369 enc.chat)
  function sendChat(message, chatType) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (!message) return false;
    const msgBytes = new TextEncoder().encode(message);
    if (msgBytes.length > 200) return false;   // cap 200 (mirror bot_server.js:1740)
    const b = new Uint8Array(1 + 2 + msgBytes.length + 1);
    b[0] = 0x2c;
    b[1] = msgBytes.length & 0xff; b[2] = (msgBytes.length >> 8) & 0xff;
    b.set(msgBytes, 3);
    b[3 + msgBytes.length] = chatType || 0;
    activeWS.send(b);
    return true;
  }

  // ★ v4.189.27 — Chat Alert + Pause (manual reply only)
  function chatAlertTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC(); const o = ac.createOscillator(); const g = ac.createGain();
      o.frequency.value = 740; g.gain.value = 0.045; o.connect(g); g.connect(ac.destination); o.start();
      setTimeout(() => { try { o.stop(); ac.close(); } catch (_) {} }, 180);
    } catch (_) {}
  }
  function resumeChatPause() {
    if (!chatPauseActive) return;
    chatPauseActive = false;
    const box = document.getElementById('__assist_chat_alert'); if (box) box.remove();
    log('▶ Chat Pause: Resume — กลับมาทำงานตาม config เดิม');
  }
  function renderChatPauseOverlay() {
    if (!chatPauseLast) return;
    let box = document.getElementById('__assist_chat_alert');
    if (!box) {
      box = document.createElement('div'); box.id = '__assist_chat_alert';
      Object.assign(box.style, {position:'fixed',right:'18px',top:'18px',zIndex:'2147483647',width:'360px',maxWidth:'calc(100vw - 36px)',background:'rgba(22,24,31,.98)',border:'2px solid #ef5350',borderRadius:'10px',boxShadow:'0 8px 30px rgba(0,0,0,.55)',padding:'12px',fontFamily:"'Segoe UI',system-ui,sans-serif",color:'#eee',fontSize:'12px'});
      document.body.appendChild(box);
    }
    while (box.firstChild) box.removeChild(box.firstChild);
    const title=document.createElement('div'); title.style.cssText='font-weight:700;color:#ff8a80;font-size:14px;margin-bottom:6px'; title.textContent='💬 มีคนทัก — Automation Pause'; box.appendChild(title);
    const meta=document.createElement('div'); meta.style.cssText='color:#9aa0a6;font-size:11px;margin-bottom:5px'; meta.textContent=(chatPauseLast.isTest?'[TEST] ':'')+(chatPauseLast.typeName||'แชท')+' · '+(chatPauseLast.name||'?'); box.appendChild(meta);
    const msg=document.createElement('div'); msg.style.cssText='background:#0f1115;border:1px solid #333;border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-word;margin-bottom:8px'; msg.textContent=chatPauseLast.message||''; box.appendChild(msg);
    const note=document.createElement('div'); note.style.cssText='color:#f1c40f;font-size:10px;margin-bottom:8px'; note.textContent=chatPauseLast.isTest?'โหมดทดสอบ: ปุ่มตอบจะไม่ส่งข้อความจริง':'ตอบด่วนต้องกดเอง — ไม่มีการตอบอัตโนมัติ'; box.appendChild(note);
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px;flex-wrap:wrap'; box.appendChild(row);
    const mk=(label,reply)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='background:#2a3441;border:1px solid #4b5563;border-radius:6px;color:#fff;padding:6px 10px;cursor:pointer;font-size:12px';b.onclick=()=>{if(chatPauseLast&&chatPauseLast.isTest){log('🧪 Chat Alert Test: กด '+reply+' (ไม่ส่งจริง)');return;}const ct=chatPauseLast&&chatPauseLast.chatType===2?2:0;if(sendChat(reply,ct))log('💬 ตอบด้วยมือ → '+reply);else log('❌ ส่งแชทไม่สำเร็จ');};row.appendChild(b);};
    mk('👋','👋'); mk('ครับ','ครับ'); mk('แป๊บนึงครับ','แป๊บนึงครับ');
    const resume=document.createElement('button');resume.textContent='▶ Resume';resume.style.cssText='background:#1b5e20;border:1px solid #2e7d32;border-radius:6px;color:#fff;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:700';resume.onclick=resumeChatPause;row.appendChild(resume);
  }
  function triggerChatPause(name, message, chatType, typeName, isTest) {
    chatPauseLast = { name:name||'?', message:String(message||''), chatType:Number(chatType), typeName:typeName||'แชท', at:Date.now(), isTest:!!isTest };
    chatPauseActive = true;
    target = null;
    noMonsterSince = 0;
    if (!isTest) logImportant('chat', '💬 [' + (typeName||'แชท') + '] ' + (name||'?') + ': ' + message + ' → ⏸️ Pause รอผู้ใช้ตอบ/Resume');
    else log('🧪 Chat Alert Test → ⏸️ Pause (ไม่ส่งข้อความจริง)');
    renderChatPauseOverlay();
    chatAlertTone();
  }
  // SELL encoders (mirror protocol.js:367,386,394)
  function sendNpcTalk(npcId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5); b[0] = 0x4c;
    b[1] = npcId & 0xff; b[2] = (npcId >> 8) & 0xff; b[3] = (npcId >> 16) & 0xff; b[4] = (npcId >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  function sendNpcSelect(idx) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5); b[0] = 0x4f;
    b[1] = idx & 0xff; b[2] = (idx >> 8) & 0xff; b[3] = (idx >> 16) & 0xff; b[4] = (idx >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  // [57][count:4][itemId:4][count:4] × N
  function sendSellItems(items) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(1 + 4 + items.length * 8);
    let p = 0; b[p++] = 0x57;
    b[p++] = items.length & 0xff; b[p++] = (items.length >> 8) & 0xff; b[p++] = (items.length >> 16) & 0xff; b[p++] = (items.length >>> 24) & 0xff;
    for (const it of items) {
      const id = it.itemId, c = it.count;
      b[p++] = id & 0xff; b[p++] = (id >> 8) & 0xff; b[p++] = (id >> 16) & 0xff; b[p++] = (id >>> 24) & 0xff;
      b[p++] = c & 0xff; b[p++] = (c >> 8) & 0xff; b[p++] = (c >> 16) & 0xff; b[p++] = (c >>> 24) & 0xff;
    }
    activeWS.send(b); return true;
  }
  // ============== STORAGE encoders (mirror protocol.js:371-415) ==============
  // [4e] NPC_NEXT — ไปหน้า dialog ถัดไป (Kafra มีหน้า intro ก่อนเมนู)
  function sendNpcNext() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x4e]));
    return true;
  }
  // [56][01][invId:4][amount:4] — ย้ายของจาก inventory → storage
  //   invId = itemId (stackable) หรือ slotId (equipment)
  //   หลักฐาน: 56 01 f4020000 08000000 → invId=756(Rough Oridecon) amount=8
  function sendStorageMove(invId, amount) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(10); let p = 0;
    b[p++] = 0x56; b[p++] = 0x01;
    b[p++] = invId & 0xff; b[p++] = (invId >> 8) & 0xff; b[p++] = (invId >> 16) & 0xff; b[p++] = (invId >>> 24) & 0xff;
    b[p++] = amount & 0xff; b[p++] = (amount >> 8) & 0xff; b[p++] = (amount >> 16) & 0xff; b[p++] = (amount >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  // [56][00] — ปิดหน้าต่าง storage
  function sendStorageClose() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x56, 0x00]));
    return true;
  }
  // [4F][05 00 00 00] — เลือกเมนู Kafra ข้อ 5 = Cancel
  // ★ ยืนยันจาก Re-Capture Rayrag v4.189.20: CLICK Cancel → OUT 0x4F len=5 [4F 05 00 00 00]
  function sendKafraCancel() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x4f, 0x05, 0x00, 0x00, 0x00]));
    return true;
  }
  // ★★ ปิด sell dialog — ส่ง SELL_ITEMS ด้วย count=0 = cancel (จาก packet capture)
  //   packet: [57][count:4 LE = 0] → server ตอบ 4d 03 (dialog closed)
  function sendSellClose() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x57, 0x00, 0x00, 0x00, 0x00]));   // sell 0 items = cancel
    return true;
  }
  function clearCombatThreat() { monsterAggro.clear(); mobAttackers.clear(); }

  // ---------- combat state machine ----------
  // abandon target + (ถ้าเป็น stuck/ล้มเหลว) ตั้ง cooldown กันเลือกตัวเดิมซ้ำทันที
  //   cooldownMs: 0 = ไม่ตั้ง (เช่น ฆ่าได้/defensive ที่เป็นการเปลี่ยนเป้าปกติ)
  //   ★ เดินหลีก 1 ครั้ง เฉพาะตอน stuck=true (กันยืนนิ่งหลังตีไม่ติด/server เงียบ)
  //     กรณี stuck=false (ฆ่าได้/defensive/ไกลเกิน) ไม่เดิน เพราะมีเหตุผลอื่นหรือมีของตกต้องเก็บ
  function abandonTarget(reason, stuck, cooldownMs = 0) {
    if (target) {
      const abM = entities.get(target.id);
      const abName = (abM && abM.name) ? abM.name : '?';
      log('🚫 abandon', abName, target.id.toString(16), '(' + reason + ')');
      if (cooldownMs > 0) abandonCooldown.set(target.id, nowMs() + cooldownMs);
      // ★ เคลียร์ claim (mirror bot.js:3914-3916) — กันมอนที่ abandon ดึงกลับมาวนลูป
      const e = entities.get(target.id);
      if (e && e._claimedByMe) e._claimedByMe = false;
      if (stuck) {
        stuckAbandonHistory.push(nowMs());
        stuckAbandonHistory = stuckAbandonHistory.filter(t => nowMs() - t < 60000);
        stuckAbandonCount = stuckAbandonHistory.length;
        // ★ เดินหลีกเฉพาะตอน stuck (กันยืนนิ่งหลังตีไม่ติด) — toggle ได้
        if (CFG.stepAsideOnAbandon !== false && player.x != null && player.y != null) {
          const angle = Math.random() * Math.PI * 2;
          const step = 5 + Math.random() * 7;   // 5-12 ช่อง
          const tx = Math.round(player.x + Math.cos(angle) * step);
          const ty = Math.round(player.y + Math.sin(angle) * step);
          if (sendMove(tx, ty)) log('🚶 เดินหลีกหลัง abandon @(', tx, ty + ')');
        }
      }
    }
    target = null;
    stuckWalkCount = 0;
  }
  // ★ v4.189.54 — Blacklist Attack Flee
  // โดนมอนที่อยู่ใน targetBlacklist โจมตี → หนีในแมพตาม priority เดียวกับ HP Emergency Flee:
  // Direct/Database TP (0x40) → Teleport Clip skillId 53 → Fixed Hotkey Macro (Alt↓ 1→2→3 Alt↑) → Fly Wing 601
  let blacklistFleePendingClip = null;   // {map,x,y,startedAt,label}
  let blacklistFleeNextTryAt = 0;
  const BLACKLIST_FLEE_CLIP_FALLBACK_MS = 450;
  const BLACKLIST_FLEE_RETRY_MS = 1500;

  function blacklistFleeClearCombat() {
    target = null;
    monsterAggro.clear();
    mobAttackers.clear();
    noMonsterSince = 0;
  }
  function blacklistFleeUseFlyWing(label, reason) {
    const FLY_WING_ID = 601;
    const stock = inventory.has(FLY_WING_ID) ? (inventory.get(FLY_WING_ID) || 0) : 0;
    if (stock <= 0) {
      log('⚠️ Blacklist Flee: ไม่มี Fly Wing (601)' + (reason ? ' · ' + reason : ''));
      blacklistFleeNextTryAt = nowMs() + BLACKLIST_FLEE_RETRY_MS;
      return false;
    }
    if (!sendUseItem(FLY_WING_ID)) {
      blacklistFleeNextTryAt = nowMs() + BLACKLIST_FLEE_RETRY_MS;
      return false;
    }
    log('🪽 Blacklist Flee → Fly Wing (601) · ' + label + ' · เหลือก่อนใช้ ' + stock + ' ชิ้น' + (reason ? ' · ' + reason : ''));
    blacklistFleeClearCombat();
    blacklistFleePendingClip = null;
    blacklistFleeNextTryAt = nowMs() + 300;
    lastFleeAt = nowMs();
    return true;
  }
  function blacklistFleeTryMacroThenWing(label, reason) {
    return startTeleportHotkeyMacro('blacklist', 'Blacklist Flee',
      (macroReason) => blacklistFleeUseFlyWing(label, [reason, macroReason].filter(Boolean).join(' · ')),
      () => { blacklistFleeClearCombat(); blacklistFleePendingClip = null; blacklistFleeNextTryAt = nowMs() + 300; lastFleeAt = nowMs(); }
    );
  }
  function blacklistFleeTryClipThenWing(label) {
    if (sp.cur != null && sp.cur < 30) {
      log('⚡ Blacklist Flee: SP < 30 → ข้าม Teleport Clip ไป Hotkey Macro');
      return blacklistFleeTryMacroThenWing(label, 'SP ไม่พอใช้ Clip');
    }
    if (typeof castingUntil !== 'undefined' && nowMs() < castingUntil) {
      return blacklistFleeTryMacroThenWing(label, 'กำลัง cast อยู่');
    }
    const src = { map: currentMap, x: player.x, y: player.y, startedAt: nowMs(), label };
    if (!sendSkill(53, 1, null, null, null)) return blacklistFleeTryMacroThenWing(label, 'ส่ง Teleport Clip ไม่สำเร็จ');
    blacklistFleePendingClip = src;
    blacklistFleeNextTryAt = nowMs() + BLACKLIST_FLEE_CLIP_FALLBACK_MS;
    log('📎 Blacklist Flee → ลอง Teleport Clip · ' + label + ' · ถ้าไม่วาร์ปใน ~' + BLACKLIST_FLEE_CLIP_FALLBACK_MS + 'ms จะลอง Hotkey Macro');
    blacklistFleeClearCombat();
    return true;
  }
  function blacklistFleeSameMap(label) {
    const now = nowMs();
    // ใช้เงื่อนไขเดียวกับ HP Emergency Flee เพื่อคงลำดับการ fallback เดิม
    const dbReady = !!currentMap && (now - lastTeleportSentAt >= TELEPORT_MIN_GAP_MS);
    if (dbReady) {
      log('🌀 Blacklist Flee → Direct/Database TP ก่อน · ' + label);
      if (sendRandomWarp()) {
        blacklistFleeClearCombat();
        blacklistFleePendingClip = null;
        blacklistFleeNextTryAt = now + 300;
        lastFleeAt = now;
        return true;
      }
      log('⚠️ Blacklist Flee: Direct TP ส่งไม่สำเร็จ → fallback Teleport Clip');
    } else {
      const left = Math.max(0, TELEPORT_MIN_GAP_MS - (now - lastTeleportSentAt));
      dbg('🌀 Blacklist Flee: Direct TP ยังติด gap ' + left + 'ms → fallback Clip ทันที');
    }
    return blacklistFleeTryClipThenWing(label);
  }
  function checkBlacklistAttackFlee() {
    if (CFG.blacklistFleeEnabled !== true) { blacklistFleePendingClip = null; return false; }
    if (!CFG.targetBlacklist || CFG.targetBlacklist.length === 0) { blacklistFleePendingClip = null; return false; }
    // HP ต่ำถือเป็น emergency สูงกว่า — ถ้ากำลังรอผล Clip/Macro อยู่ อย่าแทรก packet
    if (hpFleePendingClip) return true;
    if (teleportMacroPending) return true;
    const now = nowMs();

    // ถ้ากำลังรอผล Teleport Clip ของ Blacklist Flee ให้ตรวจผลก่อน
    if (blacklistFleePendingClip) {
      const p = blacklistFleePendingClip;
      const movedMap = !!currentMap && !!p.map && currentMap !== p.map;
      const movedPos = player.x != null && p.x != null && p.y != null && Math.hypot(player.x - p.x, player.y - p.y) >= 3;
      if (movedMap || movedPos) {
        log('✅ Blacklist Flee: Teleport Clip สำเร็จ · ' + (p.label || 'blacklist'));
        blacklistFleePendingClip = null;
        blacklistFleeNextTryAt = now + 300;
        lastFleeAt = now;
        blacklistFleeClearCombat();
        return true;
      }
      if (now - p.startedAt >= BLACKLIST_FLEE_CLIP_FALLBACK_MS) {
        blacklistFleePendingClip = null;
        blacklistFleeTryMacroThenWing(p.label || 'blacklist', 'Clip ไม่ตอบสนอง/ไม่มี Clip');
      }
      return true;
    }

    // Trigger เฉพาะมอนที่มีหลักฐานว่า "โจมตีเรา" ใน mobAttackers และอยู่ใน targetBlacklist
    let attacker = null, newestAt = 0;
    for (const [id, at] of mobAttackers) {
      if (now - at >= CFG.fleeMobWindowMs) { mobAttackers.delete(id); continue; }
      if (isStaleId(id, now) || isBeaconPlayer(id, now)) continue;
      const m = entities.get(id);
      if (!m || !m.alive || m.kind !== 1) continue;
      if (!matchList(m, CFG.targetBlacklist)) continue;
      if (at >= newestAt) { newestAt = at; attacker = m; }
    }
    if (!attacker) return false;

    // มี attacker blacklist จริง → หยุด logic อื่นใน tick นี้ แม้กำลังรอ retry
    if (now < blacklistFleeNextTryAt) return true;
    const label = attacker.name || (attacker.sub != null ? ('sub-ID ' + attacker.sub) : attacker.id.toString(16));
    log('🛑 มอน Blacklist โจมตีเรา:', label, '→ เริ่มลำดับวาร์ปหนี');
    logImportant('flee', '🛑 หนี Blacklist: ' + label + ' โจมตีเรา → Direct → Clip → Macro → Fly Wing');
    if (!blacklistFleeSameMap(label)) blacklistFleeNextTryAt = now + BLACKLIST_FLEE_RETRY_MS;
    return true;
  }

  // ★ v4.189.57 — หนีมอนรุม/มอนอันตรายใช้ Shared Macro ได้ด้วย
  // Macro ON = ลอง Macro ก่อน; ถ้าไม่วาร์ปจึง fallback วาร์ปสุ่มเดิม
  function monsterFleeDirectFallback(reason, macroReason) {
    const why = [reason, macroReason].filter(Boolean).join(' · ');
    if (sendRandomWarp()) {
      lastFleeAt = nowMs();
      clearCombatThreat();
      abandonTarget('flee', false);
      log('🌀 หนีมอน → fallback Direct random warp' + (why ? ' · ' + why : ''));
      return true;
    }
    return false;
  }
  function doFlee(reason) {
    const now = nowMs();
    if (now - lastFleeAt < CFG.fleeCooldownMs) return false;
    if (teleportMacroPending) return true;
    log('🏃 วาร์ปหนี:', reason);
    if (CFG.teleportMacroEnabled === true) {
      const started = startTeleportHotkeyMacro('monster-flee', 'หนีมอน',
        (macroReason) => monsterFleeDirectFallback(reason, macroReason),
        () => {
          lastFleeAt = nowMs();
          clearCombatThreat();
          abandonTarget('flee', false);
        }
      );
      if (started) return true;
    }
    return monsterFleeDirectFallback(reason, 'Macro ปิด/เริ่มไม่ได้');
  }
  // ★ v4.189.52 — Mob Flee แยกจาก Combat: เรียกได้ก่อน combatEnabled guard
  // คืน true เมื่อเข้าเงื่อนไขหนี (แม้ยังติด cooldown) เพื่อหยุด logic อื่นใน tick นั้นเหมือนพฤติกรรมเดิม
  function checkMobFleeTriggers() {
    if (CFG.mobFleeEnabled === false) return false;
    const radius = CFG.fleeOnProximityRadius;
    const atkN = getMobAttackerCount(radius);
    const aggN = getAggroCount(radius);
    const nearN = countMonsters(radius);
    const ctx = ' (ตีเรา ' + atkN + ' · เล็งเรา ' + aggN + ' · มอนรอบ ' + nearN + ')';
    if (CFG.fleeOnMobCount > 0 && atkN >= CFG.fleeOnMobCount) { doFlee('รุม ' + atkN + ' ตัว' + ctx); return true; }
    if (CFG.fleeOnAggroCount > 0 && aggN >= CFG.fleeOnAggroCount) { doFlee('aggro ' + aggN + ' ตัว' + ctx); return true; }
    if (CFG.fleeOnProximityCount > 0 && nearN >= CFG.fleeOnProximityCount) { doFlee('มอนรอบ ' + nearN + ' ตัว' + ctx); return true; }
    return false;
  }
  // ★ v4.189.53 — Dangerous Monster Flee แยกจาก Combat เช่นเดียวกับ Mob Flee
  function checkDangerMonsterFlee() {
    if (CFG.dangerFleeEnabled === false) return false;
    if (!CFG.fleeMonsters || CFG.fleeMonsters.length === 0 || player.x == null) return false;
    const fleeR = CFG.fleeMonsterRadius || 20;
    const now = nowMs();
    for (const e of entities.values()) {
      if (!e.alive || e.kind !== 1 || e.x == null) continue;
      if (isStaleId(e.id, now)) continue;
      const name = (e.name || '').toLowerCase();
      const subId = e.sub != null ? String(e.sub) : null;
      const isDanger = CFG.fleeMonsters.some(n => {
        const ns = String(n).toLowerCase();
        if (name && name === ns) return true;
        if (subId && subId === ns) return true;
        return false;
      });
      if (!isDanger) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= fleeR) {
        log('🚨 เจอ', e.name || e.id.toString(16), 'ในระยะ', d.toFixed(1), 'ช่อง → วาร์ปหนี!');
        logImportant('flee', '🚨 หนีมอน! เจอ ' + (e.name || e.id.toString(16)) + ' ในระยะ ' + d.toFixed(0) + ' ช่อง');
        doFlee('มอนอันตราย ' + (e.name || e.id.toString(16)) + ' ระยะ ' + d.toFixed(1) + ' ช่อง');
        lastFarmWarpBackAt = now;
        return true;
      }
    }
    return false;
  }
  function acquireTarget(now) {
    // ★ cooldown: กันสลับ target บ่อยเกินไป (สลับได้ทุก 1.5s)
    if (now - lastTargetSwitchAt < TARGET_REACQUIRE_MS) return null;
    // whitelist ว่าง = ตีทุกมอน kind=1 (ตามความหมายของ whitelist); ตั้งค่า = ตีเฉพาะที่ match
    const mobCount = getMobAttackerCount();
    const useLowestHp = CFG.targetLowestHpFirst && mobCount >= 2;
    // ★ progressive search — ค้นจากรัศมีเล็กก่อน ถ้าเจอใช้เลย (mirror bot.js:3957-3963)
    //   ทำให้เลือกมอนใกล้ก่อนเสมอ แม้จะตั้ง maxAcquireDistance ไว้สูง
    const maxAcquire = Math.max(1, Number(CFG.maxAcquireDistance) || 1);
    const baseRadii = (Array.isArray(CFG.searchRadii) && CFG.searchRadii.length > 0) ? CFG.searchRadii : [];
    // ★ v4.187.1: maxAcquireDistance ต้องถูกค้นจริงเสมอ (เดิม searchRadii จบที่ 30 แม้ maxAcquire=90 → 31-90 ไม่เคยถูก scan)
    const radii = [...new Set(baseRadii.map(Number).filter(r => Number.isFinite(r) && r > 0 && r <= maxAcquire).concat([maxAcquire]))]
      .sort((a, b) => a - b);
    let found = null;
    let usedRadius = 0;
    for (const r of radii) {
      found = useLowestHp ? findLowestHpMonster(now, r) : findNearestMonster(now, r);
      if (found) { usedRadius = r; break; }   // ★ เจอแล้วใช้เลย ไม่ขยายรัศมี
    }
    if (!found) return null;
    if (useLowestHp) {
      log('🎯 เลือกเป้า HP ต่ำสุด (รุม', mobCount, 'ตัว):', found.m.name, (found.hpPct * 100).toFixed(0) + '%', '@', found.dist.toFixed(1), '(r≤' + usedRadius + ')');
    } else {
      log('🎯 เลือกเป้า:', found.m.name || '?', found.m.id.toString(16), '@ dist', found.dist.toFixed(1), '(r≤' + usedRadius + ')');
    }
    const m = found.m;
    target = {
      id: m.id, x: m.x, y: m.y, acquiredAt: now, engageAt: 0,
      lastAttackAt: 0, lastAttackResultAt: 0, pendingAttacks: 0, firstAttackAt: 0,
      stuckCount: 0, warpCount: 0, lastDist: null,
    };
    lastTargetSwitchAt = now;
    skillUsesOnTarget.clear();   // ★ reset per-target skill uses (mirror bot.js:4083)
    return target;
  }
  // ★★ GUARD MODE — เลือกเป้า "เฉพาะมอนที่ตีเรา" (fight back) ไม่หามอนเอง
  //   - mobAttackers = มอนที่ตีเราล่าสุด (0x0b victim=player) — มอนยิงไกลก็จะเดินเข้าไปตีเอง (ลอจิกเดินหา target เดิม)
  //   - เลิกสู้เมื่อมอนเลิกตีเราแล้ว 8s (เช่น de-aggro หนีไป) → กลับจุดยืน
  //   - เคารพ blacklist เหมือน combat ปกติ (เว้นแต่เปิด fightBackBlacklisted)
  function acquireGuardTarget(now) {
    if (now - lastTargetSwitchAt < TARGET_REACQUIRE_MS) return null;
    if (player.x == null) return null;
    let best = null, bestD = Infinity;
    for (const [mid, at] of mobAttackers) {
      if (now - at >= 8000) continue;
      const e = entities.get(mid);
      if (!e || !e.alive || e.x == null || e.kind !== 1) continue;
      if (isStaleId(mid, now)) continue;
      if (isBeaconPlayer(mid, now)) continue;
      if (!CFG.fightBackBlacklisted && matchList(e, CFG.targetBlacklist)) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    log('🛡️ Guard ตีกลับ:', best.name || best.id.toString(16), '@ dist', bestD.toFixed(1));
    target = {
      id: best.id, x: best.x, y: best.y, acquiredAt: now, engageAt: 0,
      lastAttackAt: 0, lastAttackResultAt: 0, pendingAttacks: 0, firstAttackAt: 0,
      stuckCount: 0, warpCount: 0, lastDist: null,
    };
    lastTargetSwitchAt = now;
    skillUsesOnTarget.clear();
    return target;
  }
  // ★★ GUARD MODE — กลับไปยืนจุดประจำเมื่อไม่มีมอนตีเราแล้ว
  let guardReturnLastAt = 0, guardWasReturning = false;
  function guardReturnToPost(now) {
    if (player.x == null) return;
    const gx = CFG.guardX, gy = CFG.guardY;
    if (gx == null || gy == null || gx <= -999 || gy <= -999) return;
    const d = Math.hypot(player.x - gx, player.y - gy);
    if (d <= 2) {   // ยืนครบแล้ว
      if (guardWasReturning) { guardWasReturning = false; log('🛡️ Guard: กลับมายืนจุดประจำแล้ว @(', gx + ',' + gy + ')'); }
      return;
    }
    if (now - guardReturnLastAt < 1500) return;
    guardReturnLastAt = now;
    if (!guardWasReturning) { guardWasReturning = true; log('🛡️ Guard: กลับจุดยืน @(', gx + ',' + gy + ') — ห่าง', d.toFixed(0), 'ช่อง'); }
    if (d > 60) {
      // ห่างเกิน (ไล่มอนไกล) → วาร์ปกลับ (ผ่าน teleport serializer กันตีกับ warp อื่น)
      sendTeleport(CFG.guardMap || currentMap, gx, gy);
    } else {
      sendMove(gx, gy);
    }
  }
  // เดินไปหามอน — เดินเส้นตรงไปทางมอน + stuck detection ดูระยะลดลง
  let lastWalkToTargetAt = 0;
  let lastDistToTarget = null;
  let noProgressTicks = 0;
  const abandonCooldown = new Map();   // entityId → timestamp ที่ abandon (กันเลือกตัวเดิมซ้ำเลย)
  function walkToTarget(now, m) {
    if (player.x == null) return false;
    const dist = Math.hypot(m.x - player.x, m.y - player.y);
    // stuck detection: ดูว่าระยะลดลงไหม (แม่นกว่าดูพิกัดคงที่)
    if (lastDistToTarget != null) {
      if (dist < lastDistToTarget - 0.5) {
        noProgressTicks = 0;             // ใกล้ขึ้น → ไม่ stuck
      } else {
        noProgressTicks++;               // ไม่ใกล้ขึ้น → นับ stuck
      }
    }
    lastDistToTarget = dist;

    // ★ stuck จริงๆ (ระยะไม่ลด ≥10 tick ≈ 8s+) → return 'STUCK' ให้ caller ตัดสินใจ (warpToMonster/abandon)
    //   ไม่ abandon เองที่นี่ เพื่อให้ caller ควบคุม (เช่น warpToMonster อาจช่วยได้)
    if (noProgressTicks >= 10) {
      log('🚧 stuck: ไม่เข้าใกล้ ' + noProgressTicks + ' tick @ dist ' + dist.toFixed(1));
      return 'STUCK';
    }

    if (now - lastWalkToTargetAt < 800) return false;
    lastWalkToTargetAt = now;
    // เดินเส้นตรงไปทางมอน (step = min(ระยะที่เหลือ, walkStepDistance) — สั่งทีละ ≤20 ช่อง)
    let angle = Math.atan2(m.y - player.y, m.x - player.x);
    // ถ้า stuck (ระยะไม่ลด) → เปลี่ยนทิศตั้งฉากบ้างเพื่อหาทางอ้อม
    if (noProgressTicks >= 3) angle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
    else angle += (Math.random() * 2 - 1) * (Math.PI / 12);   // ±15° jitter เล็กน้อย
    const step = Math.min(dist, CFG.walkStepDistance);
    const tx = player.x + Math.cos(angle) * step;
    const ty = player.y + Math.sin(angle) * step;
    if (sendMove(tx, ty)) { log('🚶 เดินไปหา', m.name || m.id.toString(16), '@(', Math.round(tx), Math.round(ty) + ') dist=' + dist.toFixed(1) + ' step=' + Math.round(step) + ' stuck=' + noProgressTicks); return 'WALKING'; }
    return false;
  }

  let combatCooldownUntil = 0;   // ★ หยุด combat ชั่วคราวจนกว่าจะถึงเวลานี้ (post-combat delay)
  // ★★ Manual mode — คลิกมอนจาก monitor ตอน combat off → เปิด combat ชั่วคราว ตีตัวเดียวแล้วปิด
  let manualMode = false;
  // ★★ Flee from players — วาร์ปหนีผู้เล่นไปแผนที่สำรอง
  let fleeMapIdx = 0;
  let fleeCooldownUntil = 0;
  let fleeBurstTimes = [];               // ★ timestamps การหนีล่าสุด — กันหนีถี่ผิดปกติ (dot ผี/วาร์ปล้ม)
  // ★ v4.189.2 Player Flee change-map fallback
  // Direct map warp ติด 3s gap → Clip → Wing เพื่อหนีทันที → พอ gap พร้อมค่อยเปลี่ยนแมพสำรอง
  let playerFleePending = null;          // {phase:'clip'|'mapwait', map, srcMap, x, y, startedAt, nearby}
  const PLAYER_FLEE_CLIP_FALLBACK_MS = 450;
  let lastFleeDebugAt = 0;
  let lastStatusDbgAt = 0;             // ★ throttle บรรทัดสถานะใน Debug log (ทุก 10s)
  let lastGuardWarpBackAt = 0;         // ★ guard: throttle วาร์ปกลับแมปประจำ (ทุก 5s)
  let last3cDebugAt = 0;
  let lastDamageDebugAt = 0;
  let lastSpawnFailDbgAt = 0;         // ★ throttle dbg SPAWN parse fail
  let respawnAttemptCount = 0;   // ★ กัน death loop — max 5 ครั้ง
  let _victimIdCount = null;   // ★ auto-detect playerId — นับ victim ID ที่โดนตีซ้ำ
  let _victimIdCountAt = 0;
  // ★★ AUTO-REFRESH watchdog — เข้าเกมแล้วแต่ packet เงียบผิดปกติ (ค้าง) หรือ WS หลุดนาน
  //   → refresh หน้าเว็บ แล้ว auto-login พากลับเข้าเกมเอง (ถ้าเปิดไว้)
  //   ปกติ server ส่ง packet มาตลอด (0x26 regen ทุก ~6s / beacon / 0x07) — เงียบยาว = ค้างแน่นอน
  // ★★★ CHAR-SELECT NUDGE: WS เปิดแล้ว (login ผ่าน) แต่ไม่มี playerId ใน 12s
  //   = ค้างหน้าเลือกตัวละคร → กด Enter / คลิกแทน (หมุนตำแหน่งคลิก: กลาง/ซ้าย/ขวา
  //   เพราะ slot ตัวละครวางแนวนอน — กดไล่จนกว่าจะเข้า)
  let csNudgeTries = 0;
  const csNudgeTimer = setInterval(() => {
    const wsOpen = activeWS && activeWS.readyState === 1;
    if (!CFG.autoLoginEnabled || !wsOpen || playerId != null || autoLoginPhase === 'failed') { if (playerId != null) csNudgeTries = 0; return; }
    if (!wsOpenedAt || Date.now() - wsOpenedAt < 12000) return;   // เพิ่งเปิด WS — ยังไม่ต้องดัน
    if (++csNudgeTries > 12) return;                              // เลิกลองหลัง ~96s (ปล่อยให้ auto-refresh จัดการ)
    const pos = [0.5, 0.35, 0.65, 0.42, 0.58][csNudgeTries % 5];
    try {
      const cv = document.querySelector('canvas') || document.body;
      const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const cx = r.left + r.width * pos, cy = r.top + r.height * 0.5;
      for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
        const E = (t.startsWith('pointer')) ? PointerEvent : MouseEvent;
        cv.dispatchEvent(new E(t, { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true }));
      }
      cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      log('🎯 [auto-login] ค้างหน้าเลือกตัวละคร → คลิก x' + Math.round(pos * 100) + '% + Enter (ครั้ง', csNudgeTries + '/12)');
    } catch (e) {}
  }, 8000);
  // ★★ despawn sweeper — ลบ entity ที่ 1b mark ไว้จริงเมื่อพ้น grace โดยไม่มี packet ยืนยัน
  const despawnSweeper = setInterval(() => {
    const nowS = Date.now();
    for (const [id, e] of entities) {
      if (!e._despawnPendingAt) continue;
      if (nowS - e._despawnPendingAt > MONSTER_DESPAWN_GRACE_MS) {
        // ★ จำสถานะไว้ 60s — ถ้า id นี้ขยับกลับมา (1b หลอก/ยืนนิ่งนาน) จะได้คืนเป็นมอน ไม่ใช่ผี kind=0
        recentlyDespawned.set(id, { kind: e.kind, sub: e.sub, name: e.name, isBoss: e._isBoss, isMiniBoss: e._isMiniBoss, expireAt: nowS + 60000 });
        entities.delete(id);
        if (e._isMiniBoss || e._isBoss) { bossAlertedIds.delete(id); log((e._isBoss ? '👑 Boss' : '👹 Mini Boss') + ' ตาย — จะ alert ใหม่เมื่อเกิดใหม่'); }
        if (target && target.id === id) { abandonTarget('despawn', false); target = null; }
      }
    }
    for (const [rid, rd] of recentlyDespawned) { if (nowS >= rd.expireAt) recentlyDespawned.delete(rid); }
  }, 1000);
  const autoRefreshWatchdog = setInterval(() => {
    if (!CFG.autoRefreshEnabled) return;
    const now = Date.now();
    const silentSec = (now - lastGamePacketAt) / 1000;
    const wsOk = activeWS && activeWS.readyState === 1;
    // เคส 1: ต่ออยู่แต่เงียบเกินเกณฑ์ (client ค้าง / server ไม่ตอบ)
    if (playerId != null && silentSec > CFG.autoRefreshStallSec) {
      logImportant('flee', '🔄 [auto-refresh] ไม่มี packet ' + Math.round(silentSec) + 's → refresh หน้าแล้ว login ใหม่');
      clearInterval(autoRefreshWatchdog);
      setTimeout(() => location.reload(), 1500);   // หน่วงให้ alert ไป Telegram ก่อน
    }
    // เคส 2: WS ปิดนานเกิน (เกม client ไม่ต่อกลับเอง) — เผื่อเวลาเกิน stall + 60s
    else if (!wsOk && playerId != null && silentSec > CFG.autoRefreshStallSec + 60) {
      logImportant('flee', '🔄 [auto-refresh] WebSocket หลุด ' + Math.round(silentSec) + 's → refresh หน้าแล้ว login ใหม่');
      clearInterval(autoRefreshWatchdog);
      setTimeout(() => location.reload(), 1500);
    }
    // เคส 3: WS เปิดแต่ไม่เข้าโลกเกมเลย (ค้างหน้า login/char select ที่ nudge ช่วยไม่ได้) → รีสตาร์ทรอบใหม่
    else if (wsOk && playerId == null && CFG.autoLoginEnabled && wsOpenedAt && Date.now() - wsOpenedAt > CFG.autoRefreshStallSec * 1000) {
      logImportant('flee', '🔄 [auto-refresh] ค้างหน้า login/เลือกตัวละครเกิน ' + CFG.autoRefreshStallSec + 's → refresh หน้าแล้วลองใหม่');
      clearInterval(autoRefreshWatchdog);
      setTimeout(() => location.reload(), 1500);
    }
  }, 10000);
  const combatLoop = setInterval(() => {
    const now = nowMs();
    // ★★ กำลังขาย/ฝากของ → routine เป็นเจ้าของตัวละคร — หยุด combatLoop ทั้งก้อน
    //   (เคสจริงจาก log: สุ่มเดินแย่งทาย NPC / ตี+สกิลมอนข้ามแมปจากพิกัด optimistic /
    //    farm-guard ส่ง warp กลับฟาร์มสู้กับ warp ของ routine จนลูป "ยังอยู่แมปผิด" นาที)
    if (typeof sellState !== 'undefined' && sellState !== 'IDLE') return;
    if (typeof storageState !== 'undefined' && storageState !== 'IDLE') return;
    if (typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE') return; // ★ ESC→Unstuck→รับ AB→กลับฟาร์ม เป็นเจ้าของตัวละคร
    if (playerFleePending) return; // ★ v4.189.2 Clip/Wing→รอเปลี่ยนแมพ เป็นเจ้าของตัวละครชั่วคราว
    if (chatPauseActive) return;  // ★ v4.189.27 มีคนทัก → หยุด Combat/Wander/Flee/WarpFind จนกด Resume
    // ★★ Flee from players — ทำงานไม่สน combat on/off (priority สูงสุด)
    //   ★★ ยกเว้นตอนกำลังขายของ/ฝากของ (ในเมืองมีผู้เล่นเยอะ → ห้ามวาร์ปหนี!)
    const _inSellRoutine = typeof sellState !== 'undefined' && sellState !== 'IDLE';
    const _inStorageRoutine = typeof storageState !== 'undefined' && storageState !== 'IDLE';
    if (CFG.fleeFromPlayers && CFG.fleeMaps && CFG.fleeMaps.length > 0 && activeWS && activeWS.readyState === 1
        && !_inSellRoutine && !_inStorageRoutine) {
      if (now >= fleeCooldownUntil) {
        // sync pos ก่อน
        if (player.x == null && playerId != null) {
          const me = entities.get(playerId);
          if (me && me.x != null) { player.x = me.x; player.y = me.y; }
        }
        if (player.x != null && currentMap) {
          const nearby = countNearbyPlayers(CFG.fleePlayerRadius);
          // ★ debug log ทุก 5s — เช็คว่าระบบทำงานไหม
          if (now - (lastFleeDebugAt || 0) > 5000) {
            lastFleeDebugAt = now;
            // ★ แสดงแค่ 5 ตัวแรก — กัน log spam (players 34 ตัว = ยาวมาก!)
            // ★ แสดงเฉพาะ entity ที่ "นับได้" (มีชื่อจาก SPAWN หรือ beacon) — ให้ตรงกับ nearby
            const pes = [...entities.values()].filter(e => e.kind === 0 && e.id !== playerId && e.alive
              && ((e.name && e.name.trim()) || e._src === 'beacon'));
            const detail = pes.length > 0 ? pes.slice(0, 5).map(e => (e.name && e.name.trim() ? '' : '•') + `${e.id.toString(16)}@(${e.x},${e.y})`).join(' ') + (pes.length > 5 ? ` +${pes.length - 5} more` : '') + ' (•=beacon)' : '(none)';
            dbg('🔍 flee: nearby=' + nearby + ' players=' + pes.length + ' r=' + CFG.fleePlayerRadius + ' [' + detail + ']');
          }
          if (nearby > 0) {
            // ★ แสดงตำแหน่งผู้เล่น (ถ้า nearby=1 แสดงตำแหน่งเดียวกัน)
            const pes = [...entities.values()].filter(e => e.kind === 0 && e.id !== playerId && e.alive && e.x != null);
            const posInfo = pes.length === 1 ? ' @(' + pes[0].x + ',' + pes[0].y + ')' : '';
            const botPos = player.x != null ? ' bot@(' + Math.round(player.x) + ',' + Math.round(player.y) + ')' : '';
            // ★★ กันหนีถี่ผิดปกติ — >5 ครั้งใน 10s = ข้อมูลผี/วาร์ปล้มรัว ๆ → พัก 10s
            //   (แม้ตั้ง cooldown=0 ก็ต้องมีเบรก — กันยิง teleport รัวเมื่อข้อมูลผิด)
            fleeBurstTimes.push(now);
            fleeBurstTimes = fleeBurstTimes.filter(t => now - t < 10000);
            if (fleeBurstTimes.length > 5) {
              fleeBurstTimes = [];
              fleeCooldownUntil = now + 10000;
              log('⚠️ หนีผู้เล่นถี่ผิดปกติ (>5 ครั้ง/10s) — พัก 10s (สงสัย dot ผี หรือวาร์ปล้มต่อเนื่อง)');
              logImportant('flee', '⚠️ หนีถี่ผิดปกติ — พัก 10s');
              return;
            }
            // ★★ sameMap mode — วาร์ปสุ่มในแมปเดิม (ไม่เปลี่ยนแมป)
            if (CFG.fleeMode === 'sameMap') {
              log('🏃 หนีผู้เล่น!', nearby, 'คน' + posInfo + botPos + ' → วาร์ปสุ่มในแมปเดิม');
              logImportant('flee', '🏃 หนีผู้เล่น ' + nearby + ' คน → วาร์ปสุ่มในแมปเดิม');
              if (sendRandomWarp()) {
                // ★★ clear entities — เหมือนเปลี่ยนแมป!
                //   ไม่ clear → entity เก่า (ID เก่า + ตำแหน่งเก่า) ค้าง → นับเป็น player → หนีตัวเอง!
                //   ตำแหน่งใหม่หลังวาร์ป → ข้อมูลเก่าใช้ไม่ได้ → clear เป็นวิธีที่ถูกต้อง
                entities.clear();
                queue.clear(); recentDrops.clear();
                fleeCooldownUntil = now + CFG.fleeWarpCooldownSec * 1000;   // ★ ตั้งได้ใน UI (0 = รัวสุด)
                target = null; monsterAggro.clear(); mobAttackers.clear();
              }
              return;
            }
            // ★★ changeMap mode — v4.189.2 Direct → Clip → Wing fallback เมื่อ cross-map ยังติด gap
            const next = pickNextFleeMap();
            if (next) {
              log('🏃 หนีผู้เล่น!', nearby, 'คน' + posInfo + botPos + ' → เป้าหมายแมพสำรอง', next);
              playerFleeStartChangeMap(next, nearby);
              return;
            }
          }
        }
      }
      // ★ กำลัง cooldown → รอ (กันวาร์ปซ้ำ + กัน combat ทำงานตอนยังไม่รู้ว่ามีผู้เล่นไหม)
      if (now < fleeCooldownUntil) return;
    }
    // ★ v4.189.52 — sync ตำแหน่งก่อน Mob Flee แม้ Combat OFF
    //   เพื่อให้ trigger ที่ใช้รัศมี (รุม/aggro/มอนรอบ) ยังทำงานได้เมื่อปิดการโจมตี
    if (player.x == null && playerId != null) {
      const me = entities.get(playerId);
      if (me && me.x != null) { player.x = me.x; player.y = me.y; }
    }
    if (player.x == null && playerId != null && activeWS && activeWS.readyState === 1) {
      if (now - (lastWhereReqAt || 0) > 5000) {
        if (sendWhere()) {
          lastWhereReqAt = now;
          dbg('📍 ตำแหน่งยังไม่รู้ → ถาม /where (Mob Flee ใช้ได้แม้ Combat OFF)');
        }
      }
    }
    // ★★ Combat Flee เป็นอิสระจากการโจมตี — ปิด Combat ก็ยังหนีได้ถ้าสวิตช์ของระบบนั้นเปิด
    // Blacklist Attack Flee มาก่อน danger/proximity เพราะมีหลักฐานว่ามอนกำลังโจมตีเราแล้ว
    if (activeWS && activeWS.readyState === 1 && checkBlacklistAttackFlee()) return;
    if (activeWS && activeWS.readyState === 1 && checkDangerMonsterFlee()) return;
    if (activeWS && activeWS.readyState === 1 && checkMobFleeTriggers()) return;
    if (!CFG.combatEnabled) return;
    // ★★ ถ้ากำลังเดินตามคำสั่ง remote → หยุดตีตอนเดิน
    // ★★★ AUTO-RESPAWN — priority สูงสุด: ถ้าตาย → respawn กลับจุด save (mirror bot.js:1404-1406)
    //   ★★ MAX 5 ครั้ง — กัน death loop (ส่ง respawn รัวๆ แต่ไม่ฟื้น)
    if (isDead) {
      if (now - lastRespawnAt > 30000) respawnAttemptCount = 0;   // ผ่าน 30s ไม่ตาย → reset count
      if (respawnAttemptCount >= 5) {
        if (now - lastRespawnAt > 60000) {
          respawnAttemptCount = 0;
          log('⚠️ Death loop หยุด 60s — ลอง respawn ใหม่อีกครั้ง');
        } else return;
      }
      if (CFG.autoRespawnEnabled && activeWS && activeWS.readyState === 1) {
        if (now - lastRespawnAt >= CFG.autoRespawnDelayMs) {
          if (sendRespawn()) {
            lastRespawnAt = now;
            respawnAttemptCount++;
            autoRespawnUnstuckPending = true; // ★ v4.188.3: พอเกิดใหม่จริง ต้องส่ง 0x73 ให้ครบ 1 ครั้ง
            autoRespawnUnstuckReadyAt = 0;
            target = null; monsterAggro.clear(); mobAttackers.clear();
            postRespawnRest = true;   // ★ บังคับนั่งพักหลัง respawn
            log('💀 ตาย! → respawn (ครั้งที่ ' + respawnAttemptCount + '/5)');
            logImportant('flee', '💀 ตาย → respawn กลับจุด save');
          }
        }
      }
      return;
    }
    // ★ v4.188.3 — fallback retry: เกิดใหม่แล้วแต่จังหวะ HP packet ส่ง 0x73 ไม่สำเร็จ
    // ค้าง pending ไว้จน WebSocket พร้อม แล้วส่งสำเร็จเพียง 1 ครั้งก่อนล้าง flag
    if (autoRespawnUnstuckPending && now >= autoRespawnUnstuckReadyAt && activeWS && activeWS.readyState === 1) {
      if (sendDirectUnstuckPacket()) {
        autoRespawnUnstuckPending = false;
        autoRespawnUnstuckReadyAt = 0;
        log('💀 Auto Respawn → Direct Unstuck 0x73 ครบ 1 ครั้ง');
      } else {
        autoRespawnUnstuckReadyAt = now + 500;
      }
    }
    if (!activeWS || activeWS.readyState !== 1) return;
    // ★ POST-RESPAWN REST — หลัง respawn บังคับนั่งพักจนเลือดเต็ม (restUntilPercent)
    //   เหมือน auto-rest ปกติ แต่ trigger จาก flag postRespawnRest ไม่ใช่ HP%
    if (postRespawnRest && CFG.restEnabled && hp.cur != null) {
      const pct = hpPct();
      // ★ มีของรอเก็บ (drop จากรอบที่ตาย) → เก็บก่อนค่อยนั่ง
      if (!isResting && pct != null && pct < CFG.restUntilPercent && queue.size === 0 && warpQueue.size === 0) {
        if (sendSit()) {
          isResting = true;
          restUntil = now + CFG.restMaxSec * 1000;
          log('🪑 [post-respawn] นั่งพักจนเลือดเต็ม: HP', pct.toFixed(0) + '% → ' + CFG.restUntilPercent + '%');
        }
        return;
      }
      if (isResting) {
        if (queue.size > 0 || warpQueue.size > 0) {
          // ★ ลุกไปเก็บของก่อน — postRespawnRest ยัง true → เก็บเสร็จนั่งต่อเอง
          if (sendStand()) { log('🪑 [post-respawn] ลุกไปเก็บของก่อน — เก็บเสร็จนั่งต่อ'); }
          isResting = false;
        }
        else if (pct != null && pct >= CFG.restUntilPercent || now >= restUntil) {
          if (sendStand()) { log('🪑 [post-respawn] ลุกยืน: HP', pct.toFixed(0) + '% → กลับฟาร์ม'); }
          isResting = false;
          postRespawnRest = false;   // ★ เคลียร์ flag — กลับสู่ฟาร์มปกติ
          combatCooldownUntil = now + CFG.postCombatDelayMs;
        }
        return;   // ยังนั่งอยู่ → หยุดทุกอย่าง
      }
    }
    // ★ farm map guard: ถ้าตั้ง farmMap ไว้ และตอนนี้ไม่ได้อยู่แมปฟาร์ม → ไม่ฟาร์ม
    //   + retry วาร์ปกลับทุก 5s (กันติดแมปผิดถ้าวาร์ปครั้งแรกไม่สำเร็จ)
    //   ★★ ยกเว้น sellNpcMap/kafraMap เฉพาะตอนกำลังขาย/ฝากอยู่ (state ≠ IDLE)
    //      ถ้า abort แล้ว (state = IDLE) ต้องวาร์ปกลับฟาร์ม ไม่งั้นติดในเมือง
    const inSellRoutine = sellState !== 'IDLE';
    const inStorageRoutine = storageState !== 'IDLE';
    if (CFG.guardEnabled) {
      // ★★ GUARD MODE — จัดการแมปเอง: ผิดแมป guard → วาร์ปกลับจุดประจำ (แทน farm-guard)
      if (CFG.guardMap && currentMap && currentMap !== CFG.guardMap) {
        const nowG = nowMs();
        if (nowG - (lastGuardWarpBackAt || 0) > 5000) {
          log('🛡️ Guard: อยู่แมปผิด (' + currentMap + ') → วาร์ปกลับ', CFG.guardMap, '@(', CFG.guardX + ',' + CFG.guardY + ')');
          sendTeleport(CFG.guardMap, CFG.guardX, CFG.guardY);
          lastGuardWarpBackAt = nowG;
        }
        return;
      }
    }
    //   ★★★ เช็ค warpBackToFarm ด้วย — เดิมลูป retry นี้ไม่เช็ค ทำให้ปิด toggle แล้วยังโดนดึงกลับ
    //       ถ้าไปได้แมปอื่น (ตาย respawn เมือง/หนีเปลี่ยนแมป/วาร์ปมือ) — ปิดแล้ว = ฟาร์มแมปไหนก็ได้ที่ไปติด
    else if (CFG.warpBackToFarm && CFG.farmMap && currentMap && currentMap !== CFG.farmMap
        && !(inSellRoutine && currentMap === CFG.sellNpcMap)
        && !(inStorageRoutine && currentMap === CFG.kafraMap)
        && !(typeof buffVisitState !== 'undefined' && buffVisitState !== 'IDLE' && currentMap === CFG.buffVisitMap)
        && !(typeof unstuckBuffState !== 'undefined' && unstuckBuffState !== 'IDLE')) {   // ★ ไปรับบัพ/Unstuck AB — ห้าม farm-guard แย่งวาร์ป
      const now2 = nowMs();
      if (now2 - (lastFarmWarpBackAt || 0) > 5000) {
        log('🌀 ยังอยู่แมปผิด (' + currentMap + ') → วาร์ปกลับอีกครั้ง');
        sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
        lastFarmWarpBackAt = now2;
      }
      return;
    }
    const pct = hpPct();
    const mobCount = getMobAttackerCount();

    // ★★ Debug: บรรทัดสถานะทุก 10 วิ — HP/SP/ตำแหน่ง/เป้า/ผู้เล่น ไว้วิเคราะห์ย้อนหลัง
    //   (ดูในแท็บ 🔍 Debug — เห็นว่า HP ไหลไปไหนระหว่างเหตุการณ์ต่าง ๆ)
    if (now - (lastStatusDbgAt || 0) > 10000) {
      lastStatusDbgAt = now;
      const tgtName = target && target.id != null ? ((entities.get(target.id) || {}).name || target.id.toString(16)) : '-';
      dbg('ⓘ สถานะ: HP ' + (hp.cur != null ? hp.cur + '/' + hp.max + ' (' + (pct != null ? pct.toFixed(0) : '?') + '%)' : '?')
        + ' SP ' + (sp.cur != null ? sp.cur + '/' + sp.max : '?')
        + (isResting ? ' [นั่งพัก]' : '')
        + (playerWeight != null ? ' น้ำหนัก ' + playerWeight + '/' + playerMaxWeight : '')
        + ' | ' + (currentMap || '?') + (player.x != null ? ' @(' + Math.round(player.x) + ',' + Math.round(player.y) + ')' : ' (ไม่รู้ตำแหน่ง)')
        + ' | เป้า: ' + tgtName
        + ' | โดนตี:' + mobCount + ' ผู้เล่น:' + countNearbyPlayers(CFG.fleePlayerRadius)
        + ' | คิวเก็บ:' + queue.size);
    }

    // === -1. AUTO-REST (priority สูงสุด — ก่อน flee) ===
    //   ถ้า HP ต่ำ (+SP ต่ำถ้าตั้ง restSpPercent) และไม่โดนรุม → นั่งพัก; ถ้ากำลังนั่งอยู่ → จัดการลุก/นั่งต่อ
    if (CFG.restEnabled && pct != null && hp.cur != null && pct > 0) {
      // ★ pct=0 = tracking ผิด (ไม่ตายจริง) → ไม่นั่งพัก (รอ STAT แก้)
      // ★★ SP condition — นั่งด้วยเมื่อ SP% ต่ำกว่า restSpPercent (>0 = เปิด) สำหรับบอทบัพ
      //   ลุกเมื่อ HP+SP ฟื้นถึง restUntilPercent ครบทั้งคู่ (หรือหมดเวลา)
      const spP = spPct();
      const spLow = CFG.restSpPercent > 0 && spP != null && spP < CFG.restSpPercent;
      const hpLow = pct < CFG.restHpPercent;
      const spOkToStand = !(CFG.restSpPercent > 0) || spP == null || spP >= CFG.restUntilPercent;
      // ★★ มีของรอเก็บ → ยังไม่นั่ง! เก็บให้เสร็จก่อน (ยืนเก็บได้/ไม่ต้องวาร์ปไปเก็บตอนนั่ง)
      //   (บั๊กเดิม: นั่งก่อน → loot loop ยิงเก็บตอนนั่ง fail รัว → วาร์ปไปเก็บ → การนั่งพัง)
      //   + พักหลังเก็บของเสร็จอย่างน้อย restDelayMs — เก็บเสร็จแล้วนั่งทันที = ดูเป็นบอท
      if (!isResting && (hpLow || spLow) && mobCount === 0
          && queue.size === 0 && warpQueue.size === 0
          && now - lastLootActivityAt >= CFG.restDelayMs
          && now - lastRestStandAt >= 2000) {
        // เริ่มนั่งพัก
        if (sendSit()) {
          isResting = true;
          restUntil = now + CFG.restMaxSec * 1000;
          if (hpLow) log('🪑 นั่งพัก: HP', pct.toFixed(0) + '% < ' + CFG.restHpPercent + '% (นานสุด ' + CFG.restMaxSec + 's หรือจนถึง ' + CFG.restUntilPercent + '%)');
          else log('🪑 นั่งพัก: SP', (spP != null ? spP.toFixed(0) + '% < ' + CFG.restSpPercent + '%' : 'ต่ำ') + ' (นานสุด ' + CFG.restMaxSec + 's หรือจนถึง SP ' + CFG.restUntilPercent + '%)');
        }
        return;
      }
      if (isResting) {
        // ★★ ของเข้าคิวระหว่างนั่ง (drop มาช้ากว่า combat window) → ลุกไปเก็บก่อน
        //   เก็บเสร็จคิวว่าง → เงื่อนไขด้านบนจะให้นั่งใหม่เอง
        if (queue.size > 0 || warpQueue.size > 0) {
          if (sendStand()) { log('🪑 ลุกยืน: มีของรอเก็บ — เก็บก่อนแล้วค่อยพักต่อ'); }
          isResting = false;
        }
        // ★★ นั่งแล้ว HP=0/null (tracking ผิด) → ลุกทันที (ไม่ต้องรอ timeout)
        else if (pct == null || pct <= 0) {
          if (sendStand()) { log('⚠️ HP=0 ขณะนั่ง (tracking ผิด) → ลุกทันที'); }
          isResting = false;
          hp.cur = null; hp.max = null;   // reset รอ STAT
        }
        // โดนรุมระหว่างนั่ง → ลุกทันทีเพื่อตีตอบ (ไม่ return — ให้ flee/defensive ทำงานต่อ)
        else if (mobCount > 0) {
          if (sendStand()) { log('⚠️ โดนรุมขณะนั่ง → ลุกทันที'); }
          isResting = false;
        }
        // ฟื้นถึง restUntilPercent (HP ครบ + SP ครบถ้าเปิด SP rest) หรือหมดเวลา → ลุก
        else if ((pct >= CFG.restUntilPercent && spOkToStand) || now >= restUntil) {
          const byFull = pct >= CFG.restUntilPercent && spOkToStand;
          if (sendStand()) {
            log('🪑 ลุกยืน: HP ' + pct.toFixed(0) + '%' + (CFG.restSpPercent > 0 && spP != null ? ' SP ' + spP.toFixed(0) + '%' : '') + (byFull
              ? ' (ฟื้นครบ ≥ ' + CFG.restUntilPercent + '%)'
              : ' (หมดเวลา ' + CFG.restMaxSec + 's แต่ยังไม่ครบ — น่าจะ tracking ค้าง ตรวจ player_id)'));
          }
          isResting = false;
          lastRestStandAt = now;
          combatCooldownUntil = now + CFG.postCombatDelayMs;   // พักเล็กน้อยก่อนเริ่ม
        }
        else { return; }   // ยังนั่งอยู่ → หยุดทุกอย่าง
      }
    }

    // === 0. post-combat cooldown — รอหลังสู้เสร็จ/เก็บของเสร็จ ก่อนทำอย่างอื่น ===
    //   ยกเว้น flee (ต้องทำทันทีเสมอเพื่อความปลอดภัย)
    const inCooldown = now < combatCooldownUntil;
    // ★ Combat Flee (มอนอันตราย + มอนรุม) ถูกตรวจไปแล้วก่อน combatEnabled guard (v4.189.53)
    if (inCooldown && mobCount === 0) return;   // อยู่ใน cooldown + ไม่โดนรุม → รอ

    // === 1b. ★ ถ้ามีของรอเก็บ → หยุด combat ชั่วคราว ให้ loot ทำงานก่อน ===
    //   เหตุผล: ฆ่ามอนได้ → เก็บของก่อน แล้วค่อยไปตีตัวใหม่ (เหมือนบอทหลัก _lootBlockingFarm)
    //   ยกเว้น: ถ้ากำลังโดนรุม (mobAttackers ≥1) → ยังตีต่อเพื่อป้องกันตัวเอง
    if (CFG.lootEnabled && queue.size > 0 && getMobAttackerCount() === 0) {
      return;   // มีของรอเก็บ + ไม่โดนรุม → รอ lootLoop เก็บก่อน
    }

    // === 1c. ★ warp guard — หลังวาร์ป player.x/y ค้างจนกว่า server จะส่ง MOVE_UPDATE ใหม่
    //   ถ้าคำนวณ dist ตอนนี้จะได้ค่าผิด (dist 0.0 หลอก) → ตีไม่ได้ → pending ขึ้น
    //   แก้: รอจนกว่า player pos จะเปลี่ยนจากก่อนวาร์ป (หรือหมดเวลา 3s)
    if (now < warpGuardUntil && lastWarpPlayerPos) {
      if (player.x === lastWarpPlayerPos.x && player.y === lastWarpPlayerPos.y) {
        return;   // pos ยังไม่เปลี่ยน → รอ (dist จะผิดถ้าคำนวณตอนนี้)
      }
      // pos เปลี่ยนแล้ว → เคลียร์ guard
      warpGuardUntil = 0;
      lastWarpPlayerPos = null;
    }
    // ★★ หลังหมดเวลา warp guard (3s) — ถ้าตำแหน่งยังเดิม → null ทิ้ง กันใช้ค่าเก่าไปตลอด
    //   ถ้าใช้ค่าเก่า → bot จะคำนวณ dist ผิด → ไม่เจอมอน → วาร์ปสุ่มซ้ำๆ → ตำแหน่งค้างตลอด
    if (now >= warpGuardUntil && lastWarpPlayerPos && player.x === lastWarpPlayerPos.x && player.y === lastWarpPlayerPos.y) {
      log('⚠️ ตำแหน่งค้างหลังวาร์ป 3s → รอ server ส่ง pos ใหม่');
      player.x = null; player.y = null;
      lastWarpPlayerPos = null;
      return;
    }

    // === 1b. Defensive retarget === ถ้าโดนมอนตี/aggro (ที่ไม่ใช่ target ปัจจุบัน) → สลับมาตีตัวนั้น
    //   สำคัญ: ถ้ามอน aggro เรา ต้องสู้กลับ ไม่ใช่เดินหาตัวอื่น
    //   ★★ sticky target guard: ถ้ากำลังตีอยู่ + server ตอบกลับ < 5s → ไม่สลับ (กันสลับไปมา)
    //   ★★★ ยกเว้น: โดนรุม ≥2 ตัว หรือ HP < 50% → ละ sticky guard (ตอบโต้ทันที!)
    //   (กันตี plant นานไป มอนตีเราไปเรื่อยโดยไม่ตอบโต้)
    const _mobAtkCount = getMobAttackerCount();
    const _hpPct = hpPct();
    const _breakSticky = _mobAtkCount >= 2 || (_hpPct != null && _hpPct < 50);
    if (!unstuckBuffAutoFinishPending && player.x != null && (!_breakSticky || !target) && !(target && target.lastAttackResultAt && now - target.lastAttackResultAt < 5000)) {
      let attacker = null, attackerDist = Infinity;
      // ★★ รวม mobAttackers (ตีกายภาพ) + monsterAggro (สกิลเล็งเรา) → ตอบโต้ทุกกรณี
      const threats = new Map();
      for (const [aid, at] of mobAttackers) { if (now - at <= CFG.fleeMobWindowMs) threats.set(aid, at); else mobAttackers.delete(aid); }
      for (const [aid, at] of monsterAggro) { if (now - at <= (CFG.aggroKeepAliveMs || 10000)) threats.set(aid, Math.max(threats.get(aid) || 0, at)); else monsterAggro.delete(aid); }
      for (const [aid, at] of threats) {
        if (target && aid === target.id) continue;   // ตัวที่กำลังตีอยู่แล้ว → ข้าม
        const am = entities.get(aid);
        if (!am || !am.alive || am.x == null) continue;
        // ★★ ไม่เช็ค isTargetable สำหรับ threats — มอนที่ตีเราต้องตอบโต้เสมอ
        // (mirror บอทหลัก bot.js:600-607 — แค่ alive + kind ไม่สน cooldown/distance/avoidPlayers)
        // ★ ยกเว้น: มอนใน blacklist + ผู้ใช้ปิด fightBackBlacklisted → ไม่ตีกลับ (เคารพ blacklist เด็ดขาด)
        if (!CFG.fightBackBlacklisted && matchList(am, CFG.targetBlacklist)) continue;
        if (isBeaconPlayer(aid, now)) continue;   // ★★ ห้ามตีผู้เล่น (เคยบน radar) แม้ kind พลาด
        if (am.kind !== 1) continue;   // ★★ ต้องเป็น monster (kind=1) เท่านั้น — ห้ามตี player (kind=0)!
        const d = Math.hypot(am.x - player.x, am.y - player.y);
        if (d < attackerDist) { attackerDist = d; attacker = am; }
      }
      if (attacker) {
        if (target) abandonTarget('defensive → ตีตัวที่รุม', false);
        target = { id: attacker.id, x: attacker.x, y: attacker.y, acquiredAt: now, engageAt: 0, lastAttackAt: 0, lastAttackResultAt: 0, pendingAttacks: 0, firstAttackAt: 0, stuckCount: 0, warpCount: 0 };
        lastTargetSwitchAt = now;
        log('🛡️ สลับเป้า: ตีตัวที่กำลังตีเรา', attacker.name || attacker.id.toString(16));
        return;
      }
    }

    // === 2. Target validation / abandon ===
    if (target) {
      const m = entities.get(target.id);
      if (!m || !m.alive) { abandonTarget('ตาย/หาย', false); target = null; }
      else {
        target.x = m.x; target.y = m.y;
        // ★ ถ้ากำลังเข้าใกล้ขึ้น (dist ลด) → อย่า abandon (กำลังทำงานถูกต้อง)
        const curDist = (player.x != null) ? Math.hypot(m.x - player.x, m.y - player.y) : Infinity;
        if (target._lastDist != null && curDist < target._lastDist - 0.5) {
          target.pendingAttacks = 0;   // เข้าใกล้ขึ้น → reset pending (ไม่ใช่ stuck)
        }
        target._lastDist = curDist;
        // abandon เฉพาะเคสจริง: engage นานเกิน หรือ pending สูง (server เงียบ)
        const engageAge = target.engageAt ? (now - target.engageAt) / 1000 : 0;
        const acquireAge = (now - target.acquiredAt) / 1000;
        // ★ มอนยัง "กำลังสู้กับเรา" → ยกเลิก abandon จาก pending/server เงียบ
        //   สัญญาณ 3 อย่าง (อย่างน้อย 1 อย่างล่าสุด):
        //   1. monsterAggro (0x18) — มอนเลือกเราเป็นเป้า
        //   2. mobAttackers — มอนตีเรา
        //   3. _lastDamageAt — เราสร้าง damage ให้มอนได้จริง (สำคัญสำหรับมอนนิ่ง เช่น ไข่/เห็ด ที่ไม่ตีกลับ)
        const targetAggro = monsterAggro.get(target.id);
        const targetHitUs = mobAttackers.get(target.id);
        const targetDamaged = m._lastDamageAt;   // ★ เราตีมอนแล้วโดน (HP ลด)
        const lastCombatSignal = Math.max(targetAggro || 0, targetHitUs || 0, targetDamaged || 0);
        const isTargetStillEngaged = lastCombatSignal && (now - lastCombatSignal < CFG.aggroKeepAliveMs);
        // ★ มอน "ตีช้า" (mushroom/plant/เจาะไม่เข้า) → ใช้ maxEngageSecSlow (ยาวกว่า) กัน abandon ก่อนฆ่าทัน
        const isSlowMonster = m.sub != null && Array.isArray(CFG.slowMonsterSubIds) && CFG.slowMonsterSubIds.includes(m.sub);
        // ★★ เพิ่มเวลาเดิน — ระยะ 5 ช่อง = +1 วิ (กัน abandon ตอนกำลังเดินไปหามอนไกล)
        const travelSec = curDist > 0 ? Math.ceil(curDist / 5) : 0;
        const engageLimit = (isSlowMonster ? (CFG.maxEngageSecSlow || 180) : CFG.maxEngageSec) + travelSec;
        // ★★★ hard cap: pending สูงเกินปกติมาก "แม้กำลังสู้อยู่" → abandon ได้
        //   กัน entity ผิดปกติ (id ขยะ/ตีไม่ได้ แต่ส่งสัญญาณตีเรา) — isTargetStillEngaged
        //   จะบล็อก abandon ข้างล่างไปเรื่อย ๆ บอทยืนตี้ ๆ นานเป็นสิบวินาที (เคย pending 9)
        const hardPendingCap = Math.max(CFG.attackPendingMax + 3, 5);
        if (target.pendingAttacks >= hardPendingCap && target.firstAttackAt && (now - target.firstAttackAt > CFG.attackAbandonMs)) {
          abandonTarget('pending ' + target.pendingAttacks + ' (ตีไม่โดนแม้กำลังสู้)', true, 10000); target = null;
        }
        else if (target.engageAt && engageAge > engageLimit && !isTargetStillEngaged) {
          abandonTarget('engage นาน ' + engageAge.toFixed(0) + 's' + (isSlowMonster ? ' (slow)' : ''), true, 10000); target = null;
        }
        else if (!target.engageAt && acquireAge > engageLimit && !isTargetStillEngaged) {
          abandonTarget('ไม่ได้ตี ' + acquireAge.toFixed(0) + 's', true, 10000); target = null;
        }
        // ★ pending ≥ attackPendingMax abandon ถ้า server ไม่ตอบนานเกินไป — แต่ถ้ามอนยัง aggro เรา ข้าม (ยังสู้อยู่)
        else if (target.pendingAttacks >= CFG.attackPendingMax && target.firstAttackAt && (now - target.firstAttackAt > CFG.attackAbandonMs) && !isTargetStillEngaged) {
          abandonTarget('pending ' + target.pendingAttacks + ' (server เงียบ)', true, 10000); target = null;
        }
      }
      // stuck warp escalation — ★★ ห้ามตอนที่กำลังขาย/ฝากของ (การ์อยู่เมือง Kafra ไม่มีมอน!)
      const _stuckInRoutine = sellState !== 'IDLE' || storageState !== 'IDLE';
      if (!target && !_stuckInRoutine && CFG.stuckWarpOnAbandon > 0 && stuckAbandonCount >= CFG.stuckWarpOnAbandon) {
        log('🌀 stuck abandon', stuckAbandonCount, 'ครั้ง → วาร์ปสุ่ม');
        sendRandomWarp(); stuckAbandonCount = 0; stuckAbandonHistory = [];
      }
    }

    // === 2.8 Auto-Skill (ใช้สกิลตามเงื่อนไข — ก่อน attack) ===
    //   mirror bot.js _maybeSkill:3440-3538 — ทีละสกิลต่อ tick
    //   mode: targeted (Bash/Charge), AoE (Magnum), self-cast (Quicken/Heal ตัวเอง)
    //   ★★ ไม่บังคับต้องมี target อีกแล้ว — สกิล self-cast (เช่น Heal เมื่อ HP ต่ำ) ใช้ได้แม้ยืนเฉย ๆ
    //   ★★★ กำลังร่าย (castingUntil จาก 0x18/0x19 + castTime จริงของ server) → รอให้จบก่อน
    //       แก้: หลายสกิลพร้อมกันเดิมยิงทับกันระหว่างร่าย → ตัวที่โดนทับไม่ติด เสีย cooldown เปล่า สกิลท้ายลิสต์ไม่มีทางได้ใช้
    if (now < castingUntil) return;   // รอร่ายจบ — completion (0x1d/0x0b) จะปลดล็อกเอง
    // ★★ คิวตามเวลา (กัน completion ปลด lock กลางคัน): ห่างจากสกิลล่าสุดไม่น้อยกว่าเวลาร่ายที่เรียนรู้ + margin
    //   เคสจริง: Cold Bolt โดนยิงกลางการร่าย Fire Bolt → server ทิ้งเงียบ (SP ไม่หัก ไม่มีดาเมจ)
    if (lastSkillSentAt && now - lastSkillSentAt < lastSkillCastMs) {
      dbg('🎬 รอคิวร่าย — เพิ่งส่งสกิล ' + (now - lastSkillSentAt) + '/' + lastSkillCastMs + 'ms');
      return;
    }
    if (CFG.skillEnabled && CFG.skills && CFG.skills.length) {
      const mobCount = getMobAttackerCount();
      const curSP = sp.cur;
      const curSPmax = sp.max;
      const curHpPct = hpPct();
      const disabled = Array.isArray(CFG.disabledSkillIds) ? CFG.disabledSkillIds : [];
      for (const skill of CFG.skills) {
        if (!skill || skill.skillId == null) continue;
        // ★ สงวน Teleport skillId 53 ออกจาก Auto-Skill เมื่อ Warp Find ใช้ Teleport Clip หรือ Fly Wing
        //   Fly Wing mode ต้องไม่ให้ Teleport จาก skill timer แอบวาร์ปแยกอีกทาง
        if ((CFG.warpFindUseTeleportSkill || CFG.warpFindUseFlyWing) && Number(skill.skillId) === 53) continue;
        if (skill.buffMode) continue;   // ★ buffMode ประมวลใน buffOthersLoop แยก (ไม่ต้องมีมอน/ตี)
        if (disabled.includes(skill.skillId)) continue;
        // ★ สกิลที่ต้องมีเป้า (targeted/ground ไม่ใช่ self/ally) — ไม่มี target ข้าม
        //   ally = ใช้กับ "ตัวเอง" ผ่าน targetId ของเรา (Heal/Blessing เป็น Ally-target ตาม Skills.toml)
        const needsTarget = (skill.targeted || skill.ground) && !skill.selfCast && !skill.ally;
        if (needsTarget && !target) continue;
        // ★ ally ต้องรู้ playerId ของตัวเองก่อน (จะส่ง targetId = เรา)
        if (skill.ally && playerId == null) continue;
        const lastUse = lastSkillUse.get(skill.skillId) || 0;
        // ★ timer mode (intervalMin > 0) — self-cast buff
        const intervalMin = Number(skill.intervalMin) || 0;
        if (intervalMin > 0) {
          if (lastUse > 0 && (now - lastUse) < intervalMin * 60 * 1000) continue;
        } else {
          const cooldown = skill.cooldownMs ?? 2000;
          if (now - lastUse < cooldown) continue;
        }
        // ★ SP gate
        const spMin = skill.spMin ?? 0;
        if (spMin > 0 && curSP != null && curSP < spMin) continue;
        // ★★ HP% gate — ใช้เฉพาะเมื่อ HP% ต่ำกว่าเกณฑ์ (เช่น Heal ตัวเองเมื่อ HP < 50%)
        //   0 หรือว่าง = ไม่สน HP · HP ไม่รู้ค่า (?) = ไม่ใช้ (กันยิงพร่ำเพรื่อ)
        const hpBelow = Number(skill.hpBelowPct) || 0;
        if (hpBelow > 0 && (curHpPct == null || curHpPct >= hpBelow)) continue;
        // ★ mob count gate (AoE skill)
        const mobMin = skill.mobCountMin ?? 0;
        if (mobCount < mobMin) continue;
        // ★ targeted/ground skill: ต้องมี target + ในระยะ + ไม่เกิน maxUses
        //   selfCast=true ข้ามเงื่อนไขนี้ทั้งหมด
        if ((skill.targeted || skill.ground) && !skill.selfCast) {
          const m = entities.get(target.id);
          if (!m || m.x == null || player.x == null) continue;
          const dist = Math.hypot(m.x - player.x, m.y - player.y);
          const minDist = skill.minDistance ?? 0;
          const maxDist = skill.maxDistance ?? 0;
          if (maxDist > 0 && dist > maxDist) continue;
          if (minDist > 0 && dist < minDist) continue;
          const maxUses = skill.maxUsesPerTarget ?? 1;
          const targetUses = skillUsesOnTarget.get(skill.skillId) || new Map();
          const used = targetUses.get(target.id) || 0;
          if (used >= maxUses) continue;
        }
        // ★ ผ่านเงื่อนไข → ใช้สกิล!
        //   ally → targetId = ตัวเราเอง (สกิล Ally ใช้กับตัวเอง: Heal/Blessing/Kyrie ฯลฯ)
        // ★★ แก้สกิลพื้นที่ที่ถูกตั้งโหมดผิดเป็น "AoE รอบตัว" (preset บอกชัดว่าเป็น ground เช่น Thunderstorm)
        //   ส่ง [1d][05] แทน [1d][04] → server รับ cast + หัก SP แต่ไม่มีพื้นที่เป้าหมาย = ไม่มีดาเมจ (เคสจริง)
        let skillGround = !!skill.ground;
        if (!skillGround && !skill.targeted && !skill.selfCast && !skill.ally && target
            && GROUND_SKILL_IDS.has(skill.skillId)) {
          skillGround = true;
          if (!groundModeFixWarned.has(skill.skillId)) {
            groundModeFixWarned.add(skill.skillId);
            log('🔧 สกิล', skill.name || ('id=' + skill.skillId), 'เป็นแบบพื้นที่ (ตาม preset) → ส่งพิกัดมอนเป้าหมายให้ แทนโหมด AoE รอบตัว (แก้: ร่ายเสร็จ SP หมดแต่ไม่มีดาเมจ)');
          }
        }
        const skillTarget = skill.ally ? playerId : ((skill.targeted && !skill.selfCast && !skill.ground) ? target.id : null);
        // ★ ground-targeted (Arrow Shower/Thunderstorm): ส่งพิกัดของมอนเป้าหมาย
        let groundX = null, groundY = null;
        if (skillGround && target) {
          const tm = entities.get(target.id);
          if (tm && tm.x != null) { groundX = Math.round(tm.x); groundY = Math.round(tm.y); }
        }
        if (sendSkill(skill.skillId, skill.level || 1, skillTarget, groundX, groundY)) {
          lastSkillUse.set(skill.skillId, now);
          saveSkillTimesDebounced();
          if (skill.targeted && !skill.selfCast && !skill.ally) {
            const tu = skillUsesOnTarget.get(skill.skillId) || new Map();
            tu.set(target.id, (tu.get(target.id) || 0) + 1);
            skillUsesOnTarget.set(skill.skillId, tu);
          }
          const spInfo = curSP != null ? (curSPmax ? ` ${curSP}/${curSPmax}` : ` ${curSP}`) : ' ?';
          const modeTag = skill.ally ? ' (ally→ตัวเอง)' : (skill.selfCast ? ' (self)' : (skill.targeted ? '' : (skillGround ? ' (พื้น)' : ' (AoE รอบตัว)')));
          log('✨ ใช้สกิล', skill.name || ('id=' + skill.skillId), modeTag, '(sp' + spInfo + ' mob=' + mobCount + ')');
          break;   // ทีละสกิลต่อ tick
        }
      }
    }

    // === 3. Attack ===
    //   ★ server ทำ walk-and-attack เอง: ส่ง ATTACK ในระยะ maxAcquireDistance → server เดินตัวละครเข้าไปตี
    //     dist > maxAcquireDistance → บอทเดินเข้าไปเอง (MOVE) จนถึง ≤maxAcquireDistance แล้วค่อยส่ง ATTACK
    //   ★★ โหมดเวทย์ (ปิด normalAttackEnabled) — ไม่ส่ง ATTACK เลย: server ไม่เดินเข้าปะทะ
    //     ดาเมจมาจากสกิล (section 2.8) · เดินเข้าแค่พอระยะร่าย = max(maxDistance ของสกิลโจมตี)
    if (target) {
      const m = entities.get(target.id);
      if (m && player.x != null && m.x != null && m.y != null) {
        const dist = Math.hypot(m.x - player.x, m.y - player.y);
        target.lastDist = dist;
        const _skillOnly = CFG.normalAttackEnabled === false;
        // ★ fallback ระยะร่าย: สกิลที่ตั้งไว้ไม่มี maxDistance เลย → เข้าใกล้ถึง 9 ช่อง (ระยะเวทย์ทั่วไป)
        //   เดิมใช้ maxAcquireDistance (15-30) = ยืนห่างเฉย ๆ ทั้งที่สกิลยิงไม่ถึง (เคสจริง: ยืน 43s ไม่ทำอะไร)
        const _engageRange = _skillOnly ? (getCastRange() || Math.min(CFG.maxAcquireDistance, 9)) : CFG.maxAcquireDistance;
        // ในระยะ acquire → ส่ง ATTACK ตรงๆ (server เดินเข้าไปตีเอง)
        if (dist <= _engageRange) {
          // ★★ โหมดเวทย์: ยืนระยะร่าย — ไม่ส่งตีปกติ ไม่วาร์ปหามอน (pending ไม่มีความหมาย)
          //   engage จับเวลาตอนถึงระยะ + ดาเมจสกิลต่ออายุ _lastDamageAt → abandon ยังทำงานพอดี
          if (_skillOnly) {
            if (!target.engageAt) target.engageAt = now;
            return;
          }
          // (ลบ fallback เดินเข้า — server walk-and-attack ทำงานจริง แค่ reset ไม่ทำงานชั่วคราว)
          // ★ ถ้า pending สูง + server เงียบนาน + เปิด warpToMonster → วาร์ปไปหามอน (แทน abandon)
          if (CFG.warpToMonster && target.pendingAttacks >= 4 && target.firstAttackAt && (now - target.firstAttackAt > 8000)
              && (warpToMonsterCount.get(target.id) || 0) < CFG.warpToMonsterMaxPerEntity
              && now - (target._lastWarpAt || 0) > CFG.warpToMonsterCooldownMs) {
            const wc = warpToMonsterCount.get(target.id) || 0;
            if (sendTeleport(currentMap, m.x, m.y)) {
              target._lastWarpAt = now; warpToMonsterCount.set(target.id, wc + 1);
              target.pendingAttacks = 0; target.firstAttackAt = 0;   // reset หลังวาร์ป
              log('🌀 วาร์ปไปหา', m.name || target.id.toString(16), '@(', m.x, m.y + ')', '(pending สูง warp', wc + 1 + ')');
            }
            return;
          }
          if (now - target.lastAttackAt > CFG.attackReIssueMs || target.lastAttackAt === 0) {
            if (sendAttack(target.id)) {
              target.lastAttackAt = now; target.pendingAttacks++;
              if (!target.firstAttackAt) { target.firstAttackAt = now; }   // ★ จดเวลาส่งครั้งแรก
              if (!target.engageAt) { target.engageAt = now; }
              // ★ HP มอน: จาก SPAWN (ค่าเริ่ม) + ลดจากดาเมจเรา (real-time) — ถ้าคนอื่นตีด้วยจะค้างสูงกว่าจริง
              const hpInfo = (m.hp != null && m.hpMax > 0) ? ' HP ' + m.hp + '/' + m.hpMax + ' (' + (monsterHpPct(m) * 100).toFixed(0) + '%)' : '';
              log('⚔️ ตี', m.name || m.id.toString(16), target.id.toString(16), '@(' + Math.round(m.x) + ',' + Math.round(m.y) + ') dist', dist.toFixed(1) + hpInfo, '(pending', target.pendingAttacks + ')');            }
          }
          return;
        }
        // ★ dist > maxChaseDistance → abandon ทันที (มอนไกลเกินไป ไม่สมควรไล่ตาม)
        if (dist > CFG.maxChaseDistance) {
          log('📏 abandon: มอนไกล', dist.toFixed(0), 'ช่อง (เกิน maxChase ' + CFG.maxChaseDistance + ')');
          abandonTarget('ไกลเกิน ' + CFG.maxChaseDistance, false, 10000);
          target = null;
          return;
        }
        // dist > maxAcquireDistance → เดินเข้าไปเองจนถึงระยะ acquire
        //   สั่งเดินทีละ walkStepDistance ช่อง (≤20) ถ้าติดกำแพงนาน → warpToMonster/abandon
        const stuck = walkToTarget(now, m);
        if (stuck === 'STUCK') {
          if (CFG.warpToMonster && (warpToMonsterCount.get(target.id) || 0) < CFG.warpToMonsterMaxPerEntity) {
            const wc = warpToMonsterCount.get(target.id) || 0;
            if (now - (target._lastWarpAt || 0) > CFG.warpToMonsterCooldownMs) {
              if (sendTeleport(currentMap, m.x, m.y)) {
                target._lastWarpAt = now; warpToMonsterCount.set(target.id, wc + 1);
                log('🌀 วาร์ปไปหา', m.name || target.id.toString(16), '@(', m.x, m.y + ')', '(warp', wc + 1 + ')');
              }
              return;
            }
          }
          // ไม่เปิด warpToMonster หรือ warp ครบแล้ว → abandon + cooldown กันเลือกตัวเดิม
          abandonTarget('ติดกำแพง (stuck)', true, 15000);
          target = null;
        }
        return;
      }
    }

    // === 4. Acquire new target ===
    if (!target) {
      // ★ v4.189.0: AB Auto ครบเวลาแล้ว → ห้ามหา/เดินไปมอนตัวใหม่ รอ loot เสร็จแล้ว Unstuck
      if (unstuckBuffAutoFinishPending) return;
      // ★★ Manual mode: ตีตัวเดียว — target ตาย/หาย → ปิด combat + หยุด (ไม่หาตัวใหม่)
      if (manualMode) {
        manualMode = false;
        CFG.combatEnabled = false;
        log('✅ ฆ่ามอน (manual) เสร็จ — หยุด combat');
        return;
      }
      // ★★★ HP ต่ำกว่าเกณฑ์นั่งพัก + ไม่โดนตี + ไม่มีของรอเก็บ → ห้ามเปิดสู้ตัวใหม่!
      //   (บั๊กเดิม: ฆ่าได้ → เข้าเป้าใหม่ทันที → โดนตี → นั่งไม่ได้ → วนสู้รัว ๆ จน HP ยิ่งต่ำ/ตาย
      //    การนั่งพักชนะ tick ไม่ไหวเพราะแพ้การแข่ง acquire — ปิดทาง acquire เลยให้จบ)
      if (CFG.restEnabled) {
        const _pct = hpPct();
        if (_pct != null && _pct > 0 && _pct < CFG.restHpPercent
            && getMobAttackerCount() === 0 && queue.size === 0 && warpQueue.size === 0) {
          return;   // ปล่อยให้ส่วน auto-rest ทำงานใน tick ถัดไป (จะนั่งเอง)
        }
      }
      // ★★ GUARD MODE — ตีกลับเฉพาะมอนที่มาตีเรา (ไม่หามอนเอง)
      // ★★ กำลังเดินไป/ยืนรับบัพ/กลับจากบอทบัพ (buffVisit) — ไม่หามอนใหม่ ไม่ wander
      //   (ให้ buffVisitLoop เป็นเจ้าของการเดิน · ถ้าโดนมอนตีระหว่างทาง combat ตีกลับผ่าน defensive อยู่แล้ว)
      if (typeof buffVisitState !== 'undefined' && buffVisitState !== 'IDLE') return;
      const t = CFG.guardEnabled ? acquireGuardTarget(now) : acquireTarget(now);
      if (t) { target = t; noMonsterSince = 0; return; }
      // ★★ GUARD: ไม่มีมอนตี → กลับจุดยืน + ห้าม wander/วาร์ปหามอน (นิ่งประจำการ)
      if (CFG.guardEnabled) { guardReturnToPost(now); return; }
      // ไม่เจอมอน
      if (!noMonsterSince) noMonsterSince = now;
      const noMonSec = (now - noMonsterSince) / 1000;
      // ★★ เดิมบังคับขั้นต่ำ 3 วิ (ให้เวลา acquireTarget หามอนใหม่ก่อนวาร์ป) — ผู้ใช้บางกลุ่มอยากได้ 0-2 วิ
      //   ตอนนี้ตามค่าที่ตั้งเป๊ะ (0 = วาร์ปทันทีที่ไม่เจอมอน) · กัน spam ด้วย cooldown lastWarpFindAt ≥3 วิ อยู่แล้ว
      const effectiveWarpSec = Math.max(CFG.noMonsterWarpSec, 0);
      // warp-find — มี cooldown กัน spam (วาร์ป fail ก็ต้องรอ ไม่ยิงทุก tick)
      // ★★ ห้ามวาร์ปถ้า player.x == null (ตำแหน่งค้าง/ไม่รู้ตำแหน่ง → วาร์ปไปก็ไม่รู้ว่าได้ผลไหม)
      if (CFG.warpFindEnabled && noMonSec >= effectiveWarpSec && now - lastWarpFindAt > 3000 && player.x != null
          && sellState === 'IDLE' && storageState === 'IDLE') {   // ★★ ห้ามวาร์ปตอนกำลังขาย/ฝากของ
        lastWarpFindAt = now;
        if (currentMap) {
          // ★★★ ก่อนวาร์ปหนี — เช็คว่า "ไม่เจอมอน" เพราะโดนบล็อกชั่วคราวหรือเปล่า
          //   เคสจริง: abandon มอนรอบตัวครบทุกตัว (pending server เงียบ) → ทุกตัวโดน
          //   abandonCooldown 15s → "ไม่เจอมอน" ทั้งที่มอนเต็มจอ → วาร์ปหนีไปเอง!
          //   แก้: มีมอนในระยะที่บล็อกแค่เพราะ cooldown → ปลดตัวใกล้สุดแทนการวาร์ป
          let _blockedAb = null, _blockedAbDist = Infinity;
          for (const e of entities.values()) {
            if (e.kind !== 1 || !e.alive || e.x == null) continue;
            const ab = abandonCooldown.get(e.id);
            if (!ab || now >= ab) continue;
            const d2 = Math.hypot(e.x - player.x, e.y - player.y);
            if (d2 <= CFG.maxAcquireDistance && d2 < _blockedAbDist) { _blockedAbDist = d2; _blockedAb = e; }
          }
          if (_blockedAb) {
            abandonCooldown.delete(_blockedAb.id);
            noMonsterSince = now;
            log('🔓 มอนอยู่ใกล้ (' + (_blockedAb.name || _blockedAb.id.toString(16)) + ' @' + _blockedAbDist.toFixed(0) + ' ช่อง) แต่โดน abandon-cooldown บล็อก → ปลดแทนการวาร์ปหนี');
            return;
          }
          // ★ Diagnostic ไป Debug log: ทำไมไม่เจอ — มอนในระยะกี่ตัว / โดน antiKS / ghost จาก 0x07
          let _inRange = 0, _ks = 0, _ghost = 0;
          for (const e of entities.values()) {
            if (!e.alive || e.x == null) continue;
            if (Math.hypot(e.x - player.x, e.y - player.y) > CFG.maxAcquireDistance) continue;
            if (e.kind === 1) {
              _inRange++;
              if (CFG.antiKS && !e._claimedByMe && e._lastEngagedByOtherAt && now - e._lastEngagedByOtherAt < (CFG.antiKSCooldownMs || 10000)) _ks++;
            } else if (e.kind === 0 && e._src === 'move') _ghost++;
          }
          dbg('🔍 ไม่เจอมอน ' + noMonSec.toFixed(0) + 's → วาร์ป — มอนในระยะ: ' + _inRange + ' (โดน antiKS: ' + _ks + ') | ghost 0x07 ใกล้ ๆ: ' + _ghost);
          log('🌀 ไม่เจอมอน', noMonSec.toFixed(0) + 's → ' + (CFG.teleportMacroEnabled === true ? 'Fixed Macro' : (CFG.warpFindUseFlyWing ? 'Fly Wing (601)' : (CFG.warpFindUseTeleportSkill ? 'Teleport Clip' : 'วาร์ปสุ่ม'))));
          if (sendWarpFind()) noMonsterSince = now;   // สำเร็จ → reset (เริ่มนับใหม่ในแมปใหม่)
          // fail → ไม่ reset noMonsterSince แต่ lastWarpFindAt คุม cooldown แล้ว ไม่ spam
        } else {
          log('⚠️ warpFind: ยังไม่รู้ชื่อแมป — รอ SELECT_CHAR/MAP_NAME');
        }
        return;
      }
      // wander — สุ่มเดิน ≤ walkStepDistance ช่องจากตำแหน่งปัจจุบัน
      //   ★ ถ้าเปิด navWanderUseNav และมีข้อมูลแมป → ใช้ waypoint graph (เดินต่อเนื่อง stateful)
      //   ★ navWander เป็น stateful: track target + arrival → เดินต่อทันทีไม่รอ cooldown
      //     ใช้ cooldown สั้น 400ms แทน wanderCooldownMs เพื่อความต่อเนื่อง
      //   ★★ GAT wander มีลำดับก่อน: มีตารางเดินได้ของแมป → เดินตามพื้นที่จริง (A*) ก่อน แล้วค่อย fallback nav ที่เรียนรู้
      const gatActive = CFG.gatWanderEnabled !== false && currentMap && gatCache.has(currentMap);
      const navCooldown = ((CFG.navWanderUseNav && navHasData()) || gatActive) ? 400 : CFG.wanderCooldownMs;
      if (CFG.wanderEnabled && now - lastWanderAt > navCooldown && player.x != null) {
        lastWanderAt = now;
        let moved = false;
        if (gatActive && gatWanderStep(now)) {
          moved = true;   // ★ GAT ก่อน — ground truth ครบทั้งแมป ไม่ต้องรอเรียนรู้
        }
        else if (CFG.navWanderUseNav) {
          // ★ เลือก mode: patrol (เดินตามลำดับ route) หรือ graph (wander สุ่ม)
          const wp = CFG.navWanderMode === 'patrol' ? navPatrol() : navWander();
          if (wp) {
            if (sendMove(wp.x, wp.y)) {
              // ★ log เฉพาะตอน target เปลี่ยน (กัน spam — move command ซ้ำปกติ 1 วิต่อครั้ง)
              const tag = Math.round(wp.x) + ',' + Math.round(wp.y);
              if (tag !== lastNavLogTag) {
                lastNavLogTag = tag;
                log(CFG.navWanderMode === 'patrol' ? '🔄 patrol @(' : '🗺️ nav wander @(', wp.x, wp.y + ')');
              }
              moved = true;
            }
          }
        }
        if (!moved) {
          // fallback: สุ่มเดิน ≤ walkStepDistance ช่อง
          const angle = Math.random() * Math.PI * 2;
          const step = 3 + Math.random() * Math.min(CFG.wanderMaxStep, CFG.walkStepDistance) - 3;
          const tx = player.x + Math.cos(angle) * step;
          const ty = player.y + Math.sin(angle) * step;
          if (sendMove(tx, ty)) log('🚶 สุ่มเดิน @(', Math.round(tx), Math.round(ty) + ') | จาก player(', player.x.toFixed(0), player.y.toFixed(0) + ') step=' + Math.round(step));
        }
      }
    }
  }, CFG.combatTickMs);

  // ============================================================
  //  ★★ GAT WALKABILITY — ตารางเดินได้ ground truth จากไฟล์ .gat ของแมป
  //    format: GRAT 1.2 · w×h · cell 20B = ความสูง4มุม + type(u32) · type 0=เดินได้
  //    moc_fild01 ฝังในตัว (RLE) · แมปอื่นดึงจาก GitHub maps-gat/<map>.json + cache localStorage
  //    ใช้กับ gatWander — เดินหามอนแบบธรรมชาติ รู้จุดเดินได้ทั้งแมปตั้งแต่วินาทีแรก (ไม่ต้องเรียนรู้)
  // ============================================================
  const GAT_KEY_PREFIX = 'roAssistGat_';
  const GAT_EMBED = { moc_fild01: { w: 400, h: 400, rle: '1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x45,0x86,1x159,0x61,1x48,0x1,1x45,0x84,1x161,0x60,1x49,0x1,1x46,0x78,1x1,0x2,1x163,0x48,1x1,0x10,1x50,0x1,1x46,0x74,1x1,0x3,1x1,0x1,1x163,0x49,1x1,0x10,1x50,0x1,1x46,0x7,1x2,0x70,1x164,0x60,1x50,0x1,1x46,0x7,1x2,0x70,1x163,0x49,1x1,0x10,1x51,0x1,1x46,0x8,1x2,0x66,1x1,0x1,1x58,0x15,1x91,0x60,1x51,0x1,1x46,0x6,1x4,0x68,1x58,0x17,1x88,0x52,1x2,0x8,1x50,0x1,1x46,0x6,1x2,0x68,1x1,0x1,1x58,0x6,1x1,0x5,1x1,0x1,1x2,0x1,1x86,0x10,1x1,0x54,1x49,0x1,1x45,0x10,1x2,0x67,1x58,0x8,1x2,0x2,1x1,0x1,1x2,0x2,1x83,0x67,1x49,0x1,1x45,0x10,1x2,0x67,1x23,5x5,1x2,0x12,1x17,0x7,1x2,0x4,1x2,0x2,1x54,0x8,1x20,0x10,1x1,0x57,1x49,0x1,1x44,0x80,1x23,5x7,0x5,1x1,0x6,1x19,0x2,1x1,0x8,1x2,0x3,1x52,0x10,1x18,0x70,1x48,0x1,1x44,0x79,1x24,5x7,0x2,1x2,0x8,1x21,0x3,1x2,0x4,1x2,0x4,1x51,0x10,1x18,0x71,1x47,0x1,1x43,0x78,1x24,0x2,5x8,0x11,1x22,0x2,1x2,0x4,1x2,0x7,1x48,0x11,1x16,0x75,1x44,0x1,1x41,0x3,1x1,0x74,1x26,0x2,5x9,0x10,1x22,0x8,1x2,0x14,1x40,0x12,1x16,0x78,1x41,0x1,1x39,0x2,1x2,0x1,1x1,0x73,1x27,0x2,5x10,0x10,1x22,0x7,1x2,0x8,1x2,0x4,1x39,0x14,1x14,0x80,1x40,0x1,1x33,0x8,1x2,0x74,1x27,0x3,5x11,0x9,1x22,0x17,1x2,0x2,1x1,0x2,1x36,0x17,1x10,0x83,1x40,0x1,1x31,0x86,1x26,0x6,5x10,0x9,1x22,0x15,1x1,0x7,1x34,0x22,1x6,0x85,1x39,0x1,1x30,0x15,1x2,0x70,1x24,0x6,1x1,0x2,5x10,0x8,1x22,0x2,1x1,0x2,1x2,0x17,1x32,0x14,1x1,0x99,1x39,0x1,1x29,0x87,1x23,0x8,1x1,0x6,5x7,0x8,1x21,0x2,1x1,0x2,1x2,0x18,1x30,0x116,1x38,0x1,1x28,0x88,1x22,0x16,5x7,0x9,1x20,0x26,1x9,0x1,1x19,0x12,1x1,0x93,1x2,0x4,1x2,0x3,1x37,0x1,1x27,0x90,1x20,0x11,1x2,0x2,5x8,0x13,1x17,0x27,1x6,0x3,1x19,0x12,1x1,0x2,1x1,0x90,1x2,0x12,1x34,0x1,1x25,0x93,1x19,0x8,1x1,0x5,5x8,0x15,1x16,0x36,1x18,0x16,1x1,0x93,1x2,0x16,1x27,0x1,1x23,0x95,1x18,0x12,5x10,0x17,1x16,0x29,1x1,0x4,1x18,0x111,1x2,0x16,1x27,0x1,1x22,0x13,1x2,0x81,1x18,0x12,5x9,0x18,1x15,0x34,1x17,0x117,1x1,0x13,1x27,0x1,1x22,0x11,1x7,0x79,1x16,0x12,5x9,0x20,1x13,0x34,5x1,1x15,0x19,1x1,0x113,1x27,0x1,1x22,0x9,1x10,0x79,1x14,0x13,5x8,0x21,1x12,0x32,1x1,0x1,5x8,0x28,1x1,0x36,1x1,0x71,1x32,0x1,1x22,0x8,1x12,0x81,1x10,0x44,1x10,0x2,1x2,0x6,1x2,0x23,5x8,0x65,1x1,0x61,1x2,0x6,1x34,0x1,1x22,0x7,1x13,0x15,1x2,0x20,5x1,0x98,1x7,0x4,1x2,0x6,1x2,0x23,5x8,0x5,1x2,0x126,1x36,0x1,1x22,0x7,1x14,0x138,1x2,0x39,5x8,0x5,1x1,0x126,1x37,0x1,1x22,0x7,1x14,0x17,1x2,0x160,5x8,0x131,1x38,0x1,1x22,0x6,1x16,0x35,1x3,0x55,1x1,0x84,5x11,0x4,1x2,0x122,1x38,0x1,1x49,0x9,1x1,0x78,1x1,0x85,5x12,0x125,1x39,0x1,1x51,0x174,5x11,0x124,1x39,0x1,1x53,0x173,5x10,0x124,1x39,0x1,1x54,0x6,1x1,0x166,5x10,0x123,1x39,0x1,1x54,0x66,5x1,0x31,5x2,0x74,5x9,0x123,1x39,0x1,1x54,0x65,1x2,0x26,5x8,0x74,5x9,0x123,1x38,0x1,1x55,0x64,1x2,0x27,5x8,0x74,5x26,0x106,1x37,0x1,1x56,0x92,5x9,0x45,1x1,0x28,5x27,0x72,5x1,0x31,1x37,0x1,1x65,0x80,1x1,0x3,5x9,0x74,5x27,0x70,1x1,0x32,1x37,0x1,1x68,0x79,1x1,0x2,5x9,0x74,5x27,0x101,1x38,0x1,1x69,0x78,1x1,0x4,5x8,0x74,5x26,0x101,1x1,0x2,1x35,0x1,1x70,0x83,5x8,0x5,1x1,0x64,1x2,0x2,5x25,0x107,1x32,0x1,1x70,0x84,5x8,0x44,1x2,0x23,1x2,0x3,5x25,0x115,1x23,0x1,1x71,0x83,5x8,0x1,1x2,0x41,1x2,0x21,1x1,0x7,5x25,0x15,1x1,0x98,1x23,0x1,1x71,0x83,5x15,1x2,0x61,1x2,0x2,1x2,0x13,1x1,0x2,5x8,0x15,1x1,0x98,1x23,0x1,1x72,0x82,5x17,0x37,5x1,0x21,1x1,0x5,1x2,0x15,5x8,0x15,1x2,0x98,1x23,0x1,1x72,0x83,5x17,0x33,5x1,0x24,1x1,0x21,5x9,0x15,1x2,0x98,1x23,0x1,1x71,0x85,5x17,0x78,5x10,0x115,1x23,0x1,1x71,0x85,5x18,0x76,5x10,0x116,1x23,0x1,1x71,0x86,5x18,0x74,5x11,0x116,1x23,0x1,1x70,0x88,5x18,0x72,5x10,0x117,1x24,0x1,1x69,0x89,5x19,0x70,5x10,0x106,1x1,0x9,1x26,0x1,1x67,0x15,1x2,0x86,5x8,0x68,5x8,0x117,1x28,0x1,1x65,0x16,1x1,0x1,1x2,0x86,5x8,0x67,5x8,0x111,1x1,0x4,1x29,0x1,1x38,0x8,1x18,0x108,5x8,0x66,5x8,0x115,1x30,0x1,1x38,0x9,1x17,0x97,1x1,0x1,1x2,0x7,5x9,0x65,5x8,0x110,1x2,0x3,1x30,0x1,1x38,0x9,1x16,0x109,5x10,0x64,5x8,0x4,1x2,0x101,1x2,0x1,1x2,0x3,1x30,0x1,1x38,0x10,1x15,0x110,5x10,1x1,0x59,1x2,0x1,5x8,0x4,1x2,0x109,1x30,0x1,1x38,0x10,1x14,0x102,1x2,0x8,5x9,0x5,1x2,0x53,1x2,0x1,5x8,0x107,1x38,0x1,1x38,0x7,1x1,0x3,1x12,0x116,5x7,0x4,1x2,0x56,5x8,0x105,1x40,0x1,1x38,0x13,1x8,0x2,1x2,0x115,5x7,0x61,5x8,0x103,1x42,0x1,1x37,0x16,1x5,0x3,1x2,0x115,5x8,1x2,0x2,1x1,0x43,5x19,0x103,1x43,0x1,1x36,0x10,1x2,0x130,5x8,1x2,0x2,1x9,0x6,1x2,0x27,5x19,0x102,1x44,0x1,1x35,0x11,1x2,0x2,1x1,0x127,1x24,0x32,5x18,0x103,1x44,0x1,1x33,0x140,1x30,0x32,5x17,0x101,1x1,0x1,1x44,0x1,1x31,0x30,1x1,0x109,1x33,0x32,5x15,0x102,1x46,0x1,1x30,0x139,1x35,0x34,5x10,0x106,1x45,0x1,1x30,0x138,1x37,0x34,5x8,0x107,1x45,0x1,1x30,0x138,1x37,0x148,1x46,0x1,1x30,0x4,1x2,0x131,1x39,0x147,1x46,0x1,1x30,0x137,1x44,0x145,1x43,0x1,1x30,0x2,1x2,0x132,1x48,0x143,1x42,0x1,1x30,0x2,1x2,0x131,1x50,0x143,1x41,0x1,1x30,0x32,1x1,0x2,1x1,0x97,1x53,0x145,1x38,0x1,1x30,0x32,1x1,0x98,1x55,0x146,1x37,0x1,1x30,0x33,1x1,0x96,1x57,0x33,1x2,0x110,1x37,0x1,1x29,0x131,1x57,0x68,1x1,0x53,5x1,0x22,1x37,0x1,1x29,0x33,1x1,0x86,1x2,0x8,1x59,0x12,5x9,0x98,1x2,0x23,1x37,0x1,1x28,0x37,1x1,0x92,1x60,0x11,5x9,0x45,5x2,0x77,1x37,0x1,1x27,0x131,1x60,0x9,5x11,0x111,1x2,0x11,1x37,0x1,1x25,0x133,1x62,0x6,5x11,0x112,1x2,0x11,1x37,0x1,1x23,0x136,1x59,0x4,1x1,0x2,5x11,0x126,1x37,0x1,1x22,0x12,1x1,0x124,1x59,0x1,1x1,0x2,1x1,0x1,5x9,0x118,1x1,0x9,1x38,0x1,1x22,0x9,1x2,0x127,1x58,0x1,1x4,5x7,0x6,1x2,0x2,1x1,0x18,1x2,0x86,1x1,0x11,1x40,0x1,1x22,0x10,1x1,0x61,1x1,0x65,1x65,5x5,0x10,1x1,0x18,1x2,0x1,1x2,0x68,1x1,0x24,1x42,0x1,1x22,0x139,1x82,0x113,1x43,0x1,1x31,0x131,1x82,0x87,1x1,0x23,1x44,0x1,1x34,0x36,5x2,0x93,1x80,0x86,1x1,0x23,1x44,0x1,1x35,0x130,1x80,0x110,1x44,0x1,1x36,0x135,1x75,0x108,1x45,0x1,1x36,0x135,1x75,0x99,1x54,0x1,1x37,0x135,1x74,0x97,1x56,0x1,1x37,0x135,1x74,0x95,1x58,0x1,1x38,0x135,1x73,0x94,1x59,0x1,1x38,0x135,1x73,0x93,1x60,0x1,1x38,0x139,1x69,0x24,5x1,0x68,1x60,0x1,1x37,0x141,1x68,0x93,1x60,0x1,1x37,0x137,1x2,0x2,1x68,0x22,1x1,0x69,1x61,0x1,1x36,0x138,1x2,0x2,1x68,0x92,1x61,0x1,1x35,0x143,1x67,0x93,1x61,0x1,1x33,0x145,1x66,0x94,1x61,0x1,1x31,0x147,1x65,0x96,1x60,0x1,1x30,0x149,1x62,0x98,1x60,0x1,1x30,0x150,1x60,0x100,1x59,0x1,1x30,0x5,1x1,0x144,1x59,0x101,1x59,0x1,1x30,0x4,1x2,0x145,1x57,0x103,1x58,0x1,1x30,0x153,1x55,0x104,1x57,0x1,1x30,0x155,1x52,0x108,1x54,0x1,1x39,0x34,5x2,0x119,1x43,0x108,1x54,0x1,1x42,0x31,5x2,0x119,1x42,0x109,1x54,0x1,1x43,0x30,5x2,0x118,1x43,0x109,1x54,0x1,1x44,0x147,1x44,0x113,1x51,0x1,1x44,0x145,1x44,0x115,1x51,0x1,1x45,0x143,1x42,0x119,1x50,0x1,1x45,0x142,1x29,0x133,1x50,0x1,1x46,0x141,1x32,0x3,1x2,0x126,1x49,0x1,1x53,0x131,1x2,0x1,1x33,0x2,1x2,0x136,1x39,0x1,1x56,0x130,1x35,0x2,1x1,0x49,5x1,0x79,1x1,0x6,1x39,0x1,1x57,0x125,1x2,0x2,1x36,0x1,1x2,0x128,1x1,0x2,1x2,0x2,1x39,0x1,1x58,0x124,1x2,0x2,1x39,0x47,1x2,0x82,1x2,0x2,1x39,0x1,1x58,0x128,1x37,0x138,1x38,0x1,1x59,0x127,1x37,0x139,1x37,0x1,1x59,0x13,1x2,0x112,1x37,0x139,1x37,0x1,1x60,0x10,1x1,0x115,1x37,0x140,1x36,0x1,1x60,0x13,1x1,0x112,1x37,0x141,1x35,0x1,1x60,0x13,1x1,0x112,1x37,0x15,1x1,0x126,1x34,0x1,1x60,0x10,1x1,0x115,1x36,0x16,1x1,0x126,1x1,0x2,1x31,0x1,1x60,0x10,1x1,0x115,1x35,0x147,1x31,0x1,1x60,0x126,1x32,0x150,1x31,0x1,1x59,0x127,1x31,0x152,1x30,0x1,1x59,0x128,1x25,0x158,1x29,0x1,1x58,0x130,1x24,0x144,1x2,0x12,1x29,0x1,1x58,0x131,1x23,0x144,1x2,0x14,1x27,0x1,1x57,0x135,1x20,0x161,1x26,0x1,1x55,0x135,1x2,0x1,1x19,0x143,1x2,0x23,1x19,0x1,1x53,0x141,1x18,0x143,1x2,0x23,1x19,0x1,1x52,0x119,1x2,0x22,1x16,0x52,5x1,0x116,1x19,0x1,1x51,0x144,1x16,0x169,1x19,0x1,1x51,0x121,1x2,0x22,1x14,0x52,1x2,0x116,1x19,0x1,1x51,0x145,1x13,0x96,5x1,0x74,1x19,0x1,1x50,0x132,1x1,0x14,1x10,0x2,1x2,0x93,1x1,0x75,1x19,0x1,1x49,0x151,1x7,0x173,1x19,0x1,1x47,0x49,1x1,0x283,1x19,0x1,1x45,0x51,1x1,0x283,1x19,0x1,1x31,0x349,1x19,0x1,1x30,0x107,1x2,0x241,1x19,0x1,1x29,0x66,1x2,0x283,1x19,0x1,1x29,0x66,1x2,0x283,1x19,0x1,1x28,0x352,1x19,0x1,1x27,0x6,1x1,0x2,1x1,0x343,1x19,0x1,1x25,0x4,1x1,0x350,1x19,0x1,1x24,0x5,1x1,0x350,1x19,0x1,1x23,0x48,1x1,0x308,1x19,0x1,1x22,0x358,1x19,0x1,1x22,0x7,1x2,0x135,1x2,0x180,1x2,0x30,1x19,0x1,1x22,0x7,1x2,0x135,1x2,0x63,1x2,0x1,1x1,0x113,1x2,0x30,1x19,0x1,1x22,0x198,1x1,0x13,1x1,0x138,1x26,0x1,1x22,0x207,1x2,0x115,1x1,0x25,1x27,0x1,1x22,0x210,1x2,0x112,1x1,0x24,1x28,0x1,1x22,0x8,1x1,0x339,1x29,0x1,1x27,0x16,1x4,0x323,1x29,0x1,1x29,0x8,1x1,0x4,1x7,0x159,1x2,0x159,1x30,0x1,1x31,0x9,1x11,0x157,1x2,0x159,1x30,0x1,1x32,0x7,1x13,0x159,1x1,0x156,1x31,0x1,1x32,0x3,1x1,0x2,1x14,0x125,1x2,0x80,5x1,0x108,1x31,0x1,1x33,0x2,1x1,0x1,1x16,0x140,1x2,0x20,1x1,0x43,1x2,0x105,1x33,0x1,1x33,0x4,1x16,0x132,1x2,0x6,1x2,0x23,1x2,0x39,1x2,0x103,1x35,0x1,1x34,0x2,1x18,0x124,1x1,0x184,1x36,0x1,1x54,0x120,1x1,0x3,1x2,0x182,1x37,0x1,1x54,0x307,1x38,0x1,1x54,0x121,1x1,0x41,1x1,0x143,1x38,0x1,1x54,0x121,1x1,0x4,1x1,0x36,1x2,0x141,1x39,0x1,1x54,0x264,1x2,0x19,1x2,0x14,1x1,0x4,1x39,0x1,1x54,0x139,1x2,0x8,1x2,0x7,1x2,0x104,1x2,0x1,1x2,0x14,1x7,0x16,1x39,0x1,1x54,0x139,1x2,0x8,1x2,0x7,1x2,0x1,1x1,0x11,5x1,0x93,1x2,0x1,1x2,0x9,1x10,0x13,1x41,0x1,1x54,0x127,1x2,0x43,1x2,0x106,1x12,0x12,1x41,0x1,1x55,0x127,1x1,0x150,1x13,0x14,1x39,0x1,1x58,0x151,1x2,0x3,1x2,0x105,1x2,0x10,1x14,0x10,1x2,0x1,1x39,0x1,1x59,0x274,1x15,0x12,1x39,0x1,1x60,0x35,5x1,0x236,1x16,0x10,1x41,0x1,1x60,0x33,1x2,0x237,1x16,0x8,1x43,0x1,1x61,0x130,1x1,0x140,1x16,0x7,1x44,0x1,1x62,0x270,1x16,0x6,1x45,0x1,1x62,0x127,1x2,0x17,1x2,0x122,1x16,0x5,1x46,0x1,1x62,0x143,1x1,0x126,1x16,0x5,1x46,0x1,1x62,0x270,1x16,0x4,1x47,0x1,1x62,0x129,1x1,0x16,1x1,0x123,1x16,0x4,1x47,0x1,1x62,0x141,1x2,0x127,1x16,0x5,1x46,0x1,1x64,0x139,1x2,0x127,1x16,0x5,1x46,0x1,1x66,0x267,1x14,0x7,1x45,0x1,1x67,0x266,1x14,0x8,1x44,0x1,1x68,0x266,1x13,0x9,1x43,0x1,1x68,0x266,1x12,0x11,1x42,0x1,1x69,0x266,1x10,0x14,1x40,0x1,1x69,0x268,1x6,0x26,1x30,0x1,1x70,0x9,1x1,0x259,1x2,0x28,1x30,0x1,1x40,0x6,1x24,0x279,1x2,0x1,1x1,0x16,1x30,0x1,1x39,0x8,1x22,0x278,1x6,0x17,1x29,0x1,1x28,5x5,1x7,0x7,1x22,0x277,1x8,0x17,1x28,0x1,1x28,5x7,1x1,0x12,1x21,0x276,1x10,0x17,1x27,0x1,1x28,5x6,0x8,1x2,0x4,1x20,0x276,1x12,0x13,1x2,0x2,1x26,0x1,1x27,5x4,0x11,1x2,0x5,1x18,0x122,5x1,0x153,1x14,0x12,1x2,0x4,1x24,0x1,1x27,5x3,0x16,1x1,0x3,1x15,0x122,1x2,0x154,1x14,0x19,1x23,0x1,1x27,5x2,0x24,1x10,0x124,1x2,0x153,1x16,0x14,1x1,0x3,1x23,0x1,1x27,5x2,0x15,1x1,0x19,1x2,0x275,1x17,0x13,1x2,0x3,1x23,0x1,1x27,5x2,0x18,1x1,0x6,1x1,0x5,1x2,0x277,1x19,0x18,1x23,0x1,1x27,5x3,0x19,1x2,0x3,1x1,0x8,1x2,0x272,1x21,0x8,1x33,0x1,1x28,5x3,0x18,1x2,0x12,1x2,0x272,1x21,0x7,1x34,0x1,1x28,5x3,0x21,1x1,0x283,1x22,0x6,1x35,0x1,1x27,5x3,0x305,1x23,0x5,1x36,0x1,1x27,5x3,0x305,1x23,0x4,1x37,0x1,1x26,5x3,0x305,1x24,0x3,1x38,0x1,1x26,5x2,0x18,1x2,0x286,1x24,0x3,1x38,0x1,1x26,5x2,0x18,1x2,0x287,1x22,0x3,1x39,0x1,1x26,5x2,0x12,1x1,0x19,1x1,0x274,1x22,0x3,1x39,0x1,1x26,5x2,0x31,1x2,0x233,1x1,0x41,1x20,0x5,1x38,0x1,1x25,5x2,0x298,1x1,0x11,1x18,0x6,1x38,0x1,1x24,5x3,0x13,1x1,0x252,1x2,0x43,1x16,0x8,1x37,0x1,1x24,5x3,0x312,1x14,0x10,1x36,0x1,1x23,5x4,0x183,1x1,0x109,1x1,0x20,1x10,0x13,1x35,0x1,1x23,5x3,0x326,1x1,0x12,1x34,0x1,1x22,5x4,0x184,5x1,0x111,1x1,0x44,1x32,0x1,1x22,5x11,1x1,0x79,1x3,0x112,5x1,0x139,1x31,0x1,1x22,0x125,1x2,0x4,1x2,0x213,1x31,0x1,1x22,0x119,1x2,0x4,1x2,0x4,1x2,0x83,1x1,0x82,1x1,0x46,1x31,0x1,1x22,0x110,1x2,0x2,1x2,0x3,1x2,0x4,1x2,0x4,1x2,0x4,1x2,0x77,1x1,0x125,1x1,0x4,1x30,0x1,1x22,5x11,1x1,0x94,1x2,0x2,1x2,0x2,1x2,0x21,1x2,0x4,1x2,0x202,1x30,0x1,1x22,5x4,0x99,1x2,0x1,1x2,0x35,1x2,0x2,1x2,0x4,1x3,0x146,1x1,0x45,1x29,0x1,1x22,5x4,0x99,1x2,0x42,1x2,0x67,1x1,0x132,1x28,0x1,1x22,5x4,0x148,5x1,0x190,1x1,0x6,1x27,0x1,1x22,5x4,0x347,1x26,0x1,1x23,5x3,0x349,1x24,0x1,1x23,5x3,0x336,1x1,0x4,1x1,0x8,1x23,0x1,1x23,5x3,0x12,1x2,0x85,1x2,0x42,1x2,0x51,1x1,0x142,1x5,0x6,1x23,0x1,1x25,5x2,0x11,1x2,0x85,1x2,0x1,1x2,0x35,1x2,0x2,1x2,0x51,1x1,0x136,1x2,0x3,1x8,0x4,1x23,0x1,1x25,5x4,0x99,1x2,0x2,1x2,0x2,1x2,0x21,1x2,0x4,1x2,0x72,1x1,0x123,1x10,0x3,1x23,0x1,1x25,5x4,0x103,1x2,0x2,1x2,0x3,1x2,0x4,1x2,0x4,1x2,0x4,1x2,0x201,1x12,0x2,1x23,0x1,1x25,5x2,0x9,1x3,0x102,1x2,0x4,1x2,0x4,1x2,0x72,1x2,0x132,1x14,0x1,1x23,0x1,1x25,5x2,0x6,1x6,0x108,1x2,0x4,1x2,0x72,1x2,0x132,1x14,0x1,1x23,0x1,1x24,5x3,0x6,1x5,0x199,1x1,0x122,1x39,0x1,1x24,5x2,0x6,1x3,0x11,1x1,0x312,1x40,0x1,1x24,5x2,0x6,1x1,0x194,1x1,0x99,1x2,0x28,1x42,0x1,1x24,5x2,0x301,1x2,0x27,1x43,0x1,1x24,5x3,0x15,1x2,0x2,1x2,0x307,1x44,0x1,1x25,5x2,0x15,1x2,0x2,1x2,0x2,1x1,0x303,1x45,0x1,1x26,5x2,0x7,5x2,0x288,1x2,0x26,1x46,0x1,1x26,5x3,0x5,5x3,0x10,1x2,0x13,1x2,0x289,1x46,0x1,1x28,5x3,0x3,5x3,0x4,1x2,0x4,1x2,0x10,1x2,0x1,1x2,0x256,1x2,0x30,1x47,0x1,1x28,5x8,1x5,0x5,1x4,0x149,5x1,0x152,1x47,0x1,1x29,5x5,1x8,0x2,1x7,0x147,1x1,0x124,1x2,0x28,1x46,0x1,1x42,0x1,1x9,0x146,1x1,0x124,1x2,0x28,1x46,0x1,1x53,0x301,1x45,0x1,1x53,0x302,1x44,0x1,1x54,0x302,1x43,0x1,1x55,0x298,1x1,0x3,1x42,0x1,1x55,0x76,5x2,0x227,1x39,0x1,1x57,0x68,5x8,0x222,1x2,0x10,1x32,0x1,1x59,0x66,5x2,0x8,1x2,0x218,1x2,0x8,1x34,0x1,1x60,0x65,5x2,0x8,1x2,0x227,1x35,0x1,1x61,0x64,5x2,0x8,1x2,0x134,5x2,0x89,1x37,0x1,1x61,0x64,5x2,0x144,5x2,0x88,1x38,0x1,1x61,0x3,1x2,0x295,1x38,0x1,1x62,0x2,1x2,0x60,5x3,0x231,1x39,0x1,1x62,0x64,5x6,0x225,1x1,0x2,1x39,0x1,1x62,0x298,1x39,0x1,1x62,0x298,1x39,0x1,1x61,0x5,1x2,0x292,1x39,0x1,1x61,0x299,1x39,0x1,1x60,0x78,5x2,0x217,1x2,0x1,1x39,0x1,1x59,0x3,1x2,0x73,1x3,0x221,1x38,0x1,1x58,0x4,1x2,0x298,1x37,0x1,1x56,0x306,1x37,0x1,1x38,0x172,1x1,0x152,1x36,0x1,1x37,0x327,1x35,0x1,1x37,0x314,1x1,0x13,1x34,0x1,1x36,0x312,1x2,0x13,1x2,0x2,1x32,0x1,1x35,0x313,1x2,0x9,1x1,0x3,1x2,0x4,1x30,0x1,1x34,0x321,1x2,0x12,1x30,0x1,1x33,0x322,1x2,0x13,1x29,0x1,1x31,0x13,1x1,0x321,1x2,0x2,1x29,0x1,1x30,0x9,1x1,0x1,1x2,0x328,1x28,0x1,1x30,0x342,1x27,0x1,1x30,0x53,1x2,0x288,1x26,0x1,1x30,0x345,1x24,0x1,1x30,0x55,5x1,0x290,1x23,0x1,1x30,0x3,1x1,0x337,1x2,0x3,1x23,0x1,1x30,0x3,1x1,0x340,1x25,0x1,1x30,0x259,1x1,5x1,0x82,1x26,0x1,1x31,0x341,1x27,0x1,1x32,0x339,1x28,0x1,1x34,0x36,1x2,0x295,1x2,0x1,1x29,0x1,1x35,0x35,1x2,0x298,1x29,0x1,1x36,0x3,1x1,0x329,1x30,0x1,1x37,0x331,1x31,0x1,1x37,0x3,1x1,0x326,1x32,0x1,1x37,0x199,1x1,0x128,1x34,0x1,1x38,0x326,1x35,0x1,1x38,0x325,1x36,0x1,1x38,0x308,1x2,0x14,1x37,0x1,1x38,0x146,5x1,0x22,1x2,0x124,1x1,0x12,1x2,0x13,1x38,0x1,1x38,0x169,1x2,0x20,1x2,0x6,1x2,0x122,1x38,0x1,1x38,0x10,1x1,0x132,1x2,0x46,1x2,0x6,1x2,0x9,1x1,0x111,1x39,0x1,1x38,0x7,1x1,0x289,1x1,0x24,1x39,0x1,1x38,0x261,1x1,0x34,1x2,0x12,1x1,0x11,1x39,0x1,1x39,0x206,1x1,0x53,1x1,0x60,1x39,0x1,1x41,0x10,1x1,0x193,1x1,0x98,1x1,0x15,1x39,0x1,1x42,0x6,1x1,0x58,1x1,0x25,5x1,0x114,1x1,0x111,1x39,0x1,1x43,0x61,1x2,0x27,5x1,0x86,1x2,0x2,1x2,0x134,1x39,0x1,1x44,0x60,1x2,0x114,1x2,0x2,1x2,0x9,1x1,0x65,1x2,0x57,1x39,0x1,1x45,0x7,1x1,0x36,1x2,0x11,1x2,0x131,1x1,0x57,1x2,0x65,1x39,0x1,1x45,0x248,1x2,0x65,1x39,0x1,1x46,0x196,1x2,0x117,1x38,0x1,1x46,0x4,1x1,0x310,1x38,0x1,1x46,0x48,1x2,0x122,1x1,0x9,1x1,0x133,1x37,0x1,1x46,0x49,1x2,0x121,1x1,0x9,1x1,0x134,1x36,0x1,1x46,0x49,1x2,0x35,1x2,0x97,1x2,0x128,1x2,0x1,1x35,0x1,1x46,0x319,1x34,0x1,1x46,0x57,1x1,0x263,1x32,0x1,1x46,0x22,1x1,0x34,1x1,0x253,1x2,0x9,1x31,0x1,1x45,0x4,1x1,0x18,1x1,0x20,1x2,0x9,1x2,0x152,1x2,0x45,1x1,0x66,1x31,0x1,1x45,0x44,1x2,0x9,1x2,0x152,1x2,0x106,1x1,0x5,1x31,0x1,1x44,0x41,1x2,0x73,1x1,0x207,1x31,0x1,1x43,0x24,1x1,0x17,1x2,0x5,1x2,0x46,1x2,0x139,1x2,0x85,1x31,0x1,1x42,0x98,1x1,0x1,1x2,0x82,1x2,0x23,1x1,0x116,1x31,0x1,1x40,0x48,1x2,0x136,1x2,0x140,1x31,0x1,1x39,0x100,1x1,0x140,1x1,0x84,1x1,0x2,1x31,0x1,1x30,0x335,1x1,0x2,1x31,0x1,1x30,0x339,1x30,0x1,1x30,0x8,1x2,0x329,1x30,0x1,1x30,0x8,1x2,0x329,1x30,0x1,1x30,0x289,1x10,0x40,1x30,0x1,1x30,0x5,1x1,0x281,1x14,0x41,1x27,0x1,1x30,0x9,1x1,0x276,1x16,0x41,1x26,0x1,1x30,0x9,1x1,0x275,1x18,0x42,1x24,0x1,1x30,0x71,1x2,0x211,1x20,0x42,1x23,0x1,1x29,0x4,1x1,0x144,1x2,0x133,1x22,0x41,1x23,0x1,1x29,0x69,1x2,0x81,1x2,0x130,1x22,0x41,1x23,0x1,1x29,0x69,1x2,0x3,1x1,0x70,1x1,0x1,1x2,0x3,1x2,0x11,1x2,0x116,1x24,0x40,1x23,0x1,1x28,0x146,1x10,0x10,1x2,0x116,1x29,0x35,1x23,0x1,1x27,0x146,1x14,0x125,1x31,0x33,1x23,0x1,1x26,0x63,1x18,0x65,1x16,0x110,1x2,0x12,1x33,0x1,1x1,0x2,1x2,0x21,1x2,0x2,1x23,0x1,1x24,0x56,1x2,0x5,1x21,0x63,1x18,0x112,1x2,0x9,1x33,0x4,1x2,0x25,1x23,0x1,1x23,0x57,1x2,0x3,1x25,0x60,1x20,0x81,1x2,0x28,1x2,0x9,1x33,0x31,1x23,0x1,1x23,0x61,1x27,0x58,1x22,0x77,1x2,0x42,1x34,0x7,1x2,0x18,1x26,0x1,1x22,0x61,1x29,0x57,1x22,0x77,1x2,0x4,1x9,0x14,1x2,0x4,1x44,0x6,1x2,0x17,1x27,0x1,1x22,0x7,1x1,0x53,1x30,0x55,1x24,0x79,1x14,0x12,1x2,0x2,1x47,0x1,1x2,0x20,1x28,0x1,1x23,0x40,1x1,0x10,1x1,0x2,1x2,0x3,1x31,0x30,1x2,0x23,1x29,0x72,1x17,0x14,1x48,0x22,1x29,0x1,1x25,0x55,1x34,0x3,1x2,0x27,1x1,0x21,1x31,0x70,1x18,0x12,1x49,0x6,1x1,0x14,1x30,0x1,1x26,0x34,1x2,0x11,1x42,0x3,1x1,0x20,1x9,0x20,1x32,0x68,1x20,0x10,1x50,0x21,1x30,0x1,1x27,0x33,1x2,0x3,1x1,0x5,1x46,0x17,1x1,0x2,1x12,0x16,1x36,0x66,1x22,0x8,1x51,0x20,1x31,0x1,1x28,0x37,1x2,0x3,1x48,0x18,1x14,0x13,1x1,0x3,1x35,0x65,1x22,0x8,1x58,0x13,1x31,0x1,1x29,0x40,1x50,0x14,1x18,0x12,1x1,0x2,1x36,0x64,1x24,0x6,1x60,0x12,1x31,0x1,1x29,0x33,1x1,0x5,1x52,0x13,1x19,0x11,1x40,0x62,1x93,0x10,1x31,0x1,1x30,0x37,1x54,0x10,1x1,0x1,1x20,0x10,1x41,0x59,1x96,0x9,1x31,0x1,1x37,0x29,1x55,0x10,1x1,0x1,1x20,0x9,1x50,0x2,1x2,0x3,1x2,0x41,1x98,0x8,1x31,0x1,1x39,0x26,1x57,0x10,1x22,0x7,1x52,0x1,1x2,0x3,1x2,0x40,1x99,0x5,1x1,0x2,1x31,0x1,1x40,0x7,1x2,0x15,1x90,0x7,1x53,0x46,1x101,0x7,1x31,0x1,1x41,0x22,1x91,0x6,1x55,0x42,1x2,0x1,1x139,0x1,1x42,0x20,1x154,0x43,1x140,0x1,1x43,0x18,1x156,0x2,1x1,0x31,1x1,0x6,1x141,0x1,1x44,0x4,1x2,0x10,1x157,0x6,1x1,0x31,1x1,0x2,1x141,0x1,1x46,0x2,1x2,0x9,1x159,0x5,1x1,0x34,1x141,0x1,1x52,0x7,1x159,0x40,1x141,0x1,1x53,0x5,1x162,0x38,1x141,0x1,1x54,0x4,1x162,0x38,1x141,0x1,1x55,0x3,1x341,0x1,1x55,0x3,1x341,0x1,1x56,0x3,1x340,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x1,1x399,0x401' } };
  const gatCache = new Map();       // mapName -> {w, h, cells: Uint8Array} (cells=0 เดินได้)
  const gatFetchTried = new Set();
  function gatDecode(w, h, rle) {
    const cells = new Uint8Array(w * h);
    let i = 0;
    for (const part of rle.split(',')) {
      const xi = part.indexOf('x');
      cells.fill(+part.slice(0, xi), i, i + (+part.slice(xi + 1)));
      i += +part.slice(xi + 1);
    }
    return cells;
  }
  function gatRegister(mapName, d) {
    if (!mapName || !d || !d.w || !d.h || !d.rle) return;
    try { gatCache.set(mapName, { w: d.w, h: d.h, cells: gatDecode(d.w, d.h, d.rle) }); } catch (e) {}
  }
  for (const m of Object.keys(GAT_EMBED)) gatRegister(m, GAT_EMBED[m]);
  async function gatLoad(mapName) {
    if (!mapName || gatCache.has(mapName) || gatFetchTried.has(mapName)) return;
    gatFetchTried.add(mapName);
    try {
      const raw = localStorage.getItem(GAT_KEY_PREFIX + mapName);
      if (raw) { gatRegister(mapName, JSON.parse(raw)); return; }
      const res = await fetch(ASSET_RAW.replace('ro-rebuild-web-assist.user.js', 'maps-gat/' + mapName + '.json'));
      if (!res.ok) return;
      const d = await res.json();
      gatRegister(mapName, d);
      try { localStorage.setItem(GAT_KEY_PREFIX + mapName, JSON.stringify(d)); } catch (e) {}
      log('🗺️ GAT:', mapName, 'โหลดแล้ว (' + d.w + '×' + d.h + ')');
    } catch (e) {}
  }
  setInterval(() => { if (currentMap && !gatCache.has(currentMap)) gatLoad(currentMap); }, 5000);
  // ★ calibration แกน y — ตำแหน่งที่ยืน/เดินอยู่จริงต้องเป็นช่องเดินได้เสมอ
  //   เก็บสถิติทั้งแบบปกติ/flip-y 20 ตัวอย่าง แล้วล็อกข้างที่ถูก (tie = ปกติ)
  let gatFlipY = false, gatFlipLocked = false, gatCalN = 0, gatCalNormal = 0, gatCalFlip = 0;
  setInterval(() => {
    if (!currentMap || player.x == null) return;
    const g = gatCache.get(currentMap);
    if (!g) return;
    const gx = Math.round(player.x), gy = Math.round(player.y);
    if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return;
    if (g.cells[gy * g.w + gx] === 0) gatCalNormal++;
    if (g.cells[(g.h - 1 - gy) * g.w + gx] === 0) gatCalFlip++;
    gatCalN++;
    if (gatCalN >= 20 && !gatFlipLocked) {
      gatFlipLocked = true;
      gatFlipY = gatCalFlip > gatCalNormal;
      log('🗺️ GAT calibration:', gatFlipY ? 'แกน y กลับด้าน' : 'พิกัดตรงปกติ', '(ตำแหน่งตรงช่องเดินได้', Math.max(gatCalNormal, gatCalFlip) + '/' + gatCalN + ')');
    }
  }, 2000);
  function gatWalkable(x, y) {
    const g = currentMap && gatCache.get(currentMap);
    if (!g) return null;
    const gx = Math.round(x), gy = Math.round(y);
    if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return false;
    return g.cells[(gatFlipY ? g.h - 1 - gy : gy) * g.w + gx] === 0;
  }
  // เส้นตรงเดินได้ตลอดไหม (sample ทุกครึ่งช่อง) — ใช้เลือก stride ยาวธรรมชาติ
  function gatLineWalkable(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      if (!gatWalkable(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
    }
    return true;
  }
  // ★ A* บนกริด — 8 ทิศ · เดินทแยงเฉพาะเมื่อแขนงทั้งสองเดินได้ (กันตัดมุมกำแพง)
  //   คืน waypoints จุดเลี้ยวอย่างเดียว (ทิศเปลี่ยน) — เส้นทางสั้น ส่ง move น้อยครั้ง
  function gatFindPath(tx, ty, maxExpand) {
    const g = currentMap && gatCache.get(currentMap);
    if (!g || player.x == null) return null;
    maxExpand = maxExpand || 15000;
    const sx = Math.round(player.x), sy = Math.round(player.y);
    const W = g.w, H = g.h;
    const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g.cells[(gatFlipY ? H - 1 - y : y) * W + x] === 0;
    if (!walk(sx, sy) || !walk(tx, ty)) return null;
    const idx = (x, y) => y * W + x;
    const came = new Int32Array(W * H).fill(-1);
    const gsc = new Float64Array(W * H).fill(Infinity);
    const closed = new Uint8Array(W * H);
    const heap = [];
    const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let l = c * 2 + 1, r = l + 1, m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; const t = heap[m]; heap[m] = heap[c]; heap[c] = t; c = m; } } return top; };
    const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
    const startI = idx(sx, sy), goalI = idx(tx, ty);
    gsc[startI] = 0;
    push(Math.hypot(tx - sx, ty - sy), startI);
    let expanded = 0, found = false;
    while (heap.length && expanded < maxExpand) {
      const ci = pop()[1];
      if (closed[ci]) continue;
      closed[ci] = 1; expanded++;
      if (ci === goalI) { found = true; break; }
      const cx = ci % W, cy = (ci / W) | 0;
      for (let di = 0; di < 8; di++) {
        const dx = DIRS[di][0], dy = DIRS[di][1];
        const nx = cx + dx, ny = cy + dy;
        if (!walk(nx, ny)) continue;
        if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        if (closed[ni]) continue;
        const ng = gsc[ci] + DIRS[di][2];
        if (ng < gsc[ni]) { gsc[ni] = ng; came[ni] = ci; push(ng + Math.hypot(tx - nx, ty - ny), ni); }
      }
    }
    if (!found) return null;
    const pts = [];
    let cur = goalI;
    while (cur !== -1) { pts.push({ x: cur % W, y: (cur / W) | 0 }); cur = came[cur]; }
    pts.reverse();
    const simp = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p0 = simp[simp.length - 1], p1 = pts[i - 1], p2 = pts[i];
      if ((p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x) !== 0) simp.push(p2);   // ทิศเปลี่ยน = จุดเลี้ยว
    }
    return simp;
  }
  // ★★ GAT wander — เดินหามอนตามพื้นที่เดินได้จริง: สุ่มเป้าใน 15-60 ช่อง → A* → เดินตามจุดเลี้ยว
  //    ถึงเป้าแล้วเลือกใหม่ทันที (เดินต่อเนื่องเป็นธรรมชาติ) · stuck 6s / timeout 25s → เป้าใหม่
  //    ★★ ทิศแบบคน: มุ่งทิศหลัก 8 ทิศไประยะหนึ่ง (60-150 ช่อง) แล้วค่อยเลี้ยว 45-135° (ไม่ย้อนกลับ 180°)
  //      เหมือนกวาดพื้นที่ไปทางเดียวก่อน แล้วค่อยเปลี่ยนฝั่ง — ไม่สุ่มไปมาสับสน
  let gatWTarget = null, gatWPath = null, gatWPathIdx = 0, gatWTargetAt = 0;
  let gatWLastPos = null, gatWStuckSince = 0, gatWLastMoveAt = 0, gatWLogTag = '';
  let gatWDir = null, gatWDirDist = 0;
  function gatNewHeading() {
    const old = gatWDir == null ? Math.floor(Math.random() * 8) : ((Math.round(gatWDir / (Math.PI / 4)) % 8) + 8) % 8;
    const turn = [1, -1, 2, -2, 3, -3][Math.floor(Math.random() * 6)];   // เลี้ยว 45°/90°/135° — ไม่ย้อนกลับ
    gatWDir = (((old + turn) % 8 + 8) % 8) * (Math.PI / 4);
    gatWDirDist = 60 + Math.random() * 90;
  }
  function gatWanderReset() { gatWTarget = null; gatWPath = null; gatWPathIdx = 0; gatWLogTag = ''; }
  function gatPickTarget() {
    if (gatWDir == null || gatWDirDist <= 0) gatNewHeading();
    for (let tries = 0; tries < 20; tries++) {
      // 12 ครั้งแรก: กรวย ±40° รอบทิศหลัก ระยะ 25-70 ช่อง (กวาดแนว) · 8 ครั้งหลัง: สุ่มทุกทิศ (ทางตรงไปไม่ได้ → อ้อม)
      const ang = tries < 12 ? gatWDir + (Math.random() * 2 - 1) * 0.7 : Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 45;
      const tx = Math.round(player.x + Math.cos(ang) * r), ty = Math.round(player.y + Math.sin(ang) * r);
      if (!gatWalkable(tx, ty)) continue;
      const path = gatFindPath(tx, ty);
      if (path && path.length > 1) {
        gatWTarget = { x: tx, y: ty }; gatWPath = path; gatWPathIdx = 0;
        gatWTargetAt = nowMs(); gatWLogTag = '';
        gatWDirDist -= r;
        return true;
      }
    }
    gatNewHeading();   // ทิศนี้ไปไม่ได้จริง → เปลี่ยนทิศ
    return false;
  }
  function gatWanderStep(now) {
    if (!currentMap || player.x == null || !gatCache.has(currentMap)) return false;
    const ARRIVE = 2.5;
    if (gatWLastPos) {
      const pd2 = (player.x - gatWLastPos.x) * (player.x - gatWLastPos.x) + (player.y - gatWLastPos.y) * (player.y - gatWLastPos.y);
      if (pd2 < 4 && gatWTarget) {
        if (!gatWStuckSince) gatWStuckSince = now;
        else if (now - gatWStuckSince > 6000) {
          log('🗺️ GAT stuck 6s @(', Math.round(player.x), Math.round(player.y) + ') → เป้าใหม่ (จุดเลี้ยวค้าง?', gatWPathIdx + '/' + (gatWPath ? gatWPath.length : 0) + ')');
          gatWanderReset(); gatWStuckSince = 0;
        }
      } else gatWStuckSince = 0;
    }
    gatWLastPos = { x: player.x, y: player.y };
    if (gatWTarget) {
      const d = Math.hypot(gatWTarget.x - player.x, gatWTarget.y - player.y);
      // ★★ chain ล่วงหน้า — ยังไม่ถึงเป้า (เหลือ ≤10 ช่อง) ก็ต่อขาถัดไปทันที ไม่มีจังหวะหยุดยืน
      //   timeout 25s (ติดอะไรไป) ก็ข้ามไปขาใหม่เหมือนกัน · เจอมอน = combat ตัดเข้ามาเอง
      if (now - gatWTargetAt > 25000) log('🗺️ GAT timeout 25s @(', Math.round(player.x), Math.round(player.y) + ') เหลือระยะ', d.toFixed(0), 'ช่อง → ขาใหม่');
      if (d <= 14 || now - gatWTargetAt > 25000) {
        if (!gatPickTarget() && d <= ARRIVE) {
          gatWanderReset();   // ถึงจริงแล้ว + หาทางต่อไม่ได้ → ยอมให้ fallback รอบนี้ (tick หน้าลองทิศใหม่)
          return false;
        }
      }
    }
    if (!gatWTarget) { if (!gatPickTarget()) return false; }
    if (now - gatWLastMoveAt < 400) return true;   // throttle การ re-issue move — Continuous Wander
    while (gatWPathIdx < gatWPath.length - 1) {
      const wp = gatWPath[gatWPathIdx];
      if (Math.hypot(wp.x - player.x, wp.y - player.y) <= ARRIVE) gatWPathIdx++;
      else break;
    }
    // stride ยาว: waypoint ไกลสุดที่ ≤16 ช่อง (game click cap) และเส้นตรงเดินได้ตลอด
    let best = gatWPathIdx;
    const maxD = MOVE_MAX_DIST;
    for (let i = gatWPath.length - 1; i > best; i--) {
      const wp = gatWPath[i];
      if (Math.hypot(wp.x - player.x, wp.y - player.y) <= maxD && gatLineWalkable(player.x, player.y, wp.x, wp.y)) { best = i; break; }
    }
    const wp = gatWPath[best];
    if (sendMove(wp.x, wp.y)) {
      gatWLastMoveAt = now;
      // ★ วินิจฉัย: ทุก stride ลง debug log (เห็นจังหวะสั่งเดินจริง ~1 วิ/ครั้ง) — log หลักเฉพาะเป้าเปลี่ยน
      dbg('🗺️ GAT stride @(', Math.round(wp.x), Math.round(wp.y) + ') wp', best + 1 + '/' + gatWPath.length, 'player(', Math.round(player.x), Math.round(player.y) + ')');
      const tag = Math.round(gatWTarget.x) + ',' + Math.round(gatWTarget.y);
      if (tag !== gatWLogTag) {
        gatWLogTag = tag;
        log('🗺️ GAT เดินหามอน @(', Math.round(wp.x), Math.round(wp.y) + ') → เป้า(', tag + ') เส้นทาง', gatWPath.length, 'จุดเลี้ยว');
      }
    }
    return true;
  }

  // ============================================================
  //  NAVIGATION — บันทึกเส้นทางเดิน + สร้าง waypoint graph
  //    Trail (ตามเวลา) → merge nodes (ใกล้กัน) + edges (เชื่อมต่อกัน)
  //    localStorage per-map (roAssistNav_<map>) + export/import + sync GitHub
  // ============================================================
  // ★ flag แยก: บอทสั่งเดิน (sendMove) vs ผู้เล่นคลิกเอง — บันทึกเฉพาะผู้เล่น
  let navBotMoving = false;
  const NAV_KEY_PREFIX = 'roAssistNav_';
  // cache ของแต่ละแมปที่โหลดแล้ว: mapName → { nodes: [{x,y}], edges: [[i,j],...] }
  const navCache = new Map();
  // trail buffer สำหรับแมปปัจจุบัน (ตามเวลา) — rebuild graph เมื่อ save
  let navTrail = [];   // [{x, y, t}]
  // load nav data ของแมปจาก localStorage (cache ไว้)
  function navLoadMap(mapName) {
    if (!mapName) return null;
    if (navCache.has(mapName)) return navCache.get(mapName);
    try {
      const raw = localStorage.getItem(NAV_KEY_PREFIX + mapName);
      const data = raw ? JSON.parse(raw) : { nodes: [], edges: [], trail: [] };
      // ★ migrate: ข้อมูลเก่าอาจไม่มี route → rebuild จาก trail
      if (data.trail && data.trail.length && !data.route) navRebuildGraph(data);
      navCache.set(mapName, data);
      return data;
    } catch (e) { const d = { nodes: [], edges: [], trail: [] }; navCache.set(mapName, d); return d; }
  }
  function navSaveMap(mapName) {
    if (!mapName) return;
    const data = navCache.get(mapName);
    if (!data) return;
    try { localStorage.setItem(NAV_KEY_PREFIX + mapName, JSON.stringify(data)); } catch (e) {}
  }
  let navSaveTimer = null;
  function navSaveDebounced(mapName) {
    if (navSaveTimer) clearTimeout(navSaveTimer);
    navSaveTimer = setTimeout(() => navSaveMap(mapName), 1500);
  }
  // ★ rebuild graph จาก trail — merge nodes ใกล้กัน + สร้าง edges ตามลำดับเวลา
  function navRebuildGraph(data) {
    const r = CFG.navMergeRadius || 3;
    const r2 = r * r;
    const nodes = [];   // [{x, y}]
    const nodeMap = []; // trail index → node index
    // ★ pass 1: assign trail points ไปยัง node (merge ถ้าใกล้ node เดิม)
    for (let i = 0; i < data.trail.length; i++) {
      const p = data.trail[i];
      let found = -1;
      for (let j = 0; j < nodes.length; j++) {
        const dx = nodes[j].x - p.x, dy = nodes[j].y - p.y;
        if (dx * dx + dy * dy <= r2) { found = j; break; }
      }
      if (found < 0) { found = nodes.length; nodes.push({ x: p.x, y: p.y }); }
      nodeMap[i] = found;
    }
    // ★ pass 2: edges จาก trail ติดกัน (ข้าม node ตัวเอง) + dedup
    const edgeSet = new Set();
    const edges = [];
    for (let i = 1; i < nodeMap.length; i++) {
      const a = nodeMap[i - 1], b = nodeMap[i];
      if (a === b) continue;
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([a, b]);
    }
    data.nodes = nodes;
    data.edges = edges;
    // ★ build route: ลำดับ node ตามที่เดินจริง (compact nodeMap — เอาซ้ำติดกันออก)
    //   ใช้สำหรับ patrol mode (เดินตามลำดับ → ครบแล้วย้อนกลับ)
    const route = [];
    let lastNode = -1;
    for (let i = 0; i < nodeMap.length; i++) {
      if (nodeMap[i] !== lastNode) { route.push(nodeMap[i]); lastNode = nodeMap[i]; }
    }
    data.route = route;
  }
  // ★ บันทึกการคลิกเดินของผู้เล่น → trail
  function navRecordMove(x, y) {
    if (!CFG.navRecording || !currentMap) return;
    const data = navLoadMap(currentMap);
    if (!data) return;
    const now = nowMs();
    const last = data.trail[data.trail.length - 1];
    // ★ dedup: ข้ามถี่เกิน (เดินที่เดิม)
    if (last) {
      const dx = last.x - x, dy = last.y - y;
      if (dx * dx + dy * dy < 1) return;   // ขยับ < 1 ช่อง → ข้าม
    }
    data.trail.push({ x, y, t: now });
    // ★ จำกัดขนาด trail (กัน localStorage เต็ม) — เก็บสูงสุด 2000 จุด/แมป
    if (data.trail.length > 2000) data.trail = data.trail.slice(-2000);
    navRebuildGraph(data);
    navSaveDebounced(currentMap);
  }
  // ★ Navigation: หา node ที่ใกล้ (x,y) ที่สุด
  function navFindNearestNode(data, x, y) {
    if (!data || !data.nodes || !data.nodes.length) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < data.nodes.length; i++) {
      const dx = data.nodes[i].x - x, dy = data.nodes[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  // ★ Build adjacency list จาก edges
  function navAdjacency(data) {
    const adj = data.nodes.map(() => []);
    for (const [a, b] of data.edges) { adj[a].push(b); adj[b].push(a); }
    return adj;
  }
  // ★ BFS pathfinding: shortest path from node A → node B
  //   return [nodeIndex, ...] หรือ null ถ้าไม่ถึง
  function navFindPath(data, fromNode, toNode) {
    if (fromNode < 0 || toNode < 0 || fromNode >= data.nodes.length || toNode >= data.nodes.length) return null;
    if (fromNode === toNode) return [fromNode];
    const adj = navAdjacency(data);
    const visited = new Set([fromNode]);
    const queue = [[fromNode]];
    while (queue.length) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      for (const next of adj[cur]) {
        if (visited.has(next)) continue;
        visited.add(next);
        const newPath = [...path, next];
        if (next === toNode) return newPath;
        queue.push(newPath);
      }
    }
    return null;
  }
  // ★ navigateTo(x, y): หา path จากตำแหน่งปัจจุบัน → (x,y) แล้วคืนจุดถัดไปที่ควรคลิกเดิน
  //   return {x, y} ของ waypoint ถัดไป หรือ null ถ้าไม่มี path / ไม่มีข้อมูลแมป
  function navNavigateTo(targetX, targetY) {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || !data.nodes.length) return null;
    const startNode = navFindNearestNode(data, player.x, player.y);
    const endNode = navFindNearestNode(data, targetX, targetY);
    const path = navFindPath(data, startNode, endNode);
    if (!path || path.length < 2) return null;
    // ★ คืน node ถัดไป (path[1]) — bot จะคลิกเดินไปที่นั่น
    return { x: data.nodes[path[1]].x, y: data.nodes[path[1]].y };
  }
  // ★ PATROL MODE — เดินตามลำดับ route (ลำดับที่บันทึก) ครบแล้วย้อนกลับ
  //   ง่าย + เป็นธรรมชาติที่สุด เพราะเดินตามเส้นทางที่มนุษย์เคยเดินจริง
  //   state: patrolIdx = index ใน route ปัจจุบัน, patrolDir = 1 (ไป) | -1 (กลับ)
  let patrolIdx = -1;       // index ใน route ของ node ที่กำลังเดินไป
  let patrolDir = 1;        // ทิศทาง: 1 = ไปข้างหน้า, -1 = ย้อนกลับ
  let patrolTargetAt = 0;   // timestamp ที่ตั้ง target (timeout)
  function navPatrol() {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || !data.route || data.route.length < 2) return null;
    const now = nowMs();
    const ARRIVAL_RADIUS = (CFG.navMergeRadius || 3);
    const MAX_STEP = 18;
    const TARGET_TIMEOUT_MS = 10000;

    // ★ เริ่มต้น: หา index ใน route ที่ใกล้ player สุด
    if (patrolIdx < 0) {
      let bestDist = Infinity;
      for (let i = 0; i < data.route.length; i++) {
        const n = data.nodes[data.route[i]];
        const dx = n.x - player.x, dy = n.y - player.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; patrolIdx = i; }
      }
      patrolTargetAt = now;
    }

    // ★ หา target node ปัจจุบัน
    const targetNodeIdx = data.route[patrolIdx];
    if (targetNodeIdx == null) { patrolIdx = -1; return null; }
    const tx = data.nodes[targetNodeIdx].x, ty = data.nodes[targetNodeIdx].y;
    const dx = tx - player.x, dy = ty - player.y;
    const dist2 = dx * dx + dy * dy;

    // ★ arrival check: ถึงแล้ว → เลื่อนไป node ถัดไปใน route
    if (dist2 <= ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
      patrolIdx += patrolDir;
      // ★ ครบ route → ย้อนกลับ (ping-pong ไม่วนกลับจุดเริ่มต้น เพราะเสียเวลา)
      if (patrolIdx >= data.route.length) { patrolIdx = data.route.length - 2; patrolDir = -1; }
      else if (patrolIdx < 0) { patrolIdx = 1; patrolDir = 1; }
      // กัน index ออกนอก (route สั้น)
      if (patrolIdx < 0) patrolIdx = 0;
      if (patrolIdx >= data.route.length) patrolIdx = data.route.length - 1;
      patrolTargetAt = now;
      const nextNodeIdx = data.route[patrolIdx];
      return { x: data.nodes[nextNodeIdx].x, y: data.nodes[nextNodeIdx].y };
    }

    // ★ target timeout: ถ้าเกิน 10 วิ ยังไม่ถึง → ข้ามไป node ถัดไป
    if (now - patrolTargetAt > TARGET_TIMEOUT_MS) {
      patrolIdx += patrolDir;
      if (patrolIdx >= data.route.length) { patrolIdx = data.route.length - 2; patrolDir = -1; }
      else if (patrolIdx < 0) { patrolIdx = 1; patrolDir = 1; }
      if (patrolIdx < 0) patrolIdx = 0;
      if (patrolIdx >= data.route.length) patrolIdx = data.route.length - 1;
      patrolTargetAt = now;
      const nextNodeIdx = data.route[patrolIdx];
      log('🗺️ patrol timeout → ข้ามไป node', patrolIdx);
      return { x: data.nodes[nextNodeIdx].x, y: data.nodes[nextNodeIdx].y };
    }

    // ★ ยังอยู่ระหว่างทาง → คืน target ปัจจุบัน (cap ระยะ ≤ MAX_STEP)
    if (dist2 > MAX_STEP * MAX_STEP) {
      // ไกลเกิน → หา node ถัดไปที่อยู่ใกล้ player บน route
      //   ง่ายสุด: หา index ใน route ที่ใกล้ player สุด แล้วเริ่มจากตรงนั้น
      let bestI = patrolIdx, bestD = dist2;
      for (let i = 0; i < data.route.length; i++) {
        const n = data.nodes[data.route[i]];
        const ddx = n.x - player.x, ddy = n.y - player.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestD) { bestD = d; bestI = i; }
      }
      patrolIdx = bestI;
      patrolTargetAt = now;
      const nn = data.nodes[data.route[patrolIdx]];
      return { x: nn.x, y: nn.y };
    }
    return { x: tx, y: ty };
  }
  function navPatrolReset() { patrolIdx = -1; patrolDir = 1; patrolTargetAt = 0; }

  // ★ wander แบบใช้ nav — stateful: track current target + arrival → เดินต่อเนื่อง
  //   ★ หลีกเลี่ยง ping-pong: track node ที่เพิ่งมาจาก (prevNode) → ไม่สุ่มกลับ
  //     ถ้าเหลือทางเดียว (dead-end 2 node) → ขยายหา node ที่ไกลขึ้นผ่าน BFS
  let navWanderTarget = null;     // {x, y} เป้าหมายปัจจุบัน (null = ต้องเลือกใหม่)
  let navWanderNodeIdx = -1;      // index ของ node ที่กำลังเดินไป
  let navWanderPrevNode = -1;     // ★ index ของ node ที่เพิ่งจากมา (กันย้อนกลับ)
  let navWanderStuckSince = 0;    // timestamp ที่เริ่ม stuck (ไม่ถึง target)
  let navWanderLastPos = null;    // {x,y,t} ตำแหน่งก่อนหน้า (เช็ค stuck)
  let navWanderTargetAt = 0;      // ★ timestamp ที่ตั้ง target (timeout ถ้าไม่ถึง)
  // ★ helper: เลือก neighbor ถัดไป หลีกเลี่ยง prevNode — ถ้าเหลือแค่ prevNode ให้ BFS หา node ไกลขึ้น
  function navPickNextNode(data, curIdx) {
    const adj = navAdjacency(data);
    const neighbors = (adj[curIdx] || []).filter(n => n !== curIdx && n !== navWanderPrevNode);
    if (neighbors.length) {
      // ★ สุ่ม แต่ถ้ามีหลายทาง → เบนไปทางที่ไกลจาก prevNode (น้ำหนักมากกว่า)
      //   เพื่อให้เดินออกไกลแทนวนในจุดเดิม
      const px = data.nodes[navWanderPrevNode] || data.nodes[curIdx];
      // เลือกแบบสุ่มจาก neighbors ทั้งหมด (เท่ากัน) — ping-pong กันด้วย prevNode filter แล้ว
      return neighbors[Math.floor(Math.random() * neighbors.length)];
    }
    // ★ dead-end (มีแค่ prevNode ทางเดียว) → BFS หา node ที่ไกลสุดในรัศมี 3-5 hop
    //   เพื่อหลุดจากการวน แทนการย้อนกลับ
    const visited = new Set([curIdx]);
    let frontier = [curIdx];
    const dist = new Map([[curIdx, 0]]);
    let farthest = -1, farthestDist = 0;
    for (let hop = 0; hop < 5 && frontier.length; hop++) {
      const next = [];
      for (const n of frontier) {
        for (const m of adj[n] || []) {
          if (visited.has(m)) continue;
          visited.add(m);
          dist.set(m, hop + 1);
          if (hop + 1 > farthestDist) { farthestDist = hop + 1; farthest = m; }
          next.push(m);
        }
      }
      frontier = next;
    }
    return farthest >= 0 ? farthest : null;
  }
  function navWander() {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || data.nodes.length < 2) return null;
    const now = nowMs();
    const ARRIVAL_RADIUS = CFG.navMergeRadius || 3;
    const MAX_STEP = 18;
    const TARGET_TIMEOUT_MS = 8000;   // ★ ทิ้ง target ถ้าไม่ถึงใน 8 วิ (ติดกำแพง)

    // ★ target timeout: ถ้ามี target และเกิน 8 วิยังไม่ถึง → ทิ้ง เลือกใหม่
    //   (กันค้างที่ target เดิม เพราะติดกำแพง/สิ่งกีดขวาง)
    if (navWanderTarget && navWanderTargetAt && (now - navWanderTargetAt > TARGET_TIMEOUT_MS)) {
      const tdx = navWanderTarget.x - player.x, tdy = navWanderTarget.y - player.y;
      if (tdx * tdx + tdy * tdy > ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
        // ยังไม่ถึง + เกินเวลา → ทิ้ง target + ล้าง prevNode (กันติดต่อ)
        navWanderTarget = null; navWanderPrevNode = -1;
      }
    }

    // ★ เช็ค arrival: ถ้ามี target และอยู่ใกล้แล้ว → เลือก neighbor ถัดไปทันที
    if (navWanderTarget) {
      const dx = navWanderTarget.x - player.x, dy = navWanderTarget.y - player.y;
      if (dx * dx + dy * dy <= ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
        // ★ ถึงแล้ว — prevNode = node ที่เพิ่งจาก (curNode เดิม), curNode = target ที่ถึง
        navWanderPrevNode = navWanderNodeIdx >= 0 ? navFindNearestNode(data, player.x, player.y) : navWanderPrevNode;
        const curIdx = navWanderNodeIdx >= 0 ? navWanderNodeIdx : navFindNearestNode(data, player.x, player.y);
        const next = navPickNextNode(data, curIdx);
        if (next != null) {
          navWanderNodeIdx = next;
          const nx = data.nodes[next].x, ny = data.nodes[next].y;
          const sdx = nx - player.x, sdy = ny - player.y;
          if (sdx * sdx + sdy * sdy > MAX_STEP * MAX_STEP) {
            navWanderTarget = navNavigateTo(nx, ny) || { x: nx, y: ny };
          } else {
            navWanderTarget = { x: nx, y: ny };
          }
          navWanderTargetAt = now;   // ★ ตั้ง timeout ใหม่
          return navWanderTarget;
        }
        navWanderTarget = null;
      }
    }

    // ★ stuck detection: ตำแหน่งไม่ขยับ > 5s → reset
    if (navWanderLastPos) {
      const pdx = player.x - navWanderLastPos.x, pdy = player.y - navWanderLastPos.y;
      if (pdx * pdx + pdy * pdy < 4) {
        if (!navWanderStuckSince) navWanderStuckSince = now;
        else if (now - navWanderStuckSince > 5000) {
          navWanderTarget = null; navWanderPrevNode = -1; navWanderStuckSince = 0;
        }
      } else { navWanderStuckSince = 0; }
    }
    navWanderLastPos = { x: player.x, y: player.y, t: now };

    // ★ เลือก target ใหม่ (ไม่มี target หรือ reset)
    if (!navWanderTarget) {
      const curIdx = navFindNearestNode(data, player.x, player.y);
      const next = navPickNextNode(data, curIdx);
      if (next != null) {
        navWanderNodeIdx = next;
        const nx = data.nodes[next].x, ny = data.nodes[next].y;
        const sdx = nx - player.x, sdy = ny - player.y;
        if (sdx * sdx + sdy * sdy > MAX_STEP * MAX_STEP) {
          navWanderTarget = navNavigateTo(nx, ny) || { x: nx, y: ny };
        } else {
          navWanderTarget = { x: nx, y: ny };
        }
      } else {
        // ★ ไม่ได้อยู่ใกล้ node ไหน → เดินไป node ใกล้สุด (≤ MAX_STEP)
        if (curIdx >= 0) {
          const nx = data.nodes[curIdx].x, ny = data.nodes[curIdx].y;
          const sdx = nx - player.x, sdy = ny - player.y;
          if (sdx * sdx + sdy * sdy <= MAX_STEP * MAX_STEP) {
            navWanderNodeIdx = curIdx;
            navWanderTarget = { x: nx, y: ny };
          }
        }
      }
      navWanderTargetAt = now;   // ★ ตั้ง timeout ใหม่
      return navWanderTarget;
    }
    return navWanderTarget;
  }
  // ★ reset wander state (เรียกตอนเปลี่ยนแมป/วาร์ป)
  function navWanderReset() {
    navWanderTarget = null;
    navWanderNodeIdx = -1;
    navWanderPrevNode = -1;
    navWanderStuckSince = 0;
    navWanderLastPos = null;
    navWanderTargetAt = 0;
  }
  // ★ เช็คว่าแมปปัจจุบันมีข้อมูล nav หรือไม่ (ใช้ใน combatLoop เพื่อเลือก cooldown)
  function navHasData() {
    if (!currentMap) return false;
    const data = navCache.get(currentMap);
    if (!data || !data.nodes || data.nodes.length < 2) return false;
    if (CFG.navWanderMode === 'patrol') return !!(data.route && data.route.length >= 2);
    return true;   // graph mode ใช้แค่ nodes
  }
  // ★ export ข้อมูล nav ทั้งหมด (สำหรับ download/backup)
  function navExportAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(NAV_KEY_PREFIX)) {
        try { out[key.slice(NAV_KEY_PREFIX.length)] = JSON.parse(localStorage.getItem(key)); } catch (e) {}
      }
    }
    return out;
  }
  // ★ import ข้อมูล nav (merge — ถ้ามีแมปซ้ำ = ทับ)
  function navImportAll(data) {
    if (!data || typeof data !== 'object') return 0;
    let count = 0;
    for (const [mapName, navData] of Object.entries(data)) {
      if (!mapName || !navData || !Array.isArray(navData.nodes)) continue;
      localStorage.setItem(NAV_KEY_PREFIX + mapName, JSON.stringify(navData));
      navCache.set(mapName, navData);
      count++;
    }
    return count;
  }
  // ★ clear nav ของแมปที่ระบุ (หรือทั้งหมดถ้าไม่ระบุ)
  function navClear(mapName) {
    if (mapName) {
      localStorage.removeItem(NAV_KEY_PREFIX + mapName);
      navCache.delete(mapName);
      log('🗺️ ล้างข้อมูล nav แมป', mapName);
    } else {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(NAV_KEY_PREFIX)) keys.push(key);
      }
      keys.forEach(k => localStorage.removeItem(k));
      navCache.clear();
      log('🗺️ ล้างข้อมูล nav ทั้งหมด (' + keys.length + ' แมป)');
    }
  }

  // ---------- patch WebSocket ----------
  function attach(ws) {
    if (ws.__loot) return; ws.__loot = true;
    activeWS = ws; log('🔌 ต่อ WebSocket แล้ว');
    try { gameServerUrl = ws.url || ''; } catch (_) {}   // ★ เก็บ URL เซิร์ฟเวอร์เกม
    // ★★ AUTO-LOGIN หลัง WS ต่อ: WS เปิด = เกมกด login แล้วเสมอ (เกมเปิด WS ตอนกด login!)
    //   → ห้ามส่ง 0x08 ซ้ำ (server เมิง — เคยทำแล้ว phase ค้าง)
    //   → ถ้าไม่มี playerId ใน 12s = ค้างหน้าเลือกตัวละคร → charSelectNudge จะกด Enter/คลิกแทน
    if (CFG.autoLoginEnabled && (autoLoginPhase === 'idle' || autoLoginPhase === 'done')
        && Date.now() - autoLoginAttemptAt > 30000) {
      autoLoginAttemptAt = Date.now();
      autoLoginPhase = 'observing';
      wsOpenedAt = Date.now();
      log('🤖 [auto-login] WS เปิด (เกมกด login แล้ว) — รอ token / ดันหน้าเลือกตัวละคร...');
    }
    const origSend = ws.send.bind(ws);
    ws.send = function (data) {
      try {
        const u = syncU8(data);
        if (u) { marketObserveOutgoing(u); captureUnstuckOutgoing(u); handleOut(u); }
      } catch (e) {}
      return origSend(data);
    };
    ws.addEventListener('message', async (e) => {
      try { const u = await toU8(e.data); if (u) { marketObserveIncoming(u); handleIn(u); } } catch (err) {}
    });
  }
  const NativeWS = window.WebSocket;
  window.WebSocket = function (...a) { const ws = new NativeWS(...a); attach(ws); return ws; };
  window.WebSocket.prototype = NativeWS.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => window.WebSocket[k] = NativeWS[k]);

  // ============================================================
  //  API ควบคุมจาก console — พิมพ์ ASSIST.<method>()
  // ============================================================
  window.ASSIST = {
    // ---------- สถานะ ----------
    status() {
      const pct = hpPct();
      console.table([{
        version: VERSION + (latestVersion && cmpVer(latestVersion, VERSION) > 0 ? ` → ${latestVersion} ⬆` : ''),
        combat: CFG.combatEnabled ? 'ON ⚔️' : 'off',
        loot: CFG.lootEnabled ? 'ON' : 'off',
        heal: CFG.healEnabled ? 'ON' : 'off',
        dead: isDead ? '☠️ YES' : 'no',
        HP: hp.cur != null ? `${hp.cur}/${hp.max} (${pct != null ? pct.toFixed(0) : '?'}%)` : '?',
        map: currentMap || '?',
        farmMap: CFG.farmMap || '(any)',
        entities: entities.size,
        target: target ? target.id.toString(16) : '-',
        healAt: CFG.healAtPercent + '%',
        healItems: CFG.healItems.map(nameOf).join(', '),
        healMode: CFG.healMode,
        lootMode: CFG.filter.mode,
        lootQueue: queue.size,
        player_id: playerId ? playerId.toString(16) : '?',
      }]);
      const now = Date.now();
      const healStatus = CFG.healItems.map(id => ({
        id,
        name: nameOf(id),
        available: heal.isAvailable(id, now),
        retryInMs: heal.isAvailable(id, now) ? 0 : (heal.exhaustedUntil.get(id) - now),
      }));
      return {
        hp: { ...hp }, hpPct: pct, isDead,
        heal: { enabled: CFG.healEnabled, mode: CFG.healMode, threshold: CFG.healAtPercent + '%', items: healStatus },
        loot: { ...CFG.filter, queue: [...queue.values()].map(it => ({ item: nameOf(it.itemId), ...it })) },
      };
    },
    // ★ ถามตำแหน่งแม่นยำจาก server (/where) — คำตอบมาเป็นแชทระบบ แล้ว 0x2c handler apply ให้เอง
    where() { if (sendWhere()) { log('📍 ส่ง /where แล้ว — รอคำตอบจาก server'); } else { log('⚠️ WebSocket ยังไม่พร้อม'); } },
    // ★★ Auto-Login / Auto-Refresh (เก็บใน localStorage — รอดจาก refresh)
    setAutoLogin(user, pass, slot) {
      if (user) CFG.autoLoginUser = String(user);
      if (pass) CFG.autoLoginPass = String(pass);
      if (slot != null) CFG.autoLoginSlot = parseInt(slot, 10) || 0;
      saveConfigDebounced();
      log('🤖 auto-login: user=' + CFG.autoLoginUser + ' slot=' + CFG.autoLoginSlot + ' (เข้ารหัสเก็บแล้ว — ทำงานตอน WS ต่อใหม่)');
    },
    autoLoginOn() { CFG.autoLoginEnabled = true; saveConfigDebounced(); log('🤖 Auto-Login: เปิด (ต้องมี user/pass ใน config)'); },
    autoLoginOff() { CFG.autoLoginEnabled = false; saveConfigDebounced(); log('🤖 Auto-Login: ปิด'); },
    setAutoRefresh(sec) { CFG.autoRefreshStallSec = Math.max(60, parseInt(sec, 10) || 180); saveConfigDebounced(); log('🔄 auto-refresh: ค้างเกิน ' + CFG.autoRefreshStallSec + 's → refresh'); },
    autoRefreshOn() { CFG.autoRefreshEnabled = true; saveConfigDebounced(); log('🔄 Auto-Refresh: เปิด'); },
    autoRefreshOff() { CFG.autoRefreshEnabled = false; saveConfigDebounced(); log('🔄 Auto-Refresh: ปิด'); },
    help() {
      console.log(`%c ASSIST — คำสั่ง `, 'background:#4caf50;color:#fff;padding:2px 6px;border-radius:3px');
      console.log(`%c Auto-Heal `, 'color:#e91e63;font-weight:bold');
      console.log('  ASSIST.healOn() / ASSIST.healOff()');
      console.log('  ASSIST.setHealAt(50)              // เลือดต่ำกว่า 50% → ใช้ยา');
      console.log('  ASSIST.setHealItems(501,502,503)  // เซ็ตรายการ item id');
      console.log('  ASSIST.addHealItem(503)           // เพิ่ม item');
      console.log('  ASSIST.setHealMode("order")       // "order"=ใช้ตัวเดิมจนหมดแล้วข้าม, "random"=สุ่ม');
      console.log('  ASSIST.setHealDelay(800)          // ดีเลย์ ms');
      console.log('  ASSIST.setHealExhausted(3000)     // item หมด→รอ N ms แล้วลองใหม่ (default 3000)');
      console.log('  ASSIST.clearHealExhausted()       // บังคับลองใช้ item ทุกตัวใหม่ (ล้าง mark หมด)');
      console.log('  ASSIST.setHealToFull(true)        // true=ใช้ยาจนเต็ม, false=พ้น threshold หยุด');
      console.log(`%c Auto-Buff `, 'color:#9b59b6;font-weight:bold');
      console.log('  ASSIST.buffOn() / ASSIST.buffOff()');
      console.log('  ASSIST.addBuffItem(656, 30)        // Awakening Potion ทุก 30 นาที');
      console.log('  ASSIST.setBuffItems([{itemId:656,intervalMin:30}])');
      console.log('  ASSIST.removeBuffItem(656)         ASSIST.buffNow()');
      console.log('  ASSIST.getBuffCountdowns()         // ดู countdown แต่ละตัว');
      console.log(`%c Auto-Loot `, 'color:#2196f3;font-weight:bold');
      console.log('  ASSIST.lootOn() / ASSIST.lootOff()');
      console.log('  ASSIST.setLootMode("all")         // "all" | "only" | "except"');
      console.log('  ASSIST.addLootOnly(909,512)       ASSIST.addLootExcept(909)');
      console.log('  ASSIST.clearLootOnly()            ASSIST.clearLootExcept()');
      console.log('  ASSIST.setLootDelay(500)         // รอ 500ms หลังของตกแล้วค่อยเก็บ (0=ทันที)');
      console.log(`%c อื่นๆ `, 'color:#9c27b0;font-weight:bold');
      console.log(`%c Navigation `, 'color:#26a69a;font-weight:bold');
      console.log('  ASSIST.navRecordOn() / navRecordOff()   // บันทึกเส้นทางเดิน');
      console.log('  ASSIST.navGetAllStats()                  // ดูข้อมูลทุกแมป');
      console.log('  ASSIST.navExport() / navImport(json)     // export/import ไฟล์');
      console.log('  ASSIST.name(935,"Feather")        // ตั้งชื่อ item');
      console.log('  ASSIST.status()  ASSIST.config()  ASSIST.stopAll()');
    },

    // ---------- Auto-Heal ----------
    healOn() {
      if (!CFG.healItems.length) {
        console.warn('⚠️ ยังไม่มี item heal — ตั้งก่อนด้วย ASSIST.setHealItems(...) ไม่งั้นจะไม่ทำงาน');
      }
      CFG.healEnabled = true; log('💉 Auto-Heal: ON');
    },
    healOff() { CFG.healEnabled = false; log('💉 Auto-Heal: OFF'); },
    setHealAt(pct) {
      if (typeof pct !== 'number' || pct < 1 || pct > 100) { console.warn('ต้องเป็นเลข 1-100'); return; }
      CFG.healAtPercent = pct;
      log('💉 threshold =', pct + '%');
    },
    setHealItems(...ids) {
      CFG.healItems = ids.filter(x => typeof x === 'number');
      heal.clearExhausted();
      // ★ ตั้ง item = เจตนาเปิดใช้ → เปิด auto-heal ให้อัตโนมัติ (default ปิดอยู่)
      CFG.healEnabled = true;
      log('💉 healItems =', CFG.healItems.map(nameOf).join(', '), '→ auto-heal ON');
    },
    addHealItem(...ids) {
      for (const id of ids) if (!CFG.healItems.includes(id)) CFG.healItems.push(id);
      log('💉 healItems =', CFG.healItems.map(nameOf).join(', '));
    },
    setHealMode(mode) {
      if (!['order', 'random'].includes(mode)) { console.warn('โหมดต้องเป็น order/random'); return; }
      CFG.healMode = mode; log('💉 healMode =', mode);
    },
    setHealDelay(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.healDelayMs = ms; log('💉 delay =', ms + 'ms');
    },
    // ตั้งระยะเวลาที่ item ที่ "หมด" จะรอก่อนลองใหม่ (ms) — default 3000
    setHealExhausted(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.healExhaustedMs = ms; log('💉 item หมด → รอ', ms + 'ms แล้วลองใหม่');
    },
    // ล้าง mark "หมด" ทั้งหมดทันที (บังคับลองใช้ item ทุกตัวอีกครั้ง)
    clearHealExhausted() {
      heal.clearExhausted();
      log('💉 ล้าง mark "หมด" ทั้งหมด → ลองใช้ item ทุกตัวใหม่');
    },
    setHealToFull(on) { CFG.healAtMax = !!on; log('💉 ใช้ยาจนเต็ม =', CFG.healAtMax); },

    // ---------- Auto-Buff ----------
    //  buffItems: [{itemId, intervalMin}] — intervalMin = ทุกกี่นาทีจะใช้ซ้ำ
    //  เก็บเวลาใช้ล่าสุดข้าม session (localStorage) กัน buff หายเมื่อ refresh
    buffOn()  { CFG.buffEnabled = true;  log('✨ Auto-Buff: ON'); },
    buffOff() { CFG.buffEnabled = false; log('✨ Auto-Buff: OFF'); },
    // ★ setBuffItems([{itemId:656, intervalMin:30}, ...]) — แทนที่ทั้งรายการ
    setBuffItems(items) {
      CFG.buffItems = (items || []).filter(x => x && x.itemId && x.intervalMin > 0)
        .map(x => ({ itemId: Number(x.itemId), intervalMin: Number(x.intervalMin) }));
      CFG.buffEnabled = true;
      log('✨ buffItems =', CFG.buffItems.map(x => nameOf(x.itemId) + '(ทุก' + x.intervalMin + 'นาที)').join(', '));
    },
    // ★ addBuffItem(itemId, intervalMin) — เพิ่ม 1 รายการ (ถ้ามี itemId อยู่แล้ว = update interval)
    addBuffItem(itemId, intervalMin) {
      itemId = Number(itemId); intervalMin = Number(intervalMin);
      if (!itemId || intervalMin <= 0) { log('⚠️ itemId และ intervalMin ต้อง > 0'); return; }
      const existing = CFG.buffItems.find(x => x.itemId === itemId);
      if (existing) { existing.intervalMin = intervalMin; log('✨ แก้', nameOf(itemId), '→ ทุก', intervalMin + 'นาที'); }
      else { CFG.buffItems.push({ itemId, intervalMin }); log('✨ เพิ่ม', nameOf(itemId), 'ทุก', intervalMin + 'นาที'); }
    },
    removeBuffItem(itemId) {
      itemId = Number(itemId);
      CFG.buffItems = CFG.buffItems.filter(x => x.itemId !== itemId);
      lastBuffUse.delete(itemId);
      saveBuffTimesDebounced();
      log('✨ ลบ buff', nameOf(itemId));
    },
    // ★ ใช้ buff ทั้งหมดทันที (reset countdown) — เผื่ออยากใช้เลยไม่รอ
    buffNow() {
      if (!CFG.buffItems.length) { log('⚠️ ยังไม่ได้ตั้ง buffItems'); return; }
      if (!activeWS || activeWS.readyState !== 1) { log('⚠️ ยังไม่ได้เชื่อมต่อ'); return; }
      const now = nowMs();
      let used = 0;
      for (const item of CFG.buffItems) {
        if (sendUseItem(item.itemId)) { lastBuffUse.set(item.itemId, now); used++; }
      }
      saveBuffTimesDebounced();
      log('✨ ใช้ buff ทั้งหมด', used, 'รายการทันที');
    },
    // ★ ดู countdown ของแต่ละ buff (สำหรับ UI + debug)
    getBuffCountdowns() {
      const now = nowMs();
      return CFG.buffItems.map(item => {
        const last = lastBuffUse.get(item.itemId) || 0;
        const intervalMs = item.intervalMin * 60 * 1000;
        const nextUseAt = last + intervalMs;
        return {
          itemId: item.itemId,
          name: itemDisplayName(item.itemId),
          intervalMin: item.intervalMin,
          lastUsed: last,
          nextUseAt,
          remainingMs: Math.max(0, nextUseAt - now),
        };
      });
    },
    clearBuffTimes() { lastBuffUse.clear(); saveBuffTimes(); log('✨ ล้างเวลา buff ทั้งหมด → จะใช้ใหม่ทันที'); },

    // ---------- Auto-Skill ----------
    skillOn()  { CFG.skillEnabled = true;  log('✨ Auto-Skill: ON'); },
    skillOff() { CFG.skillEnabled = false; log('✨ Auto-Skill: OFF'); },
    // ★ setSkills([{skillId:3, level:10, targeted:true, maxUsesPerTarget:2, maxDistance:2, spMin:15, cooldownMs:2000}, ...])
    setSkills(skills) {
      CFG.skills = (skills || []).filter(s => s && s.skillId != null).map(s => ({
        name: s.name || ('skill_' + s.skillId),
        skillId: Number(s.skillId),
        level: Number(s.level) || 1,
        targeted: !!s.targeted,
        selfCast: !!s.selfCast,
        intervalMin: Number(s.intervalMin) || 0,
        mobCountMin: Number(s.mobCountMin) || 0,
        maxUsesPerTarget: Number(s.maxUsesPerTarget) || 1,
        maxDistance: Number(s.maxDistance) || 0,
        minDistance: Number(s.minDistance) || 0,
        spMin: Number(s.spMin) || 0,
        cooldownMs: Number(s.cooldownMs) || 2000,
      }));
      log('✨ skills =', CFG.skills.length, 'รายการ');
    },
    addSkill(skill) {
      if (!skill || skill.skillId == null) { log('⚠️ ต้องมี skillId'); return; }
      // ★★ dedupe ด้วย skillId + โหมด — สกิลเดียวกันต่างโหมดอยู่ด้วยกันได้
      //   (เช่น Heal ally HP<50% สำหรับตัวเอง + Heal buff ให้คนอื่น — คนละเงื่อนไข)
      const modeKey = (s) => s.buffMode ? 'buff' : (s.ally ? 'ally' : (s.selfCast ? 'self' : (s.ground ? 'ground' : (s.targeted ? 'targeted' : 'aoe'))));
      const existing = CFG.skills.find(s => s.skillId === skill.skillId && modeKey(s) === modeKey(skill));
      if (existing) { Object.assign(existing, skill); log('✨ แก้ skill', skill.skillId, '(' + modeKey(skill) + ')'); }
      else { CFG.skills.push(skill); log('✨ เพิ่ม skill', skill.skillId, '(' + modeKey(skill) + ')'); }
    },
    removeSkill(skillId) {
      CFG.skills = CFG.skills.filter(s => s.skillId !== skillId);
      log('✨ ลบ skill', skillId);
    },
    skillNow() {
      if (!CFG.skills.length) { log('⚠️ ยังไม่ได้ตั้ง skills'); return; }
      const now = nowMs();
      for (const s of CFG.skills) {
        const tid = (s.targeted && !s.selfCast && !s.ground && target) ? target.id : null;
        let gx = null, gy = null;
        if (s.ground && target) {
          const tm = entities.get(target.id);
          if (tm && tm.x != null) { gx = Math.round(tm.x); gy = Math.round(tm.y); }
        }
        sendSkill(s.skillId, s.level || 1, tid, gx, gy);
        lastSkillUse.set(s.skillId, now);
      }
      saveSkillTimesDebounced();
      log('✨ ใช้ skill ทั้งหมด', CFG.skills.length, 'รายการทันที');
    },
    clearSkillTimes() { lastSkillUse.clear(); saveSkillTimes(); log('✨ ล้างเวลา skill ทั้งหมด'); },
    getSkillCooldowns() {
      const now = nowMs();
      return CFG.skills.map(s => {
        const last = lastSkillUse.get(s.skillId) || 0;
        const cd = (s.intervalMin > 0) ? s.intervalMin * 60 * 1000 : (s.cooldownMs || 2000);
        return { skillId: s.skillId, name: s.name, lastUsed: last, nextUseAt: last + cd, remainingMs: Math.max(0, last + cd - now) };
      });
    },
    restOn()  { CFG.restEnabled = true;  log('🪑 Auto-Rest: ON (HP < ' + CFG.restHpPercent + '% → นั่งพัก)'); },
    restOff() { CFG.restEnabled = false; if (isResting) { sendStand(); isResting = false; } log('🪑 Auto-Rest: OFF'); },
    setRestHp(pct) { CFG.restHpPercent = pct; log('🪑 นั่งพักตอน HP <', pct + '%'); },
    setRestUntil(pct) { CFG.restUntilPercent = pct; log('🪑 ลุกยืนตอน HP ≥', pct + '%'); },
    setRestMaxSec(sec) { CFG.restMaxSec = sec; log('🪑 นั่งนานสุด', sec + 's'); },
    setRestDelay(ms) { CFG.restDelayMs = Math.max(0, ms); saveConfigDebounced(); log('🪑 ดีเลย์ก่อนนั่ง:', CFG.restDelayMs + 'ms'); },
    isResting() { return isResting; },

    // ---------- Auto-Sell ----------
    sellOn()  { CFG.sellEnabled = true;  log('💰 Auto-Sell: ON'); },
    sellOff() { CFG.sellEnabled = false; log('💰 Auto-Sell: OFF'); },
    setSellNpc(name, map) { CFG.sellNpcName = name; if (map) CFG.sellNpcMap = map; log('💰 NPC:', name, '@', CFG.sellNpcMap); },
    setSellNpcPos(x, y) { CFG.sellNpcX = Math.round(Number(x)); CFG.sellNpcY = Math.round(Number(y)); log('💰 จุดเดินไป NPC หลัง Unstuck:', CFG.sellNpcX, CFG.sellNpcY); },
    useCurrentPosAsSellWarp() {
      if (player.x != null && player.y != null) {
        CFG.sellNpcX = Math.round(player.x);
        CFG.sellNpcY = Math.round(player.y);
        if (currentMap) CFG.sellNpcMap = currentMap;
        saveConfigDebounced();
        log('💰 ใช้พิกัดปัจจุบันเป็นจุดเดินหลัง Unstuck:', CFG.sellNpcMap, '@(', CFG.sellNpcX, CFG.sellNpcY + ')');
        return true;
      }
      log('⚠️ ยังไม่รู้พิกัดตัวละคร');
      return false;
    },
    setSellInterval(min) { CFG.sellIntervalMin = min; log('💰 ขายทุก', min, 'นาที (0=off)'); },
    toggleSellOnFull(on) { CFG.sellOnFull = !!on; log('💰 ขายตอนเต็ม =', CFG.sellOnFull); },
    setSellItems(...ids) { CFG.sellItemIds = ids; log('💰 ขาย item:', ids.map(nameOf).join(', ')); },
    addSellItem(id) { if (!CFG.sellItemIds.includes(id)) CFG.sellItemIds.push(id); log('💰 เพิ่มขาย:', nameOf(id)); },
    removeSellItem(id) { CFG.sellItemIds = CFG.sellItemIds.filter(x => x !== id); log('💰 เลิกขาย:', nameOf(id)); },
    sellNow() {
      if (storageState !== 'IDLE') { log('⚠️ กำลังฝากของอยู่ (state:', storageState + ') — รอให้จบก่อนแล้วค่อยขาย'); return; }
      if (sellState !== 'IDLE') { log('⚠️ กำลังขายอยู่แล้ว (state:', sellState + ')'); return; }
      if (!CFG.sellItemIds.length) { log('⚠️ ยังไม่ได้เลือก item ที่จะขาย'); return; }
      // ★★ กดหลังเข้าเกมทันที → พิกัดยังไม่มา — บอกชัดแทน "(state: IDLE)" ที่ดูเหมือนไม่มีอะไรผิด
      if (!currentMap || player.x == null) { log('⚠️ ยังไม่รู้พิกัดตัวละคร (หลังเข้าเกมใหม่ รอ 1-2 วิ) — ลองกดอีกครั้ง'); return; }
      // ★★ pre-check เหมือน depositNow — ของ equipment จาก login อยู่ใน equipmentSlots ไม่ใช่ inventory
      //   (กดตอนของยังไม่โหลด/ขายหมดแล้ว → บอกตรง ๆ ไม่วาร์ปไป NPC เปล่า)
      let hasSell = false, wornOnly = 0;
      for (const id of CFG.sellItemIds) {
        if ((equipmentSlots.get(id) || []).length > 0 || (inventory.get(id) || 0) > 0) { hasSell = true; break; }
        if (equipmentList.some(x => x.id === id && x.worn)) wornOnly++;
      }
      if (!hasSell) {
        log('⚠️ ไม่มีของที่จะขายใน inventory' + (wornOnly > 0 ? ' (มี ' + wornOnly + ' ชนิดกำลังสวมอยู่ — ถอดก่อนจึงขายได้)' : ''));
        return;
      }
      startSellTravel('กดขายเดี๋ยวนี้', null);
    },
    getInventory() { return [...inventory.entries()].map(([id, c]) => ({ id, name: itemDisplayName(id), count: c, action: getItemAction(Number(id)) })).sort((a, b) => b.count - a.count); },

    // ---------- Auto-Storage (ฝากเข้า Kafra) ----------
    storageOn()  { CFG.storageEnabled = true;  log('🏦 Auto-Storage: ON'); },
    storageOff() { CFG.storageEnabled = false; log('🏦 Auto-Storage: OFF'); },
    setKafra(name, map) { CFG.kafraName = name; if (map) CFG.kafraMap = map; log('🏦 Kafra:', name, '@', CFG.kafraMap); },
    setKafraPos(x, y) { CFG.kafraMapX = Math.round(Number(x)); CFG.kafraMapY = Math.round(Number(y)); log('🏦 จุดเดินไป Kafra หลัง Unstuck:', CFG.kafraMapX, CFG.kafraMapY); },
    useCurrentPosAsKafra() {
      if (player.x != null && player.y != null) {
        CFG.kafraMapX = Math.round(player.x);
        CFG.kafraMapY = Math.round(player.y);
        if (currentMap) CFG.kafraMap = currentMap;
        saveConfigDebounced();
        log('🏦 ใช้พิกัดปัจจุบันเป็นจุดเดิน Kafra หลัง Unstuck:', CFG.kafraMap, '@(', CFG.kafraMapX, CFG.kafraMapY + ')');
        return true;
      }
      log('⚠️ ยังไม่รู้พิกัดตัวละคร');
      return false;
    },
    toggleDepositOnFull(on) { CFG.depositOnFull = !!on; log('🏦 ฝากตอนเต็ม =', CFG.depositOnFull); },
    toggleDepositAfterSell(on) { CFG.depositAfterSell = !!on; log('🏦 ฝากหลังขาย =', CFG.depositAfterSell); },
    // ★ Warp-to-Boss toggles (สำหรับ remote command)
    warpToBossOn()     { CFG.warpToBoss = true;     saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss: เปิด'); },
    warpToBossOff()    { CFG.warpToBoss = false;    saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss: ปิด'); },
    warpToMiniBossOn() { CFG.warpToMiniBoss = true; saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss: เปิด'); },
    warpToMiniBossOff(){ CFG.warpToMiniBoss = false;saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss: ปิด'); },
    fleeFromPlayersOn()  { CFG.fleeFromPlayers = true;  saveConfigDebounced(); log('🏃 หนีผู้เล่น: เปิด'); },
    fleeFromPlayersOff() { CFG.fleeFromPlayers = false; saveConfigDebounced(); log('🏃 หนีผู้เล่น: ปิด'); },
    setDepositItems(...ids) { CFG.depositItemIds = ids; log('🏦 ฝาก item:', ids.map(nameOf).join(', ')); },
    addDepositItem(id) { if (!CFG.depositItemIds.includes(id)) CFG.depositItemIds.push(id); log('🏦 เพิ่มฝาก:', nameOf(id)); },
    removeDepositItem(id) { CFG.depositItemIds = CFG.depositItemIds.filter(x => x !== id); log('🏦 เลิกฝาก:', nameOf(id)); },
    depositNow() {
      if (storageState !== 'IDLE') { log('⚠️ กำลังฝากอยู่แล้ว (state:', storageState + ')'); return; }
      if (sellState !== 'IDLE') { log('⚠️ กำลังขายของอยู่ (state:', sellState + ') — รอให้จบก่อนแล้วค่อยกดฝาก'); return; }
      if (!CFG.depositItemIds.length) { log('⚠️ ยังไม่ได้เลือก item ที่จะฝาก'); return; }
      if (!currentMap || player.x == null) { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); return; }
      // ★★ ตรวจผ่าน equipmentSlots ด้วย — ของ equipment จาก login ไม่เคยเข้า inventory map
      //   (เดิมเช็คแค่ inventory.get > 0 → มีแต่ equipment ตอนเข้าเกม = "ไม่มีของที่จะฝาก" ทั้งที่มีเต็มถุง!)
      let hasDeposit = false;
      for (const id of CFG.depositItemIds) {
        if ((equipmentSlots.get(id) || []).length > 0 || (inventory.get(id) || 0) > 0) { hasDeposit = true; break; }
      }
      if (!hasDeposit) { log('⚠️ ไม่มีของที่จะฝากใน inventory'); return; }
      startStorage('กดฝากเดี๋ยวนี้', null);
    },

    // ---------- Farm Map ----------
    //  setFarmMap(name, x, y): ตั้งแมปฟาร์ม + พิกัด (x/y optional, default -999=random)
    //  useCurrentPosAsFarm(): ดึงพิกัดตัวละครปัจจุบันเป็นจุดวาร์ปของแมปฟาร์ม
    //  warpToFarm(): วาร์ปไปแมปฟาร์มทันที (manual — เผื่อผู้เล่นควบคุมเองแล้วอยากกลับ)
    //  toggleWarpBack(on): เปิด/ปิด auto warp-back เมื่อออกจากแมปฟาร์ม
    setFarmMap(name, x, y) {
      CFG.farmMap = String(name || '');
      CFG.farmMapX = (x != null) ? Math.round(Number(x)) : -999;
      CFG.farmMapY = (y != null) ? Math.round(Number(y)) : -999;
      log('🗺️ แมปฟาร์ม:', CFG.farmMap || '(ยกเลิก)', '@(', CFG.farmMapX, CFG.farmMapY + ')');
    },
    useCurrentPosAsFarm() {
      if (player.x != null && player.y != null) {
        CFG.farmMapX = Math.round(player.x); CFG.farmMapY = Math.round(player.y);
        if (currentMap) CFG.farmMap = currentMap;
        log('🗺️ ใช้พิกัดปัจจุบันเป็นแมปฟาร์ม:', CFG.farmMap, '@(', CFG.farmMapX, CFG.farmMapY + ')');
      } else { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); }
    },
    warpToFarm() {
      if (!CFG.farmMap) { log('⚠️ ยังไม่ได้ตั้งแมปฟาร์ม (ASSIST.setFarmMap หรือกด "ใช้พิกัดตัวละคร")'); return; }
      if (!activeWS || activeWS.readyState !== 1) { log('⚠️ ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return; }
      sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
      log('🌀 วาร์ปไปแมปฟาร์ม:', CFG.farmMap, '@(', CFG.farmMapX, CFG.farmMapY + ')');
    },
    toggleWarpBack(on) { CFG.warpBackToFarm = !!on; log('🗺️ วาร์ปกลับแมปฟาร์มอัตโนมัติ =', CFG.warpBackToFarm); },
    openMonitor() { openMonitor(); },
    getSellState() { return { state: sellState, full: inventoryFull, returnTo: sellReturnTo }; },

    // ---------- Navigation (บันทึกเส้นทางเดิน + waypoint graph) ----------
    navRecordOn()  { CFG.navRecording = true;  log('🗺️ บันทึกเส้นทาง: ON — เดินเก็บข้อมูลในแมปที่ต้องการ'); },
    navRecordOff() { CFG.navRecording = false; log('🗺️ บันทึกเส้นทาง: OFF'); },
    navSetMergeRadius(r) { CFG.navMergeRadius = Math.max(1, Number(r) || 3); log('🗺️ รัศมีรวมจุด =', CFG.navMergeRadius, 'ช่อง'); },
    navToggleWander(on) { CFG.navWanderUseNav = !!on; log('🗺️ wander ใช้ nav =', CFG.navWanderUseNav); },
    // ★ GAT — ดูสถานะตารางเดินได้ที่โหลดแล้ว + calibration แกน y
    gatStatus() {
      const maps = [...gatCache.entries()].map(([m, g]) => m + ' (' + g.w + '×' + g.h + ')').join(', ') || '(ยังไม่มี)';
      let walkable = '';
      if (currentMap && gatCache.has(currentMap)) {
        const g = gatCache.get(currentMap);
        let n = 0; for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 0) n++;
        walkable = ' · แมปนี้เดินได้ ' + n + '/' + g.cells.length + ' ช่อง (' + (n / g.cells.length * 100).toFixed(0) + '%)';
      }
      log('🗺️ GAT:', maps, '· calibration:', gatFlipLocked ? (gatFlipY ? 'y-flip' : 'ปกติ') : 'ยังเก็บข้อมูล (' + gatCalN + '/20)', walkable);
    },
    navGetStats(mapName) {
      const data = navLoadMap(mapName || currentMap);
      if (!data) return { maps: 0 };
      return { map: mapName || currentMap, nodes: (data.nodes||[]).length, edges: (data.edges||[]).length, trail: (data.trail||[]).length };
    },
    navGetAllStats() {
      const maps = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(NAV_KEY_PREFIX)) {
          try {
            const d = JSON.parse(localStorage.getItem(key));
            maps[key.slice(NAV_KEY_PREFIX.length)] = { nodes: (d.nodes||[]).length, edges: (d.edges||[]).length, trail: (d.trail||[]).length };
          } catch (e) {}
        }
      }
      return maps;
    },
    navNavigateTo(x, y) { return navNavigateTo(x, y); },   // ทดสอบ path
    navClearMap(mapName) { navClear(mapName); },
    navClearAll() { navClear(); },
    navExport() {
      const data = navExportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ro-nav-data.json'; a.click();
      URL.revokeObjectURL(url);
      log('🗺️ export nav data:', Object.keys(data).length, 'แมป');
    },
    navImport(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const count = navImportAll(data);
        log('🗺️ import nav data:', count, 'แมป');
        return count;
      } catch (e) { log('⚠️ import nav ล้มเหลว:', e.message); return 0; }
    },

    // ---------- Auto-Loot ----------
    lootOn()  { CFG.lootEnabled = true;  log('📦 Auto-Loot: ON'); },
    lootOff() { CFG.lootEnabled = false; log('📦 Auto-Loot: OFF'); },
    setLootMode(mode) {
      if (!['all', 'only', 'except'].includes(mode)) { console.warn('โหมดต้องเป็น all/only/except'); return; }
      CFG.filter.mode = mode; log('📦 loot mode =', mode);
    },
    // ---------- Warp-to-Loot (ฟีเจอร์รุนแรง) ----------
    warpLootOn() {
      CFG.warpLootEnabled = true;
      if (!currentMap) console.warn('⚠️ ยังไม่รู้ชื่อแมป — warp จะทำงานหลังเข้าแมป');
      log('🌀 Warp-to-Loot: ON (เก็บไม่ได้ครบ', CFG.maxAttempts, 'ครั้ง → วาร์ปไปเก็บ)');
    },
    warpLootOff() {
      CFG.warpLootEnabled = false;
      warpQueue.clear();
      log('🌀 Warp-to-Loot: OFF');
    },
    warpLootQueue() {
      return [...warpQueue.values()].map(w => ({ item: nameOf(w.itemId), x: w.x, y: w.y, offsetIdx: w.offsetIdx }));
    },
    addLootOnly(...ids) {
      for (const id of ids) if (!CFG.filter.onlyItems.includes(id)) CFG.filter.onlyItems.push(id);
      log('📦 onlyItems =', CFG.filter.onlyItems);
    },
    addLootExcept(...ids) {
      for (const id of ids) if (!CFG.filter.exceptItems.includes(id)) CFG.filter.exceptItems.push(id);
      log('📦 exceptItems =', CFG.filter.exceptItems);
    },
    clearLootOnly()   { CFG.filter.onlyItems = [];   log('📦 ล้าง onlyItems'); },
    clearLootExcept() { CFG.filter.exceptItems = []; log('📦 ล้าง exceptItems'); },
    // ตั้งดีเลย์ก่อนเริ่มเก็บ (ms หลังของตก) — 0 = เก็บทันที
    setLootDelay(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.lootDelayAfterDropMs = ms;
      log('📦 ดีเลย์ก่อนเก็บ =', ms + 'ms' + (ms ? ' (รอหลังของตก)' : ' (เก็บทันที)'));
    },

    // ---------- Auto-Combat ----------
    combatOn() {
      CFG.combatEnabled = true;
      manualMode = false;   // ★ ผู้ใช้เปิดเอง → ยกเลิก manual mode (auto หาตัวใหม่)
      // ★ v4.187.6: เริ่มนับรอบ AB auto ใหม่เฉพาะตอนว่าง (ห้ามแตะ routine/manual ที่กำลังทำ)
      if (typeof unstuckBuffLastAt !== 'undefined' && typeof unstuckBuffState !== 'undefined' && unstuckBuffState === 'IDLE' && !unstuckBuffManualRun) unstuckBuffLastAt = 0;
      if (!CFG.targetWhitelist.length && !CFG.targetBlacklist.length) console.warn('⚠️ whitelist + blacklist ว่าง = ตีทุกมอน (รวม MVP/มอนแรง) — ควรตั้ง whitelist หรือ blacklist กันตาย');
      log('⚔️ Auto-Combat: ON · Warp Find เปิดใช้งานตามค่าที่ตั้ง และเริ่มนับ AB auto ใหม่');
    },
    combatOff() {
      CFG.combatEnabled = false; target = null;
      clearUnstuckBuffAutoFinishPending();
      // ★ v4.187.6: ไม่ยกเลิก Direct Unstuck/AB ที่เริ่มแล้ว — ป้องกันค้างอยู่จุดเกิด
      // reset เฉพาะ timer auto ตอน IDLE; manual/capture/direct packet ยังใช้ได้
      if (typeof unstuckBuffLastAt !== 'undefined' && typeof unstuckBuffState !== 'undefined' && unstuckBuffState === 'IDLE' && !unstuckBuffManualRun) unstuckBuffLastAt = 0;
      log('⚔️ Auto-Combat: OFF · บล็อก Warp Find/Teleport หามอน + พัก timer AB auto (Direct Unstuck/รับบัพตอนนี้ยังใช้ได้)');
    },
    setTargetWhitelist(...namesOrIds) {
      CFG.targetWhitelist = namesOrIds;
      log('⚔️ whitelist =', namesOrIds.join(', ') || '(ว่าง = ตีทุกมอน)');
    },
    addTargetWhitelist(...x) { for (const e of x) if (!CFG.targetWhitelist.includes(e)) CFG.targetWhitelist.push(e); log('⚔️ whitelist =', CFG.targetWhitelist.join(', ')); },
    clearTargetWhitelist() { CFG.targetWhitelist = []; log('⚔️ ล้าง whitelist = ตีทุกมอน'); },
    setTargetBlacklist(...namesOrIds) { CFG.targetBlacklist = namesOrIds; log('⚔️ blacklist =', namesOrIds.join(', ')); },
    addTargetBlacklist(...x) { for (const e of x) if (!CFG.targetBlacklist.includes(e)) CFG.targetBlacklist.push(e); log('⚔️ blacklist =', CFG.targetBlacklist.join(', ')); },
    clearTargetBlacklist() { CFG.targetBlacklist = []; log('⚔️ ล้าง blacklist'); },
    toggleMobFlee(on) { CFG.mobFleeEnabled = !!on; saveConfigDebounced(); log('🏃 หนีมอนรุม:', CFG.mobFleeEnabled ? 'ON' : 'OFF'); },
    toggleDangerFlee(on) { CFG.dangerFleeEnabled = !!on; saveConfigDebounced(); log('🚨 หนีมอนอันตราย:', CFG.dangerFleeEnabled ? 'ON' : 'OFF'); },
    toggleBlacklistFlee(on) { CFG.blacklistFleeEnabled = !!on; blacklistFleePendingClip = null; blacklistFleeNextTryAt = 0; saveConfigDebounced(); log('🌀 หนี Blacklist เมื่อถูกโจมตี:', CFG.blacklistFleeEnabled ? 'ON' : 'OFF'); },
    toggleTeleportMacro(on) { CFG.teleportMacroEnabled = !!on; if (!CFG.teleportMacroEnabled) teleportMacroClear(); saveConfigDebounced(); log('⌨️ Shared Teleport Macro (WarpFind + Monster Flee):', CFG.teleportMacroEnabled ? 'ON' : 'OFF'); },
    testTeleportMacro() { return startTeleportHotkeyMacro('test', 'Teleport Macro Test', () => { log('❌ Teleport Macro Test: ยิง Alt→1→2→3 ครบแล้วไม่วาร์ป'); return false; }, () => log('✅ Teleport Macro Test: วาร์ปสำเร็จ')); },
    setFleeMob(n) { CFG.fleeOnMobCount = n; saveConfigDebounced(); log('🏃 flee รุม', n, 'ตัว' + (n ? '' : ' (off)')); },
    setFleeWarpCooldown(sec) { CFG.fleeWarpCooldownSec = Math.max(0, Math.min(30, sec)); saveConfigDebounced(); log('🏃 คูลดาวน์วาร์ปหนี:', CFG.fleeWarpCooldownSec + 's' + (CFG.fleeWarpCooldownSec === 0 ? ' (รัวสุด)' : '')); },
    setFleeAggro(n) { CFG.fleeOnAggroCount = n; saveConfigDebounced(); log('🏃 flee aggro', n, 'ตัว' + (n ? '' : ' (off)')); },
    setFleeProximity(n, radius) { CFG.fleeOnProximityCount = n; if (radius != null) CFG.fleeOnProximityRadius = radius; saveConfigDebounced(); log('🏃 flee มอนรอบ', n, 'ตัวในระยะ', CFG.fleeOnProximityRadius); },
    toggleHpFlee(on) { CFG.hpFleeEnabled = !!on; hpFleeLatched = false; hpFleePendingClip = null; hpFleeNextTryAt = 0; saveConfigDebounced(); log('❤️ HP Emergency Flee:', CFG.hpFleeEnabled ? 'ON < ' + CFG.hpFleePercent + '%' : 'OFF'); },
    setHpFleePercent(pct) { CFG.hpFleePercent = Math.max(1, Math.min(99, Number(pct) || 30)); hpFleeLatched = false; saveConfigDebounced(); log('❤️ HP Flee threshold =', CFG.hpFleePercent + '%'); },
    setHpFleeMode(mode) { CFG.hpFleeMode = mode === 'unstuck' ? 'unstuck' : 'sameMap'; hpFleeLatched = false; hpFleePendingClip = null; saveConfigDebounced(); log('❤️ HP Flee mode =', CFG.hpFleeMode === 'unstuck' ? 'Unstuck 0x73' : 'หนีในแมพ (DB → Clip → Wing)'); },
    setRanged(range) { CFG.rangedAttackRange = range; log('🏹 ranged range =', range, range ? '' : '(ใช้ attackRange)'); },
    setAttackRange(r) { CFG.attackRange = r; log('⚔️ attackRange =', r); },
    // ★ ปรับ re-issue/abandon timing (pending spam)
    setAttackReissue(ms) { CFG.attackReIssueMs = ms; log('⚔️ re-issue attack ทุก', ms + 'ms'); },
    setAttackAbandon(ms) { CFG.attackAbandonMs = ms; log('⚔️ abandon ถ้า server เงียบ', ms + 'ms'); },
    setPostCombatDelay(ms) { CFG.postCombatDelayMs = Math.max(0, ms); saveConfigDebounced(); log('⚔️ รอ', CFG.postCombatDelayMs + 'ms หลังสู้เสร็จ/เก็บของเสร็จ'); },
    // toggle helpers สำหรับ UI
    toggleAntiKS(on) { CFG.antiKS = !!on; log('⚔️ antiKS =', CFG.antiKS); },
    // ★★ โหมดเวทย์ — ปิดตีปกติ: ใช้แต่สกิลโจมตี + เดินแค่พอระยะร่าย (กันโดนลากเข้าปะทะ)
    toggleNormalAttack(on) {
      CFG.normalAttackEnabled = !!on; saveConfigDebounced();
      log(on ? '⚔️ ตีปกติ: เปิด (สลับสกิล+ตีปกติ)' : '🪄 โหมดเวทย์: ปิดตีปกติ — ใช้แต่สกิลโจมตี เดินแค่พอระยะร่าย (เช็ค "ครั้ง/มอน" ของสกิลให้สูงพอ เช่น 99 — ค่า default 1 = ร่างครั้งเดียวต่อมอน)');
    },
    toggleAvoidPlayers(on) { CFG.avoidOtherPlayers = !!on; log('⚔️ avoidOtherPlayers =', CFG.avoidOtherPlayers); },
    toggleLowestHpFirst(on) { CFG.targetLowestHpFirst = !!on; log('⚔️ targetLowestHpFirst =', CFG.targetLowestHpFirst); },
    toggleWander(on) { CFG.wanderEnabled = !!on; log('⚔️ wander =', CFG.wanderEnabled); },
    toggleWarpFind(on) { CFG.warpFindEnabled = !!on; log('⚔️ warpFind =', CFG.warpFindEnabled); },
    testWarpFind() { return testWarpFindNow(); },
    toggleChatPauseAlert(on) { CFG.chatPauseOnIncoming = !!on; saveConfigDebounced(); if (!CFG.chatPauseOnIncoming) resumeChatPause(); log('💬 Chat Alert + Pause:', CFG.chatPauseOnIncoming ? 'ON' : 'OFF'); },
    resumeChatPause() { resumeChatPause(); },
    testChatAlert() { triggerChatPause('ผู้เล่นทดสอบ', 'สวัสดีครับ (ข้อความทดสอบ)', 0, 'ใกล้', true); },
    toggleWarpFindFlyWing(on) {
      CFG.warpFindUseFlyWing = !!on;
      if (CFG.warpFindUseFlyWing) CFG.warpFindUseTeleportSkill = false;   // mutual exclusive
      saveConfigDebounced();
      log('🪽 WarpFind ใช้ Fly Wing:', CFG.warpFindUseFlyWing ? 'ON (itemId 601)' : 'OFF');
    },
    toggleWarpFindTeleportSkill(on) {
      CFG.warpFindUseTeleportSkill = !!on;
      if (CFG.warpFindUseTeleportSkill) CFG.warpFindUseFlyWing = false;   // mutual exclusive
      saveConfigDebounced();
      log('🌀 WarpFind ใช้ Teleport Clip:', CFG.warpFindUseTeleportSkill ? 'ON (skillId 53)' : 'OFF' + (!CFG.warpFindUseFlyWing ? ' (packet วาร์ปสุ่มเดิม)' : ''));
    },
    // ★★ GUARD MODE — ยืนประจำตำแหน่ง ตีกลับเฉพาะมอนที่มาตี (เตรียมบอทบัพ)
    toggleGuard(on) { CFG.guardEnabled = !!on; saveConfigDebounced(); if (CFG.guardEnabled) { target = null; guardWasReturning = false; log('🛡️ Guard: ON — ยืนประจำ @(', CFG.guardMap || '(แมปปัจจุบัน)', CFG.guardX + ',' + CFG.guardY + ') ตีกลับเฉพาะมอนที่มาตี'); } else log('🛡️ Guard: OFF'); },
    setGuardPos(map, x, y) { CFG.guardMap = map || ''; CFG.guardX = x; CFG.guardY = y; guardWasReturning = false; saveConfigDebounced(); log('🛡️ Guard จุดยืน =', CFG.guardMap || '(แมปปัจจุบัน)', '@(', x + ',' + y + ')'); },
    // ★★ ไปรับบัพจากบอทอีกตัว (คู่บอท)
    toggleBuffVisit(on) { CFG.buffVisitEnabled = !!on; saveConfigDebounced(); buffVisitState = 'IDLE'; buffVisitLastAt = 0; buffVisitReturnTo = null; log('🔁 ไปรับบัพ:', on ? 'ON' : 'OFF'); },
    setBuffVisitPos(map, x, y, intervalSec, waitSec) { CFG.buffVisitMap = map || ''; CFG.buffVisitX = x; CFG.buffVisitY = y; if (intervalSec > 0) CFG.buffVisitIntervalSec = intervalSec; if (waitSec > 0) CFG.buffVisitWaitSec = waitSec; saveConfigDebounced(); log('🔁 จุดรับบัพ =', CFG.buffVisitMap, '@(', x + ',' + y + ') ทุก', CFG.buffVisitIntervalSec + 's รอ', CFG.buffVisitWaitSec + 's'); },
    toggleUnstuckBuff(on) { CFG.unstuckBuffEnabled = !!on; unstuckBuffState = 'IDLE'; unstuckBuffLastAt = 0; unstuckBuffManualRun = false; unstuckBuffReturnTo = null; clearUnstuckBuffAutoFinishPending(); saveConfigDebounced(); log('🏠 ESC→Unstuck รับบัพ AB:', CFG.unstuckBuffEnabled ? 'ON' : 'OFF'); },
    setUnstuckBuff(intervalSec, waitSec) { if (intervalSec >= 30) CFG.unstuckBuffIntervalSec = intervalSec; CFG.unstuckBuffWaitSec = 2; saveConfigDebounced(); log('🏠 รอบ AB = ทุก', CFG.unstuckBuffIntervalSec + 's · กลับหลัง Unstuck 2s (fixed)'); },
    captureUnstuckButton() { calibrateUnstuckButton(); },
    resetUnstuckButton() { resetUnstuckButton(); },
    captureUnstuckPacket() { return startUnstuckPacketCapture(); },
    stopUnstuckPacketCapture() { return stopUnstuckPacketCapture('ผู้ใช้หยุด'); },
    clearUnstuckPacket() { clearUnstuckPacketCapture(); },
    acceptUnstuckPacket() { return acceptUnstuckPacketCandidate(); },
    getUnstuckPackets() { return unstuckPacketCapturePackets.map(x => ({...x})); },
    getUnstuckPacketCandidate() { return unstuckPacketCandidate ? {...unstuckPacketCandidate} : null; },
    sendUnstuckPacketTest() { return sendDirectUnstuckPacket(); },
    unstuckBuffNow() { startUnstuckBuffNow(); },
    getUnstuckBuffStatus() { return { enabled: CFG.unstuckBuffEnabled, state: unstuckBuffState, intervalSec: CFG.unstuckBuffIntervalSec, waitSec: CFG.unstuckBuffWaitSec, calibrated: CFG.unstuckBuffClickXRatio != null && CFG.unstuckBuffClickYRatio != null, xRatio: CFG.unstuckBuffClickXRatio, yRatio: CFG.unstuckBuffClickYRatio, directPacketEnabled: !!CFG.unstuckPacketEnabled, directPacketHex: CFG.unstuckPacketHex || '', captureActive: unstuckPacketCaptureActive, captureCount: unstuckPacketCapturePackets.length, candidate: unstuckPacketCandidate, returnTo: unstuckBuffReturnTo }; },
    toggleWarpToMonster(on) { CFG.warpToMonster = !!on; log('⚔️ warpToMonster =', CFG.warpToMonster); },
    // debug
    getEntities() {
      const now = nowMs();
      return [...entities.values()].filter(e => e.kind === 1 && e.alive).slice(0, 30).map(e => ({
        id: e.id.toString(16), name: e.name || '?', sub: e.sub, x: e.x, y: e.y,
        hp: e.hp != null && e.hpMax ? (e.hp + '/' + e.hpMax + ' ' + monsterHpPct(e).toFixed(0) + '%') : '?',
        engaged: e._lastEngagedByOtherAt && (now - e._lastEngagedByOtherAt) < 5000,
      }));
    },
    getTarget() { return target ? { id: target.id.toString(16), pending: target.pendingAttacks, engageSec: target.engageAt ? ((nowMs()-target.engageAt)/1000).toFixed(0) : 0 } : null; },
    // ★★ debug — ดูสถานะ combat ครบทุกอย่าง (ใช้ตอนวินิจฉัย)
    debug() {
      const now = nowMs();
      const out = {
        playerId: playerId != null ? playerId.toString(16) : null,
        playerPos: player.x != null ? `(${player.x},${player.y})` : null,
        currentMap,
        target: target ? { id: target.id.toString(16), pending: target.pendingAttacks, firstAttackAt: target.firstAttackAt ? (now - target.firstAttackAt) + 'ms ago' : null, lastResultAt: target.lastAttackResultAt ? (now - target.lastAttackResultAt) + 'ms ago' : null } : null,
        mobAttackers: [...mobAttackers.entries()].map(([id, t]) => ({
          id: id.toString(16), ago: (now - t) + 'ms',
          entity: entities.has(id) ? { kind: entities.get(id).kind, alive: entities.get(id).alive, x: entities.get(id).x, y: entities.get(id).y, name: entities.get(id).name } : '(ไม่อยู่ใน entities!)',
        })),
        monsterAggro: [...monsterAggro.entries()].map(([id, t]) => ({
          id: id.toString(16), ago: (now - t) + 'ms',
          entity: entities.has(id) ? { kind: entities.get(id).kind, alive: entities.get(id).alive } : '(ไม่อยู่ใน entities!)',
        })),
        entities: {
          total: entities.size,
          players: [...entities.values()].filter(e => e.kind === 0).length,
          monsters: [...entities.values()].filter(e => e.kind === 1 && e.alive).length,
          npcs: [...entities.values()].filter(e => e.kind === 2).length,
        },
        flee: {
          enabled: CFG.fleeFromPlayers,
          maps: CFG.fleeMaps,
          radius: CFG.fleePlayerRadius,
          cooldownSec: CFG.fleeWarpCooldownSec,
          cooldownLeft: fleeCooldownUntil > now ? (fleeCooldownUntil - now) + 'ms' : 'ready',
        },
        combat: { enabled: CFG.combatEnabled, manualMode },
      };
      console.log('%c 🔍 ASSIST DEBUG ', 'background:#e74c3c;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold');
      console.table([out]);
      return out;
    },
    getAggro() { return { mobAttackers: getMobAttackerCount(CFG.fleeOnProximityRadius), aggro: getAggroCount(CFG.fleeOnProximityRadius), threat: getThreatCount(CFG.fleeOnProximityRadius), monstersNearby: countMonsters(CFG.fleeOnProximityRadius) }; },
    // ★ debug: ดู entities ทั้งหมดเพื่อหาสาเหตุ acquire ไม่ติด
    debugEntities() {
      const now = nowMs();
      let spawnCount = 0, ghostCount = 0, monsterCount = 0, targetableCount = 0;
      const sample = [];
      for (const e of entities.values()) {
        if (e.sub != null) spawnCount++; else ghostCount++;
        if (e.kind === 1 && e.alive) {
          monsterCount++;
          if (sample.length < 8) sample.push({ id: e.id.toString(16), name: e.name, sub: e.sub, x: e.x, y: e.y, hp: e.hp, hpMax: e.hpMax, targetable: isTargetable(e, now) });
          if (isTargetable(e, now)) targetableCount++;
        }
      }
      console.log('entities total:', entities.size, '| fromSPAWN:', spawnCount, '| ghost:', ghostCount, '| monsters:', monsterCount, '| targetable:', targetableCount);
      // ★ debug playerId vs entity: ดูว่า player entity มีพิกัดตรงกับ player.x/y ไหม
      const playerEntity = playerId ? entities.get(playerId) : null;
      console.log('playerId:', playerId ? playerId.toString(16) : 'NULL', '| player.x/y:', player.x, player.y,
        '| playerEntity:', playerEntity ? `{x:${playerEntity.x}, y:${playerEntity.y}, kind:${playerEntity.kind}, name:${playerEntity.name}}` : 'NOT IN ENTITIES');
      // ★ debug target ปัจจุบัน (แม้อยู่นอก 8 ตัวแรก)
      if (target) {
        const tm = entities.get(target.id);
        console.log('TARGET:', target.id.toString(16), '| pending:', target.pendingAttacks, '| firstAttackAt:', target.firstAttackAt ? ((now-target.firstAttackAt)/1000).toFixed(1)+'s' : 'none',
          '| inEntities:', !!tm, tm ? `{name:${tm.name}, hp:${tm.hp}/${tm.hpMax}, _lastDamageAt:${tm._lastDamageAt ? ((now-tm._lastDamageAt)/1000).toFixed(1)+'s ago' : 'NEVER'}}` : '');
      }
      console.table(sample);
      return { total: entities.size, spawnCount, ghostCount, monsterCount, targetableCount, sample, player: { ...player }, playerId: playerId ? playerId.toString(16) : null };
    },

    // ---------- ทั่วไป ----------
    name(id, label) { CFG.itemNames[id] = label; log('🏷️', id, '=', label); },
    config() { return CFG; },
    // ★★ Market Search / Price Compare
    marketOpenShop(shopId) { return marketOpenSelectedShop(shopId, ''); },
    marketSearch(q) { return marketFilteredRows(q || '').map(r=>({itemId:r.item.itemId,name:nameOf(r.item.itemId),price:r.item.price,qty:r.item.qty,shop:r.shop.shopName,seller:r.shop.sellerName,map:r.shop.map,x:r.shop.x,y:r.shop.y,accessX:r.shop.accessX,accessY:r.shop.accessY,ageMs:Date.now()-r.shop.t})); },
    marketOpen() { openMarketPanel(); },
    marketScan(maxShops) { openMarketPanel(); return marketScanVisible(maxShops == null ? 'all' : maxShops); },
    marketSweep(maxShops) { openMarketPanel(); return marketSweepMap(maxShops == null ? 'all' : maxShops, 'saved'); },
    marketSweepPronLower(maxShops) { openMarketPanel(); return marketSweepMap(maxShops == null ? 'all' : maxShops, 'pron-lower'); },
    marketSweepStop() { if(marketSweepActive){ marketSweepCancel=true; return true; } return false; },
    marketPointAdd() { openMarketPanel(); return marketAddSavedPoint(); },
    marketPointUndo() { return marketRemoveLastSavedPoint(); },
    marketRouteClear() { return marketClearRecordedRoute(); },
    marketRoute() { return marketGetRecordedRoute(); },
    marketPreset() { const p=marketPresetForMap(); return p ? {id:p.id,name:p.name,map:p.map,points:p.points.slice()} : null; },
    marketDiscoveryStatus() { return {signature:marketShopIdSignature,probePackets:marketProbePackets.length,knownShopIds:[...marketKnownOpenIds],discovered:marketShopIdSignature?marketDiscoverIdsBySignature(marketShopIdSignature,300):[],route:{points:marketGetRecordedRoute().length,preset:(marketPresetForMap()?marketPresetForMap().name:null),presetPoints:marketPresetRoute().length},sweep:{active:marketSweepActive,mode:marketSweepMode,waypoint:marketSweepWaypointIdx,total:marketSweepWaypoints.length,checkedIds:marketSweepCheckedIds.size}}; },
    marketClearIndex() { marketClearIndex(); },
    // ★★ Packet capture — สำหรับวิเคราะห์ protocol
    //   ASSIST.captureStart(10) → capture 10 วินาที → log hex ทุก packet ขาเข้า
    //   ASSIST.captureStop() → หยุด + return array ของ packets ทั้งหมด
    _captureBuf: [],
    _captureUntil: 0,
    captureStart(seconds) {
      this._captureBuf = [];
      this._captureUntil = Date.now() + (seconds || 10) * 1000;
      log('📡 Packet capture เริ่ม — ' + (seconds || 10) + ' วินาที');
    },
    captureStop() {
      this._captureUntil = 0;
      const out = this._captureBuf.slice();
      this._captureBuf = [];
      log('📡 Packet capture หยุด — ' + out.length + ' packets');
      // ★ print hex แบบสวยๆ ใน console
      out.forEach((p, i) => {
        const hex = Array.from(p.data).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`[${i}] op=0x${p.data[0].toString(16)} t=${p.t} | ${hex.slice(0, 120)}${hex.length > 120 ? '...' : ''}`);
      });
      console.log('★ ทั้งหมด ' + out.length + ' packets — ก๊อปปี้จาก console ได้เลย');
      return out;
    },
    // ---------- สถิติ + log (สำหรับ panel) ----------
    getStats() {
      const elapsed = Math.max(1, Date.now() - stats.startTime);
      const elapsedMin = elapsed / 60000;
      const now = Date.now();
      // ★ rolling window cleanup + calc (mirror world.js:1699-1721, bot.js:4439-4443)
      const dpsWindow = stats.dealtWindow.filter(d => d.t >= now - 10000);
      const atkWindow = stats.attackWindow.filter(a => a.t >= now - 10000);
      const goldWin = stats.goldWindow.filter(g => g.t >= now - 300000);
      // trim old entries (กัน array โตไม่หยุด)
      if (stats.dealtWindow.length > 500) stats.dealtWindow = dpsWindow;
      if (stats.attackWindow.length > 500) stats.attackWindow = atkWindow;
      if (stats.goldWindow.length > 500) stats.goldWindow = goldWin;
      return {
        ...stats,
        itemsByCount: [...stats.itemsByCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => ({ id, name: nameOf(id), count: n })),
        elapsedMs: elapsed,
        expPerMin: elapsedMin > 0 ? Math.round(stats.expGained / elapsedMin) : 0,
        killsPerMin: elapsedMin > 0 ? +(stats.kills / elapsedMin).toFixed(1) : 0,
        dps: dpsWindow.length > 0 ? Math.round(dpsWindow.reduce((s, d) => s + d.damage, 0) / 10) : 0,
        aspd: atkWindow.length > 0 ? +((atkWindow.length / 10)).toFixed(1) : 0,
        goldRatePerHour: goldWin.length > 0 ? Math.round(goldWin.reduce((s, g) => s + g.gold, 0) / 5 * 60) : 0,
      };
    },
    resetStats() { resetStats(); log('📊 รีเซ็ตสถิติแล้ว'); },
    getLogs() { return logBuf.slice(); },
    getDbgLogs() { return dbgBuf.slice(); },
    clearLogs() { logBuf.length = 0; log('🧹 ล้าง log'); },
    getImportantLogs() { return importantLogBuf.slice(); },
    clearImportantLogs() { importantLogBuf.length = 0; log('🧹 ล้าง log สำคัญ'); },
    stopAll() {
      clearInterval(healLoop); clearInterval(lootLoop); clearInterval(warpLoop); clearInterval(combatLoop); clearInterval(sellLoop); clearInterval(storageLoop); clearInterval(buffLoop); clearInterval(buffOthersLoop); clearInterval(buffVisitLoop); clearInterval(unstuckBuffLoop); clearInterval(unstuckPacketCaptureWatcher); clearInterval(consoleClearLoop); clearInterval(teleportFlusher); clearInterval(hpEmergencyFleeLoop); clearInterval(playerFleeFallbackLoop);
      if (typeof uiLoop !== 'undefined') clearInterval(uiLoop);
      log('⏹ หยุดระบบทั้งหมดแล้ว');
    },
    // ---------- version + update ----------
    version() { return { current: VERSION, latest: latestVersion, updateAvailable: latestVersion ? cmpVer(latestVersion, VERSION) > 0 : false }; },
    checkVersion() { return checkVersion(); },
    update() { return doUpdate(); },
    saveConfig() { saveConfig(); log('💾 บันทึกการตั้งค่าลงเครื่องแล้ว'); },

    // ---------- Full export/import (ย้ายเครื่อง) ----------
    //  รวม: config + buff times + skill times + nav data
    // ---------- Profile — ชุดการตั้งค่าแยกหลายชุด ----------
    activeProfile() { try { return localStorage.getItem(PROFILE_ACTIVE_KEY) || 'default'; } catch (e) { return 'default'; } },
    listProfiles() {
      const obj = loadProfilesObj();
      const names = Object.keys(obj);
      const cur = this.activeProfile();
      if (!names.includes(cur)) names.unshift(cur);
      names.sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a.localeCompare(b)));
      return names;
    },
    saveProfileAs(name) {
      name = String(name || '').trim();
      if (!name) { log('⚠️ กรุณาใส่ชื่อ profile ก่อนบันทึก'); return false; }
      const obj = loadProfilesObj();
      const existed = !!obj[name];
      obj[name] = buildPersistObject();
      saveProfilesObj(obj);
      log(existed ? '💾 บันทึกทับ profile "' + name + '" (' + Object.keys(obj[name]).length + ' รายการ)'
                  : '💾 สร้าง profile "' + name + '" จากค่าปัจจุบัน');
      return true;
    },
    switchProfile(name) {
      const obj = loadProfilesObj();
      const target = obj[name];
      if (!target) { log('⚠️ ไม่พบ profile:', name, '— สร้างก่อนด้วย "บันทึกเป็น"'); return false; }
      const cur = this.activeProfile();
      if (name === cur) { log('ℹ️ กำลังใช้ profile "' + name + '" อยู่แล้ว'); return false; }
      obj[cur] = buildPersistObject();   // ★ เซฟของเดิมเข้าชื่อปัจจุบันก่อนสลับ (กันของหาย)
      saveProfilesObj(obj);
      // ★ แทนที่ทั้งชุด: key ที่ profile ใหม่ไม่มี = กลับ default (ไม่ค้างจากชุดเดิม)
      for (const k of PROFILE_KEYS) CFG[k] = (k in target) ? target[k] : (k in CFG_DEFAULTS ? CFG_DEFAULTS[k] : CFG[k]);
      try { localStorage.setItem(PROFILE_ACTIVE_KEY, name); } catch (e) {}
      saveConfig();
      log('🔄 สลับ profile:', cur, '→', name, '· (ค่าเดิมเซฟไว้ใน "' + cur + '" แล้ว — แนะนำปิด-เปิด panel ให้ช่องตั้งค่าแสดงค่าใหม่)');
      return true;
    },
    deleteProfile(name) {
      const obj = loadProfilesObj();
      if (!obj[name]) { log('⚠️ ไม่พบ profile:', name); return false; }
      if (name === this.activeProfile()) { log('⚠️ ห้ามลบ profile ที่กำลังใช้อยู่ — สลับไปตัวอื่นก่อน'); return false; }
      delete obj[name];
      saveProfilesObj(obj);
      log('🗑 ลบ profile "' + name + '" แล้ว');
      return true;
    },
    exportAll() {
      const data = { _version: VERSION, _exportedAt: new Date().toISOString() };
      const cfg = {};
      for (const k of EXPORT_KEYS) if (k in CFG) cfg[k] = CFG[k];
      // ★ sort item ID arrays ตามเลขไอดี (เวลา export จะได้มองง่าย)
      const sortNum = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => a - b) : arr;
      if (cfg.healItems) cfg.healItems = sortNum(cfg.healItems);
      if (cfg.sellItemIds) cfg.sellItemIds = sortNum(cfg.sellItemIds);
      if (cfg.depositItemIds) cfg.depositItemIds = sortNum(cfg.depositItemIds);
      if (cfg.buffItems && Array.isArray(cfg.buffItems)) cfg.buffItems = [...cfg.buffItems].sort((a, b) => a.itemId - b.itemId);
      data.config = cfg;
      const buff = {};
      for (const [id, ts] of lastBuffUse) buff[id] = ts;
      data.buffTimes = buff;
      const skill = {};
      for (const [id, ts] of lastSkillUse) skill[id] = ts;
      data.skillTimes = skill;
      data.nav = navExportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ro-assist-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      URL.revokeObjectURL(url);
      log('📤 export ข้อมูลทั้งหมด: config + buff + skill + nav (ไม่รวม credentials)');
    },
    importAll(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        if (!data || typeof data !== 'object') throw new Error('รูปแบบผิด');
        let count = 0;
        if (data.config) {
          for (const k of EXPORT_KEYS) if (k in data.config) { CFG[k] = data.config[k]; count++; }
          const skippedSecrets = [...SECRET_KEYS].filter(k => k in data.config).length;
          if (skippedSecrets) log('🔐 import: ข้าม credentials จาก backup เก่า ' + skippedSecrets + ' ค่า');
          saveConfig();
        }
        if (data.buffTimes) {
          lastBuffUse.clear();
          for (const [id, ts] of Object.entries(data.buffTimes)) lastBuffUse.set(Number(id), Number(ts) || 0);
          saveBuffTimes();
        }
        if (data.skillTimes) {
          lastSkillUse.clear();
          for (const [id, ts] of Object.entries(data.skillTimes)) lastSkillUse.set(Number(id), Number(ts) || 0);
          saveSkillTimes();
        }
        if (data.nav) { count += navImportAll(data.nav); }
        log('📥 import ข้อมูลสำเร็จ: ' + count + ' รายการ');
      } catch (e) { log('⚠️ import ล้มเหลว:', e.message); }
    },
  };

  // ============================================================
  //  UI — mini-bar + popup panel (ฝังในหน้าเกม)
  // ============================================================
  let uiLoop;          // render interval (clear ใน stopAll)
  // ★ editing input tracking (module-level — ใช้ได้ทั้ง buildUI + renderUI)
  //   Unity แย่ง focus ทุกเฟรม → document.activeElement ไม่เชื่อถือได้
  //   track ด้วย focusin/focusout แทน
  const editingInputs = new WeakSet();
  const isEditing = (el) => el && editingInputs.has(el);
  // ============================================================
  //  ITEM-LIST POPUP — จัดการรายการ item (only/except) แบบ visual
  //    listType: 'only' | 'except' (สำหรับ loot filter)
  // ============================================================
  // ★ source ของรายการที่จะแสดงในช่องค้นหา = itemDB ทั้งหมด + inventory ปัจจุบัน
  function itemDBEntries() {
    const entries = [];
    // ★ inventory ปัจจุบัน แสดงก่อน (ใช้บ่อยที่สุด)
    for (const [id, count] of inventory.entries()) {
      if (count > 0) entries.push({ id: Number(id), name: itemDisplayName(id), count, src: 'inv' });
    }
    // ★ itemDB ทั้งหมด (ถ้าโหลดแล้ว)
    if (itemDB.loaded) {
      for (const id of Object.keys(itemDB.names)) {
        const numId = Number(id);
        if (!inventory.has(numId)) entries.push({ id: numId, name: itemDB.names[id], src: 'db' });
      }
    }
    return entries;
  }
  // ============================================================
  //  SKILL PRESETS — ฐานข้อมูลสกิลสำเร็จรูป (เลือกใช้ได้เลย)
  //    แต่ละสกิลมีค่า default ที่ทดสอบแล้ว — ผู้ใช้ปรับแต่งเพิ่มเติมได้หลังเพิ่ม
  //    skillId จาก packet capture: targeted=1 byte, AoE/self=2 bytes LE
  // ============================================================
  // ★ SKILL_PRESETS — เฉพาะสกิลที่ทดลองแล้ว (verify จาก packet capture)
  //    ถ้ายังไม่ได้ทดลอง = ไม่ใส่ (กันค่าผิด)
  const SKILL_PRESETS = [
    // ---- Swordsman/Knight (จากบอทหลัก config + packet capture) ----
    { name: 'Bash', skillId: 3, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 2, spMin: 15, cooldownMs: 72, job: 'Swordsman/Knight', desc: 'ตีแรง + สตัน' },
    { name: 'Magnum Break', skillId: 6, level: 10, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 90, job: 'Knight', desc: 'AoE รอบตัว' },
    { name: 'Provoke', skillId: 7, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, spMin: 5, cooldownMs: 3, job: 'Swordsman', desc: 'ลด def มอน' },
    { name: 'Endure', skillId: 4, level: 10, selfCast: true, intervalMin: 3, spMin: 10, cooldownMs: 1, job: 'Swordsman', desc: 'บัพ ไม่กระตุก' },
    { name: 'Twohand Quicken', skillId: 30, level: 10, selfCast: true, intervalMin: 3, spMin: 50, cooldownMs: 1, job: 'Knight', desc: 'บัพ ASPD ดาบสองมือ' },
    { name: 'Bowling Bash', skillId: 32, level: 10, targeted: true, mobCountMin: 2, maxUsesPerTarget: 1, maxDistance: 2, spMin: 22, cooldownMs: 84, job: 'Knight Lord', desc: 'ตีกระแทก' },
    { name: 'Charge Attack', skillId: 40, level: 1, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, minDistance: 5, spMin: 30, cooldownMs: 114, job: 'Knight', desc: 'พุ่งเข้าหามอน' },
    // ---- Archer/Hunter (ทดลองครบ) ----
    { name: 'Double Strafe', skillId: 24, level: 10, targeted: true, maxUsesPerTarget: 2, maxDistance: 15, spMin: 20, cooldownMs: 60000, job: 'Archer/Hunter', desc: 'ยิง 2 ลูก' },
    { name: 'Improve Concentration', skillId: 27, level: 10, selfCast: true, intervalMin: 4.3, spMin: 70, cooldownMs: 1, job: 'Archer/Hunter', desc: 'บัพ DEX+AGI' },
    { name: 'Charge Arrow', skillId: 25, level: 1, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, spMin: 20, cooldownMs: 60000, job: 'Archer/Hunter', desc: 'ดันมอนออกไกล' },
    { name: 'Arrow Shower', skillId: 26, level: 5, ground: true, maxUsesPerTarget: 1, maxDistance: 10, mobCountMin: 2, spMin: 20, cooldownMs: 60000, job: 'Hunter', desc: 'AoE ธนู (เลือกพื้นที่)' },
    // ---- Thief/Assassin/Rogue (จาก packet capture) ----
    { name: 'Steal', skillId: 61, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 2, spMin: 15, cooldownMs: 30000, job: 'Thief/Assassin/Rogue', desc: 'ขโมยของจากมอน (ใช้ที่เลเวลสูงสุด)' },
    { name: 'Sonic Blow', skillId: 126, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 2, spMin: 40, cooldownMs: 120000, job: 'Assassin/SinX', desc: 'ฟัน 8 ครั้งรวด (ดาเมจหนัก)' },
    // ============================================================
    // ★★ สกิลทั้งหมดจาก Skills.toml ของ RagnarokRebuildTcp (server ตัวจริงของเกมนี้)
    //   ID = ลำดับในไฟล์ (None=0) — ยืนยันแน่นอน: preset 13 ตัวที่ capture จริงตรง 100%
    //   ข้อมูล: ชื่อ/เป้าหมาย/MaxLevel/SP ต่อเลเวล/ปรับเลเวลได้ มาจาก server โดยตรง
    //   ⚠️ สกิลที่ไม่ได้ capture ยืนยัน = ค่า default (cooldown/ระยะ) — ปรับตามจำเป็น
    // ============================================================
    { name: "First Aid", skillId: 2, level: 1, selfCast: true, intervalMin: 4, spMin: 4, cooldownMs: 2000, job: "Novice", desc: "ตัวเอง · SP 4 · ยังไม่ทดสอบ" },
    { name: "Fire Bolt", skillId: 11, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 12/14/16/18/20/22/24/26/28/30 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Cold Bolt", skillId: 12, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 12/14/16/18/20/22/24/26/28/30 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Fireball", skillId: 13, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 25, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 25/25/25/25/25/25/25/25/25/25 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Fire Wall", skillId: 14, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 40, cooldownMs: 2000, job: "Mage", desc: "AoEพื้น · SP 40/40/40/40/40/40/40/40/40/40 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Frost Diver", skillId: 15, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 25, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 25/24/23/22/21/20/19/18/17/16 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Lightning Bolt", skillId: 16, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 12/14/16/18/20/22/24/26/28/30 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Napalm Beat", skillId: 17, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 18, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 9/9/9/12/12/12/15/15/15/18 · ยังไม่ทดสอบ" },
    { name: "Soul Strike", skillId: 18, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 42, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 18/14/24/20/30/26/36/32/42/38 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Thunderstorm", skillId: 19, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 74, cooldownMs: 2000, job: "Mage", desc: "AoEพื้น · SP 29/34/39/44/49/54/59/64/69/74 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Safety Wall", skillId: 20, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 40, cooldownMs: 2000, job: "Mage", desc: "AoEพื้น · SP 30/30/30/35/35/35/40/40/40/40 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Stone Curse", skillId: 21, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 25, cooldownMs: 2000, job: "Mage", desc: "โจมตี · SP 25/24/23/22/21/20/19/18/17/16 · ยังไม่ทดสอบ" },
    { name: "Sight", skillId: 22, level: 1, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Mage", desc: "ตัวเอง · SP 10 · ยังไม่ทดสอบ" },
    { name: "Energy Coat", skillId: 23, level: 1, selfCast: true, intervalMin: 4, spMin: 30, cooldownMs: 2000, job: "Mage", desc: "ตัวเอง · SP 30 · ยังไม่ทดสอบ" },
    { name: "Counter Attack", skillId: 31, level: 5, selfCast: true, intervalMin: 4, spMin: 3, cooldownMs: 2000, job: "Knight", desc: "ตัวเอง · SP 3 · ยังไม่ทดสอบ" },
    { name: "Pierce", skillId: 36, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 7, cooldownMs: 2000, job: "Knight", desc: "โจมตี · SP 7 · ยังไม่ทดสอบ" },
    { name: "Spear Stab", skillId: 37, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 9, cooldownMs: 2000, job: "Knight", desc: "โจมตี · SP 9 · ยังไม่ทดสอบ" },
    { name: "Brandish Spear", skillId: 38, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Knight", desc: "โจมตี · SP 12/12/12/12/12/12/12/12/12/12 · ยังไม่ทดสอบ" },
    { name: "Spear Boomerang", skillId: 39, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Knight", desc: "โจมตี · SP 10 · ยังไม่ทดสอบ" },
    { name: "Heal", skillId: 41, level: 10, ally: true, hpBelowPct: 50, spMin: 40, cooldownMs: 2500, job: "Acolyte", desc: "Ally→ใช้กับตัวเอง · ใช้เมื่อ HP<50% · SP 13/16/19/22/25/28/31/34/37/40 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Heal (รักษาผู้เล่นอื่น)", skillId: 41, level: 10, buffMode: true, buffAll: true, targetHpBelowPct: 90, repeatSec: 30, maxDistance: 9, spMin: 40, cooldownMs: 2500, job: "Acolyte/Priest", desc: "บอทรักษา · ให้ทุกคนที่ HP<90% ในรัศมี 9 ช่อง · ซ้ำ/คนทุก 30 วิ · SP 13-40 · ยังไม่ทดสอบ" },
    { name: "Blessing (บัพให้คน)", skillId: 44, level: 10, buffMode: true, buffAll: true, repeatSec: 300, maxDistance: 9, spMin: 64, cooldownMs: 3000, job: "Acolyte/Priest", desc: "บอทบัพ · ให้ทุกคนในรัศมี 9 ช่อง · ซ้ำ/คนทุก 5 นาที · SP 28-64 · ยังไม่ทดสอบ" },
    { name: "Increase Agility (บัพให้คน)", skillId: 42, level: 10, buffMode: true, buffAll: true, repeatSec: 300, maxDistance: 9, spMin: 45, cooldownMs: 3000, job: "Acolyte/Priest", desc: "บอทบัพ · ให้ทุกคนในรัศมี 9 ช่อง · ซ้ำ/คนทุก 5 นาที · SP 18-45 · ยังไม่ทดสอบ" },
    { name: "Increase Agility", skillId: 42, level: 10, ally: true, intervalMin: 4, spMin: 45, cooldownMs: 2000, job: "Acolyte", desc: "Ally→ใช้กับตัวเอง · SP 18/21/24/27/30/33/36/39/42/45 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Decrease Agility", skillId: 43, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 33, cooldownMs: 2000, job: "Acolyte", desc: "โจมตี · SP 15/17/19/21/23/25/27/29/31/33 · ยังไม่ทดสอบ" },
    { name: "Blessing", skillId: 44, level: 10, ally: true, intervalMin: 4, spMin: 64, cooldownMs: 2000, job: "Acolyte", desc: "Ally→ใช้กับตัวเอง · SP 28/32/36/40/44/48/52/56/60/64 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Angelus", skillId: 47, level: 10, selfCast: true, intervalMin: 4, spMin: 50, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 23/26/29/32/35/38/41/44/47/50 · ยังไม่ทดสอบ" },
    { name: "Signum Crusis", skillId: 48, level: 10, selfCast: true, intervalMin: 4, spMin: 35, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 35/35/35/35/35/35/35/35/35/35 · ยังไม่ทดสอบ" },
    { name: "Cure", skillId: 49, level: 1, ally: true, intervalMin: 4, spMin: 15, cooldownMs: 2000, job: "Acolyte", desc: "Ally→ใช้กับตัวเอง · SP 15 · ยังไม่ทดสอบ" },
    { name: "Aqua Benedicta", skillId: 50, level: 1, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 10 · ยังไม่ทดสอบ" },
    { name: "Pneuma", skillId: 51, level: 1, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Acolyte", desc: "AoEพื้น · SP 10 · ยังไม่ทดสอบ" },
    { name: "Ruwach", skillId: 52, level: 1, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 10 · ยังไม่ทดสอบ" },
    { name: "Teleport", skillId: 53, level: 1, selfCast: true, intervalMin: 4, spMin: 30, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 30 · ยังไม่ทดสอบ" },
    { name: "Return", skillId: 54, level: 1, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Acolyte", desc: "ตัวเอง · SP 10 · ยังไม่ทดสอบ" },
    { name: "Warp Portal", skillId: 55, level: 4, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 35, cooldownMs: 2000, job: "Acolyte", desc: "AoEพื้น · SP 35/32/29/26 · ยังไม่ทดสอบ" },
    { name: "Holy Light", skillId: 56, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 15, cooldownMs: 2000, job: "Acolyte", desc: "โจมตี · SP 15 · ยังไม่ทดสอบ" },
    { name: "Envenom", skillId: 58, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Thief", desc: "โจมตี · SP 12/12/12/12/12/12/12/12/12/12 · ยังไม่ทดสอบ" },
    { name: "Detoxify", skillId: 59, level: 1, ally: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Thief", desc: "Ally→ใช้กับตัวเอง · SP 10 · ยังไม่ทดสอบ" },
    { name: "Back Slide", skillId: 60, level: 1, selfCast: true, intervalMin: 4, spMin: 5, cooldownMs: 2000, job: "Thief", desc: "ตัวเอง · SP 5 · ยังไม่ทดสอบ" },
    { name: "Sand Attack", skillId: 62, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 9, cooldownMs: 2000, job: "Thief", desc: "โจมตี · SP 9 · ยังไม่ทดสอบ" },
    { name: "Stone Fling", skillId: 63, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 2, cooldownMs: 2000, job: "Thief", desc: "โจมตี · SP 2 · ยังไม่ทดสอบ" },
    { name: "Find Stone", skillId: 64, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 2, cooldownMs: 2000, job: "Thief", desc: "โจมตี · SP 2 · ยังไม่ทดสอบ" },
    { name: "Hiding", skillId: 65, level: 10, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Thief", desc: "ตัวเอง · SP 10/10/10/10/10/10/10/10/10/10 · ยังไม่ทดสอบ" },
    { name: "Vending", skillId: 70, level: 10, selfCast: true, intervalMin: 4, spMin: 0, cooldownMs: 2000, job: "Merchant", desc: "ตัวเอง · SP 0/0/0/0/0/0/0/0/0/0 · ยังไม่ทดสอบ" },
    { name: "Mammonite", skillId: 72, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 5, cooldownMs: 2000, job: "Merchant", desc: "โจมตี · SP 5/5/5/5/5/5/5/5/5/5 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Crazy Uproar", skillId: 74, level: 1, selfCast: true, intervalMin: 4, spMin: 8, cooldownMs: 2000, job: "Merchant", desc: "ตัวเอง · SP 8 · ยังไม่ทดสอบ" },
    { name: "Cart Revolution", skillId: 75, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Merchant", desc: "โจมตี · SP 12 · ยังไม่ทดสอบ" },
    { name: "Aspersio", skillId: 76, level: 5, ally: true, intervalMin: 4, spMin: 20, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 12/14/16/18/20 · ยังไม่ทดสอบ" },
    { name: "Benedictio Sanctissimi Sacramenti", skillId: 77, level: 5, ally: true, intervalMin: 4, spMin: 20, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Sanctuary", skillId: 78, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 42, cooldownMs: 2000, job: "Priest", desc: "AoEพื้น · SP 15/18/21/24/27/30/33/36/39/42 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Gloria", skillId: 79, level: 5, selfCast: true, intervalMin: 4, spMin: 20, cooldownMs: 2000, job: "Priest", desc: "ตัวเอง · SP 20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Magnificat", skillId: 80, level: 5, selfCast: true, intervalMin: 4, spMin: 40, cooldownMs: 2000, job: "Priest", desc: "ตัวเอง · SP 40/40/40/40/40 · ยังไม่ทดสอบ" },
    { name: "Impositio Manus", skillId: 81, level: 5, ally: true, intervalMin: 4, spMin: 24, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 13/16/19/21/24 · ยังไม่ทดสอบ" },
    { name: "Kyrie Eleison", skillId: 82, level: 10, ally: true, intervalMin: 4, spMin: 35, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 20/20/20/25/25/25/30/30/30/35 · ยังไม่ทดสอบ" },
    { name: "Lex Aeterna", skillId: 83, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Priest", desc: "โจมตี · SP 10 · ยังไม่ทดสอบ" },
    { name: "Lex Divina", skillId: 84, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Priest", desc: "โจมตี · SP 20/20/20/20/20/18/16/14/12/10 · ยังไม่ทดสอบ" },
    { name: "Magnus Exorcismus", skillId: 85, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 58, cooldownMs: 2000, job: "Priest", desc: "AoEพื้น · SP 40/42/44/46/48/50/52/54/56/58 · ยังไม่ทดสอบ" },
    { name: "Resurrection", skillId: 86, level: 4, ally: true, intervalMin: 4, spMin: 60, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 60/60/60/60 · ยังไม่ทดสอบ" },
    { name: "Status Recovery", skillId: 87, level: 1, ally: true, intervalMin: 4, spMin: 5, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 5 · ยังไม่ทดสอบ" },
    { name: "Suffragium", skillId: 88, level: 3, ally: true, intervalMin: 4, spMin: 8, cooldownMs: 2000, job: "Priest", desc: "Ally→ใช้กับตัวเอง · SP 8 · ยังไม่ทดสอบ" },
    { name: "Turn Undead", skillId: 89, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Priest", desc: "โจมตี · SP 20/20/20/20/20/20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Earth Spike", skillId: 91, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Wizard", desc: "โจมตี · SP 12/14/16/18/20 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Heaven's Drive", skillId: 92, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 44, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 28/32/36/40/44 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Fire Pillar", skillId: 93, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 75, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 75/75/75/75/75/75/75/75/75/75 · ยังไม่ทดสอบ" },
    { name: "Frost Nova", skillId: 94, level: 10, selfCast: true, intervalMin: 4, spMin: 45, cooldownMs: 2000, job: "Wizard", desc: "ตัวเอง · SP 45/43/41/39/37/35/33/31/29/27 · ยังไม่ทดสอบ" },
    { name: "Ice Wall", skillId: 95, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 20/20/20/20/20/20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Jupitel Thunder", skillId: 96, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 47, cooldownMs: 2000, job: "Wizard", desc: "โจมตี · SP 20/23/26/29/36/35/38/41/44/47 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Lord of Vermilion", skillId: 97, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 96, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 60/64/68/72/76/80/84/88/92/96 · ยังไม่ทดสอบ" },
    { name: "Meteor Storm", skillId: 98, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 64, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 20/24/30/34/40/44/50/54/60/64 · ยังไม่ทดสอบ" },
    { name: "Quagmire", skillId: 99, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 25, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 5/10/15/20/25 · ยังไม่ทดสอบ" },
    { name: "Sense", skillId: 100, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Wizard", desc: "โจมตี · SP 10 · ยังไม่ทดสอบ" },
    { name: "Sightrasher", skillId: 101, level: 10, selfCast: true, intervalMin: 4, spMin: 53, cooldownMs: 2000, job: "Wizard", desc: "ตัวเอง · SP 35/37/39/41/43/45/47/49/51/53 · ยังไม่ทดสอบ" },
    { name: "Storm Gust", skillId: 102, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 78, cooldownMs: 2000, job: "Wizard", desc: "AoEพื้น · SP 78/78/78/78/78/78/78/78/78/78 · ปรับเลเวลได้ · ยังไม่ทดสอบ" },
    { name: "Water Ball", skillId: 103, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 25, cooldownMs: 2000, job: "Wizard", desc: "โจมตี · SP 15/20/20/25/25/25/25/25/25/25 · ยังไม่ทดสอบ" },
    { name: "Detect", skillId: 106, level: 1, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 8, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 8 · ยังไม่ทดสอบ" },
    { name: "Blitz Beat", skillId: 107, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 22, cooldownMs: 2000, job: "Hunter", desc: "โจมตี · SP 10/13/16/19/22 · ยังไม่ทดสอบ" },
    { name: "Land Mine", skillId: 109, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Remove Trap", skillId: 110, level: 1, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 5, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 5 · ยังไม่ทดสอบ" },
    { name: "Spring Trap", skillId: 111, level: 1, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 10 · ยังไม่ทดสอบ" },
    { name: "Skid Trap", skillId: 112, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 10/10/10/10/10 · ยังไม่ทดสอบ" },
    { name: "Ankle Snare", skillId: 113, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 12/12/12/12/12 · ยังไม่ทดสอบ" },
    { name: "Flasher", skillId: 114, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 12/12/12/12/12 · ยังไม่ทดสอบ" },
    { name: "Freezing Trap", skillId: 115, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 10/10/10/10/10 · ยังไม่ทดสอบ" },
    { name: "Sandman", skillId: 116, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 12, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 12/12/12/12/12 · ยังไม่ทดสอบ" },
    { name: "Blast Mine", skillId: 117, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 10/10/10/10/10 · ยังไม่ทดสอบ" },
    { name: "Claymore Trap", skillId: 118, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 15, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 15/15/15/15/15 · ยังไม่ทดสอบ" },
    { name: "Shockwave Trap", skillId: 119, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 45, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 45/45/45/45/45 · ยังไม่ทดสอบ" },
    { name: "Talkie Box", skillId: 120, level: 1, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 1, cooldownMs: 2000, job: "Hunter", desc: "AoEพื้น · SP 1 · ยังไม่ทดสอบ" },
    { name: "Phantasmic Arrow", skillId: 121, level: 1, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Hunter", desc: "โจมตี · SP 10 · ยังไม่ทดสอบ" },
    { name: "Grimtooth", skillId: 125, level: 5, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 3, cooldownMs: 2000, job: "Assassin", desc: "โจมตี · SP 3/3/3/3/3 · ยังไม่ทดสอบ" },
    { name: "Cloaking", skillId: 127, level: 10, selfCast: true, intervalMin: 4, spMin: 15, cooldownMs: 2000, job: "Assassin", desc: "ตัวเอง · SP 15/15/15/15/15/15/15/15/15/15 · ยังไม่ทดสอบ" },
    { name: "Enchant Poison", skillId: 128, level: 10, ally: true, intervalMin: 4, spMin: 20, cooldownMs: 2000, job: "Assassin", desc: "Ally→ใช้กับตัวเอง · SP 20/20/20/20/20/20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Poison React", skillId: 129, level: 10, selfCast: true, intervalMin: 4, spMin: 60, cooldownMs: 2000, job: "Assassin", desc: "ตัวเอง · SP 25/30/35/40/45/50/55/60/45/45 · ยังไม่ทดสอบ" },
    { name: "Venom Dust", skillId: 130, level: 10, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 20, cooldownMs: 2000, job: "Assassin", desc: "AoEพื้น · SP 20/20/20/20/20/20/20/20/20/20 · ยังไม่ทดสอบ" },
    { name: "Venom Splasher", skillId: 131, level: 10, targeted: true, maxDistance: 9, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 2000, job: "Assassin", desc: "โจมตี · SP 12/14/16/18/20/22/24/26/28/30 · ยังไม่ทดสอบ" },
    { name: "Adrenaline Rush", skillId: 135, level: 10, selfCast: true, intervalMin: 4, spMin: 47, cooldownMs: 2000, job: "Blacksmith", desc: "ตัวเอง · SP 20/23/26/29/32/35/38/41/44/47 · ยังไม่ทดสอบ" },
    { name: "Hammer Fall", skillId: 136, level: 5, ground: true, maxDistance: 9, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 10, cooldownMs: 2000, job: "Blacksmith", desc: "AoEพื้น · SP 10/10/10/10/10 · ยังไม่ทดสอบ" },
    { name: "Weapon Perfection", skillId: 139, level: 5, selfCast: true, intervalMin: 4, spMin: 18, cooldownMs: 2000, job: "Blacksmith", desc: "ตัวเอง · SP 18/16/14/12/10 · ยังไม่ทดสอบ" },
    { name: "Power Thrust", skillId: 141, level: 5, selfCast: true, intervalMin: 4, spMin: 18, cooldownMs: 2000, job: "Blacksmith", desc: "ตัวเอง · SP 18/16/14/12/10 · ยังไม่ทดสอบ" },
    { name: "Maximize Power", skillId: 142, level: 5, selfCast: true, intervalMin: 4, spMin: 10, cooldownMs: 2000, job: "Blacksmith", desc: "ตัวเอง · SP 10/10/10/10/10 · ยังไม่ทดสอบ" },
  ];
  // ★★ สกิลที่ preset ระบุว่าเป็น "พื้นที่" (ground) — ใช้กันผู้ใช้ตั้งโหมดผิด (เคสจริง: Thunderstorm ตั้งเป็น
  //   AoE รอบตัว → ส่ง [1d][05] แทน [1d][04] → server รับ cast + หัก SP แต่ไม่มีพื้นที่เป้าหมาย = ไม่มีดาเมจ)
  const GROUND_SKILL_IDS = new Set(SKILL_PRESETS.filter(p => p.ground).map(p => p.skillId));
  function skillPresetGroups() {
    const groups = {};
    for (const s of SKILL_PRESETS) { (groups[s.job] = groups[s.job] || []).push(s); }
    return groups;
  }
  function openItemListPopup(listType) {
    // ★ สร้าง popup ใหม่ทุกครั้ง (กัน closure/listener ค้างจากครั้งก่อน)
    const old = document.getElementById('__assist_itempopup');
    if (old) old.remove();
    const popup = document.createElement('div');
    popup.id = '__assist_itempopup';
    document.body.appendChild(popup);

    const getList = () => listType === 'only' ? CFG.filter.onlyItems : CFG.filter.exceptItems;
    const setList = (arr) => {
      if (listType === 'only') CFG.filter.onlyItems = arr; else CFG.filter.exceptItems = arr;
      saveConfigDebounced();
    };
    const titleTxt = listType === 'only' ? 'เก็บเฉพาะ (only)' : 'ยกเว้น (except)';

    function render(search) {
      const current = getList();
      const s = (search || '').trim().toLowerCase();
      const all = itemDBEntries();
      // ★ แบ่ง 2 ส่วน: (1) ในรายการแล้ว (2) ค้นหาเพิ่ม
      const inList = current.map(id => {
        const e = all.find(x => x.id === id) || { id, name: nameOf(id) };
        return e;
      });
      const searchable = all.filter(e => !current.includes(e.id));
      let searchRes = searchable;
      if (s) {
        searchRes = searchable.filter(e =>
          e.name.toLowerCase().includes(s) || String(e.id).includes(s));
      }
      searchRes = searchRes.slice(0, 200);   // limit กัน lag

      const renderItem = (e, inCurrent) => {
        const icon = `<img src="${itemIconUrl(e.id)}" onerror="this.style.visibility='hidden'">`;
        const price = itemPrice(e.id);
        const priceStr = price ? `<span class="price">${(price).toLocaleString()}z</span>` : '';
        const countStr = e.count ? ` <span style="color:#27ae60">×${e.count}</span>` : '';
        const btn = inCurrent
          ? `<button class="rmbtn" data-rm="${e.id}">✕ ลบ</button>`
          : `<button class="addbtn" data-add="${e.id}">+ เพิ่ม</button>`;
        return `<div class="itemrow">${icon}<span class="nm">${e.name}${countStr}</span>${priceStr}<span class="id">${e.id}</span>${btn}</div>`;
      };

      let html = '';
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35">📋 ในรายการ (${inList.length})</div>`;
      html += inList.length ? inList.map(e => renderItem(e, true)).join('')
        : `<div class="empty">(ยังว่าง — ค้นหาแล้วกด + เพิ่ม ด้านล่าง)</div>`;
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">🔍 ทั้งหมด${s ? ` (${searchRes.length}${searchable.length>200?'+':''})` : ''}</div>`;
      html += searchRes.length ? searchRes.map(e => renderItem(e, false)).join('')
        : `<div class="empty">${s ? 'ไม่พบ — ลองคำอื่น หรือ id เลข' : 'พิมพ์เพื่อค้นหา...'}</div>`;
      return html;
    }

    popup.innerHTML = `
      <div class="modal">
        <div class="hdr">
          <span class="ttl">📦 จัดการรายการ — ${titleTxt}</span>
          <span class="x" id="__assist_itempopup_x">✕</span>
        </div>
        <div class="searchbar">
          <input type="text" id="__assist_itempopup_search" placeholder="ค้นหาชื่อหรือ id..." autocomplete="off" style="flex:1">
          <input type="text" id="__assist_itempopup_addid" placeholder="id" autocomplete="off" style="width:54px;flex:0 0 auto">
          <button id="__assist_itempopup_addbtn" style="flex:0 0 auto;padding:5px 10px">+ id</button>
        </div>
        <div class="body" id="__assist_itempopup_body"></div>
      </div>`;
    const bodyEl = popup.querySelector('#__assist_itempopup_body');
    const searchInput = popup.querySelector('#__assist_itempopup_search');
    const addIdInput = popup.querySelector('#__assist_itempopup_addid');
    let searchVal = '';
    const refresh = () => { bodyEl.innerHTML = render(searchVal); wireButtons(); };
    // ★ เพิ่ม id แบบ manual (รองรับหลาย id คั่นจุลภาค) — สำหรับ item ที่ไม่อยู่ใน DB
    const addManualIds = () => {
      const ids = addIdInput.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      if (!ids.length) return;
      const cur = getList();
      let added = 0;
      for (const id of ids) if (!cur.includes(id)) { cur.push(id); added++; }
      setList(cur);
      if (added) { log('📦 เพิ่ม id', ids.join(','), 'เข้า', listType); addIdInput.value = ''; refresh(); }
    };
    popup.querySelector('#__assist_itempopup_addbtn').addEventListener('click', addManualIds);
    addIdInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addManualIds(); } });
    function wireButtons() {
      bodyEl.querySelectorAll('[data-add]').forEach(b => {
        b.onclick = () => {
          const id = parseInt(b.getAttribute('data-add'), 10);
          const cur = getList();
          if (!cur.includes(id)) { setList([...cur, id]); log('📦 เพิ่ม', nameOf(id), 'เข้า', listType); }
          refresh();
        };
      });
      bodyEl.querySelectorAll('[data-rm]').forEach(b => {
        b.onclick = () => {
          const id = parseInt(b.getAttribute('data-rm'), 10);
          setList(getList().filter(x => x !== id));
          log('📦 ลบ', nameOf(id), 'ออกจาก', listType);
          refresh();
        };
      });
    }
    const closePopup = () => { popup.classList.remove('open'); setTimeout(() => popup.remove(), 200); };
    searchInput.addEventListener('input', () => { searchVal = searchInput.value; refresh(); });
    popup.querySelector('#__assist_itempopup_x').addEventListener('click', closePopup);
    popup.addEventListener('click', (ev) => { if (ev.target === popup) closePopup(); });
    // ★ คลิก input ใน popup → focus ทันที (กัน Unity ขโมย focus เหมือน main panel)
    popup.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
      }
    }, true);
    refresh();
    searchInput.focus();
    popup.classList.add('open');
  }

  // ============================================================
  //  SKILL POPUP — จัดการรายการ skill (เพิ่ม/แก้/ลบ)
  // ============================================================
  function openSkillPopup() {
    const old = document.getElementById('__assist_skillpopup');
    if (old) old.remove();
    const popup = document.createElement('div');
    popup.id = '__assist_skillpopup';
    document.body.appendChild(popup);

    let editingSkillIdx = -1;   // index ของ skill ที่กำลังแก้ (-1 = ไม่มี)
    function render() {
      const skills = CFG.skills || [];
      let html = '';
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35">🔮 skill list (${skills.length})</div>`;
      html += skills.length ? skills.map((s, i) => {
        const mode = s.selfCast ? 'self' : (s.ally ? 'ally' : (s.buffMode ? 'buff' : (s.targeted ? 'target' : 'AoE')));
        const modeColor = s.buffMode ? '#d4e157' : (s.ally ? '#29b6f6' : (s.selfCast ? '#27ae60' : (s.targeted ? '#e67e22' : '#8e44ad')));
        const spStr = s.spMin ? ` SP≥${s.spMin}` : '';
        const cdStr = s.intervalMin > 0 ? ` ทุก${s.intervalMin}นาที` : (s.cooldownMs ? ` cd${(s.cooldownMs/1000).toFixed(0)}s` : '');
        const distStr = s.maxDistance ? ` ≤${s.maxDistance}ช่อง` : '';
        const hpStr = s.hpBelowPct > 0 ? ` HP<${s.hpBelowPct}%` : '';
        const buffStr = s.buffMode ? ` ${s.buffAll === false && Array.isArray(s.buffNames) && s.buffNames.length ? 'ให้:' + s.buffNames.join(',') : 'ให้ทุกคน'}${s.targetHpBelowPct > 0 ? ' HP<' + s.targetHpBelowPct + '%' : ''} ≤${s.maxDistance || 9}ช่อง ทุก${s.repeatSec || 300}วิ` : '';
        let row = `<div style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.04)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="flex:1;font-size:11px;color:#e8e8e8">${s.name || 'skill_'+s.skillId} <span style="color:#5f6368">(#${s.skillId} Lv${s.level})</span></span>
            <span style="font-size:10px;color:${modeColor};background:${modeColor}22;padding:1px 6px;border-radius:3px">${mode}</span>
            <span style="font-size:10px;color:#9aa0a6">${spStr}${hpStr}${buffStr}${cdStr}${distStr}</span>
            <button data-editskill="${i}" style="background:#2a3441;border:1px solid #3a3f4b;border-radius:4px;color:#8ab4f8;cursor:pointer;font-size:11px;padding:3px 8px">✎</button>
            <button class="rmbtn" data-rmskill="${i}" style="background:#4a2020;border:1px solid #6a3030;border-radius:4px;color:#e8e8e8;cursor:pointer;font-size:11px;padding:3px 8px">✕</button>
          </div>`;
        // ★ ฟอร์มแก้ไข (แสดงเมื่อกด ✎)
        if (editingSkillIdx === i) {
          const modeVal = s.selfCast ? 'self' : (s.ally ? 'ally' : (s.buffMode ? 'buff' : (s.ground ? 'ground' : (s.targeted ? 'targeted' : 'aoe'))));
          const fld = (label, inner, title) => `<label style="display:flex;flex-direction:column;gap:1px;font-size:9px;color:#9aa0a6" title="${title}">${label}${inner}</label>`;
          const inp = (key, val, w) => `<input data-edit="${key}" type="number" value="${val}" style="width:${w};background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`;
          row += `<div style="padding:8px;background:rgba(0,0,0,.2);border-radius:4px;margin-top:4px">
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${fld('ชื่อ', `<input data-edit="name" value="${s.name||''}" placeholder="ชื่อสกิล" style="flex:1;min-width:120px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ชื่อสกิล (แสดงใน log)')}
              ${fld('skillId', inp('skillId', s.skillId, '60px'), 'เลข ID ของสกิล (จาก packet capture)')}
              ${fld('เลเวล', inp('level', s.level, '45px'), 'เลเวลสกิลที่จะส่ง (1-10)')}
            </div>
            <div style="margin-bottom:6px">
              ${fld('โหมดการใช้งาน', `<select data-edit="mode" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">
                <option value="targeted"${modeVal==='targeted'?' selected':''}>targeted — เลือกเป้า (Bash, Double Strafe)</option>
                <option value="ground"${modeVal==='ground'?' selected':''}>ground — เลือกพื้นที่ (Arrow Shower)</option>
                <option value="aoe"${modeVal==='aoe'?' selected':''}>AoE — รอบตัว (Magnum Break)</option>
                <option value="self"${modeVal==='self'?' selected':''}>self-cast — ใช้กับตัวเอง (Quicken, Blessing)</option>
                <option value="ally"${modeVal==='ally'?' selected':''}>ally — สกิล Ally ใช้กับตัวเอง (Heal, Kyrie)</option>
                <option value="buff"${modeVal==='buff'?' selected':''}>buff — บอทบัพให้ผู้เล่นอื่น (Blessing, Heal ให้คน)</option>
              </select>`, 'targeted=ต้องมีมอนเป้าหมาย, AoE=ใช้รอบตัว, self=สกิล Self แท้, ally=Ally ใช้กับตัวเอง, buff=หาผู้เล่นรอบตัวมาบัพให้อัตโนมัติ')}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${fld('SP ขั้นต่ำ', inp('spMin', s.spMin||0, '55px'), 'SP ต้องมากกว่าหรือเท่ากับค่านี้ถึงจะใช้')}
              ${fld('Cooldown (วินาที)', `<input data-edit="cooldownSec" type="text" inputmode="decimal" value="${((s.cooldownMs||2000)/1000).toFixed(1)}" style="width:60px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ระยะเวลารอก่อนใช้ซ้ำ (วินาที) เช่น 2 = 2 วินาที')}
              ${fld('ระยะสูงสุด', inp('maxDistance', s.maxDistance||0, '55px'), 'ต้องอยู่ใกล้ไม่เกินกี่ช่อง (0=ไม่จำกัด)')}
              ${fld('ครั้ง/มอน', inp('maxUsesPerTarget', s.maxUsesPerTarget||1, '55px'), 'ใช้สกิลนี้ได้กี่ครั้งต่อมอน 1 ตัว')}
              ${fld('มอนขั้นต่ำ', inp('mobCountMin', s.mobCountMin||0, '55px'), 'ใช้เมื่อมอนรุมมากกว่าหรือเท่ากับ N ตัว')}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${fld('ระยะเวลา (นาที) — self', `<input data-edit="intervalMin" type="number" step="0.5" value="${s.intervalMin||0}" style="flex:1;min-width:90px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'สำหรับ self-cast: ร่ายใหม่ทุก N นาที (0=ใช้ cooldownMs แทน)')}
              ${fld('ระยะต่ำสุด (ช่อง)', `<input data-edit="minDistance" type="number" value="${s.minDistance||0}" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ต้องอยู่ไกลอย่างน้อย N ช่อง (เช่น Charge Attack)')}
              ${fld('ใช้เมื่อ HP < %', inp('hpBelowPct', s.hpBelowPct||0, '60px'), 'ใช้สกิลเฉพาะเมื่อ HP% ต่ำกว่าค่านี้ (เช่น Heal ตัวเอง) — 0 หรือว่าง = ไม่สน HP')}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <select data-edit="buffAll" style="flex:1;min-width:140px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit" title="โหมด buff: ใช้กับใคร">
                <option value="all"${(s.buffAll !== false && !(Array.isArray(s.buffNames) && s.buffNames.length))?' selected':''}>บัพให้ทุกคนที่เข้ามาในระยะ</option>
                <option value="list"${(Array.isArray(s.buffNames) && s.buffNames.length)?' selected':''}>เฉพาะรายชื่อที่กำหนด</option>
              </select>
              <input data-edit="buffNames" value="${(Array.isArray(s.buffNames)?s.buffNames:[]).join(',')}" placeholder="รายชื่อผู้เล่น (คั่นจุลภาค)" style="flex:2;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit" title="เช่น superogira0,testmage — ใช้เมื่อเลือก 'เฉพาะรายชื่อ'">
              ${fld('delay ซ้ำ/คน (วิ)', inp('repeatSec', s.repeatSec||300, '60px'), 'รออย่างน้อย N วินาทีก่อนบัพซ้ำคนเดิม (กันสแปม) — default 300 = 5 นาที')}
              ${fld('รวมตัวเอง', `<select data-edit="buffIncludeSelf" style="width:55px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 3px;font-size:10px;font-family:inherit"><option value="1"${s.buffIncludeSelf?' selected':''}>ใช่</option><option value="0"${!s.buffIncludeSelf?' selected':''}>ไม่</option></select>`, 'บัพตัวเองด้วยสกิลนี้ตามรอบ delay ซ้ำ (แยกจากโหมด ally/self-cast ที่ใช้ HP% หรือ interval)')}
              ${fld('HP เป้า < %', inp('targetHpBelowPct', s.targetHpBelowPct||0, '60px'), 'ใช้สกิลเฉพาะเมื่อ HP ของเป้าหมายต่ำกว่าค่านี้ — คุมทั้งคนอื่นและตัวเอง (ถ้ารวมตัวเอง) · 0 = ไม่สน (บัพได้ตลอด) · ไม่รู้ HP = ข้าม')}
              ${fld('💬 ต้องแชทคำขอ', `<input data-edit="buffChatKeyword" value="${s.buffChatKeyword||''}" placeholder="เช่น heal" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'บัพเฉพาะคนที่พิ่งแชทข้อความมีคำนี้ (ภายใน 60 วิ · ไม่สนตัวพิมพ์) เช่น heal = พิมพ์ heal มาก่อนถึงบัพ · เงื่อนไขอื่นที่ตั้งไว้ยังเช็คตามปกติ · ว่าง = ไม่เช็ค')}
            </div>
            <div style="display:flex;gap:4px">
              <button data-saveedit="${i}" style="flex:1;background:#1b5e20;border:1px solid #2e7d32;border-radius:4px;color:#a5d6a7;cursor:pointer;font-size:10px;padding:5px;font-family:inherit">✓ บันทึก</button>
              <button data-canceledit style="flex:1;background:#4a2020;border:1px solid #6a3030;border-radius:4px;color:#ef9a9a;cursor:pointer;font-size:10px;padding:5px;font-family:inherit">ยกเลิก</button>
            </div>
          </div>`;
        }
        row += `</div>`;
        return row;
      }).join('') : `<div class="empty">(ยังว่าง — เพิ่มด้านล่าง)</div>`;

      // ★ preset dropdown — เลือกสกิลสำเร็จรูปจาก database
      const groups = skillPresetGroups();
      const presetOpts = Object.entries(groups).map(([job, skills]) => {
        const skillOpts = skills.map((s, i) => {
          const idx = SKILL_PRESETS.indexOf(s);
          const mode = s.selfCast ? 'self' : (s.targeted ? 'target' : 'AoE');
          return `<option value="${idx}">${s.name} (Lv${s.level}, ${mode}) — ${s.desc || ''}</option>`;
        }).join('');
        return `<optgroup label="${job}">${skillOpts}</optgroup>`;
      }).join('');
      html += `<div style="padding:6px 8px;color:#27ae60;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">⚡ เลือกจาก preset (แนะนำ)</div>`;
      html += `<div style="padding:8px">
        <select id="__assist_skill_preset" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:6px">
          <option value="">— เลือกสกิลที่จะเพิ่ม —</option>
          ${presetOpts}
        </select>
        <button id="__assist_skill_presetbtn" style="width:100%;background:#1b5e20;border:1px solid #2e7d32;border-radius:5px;color:#a5d6a7;cursor:pointer;font-size:11px;padding:6px;font-family:inherit;margin-bottom:4px">+ เพิ่มจาก preset</button>
      </div>`;
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">➕ เพิ่ม skill ใหม่ (กำหนดเอง)</div>`;
      html += `<div style="padding:8px">
        <input id="__assist_skill_name" placeholder="ชื่อ (เช่น Bash)" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:4px">
        <div style="display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap">
          <input id="__assist_skill_id" type="number" placeholder="skillId" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_lvl" type="number" placeholder="Lv" value="1" style="width:50px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <select id="__assist_skill_mode" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:4px">
          <option value="targeted">targeted (Bash/Double Strafe — เลือกเป้า)</option>
          <option value="ground">ground (Arrow Shower — เลือกพื้นที่)</option>
          <option value="aoe">AoE (Magnum Break — รอบตัว)</option>
          <option value="self">self-cast (Quicken — บัพตัวเอง)</option>
          <option value="ally">ally (Heal/Kyrie — สกิล Ally ใช้กับตัวเอง)</option>
          <option value="buff">buff (บอทบัพให้ผู้เล่นอื่น)</option>
        </select>
        <div style="display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap">
          <input id="__assist_skill_sp" type="number" placeholder="spMin" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_cd" type="number" placeholder="cd ms" value="2000" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
          <input id="__assist_skill_maxdist" type="number" placeholder="maxDist" value="2" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_maxuse" type="number" placeholder="maxUse/target" value="1" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_mobmin" type="number" placeholder="mobMin" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
          <input id="__assist_skill_interval" type="number" placeholder="intervalMin (self)" value="0" step="0.5" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_mindist" type="number" placeholder="minDist" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_hpbelow" type="number" placeholder="HP<%" value="0" min="0" max="100" title="ใช้เมื่อ HP% ต่ำกว่าค่านี้ (0=ไม่สน HP)" style="width:70px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
          <select id="__assist_skill_buffall" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit" title="โหมด buff: ใช้กับใคร">
            <option value="all">บัพทุกคนในระยะ</option>
            <option value="list">เฉพาะรายชื่อ</option>
          </select>
          <input id="__assist_skill_buffnames" placeholder="รายชื่อผู้เล่น (คั่นจุลภาค)" style="flex:2;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit" title="เช่น superogira0,testmage (ใช้เมื่อเลือกเฉพาะรายชื่อ)">
          <input id="__assist_skill_buffchat" placeholder="💬 ต้องแชทคำขอ เช่น heal" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit" title="บัพเฉพาะคนที่พิ่งแชทข้อความมีคำนี้ (ภายใน 60 วิ · ไม่สนตัวพิมพ์) — ว่าง = ไม่เช็ค (บัพตามเงื่อนไขอื่นอย่างเดียว)">
          <input id="__assist_skill_repeatsec" type="number" placeholder="ซ้ำ/คน(วิ)" value="300" title="delay ก่อนบัพซ้ำคนเดิม (วินาที)" style="width:80px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <select id="__assist_skill_buffself" title="รวมบัพตัวเองด้วยสกิลนี้ตามรอบ delay ซ้ำ" style="width:70px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 4px;font-size:11px;font-family:inherit">
            <option value="0">เฉพาะคนอื่น</option>
            <option value="1">รวมตัวเอง</option>
          </select>
          <input id="__assist_skill_tgthp" type="number" placeholder="HPเป้า<%" value="0" min="0" max="100" title="ใช้เฉพาะเมื่อ HP ของเป้าหมายต่ำกว่าค่านี้ (คุมทั้งคนอื่นและตัวเองถ้ารวม · 0=ไม่สน)" style="width:75px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <button id="__assist_skill_addbtn" style="width:100%;background:#1b5e20;border:1px solid #2e7d32;border-radius:5px;color:#a5d6a7;cursor:pointer;font-size:11px;padding:6px;font-family:inherit">+ เพิ่ม skill</button>
      </div>`;
      return html;
    }

    popup.innerHTML = `
      <div class="modal" style="background:rgba(20,22,28,.98);border:1px solid #3a3f4b;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.7);width:680px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;color:#e8e8e8;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px">
        <div class="hdr" style="padding:10px 14px;background:#15171c;border-bottom:1px solid #3a3f4b;display:flex;justify-content:space-between;align-items:center">
          <span style="color:#8ab4f8;font-weight:600;font-size:13px">🔮 จัดการ skill list</span>
          <span id="__assist_skillpopup_x" style="cursor:pointer;color:#9aa0a6;font-size:18px;line-height:1">✕</span>
        </div>
        <div id="__assist_skillpopup_body" style="overflow-y:auto;flex:1;padding:6px 8px"></div>
      </div>`;
    const bodyEl = popup.querySelector('#__assist_skillpopup_body');
    const refresh = () => { bodyEl.innerHTML = render(); wireButtons(); };
    function wireButtons() {
      bodyEl.querySelectorAll('[data-rmskill]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-rmskill'), 10);
          CFG.skills.splice(i, 1);
          saveConfigDebounced();
          editingSkillIdx = -1;
          refresh();
        };
      });
      // ★ แก้ไข skill — ขยายฟอร์ม
      bodyEl.querySelectorAll('[data-editskill]').forEach(b => {
        b.onclick = () => {
          editingSkillIdx = parseInt(b.getAttribute('data-editskill'), 10);
          refresh();
        };
      });
      // ★ บันทึกการแก้ไข
      bodyEl.querySelectorAll('[data-saveedit]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-saveedit'), 10);
          const s = CFG.skills[i];
          if (!s) return;
          const getVal = (key) => {
            const el = bodyEl.querySelector(`[data-edit="${key}"]`);
            return el ? el.value : '';
          };
          s.name = getVal('name').trim() || s.name;
          s.skillId = parseInt(getVal('skillId'), 10) || s.skillId;
          s.level = parseInt(getVal('level'), 10) || 1;
          const mode = getVal('mode');
          s.targeted = mode === 'targeted';
          s.ground = mode === 'ground';
          s.selfCast = mode === 'self';
          s.ally = mode === 'ally';
          s.buffMode = mode === 'buff';
          // ★★ buff settings — บันทึกเสมอไม่ gate ด้วย mode (เดิม gate ด้วย buffMode → ถ้า mode select
          //   ยังค้างค่าเดิมตอนกดบันทึก ค่าที่แก้จะหลุดทั้งหมด — บั๊กค่าไม่อัปเดตที่ผู้ใช้พบ)
          //   ★ เช็ค element ตรง ๆ (getVal แยก "ไม่มีช่อง" กับ "ช่องว่าง" ไม่ได้ — ลบชื่อออกต้องบันทึกด้วย)
          const bAllEl = bodyEl.querySelector('[data-edit="buffAll"]');
          if (bAllEl) s.buffAll = bAllEl.value !== 'list';
          const bNamesEl = bodyEl.querySelector('[data-edit="buffNames"]');
          if (bNamesEl) s.buffNames = bNamesEl.value.split(',').map(x => x.trim()).filter(Boolean);
          const rSecEl = bodyEl.querySelector('[data-edit="repeatSec"]');
          if (rSecEl) { const rs2 = parseInt(rSecEl.value, 10); if (!isNaN(rs2) && rs2 > 0) s.repeatSec = rs2; }
          const bisEl = bodyEl.querySelector('[data-edit="buffIncludeSelf"]');
          if (bisEl) s.buffIncludeSelf = bisEl.value === '1';
          const thbEl = bodyEl.querySelector('[data-edit="targetHpBelowPct"]');
          if (thbEl) { const thb = parseInt(thbEl.value, 10); s.targetHpBelowPct = (!isNaN(thb) && thb > 0) ? Math.min(thb, 100) : 0; }
          const ckwEl = bodyEl.querySelector('[data-edit="buffChatKeyword"]');
          if (ckwEl) s.buffChatKeyword = ckwEl.value.trim();
          log('✎ บันทึก skill', s.name, s.buffMode ? ('· buff: ' + (s.buffAll === false ? 'เฉพาะ ' + (s.buffNames || []).join(',') : 'ทุกคน') + (s.buffChatKeyword ? ' · ต้องแชท "' + s.buffChatKeyword + '"' : '') + ' ≤' + (s.maxDistance || 9) + 'ช่อง ทุก' + (s.repeatSec || 300) + 'วิ') : '');
          s.spMin = parseInt(getVal('spMin'), 10) || 0;
          const cdSec = parseFloat(getVal('cooldownSec'));
          s.cooldownMs = isNaN(cdSec) ? (s.cooldownMs || 2000) : Math.round(cdSec * 1000);
          s.maxDistance = parseInt(getVal('maxDistance'), 10) || 0;
          s.maxUsesPerTarget = parseInt(getVal('maxUsesPerTarget'), 10) || 1;
          s.mobCountMin = parseInt(getVal('mobCountMin'), 10) || 0;
          s.intervalMin = parseFloat(getVal('intervalMin')) || 0;
          s.minDistance = parseInt(getVal('minDistance'), 10) || 0;
          s.hpBelowPct = parseInt(getVal('hpBelowPct'), 10) || 0;
          saveConfigDebounced();
          editingSkillIdx = -1;
          log('✎ แก้ไข skill', s.name);
          refresh();
        };
      });
      // ★ ยกเลิกการแก้ไข
      bodyEl.querySelectorAll('[data-canceledit]').forEach(b => {
        b.onclick = () => { editingSkillIdx = -1; refresh(); };
      });
      const addBtn = bodyEl.querySelector('#__assist_skill_addbtn');
      // ★ preset button — เพิ่มจาก database สำเร็จรูป
      const presetBtn = bodyEl.querySelector('#__assist_skill_presetbtn');
      if (presetBtn) {
        presetBtn.onclick = () => {
          const sel = bodyEl.querySelector('#__assist_skill_preset');
          const idx = parseInt(sel.value, 10);
          if (isNaN(idx) || !SKILL_PRESETS[idx]) return;
          const p = SKILL_PRESETS[idx];
          ASSIST.addSkill({
            name: p.name, skillId: p.skillId, level: p.level,
            targeted: !!p.targeted, selfCast: !!p.selfCast, ally: !!p.ally, buffMode: !!p.buffMode,
            buffAll: p.buffAll !== false, buffNames: Array.isArray(p.buffNames) ? p.buffNames : [], repeatSec: p.repeatSec || 300,
            buffIncludeSelf: !!p.buffIncludeSelf, targetHpBelowPct: p.targetHpBelowPct || 0,
            intervalMin: p.intervalMin || 0, mobCountMin: p.mobCountMin || 0,
            maxUsesPerTarget: p.maxUsesPerTarget || 1, maxDistance: p.maxDistance || 0,
            minDistance: p.minDistance || 0, spMin: p.spMin || 0, cooldownMs: p.cooldownMs || 2000,
            hpBelowPct: p.hpBelowPct || 0,
          });
          saveConfigDebounced();
          log('⚡ เพิ่ม preset:', p.name, '(#' + p.skillId + ')');
          refresh();
        };
      }
      if (addBtn) {
        addBtn.onclick = () => {
          const name = bodyEl.querySelector('#__assist_skill_name').value.trim() || undefined;
          const skillId = parseInt(bodyEl.querySelector('#__assist_skill_id').value, 10);
          const level = parseInt(bodyEl.querySelector('#__assist_skill_lvl').value, 10) || 1;
          const mode = bodyEl.querySelector('#__assist_skill_mode').value;
          const spMin = parseInt(bodyEl.querySelector('#__assist_skill_sp').value, 10) || 0;
          const cooldownMs = parseInt(bodyEl.querySelector('#__assist_skill_cd').value, 10) || 2000;
          const maxDistance = parseInt(bodyEl.querySelector('#__assist_skill_maxdist').value, 10) || 0;
          const maxUsesPerTarget = parseInt(bodyEl.querySelector('#__assist_skill_maxuse').value, 10) || 1;
          const mobCountMin = parseInt(bodyEl.querySelector('#__assist_skill_mobmin').value, 10) || 0;
          const intervalMin = parseFloat(bodyEl.querySelector('#__assist_skill_interval').value) || 0;
          const minDistance = parseInt(bodyEl.querySelector('#__assist_skill_mindist').value, 10) || 0;
          const hpBelowPct = parseInt(bodyEl.querySelector('#__assist_skill_hpbelow').value, 10) || 0;
          const buffAll = bodyEl.querySelector('#__assist_skill_buffall').value !== 'list';
          const buffNames = (bodyEl.querySelector('#__assist_skill_buffnames').value || '').split(',').map(x => x.trim()).filter(Boolean);
          const buffChatKeyword = (bodyEl.querySelector('#__assist_skill_buffchat').value || '').trim();
          const repeatSec = parseInt(bodyEl.querySelector('#__assist_skill_repeatsec').value, 10) || 300;
          const buffIncludeSelf = bodyEl.querySelector('#__assist_skill_buffself').value === '1';
          const targetHpBelowPct = Math.max(0, Math.min(100, parseInt(bodyEl.querySelector('#__assist_skill_tgthp').value, 10) || 0));
          if (isNaN(skillId)) { return; }
          ASSIST.addSkill({
            name, skillId, level,
            targeted: mode === 'targeted',
            ground: mode === 'ground',
            selfCast: mode === 'self',
            ally: mode === 'ally',
            buffMode: mode === 'buff',
            buffAll, buffNames, buffChatKeyword, repeatSec, buffIncludeSelf, targetHpBelowPct,
            intervalMin, mobCountMin, maxUsesPerTarget, maxDistance, minDistance, spMin, cooldownMs,
            hpBelowPct: Math.max(0, Math.min(100, hpBelowPct)),
          });
          saveConfigDebounced();
          refresh();
        };
      }
    }
    const closePopup = () => { popup.classList.remove('open'); setTimeout(() => popup.remove(), 200); };
    popup.querySelector('#__assist_skillpopup_x').addEventListener('click', closePopup);
    popup.addEventListener('click', (ev) => { if (ev.target === popup) closePopup(); });
    // ★ focus tracking (เหมือน item popup)
    popup.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
      }
    }, true);
    refresh();
    popup.classList.add('open');
  }

  function buildUI() {
    if (document.getElementById('__assist_root')) return;   // สร้างแล้ว

    // ---------- CSS ----------
    const css = `
      #__assist_root, #__assist_root * { box-sizing: border-box; margin: 0; padding: 0; }
      #__assist_root {
        position: fixed; top: 10px; right: 10px; z-index: 2147483647;
        font-family: 'Segoe UI', 'Segoe UI Emoji', system-ui, 'Apple Color Emoji', sans-serif; font-size: 12px;
        color: #e8e8e8; user-select: none;
      }
      /* mini-bar */
      #__assist_bar {
        background: rgba(20,22,28,.92); border: 1px solid #3a3f4b; border-radius: 8px;
        padding: 5px 8px; display: flex; align-items: center; gap: 4px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: opacity .15s;
        max-width: 900px; flex-wrap: wrap; justify-content: flex-end;
      }
      #__assist_bar:hover { opacity: .85; }
      #__assist_bar .hpbar { width: 60px; height: 8px; background: #2a2d35; border-radius: 4px; overflow: hidden; }
      #__assist_bar .hpfill { height: 100%; background: linear-gradient(90deg,#e53935,#ef5350); transition: width .3s; }
      #__assist_bar .hpfill.warn { background: linear-gradient(90deg,#fb8c00,#ffa726); }
      #__assist_bar .hpfill.good { background: linear-gradient(90deg,#43a047,#66bb6a); }
      #__assist_bar .pill { font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: 600; white-space: nowrap; }
      #__assist_bar .pill.on  { background: #1b5e20; color: #a5d6a7; }
      #__assist_bar .pill.off { background: #4a2020; color: #ef9a9a; }
      #__assist_bar .expand { color: #8ab4f8; font-weight: 700; }
      /* popup */
      #__assist_popup {
        display: none; width: 440px; max-height: 70vh;
        position: absolute; top: 100%; right: 0; margin-top: 6px;
        background: rgba(20,22,28,.97); border: 1px solid #3a3f4b; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.6); overflow: hidden; flex-direction: column;
      }
      #__assist_popup.open { display: flex; }
      #__assist_tabs { display: flex; background: #15171c; border-bottom: 1px solid #3a3f4b; }
      #__assist_tabs .tab {
        flex: 1; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 11px;
        color: #9aa0a6; border-bottom: 2px solid transparent;
      }
      #__assist_tabs .tab:hover { background: rgba(255,255,255,.04); }
      #__assist_tabs .tab.active { color: #8ab4f8; border-bottom-color: #8ab4f8; }
      .__assist_page { display: none; padding: 10px; overflow-y: auto; }
      .__assist_page.active { display: block; }
      .__assist_page .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
      .__assist_page .row .k { color: #9aa0a6; }
      .__assist_page .row .v { color: #e8e8e8; font-weight: 600; }
      .__assist_page h4 { margin: 8px 0 4px; color: #8ab4f8; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      .__assist_page .field { margin: 6px 0; }
      .__assist_page .field label { display: block; color: #9aa0a6; font-size: 10px; margin-bottom: 2px; }
      .__assist_page .field input, .__assist_page .field select {
        width: 100%; background: #15171c; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 5px 7px; font-size: 12px; font-family: inherit;
      }
      .__assist_page .field input:focus, .__assist_page .field select:focus { outline: none; border-color: #8ab4f8; }
      .__assist_page .btns { display: flex; gap: 6px; margin-top: 8px; }
      .__assist_page button {
        flex: 1; background: #2a3441; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 6px; cursor: pointer; font-size: 11px; font-family: inherit;
      }
      .__assist_page button:hover { background: #34465a; }
      .__assist_page button.on  { background: #1b5e20; border-color: #2e7d32; }
      .__assist_page button.off { background: #4a2020; border-color: #6a3030; }
      .__assist_page button.danger { background: #4a2020; }
      .__assist_page .logbox {
        background: #0f1115; border: 1px solid #2a2d35; border-radius: 5px; padding: 6px;
        height: 240px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 10.5px; line-height: 1.5;
      }
      .__assist_page .logline { color: #b0b0b0; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,.03); white-space: pre-wrap; word-break: break-word; }
      .__assist_page .logline .ts { color: #5f6368; }
      /* ===== sub-tabs (ใน config page) ===== */
      .__assist_subtabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid #3a3f4b; margin-bottom: 8px; padding-bottom: 0; }
      .__assist_subtabs .subtab { padding: 7px 12px; font-size: 11px; cursor: pointer; color: #9aa0a6; border-bottom: 2px solid transparent; border-radius: 3px 3px 0 0; white-space: nowrap; }
      .__assist_subtabs .subtab:hover { background: rgba(255,255,255,.04); color: #cdd3de; }
      .__assist_subtabs .subtab.active { color: #8ab4f8; border-bottom-color: #8ab4f8; }
      .__assist_subpage { display: none; }
      .__assist_subpage.active { display: block; }
      .__assist_dead { animation: __assist_blink 1s infinite; }
      @keyframes __assist_blink { 50% { opacity: .4; } }
      /* ===== item-list popup + skill popup (รวม CSS) ===== */
      #__assist_itempopup, #__assist_skillpopup {
        position: fixed; inset: 0; z-index: 2147483648;
        background: rgba(0,0,0,.5); display: none; align-items: center; justify-content: center;
      }
      #__assist_itempopup.open, #__assist_skillpopup.open { display: flex; }
      #__assist_itempopup .modal, #__assist_skillpopup .modal {
        background: rgba(20,22,28,.98); border: 1px solid #3a3f4b; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.7); width: 480px; max-width: 92vw; max-height: 80vh;
        display: flex; flex-direction: column; overflow: hidden; color: #e8e8e8;
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px;
      }
      #__assist_itempopup .modal .hdr {
        padding: 10px 14px; background: #15171c; border-bottom: 1px solid #3a3f4b;
        display: flex; justify-content: space-between; align-items: center;
      }
      #__assist_itempopup .modal .hdr .ttl { color: #8ab4f8; font-weight: 600; font-size: 13px; }
      #__assist_itempopup .modal .hdr .x { cursor: pointer; color: #9aa0a6; font-size: 18px; line-height: 1; padding: 0 4px; }
      #__assist_itempopup .modal .hdr .x:hover { color: #ef5350; }
      #__assist_itempopup .modal .searchbar { padding: 8px 14px; border-bottom: 1px solid #2a2d35; display: flex; gap: 8px; }
      #__assist_itempopup .modal .searchbar input {
        flex: 1; background: #15171c; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 5px 8px; font-size: 12px; font-family: inherit;
      }
      #__assist_itempopup .modal .searchbar input:focus { outline: none; border-color: #8ab4f8; }
      #__assist_itempopup .modal .body { overflow-y: auto; flex: 1; padding: 6px 8px; }
      #__assist_itempopup .itemrow {
        display: flex; align-items: center; gap: 8px; padding: 5px 6px;
        border-bottom: 1px solid rgba(255,255,255,.04); border-radius: 4px;
      }
      #__assist_itempopup .itemrow:hover { background: rgba(255,255,255,.04); }
      #__assist_itempopup .itemrow img { width: 22px; height: 22px; flex-shrink: 0; }
      #__assist_itempopup .itemrow .nm { flex: 1; font-size: 11px; color: #e8e8e8; }
      #__assist_itempopup .itemrow .id { font-size: 10px; color: #5f6368; font-family: 'Consolas', monospace; }
      #__assist_itempopup .itemrow .price { font-size: 10px; color: #f1c40f; }
      #__assist_itempopup .itemrow .addbtn, #__assist_itempopup .itemrow .rmbtn {
        background: #2a3441; border: 1px solid #3a3f4b; border-radius: 4px; color: #e8e8e8;
        cursor: pointer; font-size: 11px; padding: 3px 10px; font-family: inherit; flex-shrink: 0;
      }
      #__assist_itempopup .itemrow .addbtn:hover { background: #1b5e20; border-color: #2e7d32; }
      #__assist_itempopup .itemrow .rmbtn { background: #4a2020; border-color: #6a3030; }
      #__assist_itempopup .itemrow .rmbtn:hover { background: #6a3030; }
      #__assist_itempopup .empty { padding: 20px; text-align: center; color: #5f6368; font-size: 11px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- DOM ----------
    const root = document.createElement('div');
    root.id = '__assist_root';
    root.innerHTML = `
      <div id="__assist_bar">
        <span class="hptext">HP ?</span>
        <div class="hpbar"><div class="hpfill" style="width:0%"></div></div>
        <span class="pill off" data-loot>📦</span>
        <span class="pill off" data-heal>💉</span>
        <span class="pill off" data-rest>🪑</span>
        <span class="pill off" data-combat>⚔️</span>
        <span class="pill off" data-skill>🔮</span>
        <span class="pill off" data-buff>✨</span>
        <span class="pill off" data-sell>💰</span>
        <span class="pill off" data-storage>🏦</span>
        <span class="pill off" data-flee>🏃</span>
        <span class="pill off" data-auto>🤖</span>
        <span class="pill" data-inventory style="background:#3a2a1a;color:#ffb74d" title="Inventory">🎒</span>
        <span class="pill" data-market style="background:#263238;color:#80cbc4" title="Market Search / Price Compare">🔎</span>
        <span class="pill" data-teleport style="background:#4a2c6a;color:#d1b3ff">🌀</span>
        <span class="pill" data-monitor style="background:#1a237e;color:#90caf9">🖥️</span>
        <span class="pill" data-logview style="background:#1a2a3a;color:#82b1ff" title="ดู Log">📋</span>
        <span class="pill" data-changelog style="background:#3a2a1a;color:#ffd54f" title="Update Log">📜</span>
        <span class="expand">⚙</span>
      </div>
      <div id="__assist_popup">
        <div id="__assist_tabs">
          <div class="tab active" data-page="stats">📊 สถิติ</div>
          <div class="tab" data-page="config">⚙️ ตั้งค่า</div>
          <div class="tab" data-page="alert">🔔 สำคัญ</div>
          <div class="tab" data-page="log">📋 Log</div>
        </div>
        <div class="__assist_page active" data-page="stats">
          <div class="row" style="border-bottom:2px solid #3a3f4b;">
            <span class="k">RO Assist</span>
            <span class="v" data-version>v?</span>
            <button id="__assist_updatebtn" style="background:#455a64;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:inherit;margin-left:6px;">🔄 เช็คอัปเดต</button>
          </div>
          <div class="row"><span class="k">HP</span><span class="v" data-hp>?</span></div>
          <div class="row"><span class="k">ตำแหน่ง</span><span class="v" data-pos>?</span></div>
          <div class="row"><span class="k">🗺️ แมป / ฟาร์ม</span><span class="v" data-farmmap>?</span></div>
          <div class="row"><span class="k">player_id</span><span class="v" data-pid>?</span></div>
          <div class="row"><span class="k">สถานะ</span><span class="v" data-state>?</span></div>
          <h4>การฟาร์ม</h4>
          <div class="row"><span class="k">ฆ่าได้</span><span class="v" data-kills>0</span></div>
          <div class="row"><span class="k">เก็บของได้</span><span class="v" data-looted>0</span></div>
          <div class="row"><span class="k">💰 ยอด zeny (session)</span><span class="v" data-zeny style="color:#f1c40f">0z</span></div>
          <div class="row"><span class="k">EXP รวม</span><span class="v" data-exp>0</span></div>
          <div class="row"><span class="k">EXP/นาที</span><span class="v" data-expmin>0</span></div>
          <div class="row"><span class="k">⚔️ Damage/วิ (10วิ)</span><span class="v" data-dps style="color:#e67e22">0</span></div>
          <div class="row"><span class="k">⚡ โจมตี/วิ (ASPD)</span><span class="v" data-aspd style="color:#3498db">0</span></div>
          <div class="row"><span class="k">💰 Zeny/ชม. (5นาที)</span><span class="v" data-goldrate style="color:#f1c40f">0z</span></div>
          <div class="row"><span class="k">เวลาทำงาน</span><span class="v" data-elapsed>0s</span></div>
          <div class="row"><span class="k">ตาย</span><span class="v" data-deaths>0</span></div>
          <h4>Combat</h4>
          <div class="row"><span class="k">เป้าหมาย</span><span class="v" data-combat-target>(none)</span></div>
          <div class="row"><span class="k">มอน (ตี/aggro/รอบ)</span><span class="v" data-combat-aggro>0 / 0 / 0</span></div>
          <div class="row"><span class="k">🎒 Inventory</span><span class="v" data-inventory>?</span></div>
          <div class="row"><span class="k">💰 Sell</span><span class="v" data-sellstate>OFF</span></div>
          <div class="row"><span class="k">🏦 Storage</span><span class="v" data-storagestate>OFF</span></div>
          <h4>ของที่เก็บได้ (session นี้) <span data-pickupsell style="color:#f1c40f;font-size:11px;font-weight:normal"></span></h4>
          <div data-items style="font-size:11px;color:#9aa0a6">(ยังไม่มี)</div>
          <div class="btns"><button class="primary" id="__assist_sellnow2">💰 ไปขายของ</button><button class="danger" id="__assist_clearinv">ล้างรายการของ</button><button class="danger" id="__assist_resetstats">รีเซ็ตสถิติ</button></div>
        </div>
        <div class="__assist_page" data-page="config">
          <div class="__assist_subtabs">
            <div class="subtab" data-sub="farm">🗺️ Farm</div>
            <div class="subtab" data-sub="combat">⚔️ Combat</div>
            <div class="subtab active" data-sub="loot">📦 Loot</div>
            <div class="subtab" data-sub="skill">🔮 Skill</div>
            <div class="subtab" data-sub="buff">✨ Buff</div>
            <div class="subtab" data-sub="heal">💉 Heal</div>
            <div class="subtab" data-sub="flee">🏃 Flee</div>
            <div class="subtab" data-sub="rest">🪑 Rest</div>
            <div class="subtab" data-sub="sell">💰 Sell</div>
            <div class="subtab" data-sub="storage">🏦 Storage</div>
            <div class="subtab" data-sub="auto">🔑 Auto</div>
            <div class="subtab" data-sub="misc">⚙️ อื่นๆ</div>
          </div>
          <!-- 🗺️ Farm -->
          <div class="__assist_subpage" data-sub="farm">
            <div class="btns">
              <button id="__assist_warptofarm" class="primary">🌀 วาร์ปไปแมปฟาร์ม</button>
              <button id="__assist_t_warpback" class="on">วาร์ปกลับอัตโนมัติ</button>
            </div>
            <div class="field"><label>ชื่อแมปฟาร์ม</label><input type="text" id="__assist_farmmap" placeholder="เช่น cmd_fild01 (ว่าง=ปิด)"></div>
            <div class="field"><label>พิกัดวาร์ป X</label><input type="number" id="__assist_farmx" placeholder="-999"><label style="margin-left:8px">Y</label><input type="number" id="__assist_farmy" placeholder="-999"><button id="__assist_usefarmpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="btns"><button id="__assist_applyfarm">ใช้ค่า farm map</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ วิธีใช้: ยืนในแมปฟาร์ม → กด 'ใช้พิกัดตัวละคร' → ใช้ค่า farm map<br>★ ว่างช่องชื่อแมป = ปิดฟีเจอร์</div>
            <h4 style="margin-top:14px;">♻️ รายการแมปฟาร์มหมุนวนเมื่อตาย</h4>
            <div class="btns"><button id="__assist_t_farmondeath" class="off">☠️ ตายเปลี่ยนแมปฟาร์ม: ?</button></div>
            <div class="field"><label>ชื่อแมป</label><input type="text" id="__assist_rmap" placeholder="เช่น gef_fild13" style="flex:1"><label style="margin-left:6px">X</label><input type="number" id="__assist_rmapx" placeholder="-999" style="width:64px"><label style="margin-left:6px">Y</label><input type="number" id="__assist_rmapy" placeholder="-999" style="width:64px"><button id="__assist_addrmap" style="margin-left:8px;font-size:10px">➕ เพิ่ม</button></div>
            <div id="__assist_rmaplist" style="font-size:11px"></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ตายแต่ละครั้ง → หมุนไปแมปถัดไปในรายการ (วนกลับแมปแรก)<br>★ หลัง respawn พักเลือดเต็มแล้ววาร์ปไปแมปใหม่เอง · ว่าง X,Y = วาร์ปสุ่มในแมปนั้น</div>
          </div>
          <!-- ⚔️ Combat -->
          <div class="__assist_subpage" data-sub="combat">
            <div class="btns"><button id="__assist_combatbtn" class="off">Combat: ?</button></div>
            <div class="field"><label>มอนที่จะตี — whitelist (ชื่อหรือ sprite id, คั่นจุลภาค) — ว่าง = ตีทุกมอน</label><input type="text" id="__assist_whitelist" placeholder="เช่น Poring,Lunatic หรือ 4000,1010"></div>
            <div class="field"><label>มอนที่จะไม่ตี — blacklist</label><input type="text" id="__assist_blacklist" placeholder="เช่น MVP,Boss"></div>
            <div class="btns"><button id="__assist_t_fightbackbl" class="on">🛡️ ตีกลับมอน blacklist ที่ตีเรา</button></div>
            <div class="btns"><button id="__assist_t_blacklistflee" class="off" title="ON = เมื่อมอนใน Target Blacklist โจมตีเรา จะหนีในแมพตามลำดับ Direct TP → Teleport Clip → Fly Wing 601">🌀 หนี Blacklist: OFF</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ Trigger เฉพาะตอนมอนใน Target Blacklist โจมตีเรา · ไม่หนีเพียงเพราะเห็นมอนอยู่ใกล้<br>★ ลำดับหนี: Direct/Database TP → Teleport Clip → Macro (ถ้าเปิด) → Fly Wing 601 · ทำงานแม้ ⚔️ Combat OFF</div>
            <div class="btns"><button id="__assist_applywhitelist">ตั้ง whitelist</button><button id="__assist_applyblacklist">ตั้ง blacklist</button></div>
            <div class="field"><label>ระยะโจมตี (ช่อง) — นักธนูตั้ง >2 เพื่อตีไกล</label><input type="number" id="__assist_attackrange" min="0" max="15"></div>
            <div class="field"><label>รัศมีค้นหามอน (ช่อง) — เลือกมอนในระยะนี้เท่านั้น (เล็ก=ไม่เดินไกล)</label><input type="number" id="__assist_maxacq" min="1" max="50" placeholder="30"></div>
            <div class="field"><label>ไล่ตามมอนสูงสุด (ช่อง) — ไกลกว่านี้ abandon</label><input type="number" id="__assist_maxchase" min="5" max="100" placeholder="40"></div>
            <div class="field"><label>abandon มอนถ้าตีแล้ว server เงียบครบ N ครั้ง (attackPendingMax 1-10)</label><input type="number" id="__assist_pendmax" min="1" max="10" step="1"></div>
            <div class="field"><label>รอเงียบขั้นต่ำก่อน abandon (ms) — นับจากตีครั้งแรก (attackAbandonMs 1000-30000)</label><input type="number" id="__assist_abandonms" min="1000" max="30000" step="500"></div>
            <div class="field"><label>ดีเลย์ทั่วไปหลัง Combat (ms) — Fast Retarget หลังเก็บของจะข้ามค่านี้และหาเป้าใหม่ทันที</label><input type="number" id="__assist_postcombatdelay" min="0" max="10000" step="100"></div>
            <div class="btns">
              <button id="__assist_t_antiks" class="on">antiKS</button>
              <button id="__assist_t_avoidp" class="on">avoidPlayers</button>
              <button id="__assist_t_lowhp" class="on">lowestHP</button>
              <button id="__assist_t_normalatk" class="on" title="ปิด = โหมดเวทย์: ไม่ส่งการตีปกติ ใช้แต่สกิลโจมตี และเดินเข้าแค่พอระยะร่ายสกิล (ตาม maxDistance ที่ตั้งใน Sub-tab Skills) — เหมาะกับนักเวทย์">⚔️ ตีปกติ</button>
            </div>
            <div class="btns">
              <button id="__assist_t_wander" class="on">🚶 เดินหามอน</button>
              <button id="__assist_t_warpfind" class="off">🌀 วาร์ปหามอน</button>
              <button id="__assist_t_warpfindwing" class="off" title="ON = เมื่อไม่เจอมอน ใช้ Fly Wing Item ID 601 ตาม Rayrag · ต้องมีของใน Inventory">🪽 Fly Wing</button>
              <button id="__assist_t_warpfindskill" class="on" title="ON = เมื่อไม่เจอมอน ใช้ Teleport Lv.1 (skillId 53 / Teleport Clip) · เปิดอันนี้จะปิด Fly Wing">📎 Teleport Clip</button>
              <button id="__assist_t_tpmacro" class="off" title="ON = ใช้ Fixed Macro Alt↓→1→2→3→Alt↑ เป็นอีกทางวาร์ป ใช้ร่วมทั้งหามอนและหนีมอน">⌨️ Macro</button>
              <button id="__assist_t_warptomon" class="off">🌀 วาร์ปไปหามอนที่ตี</button>
              <button id="__assist_testwarpfind" title="ทดสอบ Warp Find ทันที · ถ้า Macro ON จะลอง Macro ก่อน">🧪 ทดสอบวาร์ปหามอน</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ ⌨️ Macro = Alt↓ → 1↓ → 1↑ → 2↓ → 2↑ → 3↓ → 3↑ → Alt↑ (25ms/event)<br>★ Macro ON ใช้ร่วมทั้ง <b>วาร์ปหามอน</b> และ <b>หนีมอน</b>; ถ้า Macro ไม่ทำให้ตำแหน่งเปลี่ยน ระบบจะ fallback ต่อ</div>
            <div class="field"><label>วาร์ปหามอนเมื่อไม่เจอมอน (วินาที) — 0 = วาร์ปทันทีที่ไม่เจอมอน (คูลดาวน์ ≥3 วิระหว่างวาร์ป)</label><input type="number" id="__assist_nowarpsec" min="0" max="120" placeholder="30"></div>
            <div class="field"><label>stuck abandon N ครั้งใน 60s → วาร์ปสุ่ม (0=ปิด)</label><input type="number" id="__assist_stuckwarp" min="0" max="20"></div>
            <div class="field"><label>เลิกตีมอนถ้าสู้นานเกิน (วินาที) — หันไปตีตัวอื่น</label><input type="number" id="__assist_engagesec" min="5" max="600" placeholder="40"></div>
            <div class="btns"><button id="__assist_t_stepaside" class="on">🚶 เดินหลีกหลัง abandon</button></div>
            <div class="field"><label>เลิกตีมอนตีช้า (เห็ด/พืช) ถ้านานเกิน (วินาที)</label><input type="number" id="__assist_engageslow" min="30" max="600" placeholder="180"></div>
            <div class="btns">
              <button id="__assist_t_warptoboss" class="off">👑 วาร์ปไปสู้ Boss</button>
              <button id="__assist_t_warptominiboss" class="off">👹 วาร์ปไปสู้ Mini Boss</button>
            </div>
            <div class="btns"><button id="__assist_applycombat">ใช้ค่า combat</button></div>
            <h4 style="margin-top:14px;">🏃 หนีมอนรุม</h4>
            <div class="btns"><button id="__assist_t_mobflee" class="on">🏃 หนีมอนรุม: ON</button></div>
            <div class="field"><label>รุม N ตัว (มอนที่กำลังตีเรา · 0=ไม่ใช้ trigger นี้)</label><input type="number" id="__assist_fleemob" min="0" max="20"></div>
            <div class="field"><label>aggro N ตัว (มอนที่เล็งเรา · 0=ไม่ใช้ trigger นี้)</label><input type="number" id="__assist_fleeaggro" min="0" max="20"></div>
            <div class="field"><label>มอนรอบ N ตัว (รวม passive · 0=ไม่ใช้ trigger นี้)</label><input type="number" id="__assist_fleeprox" min="0" max="20"></div>
            <div class="field"><label>รัศมีนับมอนทั้ง 3 แบบ (ช่อง)</label><input type="number" id="__assist_fleerprox" min="1" max="50" step="1" placeholder="8"></div>
            <div class="btns"><button id="__assist_applymobflee">💾 ใช้ค่าหนีมอนรุม</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ ปุ่ม OFF = ปิด trigger รุม/aggro/มอนรอบทั้งหมดชั่วคราว แต่ไม่ลบค่าที่ตั้งไว้<br>★ ปุ่ม ON = กลับมาใช้ threshold เดิมทันที · ทำงานแม้ ⚔️ Combat OFF<br>★ ถ้า ⌨️ Macro ON จะลอง Macro ก่อน แล้วค่อย fallback วาร์ปสุ่มถ้า Macro ไม่สำเร็จ</div>
            <hr style="border:none;border-top:1px solid #3a3f4b;margin:10px 0">
            <h4 style="margin:6px 0">🚨 มอนอันตรายที่ต้องหนี</h4>
            <div class="btns"><button id="__assist_t_dangerflee" class="on">🚨 หนีมอนอันตราย: ON</button></div>
            <div class="field"><label>มอนที่ต้องหนี (ชื่อหรือ sub-ID คั่นจุลภาค) — เจอในระยะ → วาร์ปหนี</label><input type="text" id="__assist_fleemonsters" placeholder="เช่น MVP,Boss,1234"></div>
            <div class="field"><label>ระยะหนีมอนอันตราย (ช่อง)</label><input type="number" id="__assist_fleemonsterradius" min="1" max="50" placeholder="20"></div>
            <div class="btns"><button id="__assist_applyflee">💾 ใช้ค่ามอนอันตราย</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ OFF = หยุดตรวจรายชื่อมอนอันตรายชั่วคราว แต่ยังจำรายชื่อและระยะไว้<br>★ ทำงานแม้ ⚔️ Combat OFF เช่นเดียวกับหนีมอนรุม<br>★ ถ้า ⌨️ Macro ON จะลอง Macro ก่อน แล้วค่อย fallback วาร์ปสุ่มถ้า Macro ไม่สำเร็จ</div>
            <hr style="border:none;border-top:1px solid #3a3f4b;margin:10px 0">
            <h4 style="margin:6px 0">❤️ HP Emergency Flee</h4>
            <div class="btns">
              <button id="__assist_t_hpflee" class="off">❤️ HP ต่ำหนี: OFF</button>
              <button id="__assist_t_hpflee_same" class="on">🌀 หนีในแมพ</button>
              <button id="__assist_t_hpflee_unstuck" class="off">🏠 Unstuck</button>
            </div>
            <div class="field"><label>HP ต่ำกว่ากี่ % ให้หนีทันที</label><input type="number" id="__assist_hpfleepct" min="1" max="99" step="1" placeholder="30"></div>
            <div class="btns"><button id="__assist_applyhpflee">💾 ใช้ค่า HP Flee</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ หนีในแมพ: Direct/Database TP (0x40) ก่อน → ถ้ายังติด gap 3s ใช้ Teleport Clip → ถ้า Clip ไม่ตอบสนอง ~0.45s ลอง Fixed Hotkey Macro → แล้วค่อย Fly Wing 601<br>★ Unstuck: ส่ง 0x73 ทันที 1 ครั้ง · ทำงานแบบฉุกเฉินแม้ ⚔️ Combat OFF</div>
            <h4 style="margin-top:14px;">🛡️ Guard — ยืนประจำตำแหน่ง (ตีกลับเฉพาะมอนที่มาตี)</h4>
            <div class="btns"><button id="__assist_t_guard" class="off">🛡️ Guard: ?</button></div>
            <div class="field"><label>แผนที่ประจำตำแหน่ง (ว่าง = ยึดแมปที่เปิด guard)</label><input type="text" id="__assist_guardmap" placeholder="เช่น izlude"></div>
            <div class="field"><label>พิกัดจุดยืน X</label><input type="number" id="__assist_guardx" placeholder="-999"><label style="margin-left:8px">Y</label><input type="number" id="__assist_guardy" placeholder="-999"><button id="__assist_useguardpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="btns"><button id="__assist_applyguard">💾 ใช้ค่า guard</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ยืนเฉย ๆ ไม่หามอน — มอนมาตีถึงตีกลับ (มอนยิงไกลก็เดินเข้าไปตี) ฆ่าเสร็จกลับมายืนจุดเดิม<br>★ เปิดใช้ร่วมกับ Combat: ON · เตรียมไว้สำหรับบอทคอยประจำจุดใช้สกิลบัพให้คนอื่น</div>
          </div>
          <!-- 📦 Loot -->
          <div class="__assist_subpage active" data-sub="loot">
            <div class="btns">
              <button id="__assist_lootbtn" class="on">Loot: ?</button>
            </div>
            <div class="field"><label>โหมด loot</label><select id="__assist_lootmode"><option value="all">all (เก็บหมด)</option><option value="only">only (เก็บเฉพาะ)</option><option value="except">except (ยกเว้น)</option></select></div>
            <div class="btns">
              <button id="__assist_manageonly">📋 จัดการ 'เก็บเฉพาะ'</button>
              <button id="__assist_manageexcept">📋 จัดการ 'ยกเว้น'</button>
            </div>
            <div class="field"><label>ดีเลย์ก่อนเก็บ (ms หลังของตก) — 0 = เก็บทันที</label><input type="number" id="__assist_lootdelay" min="0" step="100"></div>
            <div class="field"><label>ดีเลย์ระหว่างเก็บชิ้นต่อไป (ms) — ห่างระหว่าง pickup แต่ละครั้ง</label><input type="number" id="__assist_lootthrottle" min="100" step="100"></div>
            <div class="field"><label>เช็คของใกล้พิกัดมอนที่ฆ่า (ช่อง) — นักธนูยิงไกล → ของตกที่มอน</label><input type="number" id="__assist_pickradiuskill" min="1" max="20" placeholder="5"></div>
            <div class="field"><label>เก็บไม่ได้ครบ N ครั้ง → ปล่อย/วาร์ปไปเก็บ (maxAttempts 1-10)</label><input type="number" id="__assist_maxattempts" min="1" max="10" step="1"></div>
            <div class="btns"><button id="__assist_applylootdelay">ตั้งดีเลย์</button><button id="__assist_t_lootkillpos" class="on">เช็คพิกัดมอนที่ฆ่า</button></div>
            <h4>🌀 Warp-to-Loot (วาร์ปไปเก็บของที่ติดกำแพง)</h4>
            <div class="btns"><button id="__assist_warpbtn" class="off">วาร์ปไปเก็บของ: ?</button></div>
          </div>
          <!-- 🔮 Skill -->
          <div class="__assist_subpage" data-sub="skill">
            <div class="btns">
              <button id="__assist_skillbtn" class="off">Skill: ?</button>
              <button id="__assist_skillnow" class="primary">ใช้ skill เดี๋ยวนี้</button>
              <button id="__assist_manageskill">📋 จัดการ skill</button>
              <button id="__assist_t_buffothers" class="off">🤝 บัพให้คนอื่น: ?</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เพิ่ม/แก้/ลบ skill list ผ่าน popup — รองรับ targeted (Bash), AoE (Magnum), self-cast (Quicken), ally (Heal ตัวเอง), buff (บัพให้คนอื่น)<br>★ บัพให้คนอื่น: ต้องเปิด Skill: ON + toggle นี้ — ใช้เฉพาะรายชื่อเพื่อกันบัพมั่วใส่คนแปลกหน้า</div>
            <div id="__assist_skillcountdown" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่ตั้ง skill)</div>
          </div>
          <!-- ✨ Buff -->
          <div class="__assist_subpage" data-sub="buff">
            <div class="btns">
              <button id="__assist_buffbtn" class="off">Buff: ?</button>
              <button id="__assist_buffnow" class="primary">ใช้ buff เดี๋ยวนี้</button>
            </div>
            <div class="field"><label>buff: itemId,ทุกกี่นาที (คั่นบรรทัด เช่น 656,30) — เพิ่มได้หลายตัว</label><textarea id="__assist_buffitems" rows="3" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:'Consolas',monospace;resize:vertical" placeholder="656,30&#10;645,30"></textarea></div>
            <div class="btns"><button id="__assist_applybuff">ใช้ค่า buff</button><button id="__assist_clearbufftimes">รีเซ็ต countdown</button></div>
            <div id="__assist_buffcountdown" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่ตั้ง buff)</div>
            <h4 style="margin-top:14px;">🔁 ไปรับบัพจากบอทอีกตัว (คู่บอท)</h4>
            <div class="btns"><button id="__assist_t_buffvisit" class="off">🔁 ไปรับบัพ: ?</button></div>
            <div class="field"><label>แผนที่จุดรับบัพ (ที่บอทบัพประจำ — Guard)</label><input type="text" id="__assist_bvmap" placeholder="เช่น izlude"></div>
            <div class="field"><label>พิกัด X</label><input type="number" id="__assist_bvx" placeholder="-999"><label style="margin-left:8px">Y</label><input type="number" id="__assist_bvy" placeholder="-999"><button id="__assist_usebvpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="field"><label>ไปรับทุกกี่วินาที</label><input type="number" id="__assist_bvsec" min="30" max="7200" placeholder="600"><label style="margin-left:8px">รอรับนานสุด (วิ)</label><input type="number" id="__assist_bvwait" min="3" max="300" placeholder="20"></div>
            <div class="btns"><button id="__assist_applybuffvisit">💾 ใช้ค่ารับบัพ</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ครบกำหนด (ตอนว่าง: ไม่สู้/ไม่นั่งพัก/ของเก็บหมด) → ไปหาบอทบัพ (แมปเดิม+ใกล้=เดิน · ไกล/คนละแมป=วาร์ป)<br>★ ยืนรับ Heal/Buff ตามเวลารอ → วาร์ปกลับฟาร์มแมป+พิกัดเดิม · ระหว่างเดินไม่หามอนใหม่ (โดนตีตีกลับได้)</div>
            <h4 style="margin-top:14px;">🏠 กลับจุดเกิดรับบัพ AB (Direct Unstuck)</h4>
            <div class="btns">
              <button id="__assist_t_unstuckbuff" class="off">🏠 AB Refresh: ?</button>
              <button id="__assist_unstucknow" class="primary">▶ รับบัพตอนนี้</button>
            </div>
            <div id="__assist_unstuckpacketstatus" style="display:none"></div>
            <div class="field"><label>กลับจุดเกิดทุกกี่วินาที</label><input type="number" id="__assist_ubsec" min="30" max="7200" placeholder="500"><span style="margin-left:10px;color:#9aa0a6;font-size:10px">กลับแมพเดิมหลัง Unstuck 2 วิ (fixed)</span></div>
            <div class="btns"><button id="__assist_applyunstuckbuff">💾 ใช้ค่า AB Refresh</button></div>
            <div id="__assist_unstuckstatus" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">Direct Unstuck · state=IDLE</div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ใช้ Direct Unstuck 0x73 ที่ยืนยันจากการจับจริง — ไม่ต้อง ESC/คลิก/จับ Candidate อีก<br>★ รอบอัตโนมัติเริ่มนับเมื่อ Combat ON · ▶ รับบัพตอนนี้ = Unstuck ทันที แล้วรีเซ็ตนับ Auto ใหม่<br>★ หลัง Direct Unstuck ครบ 2 วินาที จะวาร์ปกลับแมพ+พิกัดเดิมทันที (ไม่รอ AB เพิ่ม)</div>
          </div>
          <!-- 💉 Heal -->
          <div class="__assist_subpage" data-sub="heal">
            <div class="btns">
              <button id="__assist_healbtn" class="off">Heal: ?</button>
            </div>
            <div class="field"><label>HP% เริ่มใช้ยา (healAt)</label><input type="number" id="__assist_healat" min="1" max="100"></div>
            <div class="field"><label>item id ที่จะใช้ heal (คั่นด้วยจุลภาค)</label><input type="text" id="__assist_healitems" placeholder="เช่น 501,502,503"></div>
            <div class="btns"><button id="__assist_applyheal">ใช้ค่า heal</button></div>
            <div class="field"><label>โหมด heal</label><select id="__assist_healmode"><option value="order">order (ใช้ตัวเดิมจนหมด)</option><option value="random">random (สุ่ม)</option></select></div>
          </div>
          <!-- 🏃 Flee -->
          <div class="__assist_subpage" data-sub="flee">
            <div class="btns">
              <button id="__assist_t_fleeplayers" class="off">🏃 หนีผู้เล่น</button>
              <button id="__assist_t_fleemode_change" class="on">🗺️ เปลี่ยนแมป</button>
              <button id="__assist_t_fleemode_same" class="off">📍 แมปเดิม</button>
            </div>
            <div class="field"><label>แผนที่สำรองเมื่อหนีผู้เล่น (คั่นด้วยจุลภาค)</label><input type="text" id="__assist_fleemaps" placeholder="moc_fild04,moc_fild08,gef_fild13"></div>
            <div class="field"><label>รัศมีตรวจจับผู้เล่น (ช่อง) — 0 = หนีทันทีที่มีผู้เล่นในแผนที่</label><input type="number" id="__assist_fleeradius" min="0" max="200" placeholder="30"></div>
            <div class="field"><label>คูลดาวน์วาร์ปหนี (วินาที) — 0 = หนีรัวสุด ไม่ต้องรอ</label><input type="number" id="__assist_fleecd" min="0" max="30" step="1" placeholder="5"></div>
            <div class="btns"><button id="__assist_applyfleemap">ใช้ค่าหนีผู้เล่น</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.5">★ โหมดเปลี่ยนแมพ: Direct 0x40 ไปแมพสำรองก่อน → ถ้ายังติด gap 3s จะใช้ Teleport Clip → ถ้า Clip ไม่ย้ายใน ~0.45s ใช้ Fly Wing 601 → แล้วเปลี่ยนแมพสำรองทันทีเมื่อ Direct พร้อม</div>
          </div>
          <!-- 🪑 Rest -->
          <div class="__assist_subpage" data-sub="rest">
            <div class="btns"><button id="__assist_restbtn" class="off">Rest: ?</button></div>
            <div class="field"><label>HP% ที่จะนั่งพัก (ต่ำกว่านี้ → นั่ง)</label><input type="number" id="__assist_resthp" min="1" max="99"></div>
            <div class="field"><label>SP% ที่จะนั่งพัก (ต่ำกว่านี้ → นั่งด้วย · 0 = ไม่สน SP — สำหรับบอทบัพ)</label><input type="number" id="__assist_restsp" min="0" max="99"></div>
            <div class="field"><label>HP/SP% ที่จะลุกยืน (ฟื้นถึงนี้ → ลุก · ใช้ค่าเดียวกันทั้ง HP และ SP)</label><input type="number" id="__assist_restuntil" min="1" max="100"></div>
            <div class="field"><label>นั่งนานสุด (วินาที) — กันค้าง</label><input type="number" id="__assist_restmaxsec" min="5" max="300"></div>
            <div class="field"><label>ดีเลย์ก่อนนั่ง (ms) — หลังเก็บของเสร็จ รอก่อนค่อยนั่ง (กันดูเป็นบอท)</label><input type="number" id="__assist_restdelay" min="0" max="10000" step="100"></div>
            <div class="btns"><button id="__assist_applyrest">ใช้ค่า rest</button></div>
            <h4>💀 Auto-Respawn (เกิดใหม่อัตโนมัติเมื่อตาย)</h4>
            <div class="btns"><button id="__assist_respawnbtn" class="on">Respawn: ?</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ตาย → Auto Respawn → เกิดใหม่แล้ว Unstuck 0x73 1 ครั้ง → นั่งพักจนเลือดเต็ม → กลับฟาร์ม</div>
          </div>
          <!-- 💰 Sell -->
          <div class="__assist_subpage" data-sub="sell">
            <div class="btns">
              <button id="__assist_sellbtn" class="off">Sell: ?</button>
              <button id="__assist_sellnow" class="danger">ขายเดี๋ยวนี้</button>
            </div>
            <div class="field"><label>ชื่อ NPC ขายของ</label><input type="text" id="__assist_sellnpc" placeholder="เช่น Tool Dealer"></div>
            <div class="field"><label>แมปที่ NPC อยู่ (ต้องตรงกับ Save Point หลัง Unstuck)</label><input type="text" id="__assist_sellmap" placeholder="เช่น izlude"></div>
            <div class="field"><label>จุดเดินหลัง Unstuck X</label><input type="number" id="__assist_sellx" placeholder="114"><label style="margin-left:8px">Y</label><input type="number" id="__assist_selly" placeholder="49"><button id="__assist_useselfpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="field"><label>ขายทุก N นาที (0=off)</label><input type="number" id="__assist_sellinterval" min="0" max="999"></div>
            <div class="btns"><button id="__assist_applysell">ใช้ค่า sell</button><button id="__assist_t_sellfull" class="on">ขายตอนเต็ม</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ขาไปขาย: Unstuck 0x73 → รอ 2 วิ → เดินไปจุด X/Y → คุย NPC · Save Point ต้องอยู่แมพเดียวกับ NPC<br>★ เลือก item ที่จะขาย/ฝาก: กดปุ่มสีที่รายการของในสถิติ — วน เก็บ(เทา)→ขาย(ส้ม)→ฝาก(เขียว)→เก็บ</div>
          </div>
          <!-- 🏦 Storage -->
          <div class="__assist_subpage" data-sub="storage">
            <div class="btns">
              <button id="__assist_storagebtn" class="off">Storage: ?</button>
              <button id="__assist_depositnow" class="primary">ฝากเดี๋ยวนี้</button>
            </div>
            <div class="field"><label>ชื่อ NPC Kafra</label><input type="text" id="__assist_kafra" placeholder="เช่น Kafra Staff"></div>
            <div class="field"><label>แมปที่ Kafra อยู่ (ต้องตรงกับ Save Point หลัง Unstuck)</label><input type="text" id="__assist_kaframap" placeholder="เช่น izlude"></div>
            <div class="field"><label>จุดเดินหลัง Unstuck X</label><input type="number" id="__assist_kafrax" placeholder="0=ใช้ sell"><label style="margin-left:8px">Y</label><input type="number" id="__assist_kafray" placeholder="0=ใช้ sell"><button id="__assist_usekafrapos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="field"><label>เมนู choice (0=Save, 1=Storage, 2=Warp)</label><input type="number" id="__assist_kafrachoice" min="0" max="9" placeholder="1"></div>
            <div class="btns"><button id="__assist_applykafra">ใช้ค่า storage</button><button id="__assist_t_depfull" class="on">ฝากตอนเต็ม</button><button id="__assist_t_depaftersell" class="on">ฝากหลังขาย</button></div>
          </div>
          <!-- ⚙️ อื่นๆ -->
          <!-- 🔑 Auto-Login / Auto-Refresh -->
          <div class="__assist_subpage" data-sub="auto">
            <h4>🤖 Auto-Login — ล็อกอิน + เลือกตัวละครเองเมื่อเข้าเกม</h4>
            <div class="btns"><button id="__assist_autologinbtn" class="off">Auto-Login: ?</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin:6px 0;line-height:1.6;background:#23262e;border-radius:6px;padding:8px;">
              ⚠️ <b style="color:#e8a13a">การกรอก username/password เองยังใช้ไม่ได้</b> (Unity ไม่รับ synthetic text — จะแก้ไขภายหลัง)<br>
              ✅ ระบบใช้ <b>"รหัสที่เกมจำไว้ + กด Enter"</b> แทน — โปรดล็อกอินผ่านหน้าเกมด้วยตัวเอง 1 ครั้งให้เกมจำรหัสไว้ จากนั้น auto-login จะทำงานครบวงจร (คลิก splash → Enter → เลือกตัวละคร → เข้าเกม)
            </div>
            <div class="field" style="opacity:.45"><label>Username (ยังใช้ไม่ได้ — รอแก้ไข)</label><input type="text" id="__assist_aluser" placeholder="ยังไม่รองรับการกรอกเอง" autocomplete="off" disabled></div>
            <div class="field" style="opacity:.45"><label>Password (ยังใช้ไม่ได้ — รอแก้ไข)</label><input type="password" id="__assist_alpass" placeholder="ยังไม่รองรับการกรอกเอง" autocomplete="new-password" disabled></div>
            <div class="field"><label>Character slot (เริ่มนับ 0 — ตัวแรก = 0)</label><input type="number" id="__assist_alslot" min="0" max="9" step="1"></div>
            <div class="btns"><button id="__assist_applyauto">💾 ใช้ค่า auto-login</button></div>
            <div style="font-size:10px;color:#e8a13a;margin-top:6px;">⚠️ username/password จะถูกเก็บใน localStorage ของเบราว์เซอร์ (รอดจาก refresh) — ห้ามใช้ในเครื่องส่วนรวม และค่าเหล่านี้จะไม่ถูกส่งออกนอกเครื่องโดย RO Assist</div>
            <h4 style="margin-top:14px;">🔄 Auto-Refresh — ค้างนาน → refresh หน้า + login กลับเอง</h4>
            <div class="btns"><button id="__assist_autorefreshbtn" class="off">Auto-Refresh: ?</button></div>
            <div class="field"><label>ถือว่าค้างเมื่อไม่มี packet ต่อเนื่อง (วินาที)</label><input type="number" id="__assist_arstall" min="60" max="1800" step="10"></div>
            <div class="btns"><button id="__assist_applyrefresh">💾 ใช้ค่า auto-refresh</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:6px;">★ ปกติ server ส่ง packet มาตลอด (regen/beacon ทุกไม่กี่วิ) — เงียบเกินเกณฑ์ = เกมค้าง → refresh แล้ว auto-login เข้ามาใหม่ (ควรเปิด auto-login คู่กัน)</div>
          </div>
          <div class="__assist_subpage" data-sub="misc">
            <h4>🤝 Auto Trade (คำขอ Trade ที่ผู้เล่นอื่นส่งมา)</h4>
            <div class="btns">
              <button id="__assist_trade_accept_all" class="off">✅ Accept-All Trade: OFF</button>
              <button id="__assist_trade_reject_all" class="off">🚫 Eject-All Trade: OFF</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin:5px 0;line-height:1.5;">★ Rayrag verified: request <code>0x7e len=43</code> · Accept/Eject ทำงานอัตโนมัติทันทีเมื่อมีผู้เล่นส่ง Trade</div>
            <h4>🗺️ Navigation (บันทึกเส้นทางเดิน + waypoint graph)</h4>
            <div class="btns">
              <button id="__assist_navrecbtn" class="off">บันทึก: ?</button>
              <button id="__assist_navwanderbtn" class="on">เดินตาม nav</button>
              <button id="__assist_gatwanderbtn" class="on" title="wander ใช้ตารางเดินได้จากไฟล์ .gat ของแมป (ground truth) ก่อน nav — เดินหามอนตามพื้นที่จริง ไม่ชนกำแพง (แมปที่มีข้อมูลเท่านั้น เช่น moc_fild01)">เดินตาม GAT</button>
            </div>
            <div class="field"><label>โหมดเดินตาม nav</label><select id="__assist_navmode"><option value="patrol">patrol (เดินตามลำดับ route ครบแล้วย้อนกลับ)</option><option value="graph">graph (wander สุ่มตามกราฟ)</option></select></div>
            <div class="field"><label>รัศมีรวมจุด (ช่อง) — จุดที่อยู่ใกล้กัน <= N ช่อง = รวม node เดียว</label><input type="number" id="__assist_navradius" min="1" max="20"></div>
            <div class="btns">
              <button id="__assist_applynav">ใช้ค่า nav</button>
              <button id="__assist_navexport">export</button>
              <button id="__assist_navimport">import</button>
              <button id="__assist_navclear" class="danger">ล้าง</button>
            </div>
            <div id="__assist_navstats" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่มีข้อมูล)</div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เปิด 'บันทึก' แล้วเดินเก็บข้อมูลในแมปที่ต้องการ ปิดเมื่อเสร็จ<br>★ wander จะใช้ waypoint graph แทนสุ่ม (ถ้ามีข้อมูลแมปนั้น)</div>
            <h4>👤 Profile การตั้งค่า</h4>
            <div class="field"><label>เลือก profile (● = กำลังใช้)</label><select id="__assist_profile_sel"></select></div>
            <div class="field"><label>ชื่อ profile สำหรับ "บันทึกเป็น" (ใหม่ หรือทับของเดิม)</label><input type="text" id="__assist_profile_name" placeholder="เช่น บอทบัพ, บอทฟาร์ม"></div>
            <div class="btns">
              <button id="__assist_profile_save">💾 บันทึกเป็น</button>
              <button id="__assist_profile_use">🔄 ใช้ตัวนี้</button>
              <button id="__assist_profile_del">🗑 ลบ</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ บันทึกเป็น: ใช้ชื่อในช่องข้อความ (ว่าง = ทับตัวที่เลือก)<br>★ สลับ: เซฟค่าทั่วไปอัตโนมัติก่อนโหลดชุดใหม่<br>★ 🔐 Profile/Backup ไม่เก็บ Auto-login Username/Password<br>★ buff/skill times + nav data ใช้ร่วมกันทุก profile</div>
            <h4>📤 สำรอง / ย้ายเครื่อง</h4>
            <div class="btns">
              <button id="__assist_exportall">📤 export ทั้งหมด</button>
              <button id="__assist_importall">📥 import</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ export รวม config + buff/skill times + nav data<br>★ import = ทับค่าปัจจุบัน</div>
            <h4 style="color:#e74c3c">⚠️ Reset</h4>
            <div class="btns">
              <button id="__assist_resetconfig" class="danger">🔄 รีเซ็ตค่าทั้งหมดกลับเป็น Default</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ล้างค่าทั้งหมดที่บันทึกไว้ กลับเป็นค่าเริ่มต้น<br>★ ต้องเข้าเกมใหม่หลังรีเซ็ต</div>
          </div>
        </div>
        <div class="__assist_page" data-page="alert">
          <div class="btns" style="margin-bottom:8px"><button id="__assist_chatpausebtn" class="on">💬 Chat Alert + Pause: ON</button><button id="__assist_testchatalert">🧪 ทดสอบ Chat Alert</button><button id="__assist_chatresume">▶ Resume</button></div>
          <div style="font-size:10px;color:#9aa0a6;margin-bottom:8px;line-height:1.5">★ nearby/whisper จากผู้เล่นอื่น → หยุดการเคลื่อนไหว/ต่อสู้ชั่วคราว และแสดงปุ่มตอบด่วนที่ต้องกดเอง<br>★ Auto-Heal ยังทำงานระหว่าง Pause · ไม่มีการตอบแชทอัตโนมัติ</div>
          <div class="logbox" id="__assist_alertbox"></div>
          <div class="btns"><button class="danger" id="__assist_clearalert">ล้าง log สำคัญ</button></div>
        </div>
        <div class="__assist_page" data-page="log">
          <div class="btns" style="margin-bottom:6px">
            <button id="__assist_logsrc_act" style="background:#2a4a6a;color:#8cf;border:1px solid #4a7ab5;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">📋 กิจกรรม</button>
            <button id="__assist_logsrc_dbg" style="background:#333;color:#aaa;border:1px solid #555;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">🔍 Debug</button>
          </div>
          <div class="logbox" id="__assist_logbox"></div>
          <div class="btns"><button id="__assist_copylog">📋 คัดลอก log</button><button id="__assist_clearlog">ล้าง log</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // ★★ track "กำลังแก้ input" ด้วย focusin/focusout (แทน document.activeElement)
    //   Unity เรียก canvas.focus() ทุกเฟรม → activeElement เปลี่ยนเป็น canvas ตลอด
    //   → syncInput ที่เช็ค activeElement จะเขียนทับค่าที่กำลังพิมพ์อยู่
    //   แก้: track ด้วย focusin/focusout (จับก่อน Unity แย่ง focus)
    //   ★ editingInputs + isEditing ประกาศที่ module-level (ใช้ได้ทั้ง buildUI + renderUI)
    root.addEventListener('focusin', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) editingInputs.add(e.target);
    });
    root.addEventListener('focusout', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        // ★ delay 100ms ก่อนล้าง — กัน Unity แย่ง focus ชั่วขณะ แล้ว browser คืน focus กลับ
        setTimeout(() => { try { editingInputs.delete(e.target); } catch (_) {} }, 100);
      }
    });

    // ---------- wire events ----------
    // ★★ Unity WebGL (Emscripten) ดัก keyboard ที่ window ใน capture phase เหมือนกัน
    //   + เรียก preventDefault ทำให้ input ไม่รับ key → พิมพ์ไม่ติด
    //   วิธีแก้: intercept keydown ใน capture phase (ดักก่อน Unity) ถ้ามี input ของเรา active
    //   → หยุด propagation + จัดการ input เอง (แทรก/ลบตัวอักษรตรงๆ)
    const ASSIST_INPUT_SEL = 'input, select, textarea';
    // ★ รองรับทั้ง main panel (root) และ item-list popup (append ที่ body แยก)
    function isOurField(t) {
      if (!t || !t.closest || !t.matches || !t.matches(ASSIST_INPUT_SEL)) return false;
      return root.contains(t)
        || (t.closest && t.closest('#__assist_itempopup'))
        || (t.closest && t.closest('#__assist_skillpopup'))
        || (t.closest && t.closest('#__assist_market_panel'));
    }
    function ourActiveInput() {
      const ae = document.activeElement;
      return (ae && isOurField(ae)) ? ae : null;
    }
    // ดัก keyboard events ใน capture phase — ถ้ามี input ของเรา active ให้หยุดทุกอย่าง + จัดการเอง
    window.addEventListener('keydown', (e) => {
      const inp = ourActiveInput();
      if (!inp) return;
      // หยุด Unity รับ key นี้
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      // ★★ clipboard shortcuts (Ctrl/Cmd + V/C/X/A) — ห้าม preventDefault เด็ดขาด!
      //   preventDefault บน keydown = ฆ่า default action ของ browser → paste/copy event ไม่เกิดเลย
      //   (บั๊กเดิม: Ctrl+V เงียบ ต้องคลิกขวา Paste เพราะบล็อกตัวเอง — คลิกขวาไม่ผ่าน keydown เลยรอด)
      //   คืนให้ browser ทำ → paste event จะวิ่งไป handler ที่มีอยู่แล้ว (รูป→upload, ข้อความ→แทรก/แนบ)
      //   ★ AltGr (คีย์บอร์ดยุโรป) = ctrl+alt พร้อมกัน → ไม่ใช่ shortcut จริง → ไม่ early-return
      const kLow = (e.key || '').toLowerCase();
      const isClipboardCombo = ['v', 'c', 'x', 'a'].includes(kLow) && ((e.ctrlKey && !e.altKey) || e.metaKey);
      if (isClipboardCombo) return;
      e.preventDefault();
      // จัดการ input เอง (Unity กลืน key หมด แม้ input focus)
      handleInputKey(inp, e);
    }, true);
    // ดัก paste ด้วย
    window.addEventListener('paste', (e) => {
      const inp = ourActiveInput();
      if (!inp) return;
      const pasteText = (e.clipboardData || window.clipboardData).getData('text');
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.preventDefault();
      const text = pasteText;
      const s = inp.selectionStart, en = inp.selectionEnd;
      inp.value = inp.value.slice(0, s) + text + inp.value.slice(en);
      const pos = s + text.length;
      inp.selectionStart = inp.selectionEnd = pos;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
    // จัดการ key ให้ input เอง (เพราะ Unity กลืน keydown)
    function handleInputKey(inp, e) {
      const k = e.key;
      // ★★ number input — ใช้วิธีง่าย (selection API ไม่รองรับ type=number)
      if (inp.type === 'number') {
        if (k === 'Backspace') inp.value = inp.value.slice(0, -1);
        else if (k === 'Delete') inp.value = inp.value.slice(1);
        else if (k === 'Enter') { inp.blur(); }
        else if (k.length === 1 && /[\d.\-]/.test(k)) inp.value += k;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const s = inp.selectionStart, en = inp.selectionEnd;
      if (k === 'Backspace') {
        if (s === en && s > 0) { inp.value = inp.value.slice(0, s - 1) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s - 1; }
        else if (s !== en) { inp.value = inp.value.slice(0, s) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s; }
      } else if (k === 'Delete') {
        if (s === en && s < inp.value.length) { inp.value = inp.value.slice(0, s) + inp.value.slice(en + 1); inp.selectionStart = inp.selectionEnd = s; }
        else if (s !== en) { inp.value = inp.value.slice(0, s) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s; }
      } else if (k === 'ArrowLeft') { inp.selectionStart = inp.selectionEnd = Math.max(0, s - 1); }
      else if (k === 'ArrowRight') { inp.selectionStart = inp.selectionEnd = Math.min(inp.value.length, s + 1); }
      else if (k === 'Home') { inp.selectionStart = inp.selectionEnd = 0; }
      else if (k === 'End') { inp.selectionStart = inp.selectionEnd = inp.value.length; }
      else if (k === 'Enter') {
        // ★ textarea: Enter = ขึ้นบรรทัด
        //   input (1 บรรทัด): Enter = blur
        if (inp.tagName === 'TEXTAREA') {
          inp.value = inp.value.slice(0, s) + '\n' + inp.value.slice(en);
          inp.selectionStart = inp.selectionEnd = s + 1;
        } else {
          // ★ input 1 บรรทัด: Enter = blur
          inp.blur();
        }
      }
      else if (k.length === 1) {   // ตัวอักษร 1 ตัว (รวมตัวเลข ภาษาอังกฤษ)
        // ★ คีย์ร่วมกับ Ctrl/Alt/Cmd ล้วน (ไม่ใช่ AltGr=ctrl+alt) → เป็น shortcut ไม่ใช่พิมพ์ ห้ามแทรก
        const pureCtrl = e.ctrlKey && !e.altKey, pureAlt = e.altKey && !e.ctrlKey;
        if (!(pureCtrl || pureAlt || e.metaKey)) {
          inp.value = inp.value.slice(0, s) + k + inp.value.slice(en);
          inp.selectionStart = inp.selectionEnd = s + 1;
        }
      }
      // อื่นๆ (Shift/Ctrl/Alt/Tab ฯลฯ) ไม่ต้องทำอะไร
      try { inp.scrollLeft = inp.scrollWidth; } catch (_) {}   // ★★ scroll ตาม cursor (กันข้อความยาวไม่เลื่อน)
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // ★ คลิก input → focus ทันที (กัน Unity ขโมย)
    root.addEventListener('mousedown', (e) => {
      if (isOurField(e.target)) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); e.target.select && e.target.select(); } catch (_) {} }, 0);
      }
    }, true);

    const bar = root.querySelector('#__assist_bar');
    const popup = root.querySelector('#__assist_popup');
    bar.addEventListener('click', (e) => {
      // กดที่ pill loot/heal ใน mini-bar = toggle ทันที (ไม่เปิด popup)
      const pill = e.target.closest('.pill');
      if (pill) {
        if (pill.hasAttribute('data-loot')) CFG.lootEnabled ? ASSIST.lootOff() : ASSIST.lootOn();
        if (pill.hasAttribute('data-heal')) CFG.healEnabled ? ASSIST.healOff() : ASSIST.healOn();
        if (pill.hasAttribute('data-rest')) CFG.restEnabled ? ASSIST.restOff() : ASSIST.restOn();
        if (pill.hasAttribute('data-combat')) {
          if (!CFG.combatEnabled && !confirm('เปิด Auto-Combat?\n\nส่ง packet โจมตีจริง — ตั้ง whitelist ก่อน (เช่น ASSIST.setTargetWhitelist("Poring"))\nใช้ในความรับผิดชอบของคุณ')) return;
          CFG.combatEnabled ? ASSIST.combatOff() : ASSIST.combatOn();
        }
        if (pill.hasAttribute('data-skill')) CFG.skillEnabled ? ASSIST.skillOff() : ASSIST.skillOn();
        if (pill.hasAttribute('data-buff')) CFG.buffEnabled ? ASSIST.buffOff() : ASSIST.buffOn();
        if (pill.hasAttribute('data-sell')) CFG.sellEnabled ? ASSIST.sellOff() : ASSIST.sellOn();
        if (pill.hasAttribute('data-storage')) CFG.storageEnabled ? ASSIST.storageOff() : ASSIST.storageOn();
        if (pill.hasAttribute('data-flee')) { CFG.fleeFromPlayers = !CFG.fleeFromPlayers; saveConfigDebounced(); log('🏃 หนีผู้เล่น:', CFG.fleeFromPlayers ? 'เปิด' : 'ปิด'); }
        if (pill.hasAttribute('data-auto')) {
          CFG.autoLoginEnabled ? ASSIST.autoLoginOff() : ASSIST.autoLoginOn();
          log('🤖 (มีผลตอน refresh หน้าครั้งถัดไป)');
        }
        if (pill.hasAttribute('data-teleport')) {
          if (sendRandomWarp()) log('🌀 วาร์ปสุ่ม (กดจาก mini-bar)');
        }
        if (pill.hasAttribute('data-monitor')) { openMonitor(); }
        if (pill.hasAttribute('data-inventory')) { openInventoryModal(); }
        if (pill.hasAttribute('data-market')) { openMarketPanel(); }
        if (pill.hasAttribute('data-changelog')) { openChangelogModal(); }
        if (pill.hasAttribute('data-logview')) { openLogViewModal(); }
        return;
      }
      popup.classList.toggle('open');
    });

    // tab switching
    root.querySelectorAll('#__assist_tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const page = tab.getAttribute('data-page');
        root.querySelectorAll('#__assist_tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
        root.querySelectorAll('.__assist_page').forEach(p => p.classList.toggle('active', p.getAttribute('data-page') === page));
      });
    });
    // ★ sub-tab switching (ใน config page)
    root.querySelectorAll('.__assist_subtabs .subtab').forEach(sub => {
      sub.addEventListener('click', () => {
        const s = sub.getAttribute('data-sub');
        root.querySelectorAll('.__assist_subtabs .subtab').forEach(t => t.classList.toggle('active', t === sub));
        root.querySelectorAll('.__assist_subpage').forEach(p => p.classList.toggle('active', p.getAttribute('data-sub') === s));
      });
    });

    // config tab buttons
    root.querySelector('#__assist_lootbtn').addEventListener('click', () => CFG.lootEnabled ? ASSIST.lootOff() : ASSIST.lootOn());
    root.querySelector('#__assist_healbtn').addEventListener('click', () => CFG.healEnabled ? ASSIST.healOff() : ASSIST.healOn());
    root.querySelector('#__assist_warpbtn').addEventListener('click', () => {
      if (!CFG.warpLootEnabled && !confirm('เปิด Warp-to-Loot?\n\nส่ง packet วาร์ปจริง — เก็บไม่ได้ครบ ' + CFG.maxAttempts + ' ครั้งจะวาร์ปไปที่ไอเท็ม\nใช้ในความรับผิดชอบของคุณ')) return;
      CFG.warpLootEnabled ? ASSIST.warpLootOff() : ASSIST.warpLootOn();
    });

    root.querySelector('#__assist_applyheal').addEventListener('click', () => {
      const pct = parseInt(root.querySelector('#__assist_healat').value, 10);
      if (!isNaN(pct)) ASSIST.setHealAt(pct);
      const ids = root.querySelector('#__assist_healitems').value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length) ASSIST.setHealItems(...ids);
    });
    root.querySelector('#__assist_healmode').addEventListener('change', e => ASSIST.setHealMode(e.target.value));
    // ---- buff wires ----
    root.querySelector('#__assist_buffbtn').addEventListener('click', () => CFG.buffEnabled ? ASSIST.buffOff() : ASSIST.buffOn());
    root.querySelector('#__assist_buffnow').addEventListener('click', () => ASSIST.buffNow());
    root.querySelector('#__assist_applybuff').addEventListener('click', () => {
      const raw = root.querySelector('#__assist_buffitems').value;
      const items = raw.split('\n').map(line => {
        const parts = line.split(',').map(s => s.trim());
        const itemId = parseInt(parts[0], 10);
        const intervalMin = parseFloat(parts[1]);
        return (!isNaN(itemId) && !isNaN(intervalMin) && intervalMin > 0) ? { itemId, intervalMin } : null;
      }).filter(x => x);
      ASSIST.setBuffItems(items);
    });
    root.querySelector('#__assist_clearbufftimes').addEventListener('click', () => ASSIST.clearBuffTimes());
    // ★★ ไปรับบัพจากบอทอีกตัว (buffVisit) — toggle + พิกัด + interval/wait
    root.querySelector('#__assist_t_buffvisit').addEventListener('click', () => {
      CFG.buffVisitEnabled = !CFG.buffVisitEnabled;
      saveConfigDebounced();
      buffVisitState = 'IDLE'; buffVisitLastAt = 0; buffVisitReturnTo = null;
      log('🔁 ไปรับบัพ:', CFG.buffVisitEnabled ? ('เปิด — จุดรับ ' + (CFG.buffVisitMap || '(ยังไม่ตั้ง!)') + ' @(' + CFG.buffVisitX + ',' + CFG.buffVisitY + ') ทุก ' + CFG.buffVisitIntervalSec + 's รอ ' + CFG.buffVisitWaitSec + 's') : 'ปิด');
    });
    root.querySelector('#__assist_usebvpos').addEventListener('click', () => {
      if (player.x == null) { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); return; }
      root.querySelector('#__assist_bvx').value = Math.round(player.x);
      root.querySelector('#__assist_bvy').value = Math.round(player.y);
      if (currentMap) root.querySelector('#__assist_bvmap').value = currentMap;
      log('🔁 จดจุดรับบัพ:', currentMap + ' @(' + Math.round(player.x) + ',' + Math.round(player.y) + ') — กด "ใช้ค่ารับบัพ" เพื่อบันทึก');
    });
    root.querySelector('#__assist_applybuffvisit').addEventListener('click', () => {
      const bm = root.querySelector('#__assist_bvmap').value.trim();
      const bx = parseInt(root.querySelector('#__assist_bvx').value, 10);
      const by = parseInt(root.querySelector('#__assist_bvy').value, 10);
      const bs = parseInt(root.querySelector('#__assist_bvsec').value, 10);
      const bw = parseInt(root.querySelector('#__assist_bvwait').value, 10);
      if (bm) CFG.buffVisitMap = bm;
      if (!isNaN(bx)) CFG.buffVisitX = bx;
      if (!isNaN(by)) CFG.buffVisitY = by;
      if (!isNaN(bs) && bs >= 30) CFG.buffVisitIntervalSec = bs;
      if (!isNaN(bw) && bw >= 3) CFG.buffVisitWaitSec = bw;
      saveConfigDebounced();
      log('🔁 จุดรับบัพ =', CFG.buffVisitMap || '(แมปปัจจุบัน)', '@(', CFG.buffVisitX + ',' + CFG.buffVisitY + ') ทุก', CFG.buffVisitIntervalSec + 's รอ', CFG.buffVisitWaitSec + 's');
    });
    // ★ populate buffVisit inputs ครั้งเดียว
    const _bvm = root.querySelector('#__assist_bvmap'); if (_bvm) _bvm.value = CFG.buffVisitMap || '';
    const _bvx2 = root.querySelector('#__assist_bvx'); if (_bvx2) _bvx2.value = CFG.buffVisitX != null && CFG.buffVisitX > -999 ? CFG.buffVisitX : '';
    const _bvy2 = root.querySelector('#__assist_bvy'); if (_bvy2) _bvy2.value = CFG.buffVisitY != null && CFG.buffVisitY > -999 ? CFG.buffVisitY : '';
    const _bvs = root.querySelector('#__assist_bvsec'); if (_bvs) _bvs.value = CFG.buffVisitIntervalSec || 600;
    const _bvw = root.querySelector('#__assist_bvwait'); if (_bvw) _bvw.value = CFG.buffVisitWaitSec || 20;
    // ★★ AB Refresh: Direct Unstuck → 2s → กลับฟาร์มทันที
    root.querySelector('#__assist_t_unstuckbuff').addEventListener('click', () => ASSIST.toggleUnstuckBuff(!CFG.unstuckBuffEnabled));
    root.querySelector('#__assist_unstucknow').addEventListener('click', () => ASSIST.unstuckBuffNow());
    root.querySelector('#__assist_applyunstuckbuff').addEventListener('click', () => {
      const sec = parseInt(root.querySelector('#__assist_ubsec').value, 10);
      ASSIST.setUnstuckBuff(!isNaN(sec) ? sec : CFG.unstuckBuffIntervalSec, 2);
    });
    const _ubs = root.querySelector('#__assist_ubsec'); if (_ubs) _ubs.value = CFG.unstuckBuffIntervalSec || 600;
    // ---- skill wires ----
    root.querySelector('#__assist_skillbtn').addEventListener('click', () => CFG.skillEnabled ? ASSIST.skillOff() : ASSIST.skillOn());
    root.querySelector('#__assist_skillnow').addEventListener('click', () => ASSIST.skillNow());
    root.querySelector('#__assist_manageskill').addEventListener('click', () => openSkillPopup());
    // ★ toggle บอทบัพให้คนอื่น (default OFF — กันบัพมั่วใส่คนแปลกหน้าตอนเดินผ่าน)
    root.querySelector('#__assist_t_buffothers').addEventListener('click', () => {
      CFG.buffOthersEnabled = !CFG.buffOthersEnabled;
      saveConfigDebounced();
      const bSkills = (CFG.skills || []).filter(s => s && s.buffMode);
      log('🤝 บัพให้คนอื่น:', CFG.buffOthersEnabled ? 'เปิด (' + bSkills.length + ' สกิล buff · ' + (bSkills.map(s => s.name).join(', ') || 'ยังไม่มี') + ')' : 'ปิด');
    });
    root.querySelector('#__assist_lootmode').addEventListener('change', e => ASSIST.setLootMode(e.target.value));
    root.querySelector('#__assist_manageonly').addEventListener('click', () => openItemListPopup('only'));
    root.querySelector('#__assist_manageexcept').addEventListener('click', () => openItemListPopup('except'));
    root.querySelector('#__assist_applylootdelay').addEventListener('click', () => {
      const ms = parseInt(root.querySelector('#__assist_lootdelay').value, 10);
      if (!isNaN(ms)) ASSIST.setLootDelay(ms);
      const th = parseInt(root.querySelector('#__assist_lootthrottle').value, 10);
      if (!isNaN(th) && th >= 100) { CFG.sendThrottleMs = th; log('📦 ดีเลย์ระหว่างเก็บ =', th, 'ms'); }
      const rk = parseInt(root.querySelector('#__assist_pickradiuskill').value, 10);
      if (!isNaN(rk)) { CFG.pickRadiusKill = rk; log('📦 ระยะเช็คพิกัดมอน =', rk, 'ช่อง'); }
      // ★ maxAttempts — เก็บไม่ได้ครบ N ครั้ง → ปล่อย/วาร์ปไปเก็บ
      const matt = parseInt(root.querySelector('#__assist_maxattempts')?.value, 10);
      if (!isNaN(matt) && matt >= 1 && matt <= 10) { CFG.maxAttempts = matt; log('📦 เก็บสูงสุด', matt, 'ครั้ง/ชิ้น'); saveConfigDebounced(); }
    });
    // ★ populate maxAttempts ครั้งเดียว
    const _matt = root.querySelector('#__assist_maxattempts'); if (_matt) _matt.value = CFG.maxAttempts;
    root.querySelector('#__assist_t_lootkillpos').addEventListener('click', () => {
      CFG.lootUseKillPos = !CFG.lootUseKillPos;
      log('📦 เช็คพิกัดมอนที่ฆ่า =', CFG.lootUseKillPos);
    });

    // ---- combat wires ----
    const parseList = (sel) => root.querySelector(sel).value.split(',').map(s => {
      const t = s.trim(); if (!t) return null;
      const n = parseInt(t, 10); return isNaN(n) ? t : n;     // ตัวเลข → number, อื่น → ชื่อ
    }).filter(x => x !== null);
    root.querySelector('#__assist_combatbtn').addEventListener('click', () => {
      if (!CFG.combatEnabled && !confirm('เปิด Auto-Combat?\n\nส่ง packet โจมตีจริง — ตั้ง whitelist ก่อน\nใช้ในความรับผิดชอบของคุณ')) return;
      CFG.combatEnabled ? ASSIST.combatOff() : ASSIST.combatOn();
    });
    root.querySelector('#__assist_applywhitelist').addEventListener('click', () => ASSIST.setTargetWhitelist(...parseList('#__assist_whitelist')));
    root.querySelector('#__assist_applyblacklist').addEventListener('click', () => ASSIST.setTargetBlacklist(...parseList('#__assist_blacklist')));
    root.querySelector('#__assist_applycombat').addEventListener('click', () => {
      const r = parseInt(root.querySelector('#__assist_attackrange').value, 10);
      if (!isNaN(r)) { if (r > 2) ASSIST.setRanged(r); else ASSIST.setAttackRange(r || 2); }
      const sw = parseInt(root.querySelector('#__assist_stuckwarp').value, 10);
      if (!isNaN(sw)) { CFG.stuckWarpOnAbandon = sw; log('⚔️ stuck abandon → วาร์ปสุ่ม =', sw === 0 ? 'ปิด' : sw + 'ครั้ง'); }
      const nws = parseInt(root.querySelector('#__assist_nowarpsec')?.value, 10);
      if (!isNaN(nws)) { CFG.noMonsterWarpSec = nws; log('🌀 วาร์ปหามอนหลังไม่เจอ', nws === 0 ? 'ทันที' : nws + 'วิ'); }
      const es = parseInt(root.querySelector('#__assist_engagesec')?.value, 10);
      if (!isNaN(es)) CFG.maxEngageSec = es;
      const esl = parseInt(root.querySelector('#__assist_engageslow')?.value, 10);
      if (!isNaN(esl)) CFG.maxEngageSecSlow = esl;
      const maq = parseInt(root.querySelector('#__assist_maxacq')?.value, 10);
      if (!isNaN(maq) && maq > 0) { CFG.maxAcquireDistance = maq; log('🎯 รัศมีค้นหามอน =', maq, 'ช่อง'); }
      const mch = parseInt(root.querySelector('#__assist_maxchase')?.value, 10);
      if (!isNaN(mch) && mch > 0) { CFG.maxChaseDistance = mch; log('🏃 ไล่มอนสูงสุด =', mch, 'ช่อง'); }
      // ★ attackPendingMax — abandon มอนถ้าตีแล้ว server เงียบครบ N ครั้ง
      const apm = parseInt(root.querySelector('#__assist_pendmax')?.value, 10);
      if (!isNaN(apm) && apm >= 1 && apm <= 10) { CFG.attackPendingMax = apm; log('⚔️ abandon ถ้า pending ≥', apm); saveConfigDebounced(); }
      // ★ attackAbandonMs — รอเงียบขั้นต่ำก่อน abandon (นับจากตีครั้งแรก)
      const aab = parseInt(root.querySelector('#__assist_abandonms')?.value, 10);
      if (!isNaN(aab) && aab >= 1000 && aab <= 30000) { CFG.attackAbandonMs = aab; log('⚔️ abandon ถ้าเงียบเกิน', aab + 'ms'); saveConfigDebounced(); }
      // ★ postCombatDelayMs — รอหลังสู้เสร็จ/เก็บของเสร็จ ก่อนหาเป้าใหม่
      const pcd = parseInt(root.querySelector('#__assist_postcombatdelay')?.value, 10);
      if (!isNaN(pcd) && pcd >= 0 && pcd <= 10000) { CFG.postCombatDelayMs = pcd; log('⚔️ รอ', pcd + 'ms หลังสู้เสร็จ/เก็บของเสร็จ'); saveConfigDebounced(); }
    });
    // ★ populate inputs ครั้งเดียว
    const _maq = root.querySelector('#__assist_maxacq'); if (_maq) _maq.value = CFG.maxAcquireDistance;
    const _mch = root.querySelector('#__assist_maxchase'); if (_mch) _mch.value = CFG.maxChaseDistance;
    const _apm = root.querySelector('#__assist_pendmax'); if (_apm) _apm.value = CFG.attackPendingMax;
    const _aab = root.querySelector('#__assist_abandonms'); if (_aab) _aab.value = CFG.attackAbandonMs;
    const _pcd = root.querySelector('#__assist_postcombatdelay'); if (_pcd) _pcd.value = CFG.postCombatDelayMs;
    const _es = root.querySelector('#__assist_engagesec'); if (_es) _es.value = CFG.maxEngageSec;
    const _esl = root.querySelector('#__assist_engageslow'); if (_esl) _esl.value = CFG.maxEngageSecSlow;
    // ★ populate noMonsterWarpSec ครั้งเดียว
    const _nws = root.querySelector('#__assist_nowarpsec');
    if (_nws) _nws.value = CFG.noMonsterWarpSec;
    root.querySelector('#__assist_t_warptoboss').addEventListener('click', () => { CFG.warpToBoss = !CFG.warpToBoss; saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss:', CFG.warpToBoss ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_t_warptominiboss').addEventListener('click', () => { CFG.warpToMiniBoss = !CFG.warpToMiniBoss; saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss:', CFG.warpToMiniBoss ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_t_fleeplayers').addEventListener('click', () => { CFG.fleeFromPlayers = !CFG.fleeFromPlayers; saveConfigDebounced(); log('🏃 หนีผู้เล่น:', CFG.fleeFromPlayers ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_t_fleemode_change').addEventListener('click', () => { CFG.fleeMode = 'changeMap'; saveConfigDebounced(); log('🗺️ หนีผู้เล่น: เปลี่ยนแมป'); });
    root.querySelector('#__assist_t_fleemode_same').addEventListener('click', () => { CFG.fleeMode = 'sameMap'; saveConfigDebounced(); log('📍 หนีผู้เล่น: วาร์ปสุ่มในแมปเดิม'); });
    root.querySelector('#__assist_t_stepaside').addEventListener('click', () => { CFG.stepAsideOnAbandon = CFG.stepAsideOnAbandon === false ? true : false; saveConfigDebounced(); log('🚶 เดินหลีกหลัง abandon:', CFG.stepAsideOnAbandon ? 'เปิด' : 'ปิด'); });
    // ---- auto-login / auto-refresh wires ----
    const _alBtn = root.querySelector('#__assist_autologinbtn');
    if (_alBtn) {
      _alBtn.className = CFG.autoLoginEnabled ? 'on' : 'off';
      _alBtn.textContent = 'Auto-Login: ' + (CFG.autoLoginEnabled ? 'เปิด' : 'ปิด');
      _alBtn.addEventListener('click', () => {
        CFG.autoLoginEnabled = !CFG.autoLoginEnabled; saveConfigDebounced();
        _alBtn.className = CFG.autoLoginEnabled ? 'on' : 'off';
        _alBtn.textContent = 'Auto-Login: ' + (CFG.autoLoginEnabled ? 'เปิด' : 'ปิด');
        log('🤖 Auto-Login:', CFG.autoLoginEnabled ? 'เปิด (จะทำงานตอน WS ต่อใหม่รอบหน้า)' : 'ปิด');
      });
    }
    const _arBtn = root.querySelector('#__assist_autorefreshbtn');
    if (_arBtn) {
      _arBtn.className = CFG.autoRefreshEnabled ? 'on' : 'off';
      _arBtn.textContent = 'Auto-Refresh: ' + (CFG.autoRefreshEnabled ? 'เปิด' : 'ปิด');
      _arBtn.addEventListener('click', () => {
        CFG.autoRefreshEnabled = !CFG.autoRefreshEnabled; saveConfigDebounced();
        _arBtn.className = CFG.autoRefreshEnabled ? 'on' : 'off';
        _arBtn.textContent = 'Auto-Refresh: ' + (CFG.autoRefreshEnabled ? 'เปิด' : 'ปิด');
        log('🔄 Auto-Refresh:', CFG.autoRefreshEnabled ? 'เปิด (ค้างเกิน ' + CFG.autoRefreshStallSec + 's → refresh)' : 'ปิด');
      });
    }
    const _alu = root.querySelector('#__assist_aluser'), _alp = root.querySelector('#__assist_alpass'), _als = root.querySelector('#__assist_alslot');
    if (_alu) _alu.value = CFG.autoLoginUser || '';
    if (_alp) _alp.value = CFG.autoLoginPass || '';
    if (_als) _als.value = CFG.autoLoginSlot || 0;
    const _ars = root.querySelector('#__assist_arstall');
    if (_ars) _ars.value = CFG.autoRefreshStallSec || 180;
    root.querySelector('#__assist_applyauto')?.addEventListener('click', () => {
      const s = _als ? parseInt(_als.value, 10) : 0;
      if (!isNaN(s) && s >= 0) CFG.autoLoginSlot = s;
      saveConfigDebounced();
      log('🤖 บันทึก auto-login: slot=' + CFG.autoLoginSlot + ' (โหมดใช้รหัสที่เกมจำไว้ — ช่อง user/pass ยังใช้ไม่ได้ รอแก้ไข)');
    });
    root.querySelector('#__assist_applyrefresh')?.addEventListener('click', () => {
      const sec = _ars ? parseInt(_ars.value, 10) : NaN;
      if (!isNaN(sec) && sec >= 60) { CFG.autoRefreshStallSec = Math.min(1800, sec); saveConfigDebounced(); }
      log('🔄 บันทึก auto-refresh: ค้างเกิน ' + CFG.autoRefreshStallSec + 's → refresh');
    });
    // ★ ห้ามเรียก syncToggle ที่นี่ — มันประกาศอยู่อีก scope (refresh) → ReferenceError!
    //   จับปุ่มเป็น element ตรง ๆ แล้ว set className เอง
    const _fblBtn = root.querySelector('#__assist_t_fightbackbl');
    if (_fblBtn) _fblBtn.addEventListener('click', () => {
      CFG.fightBackBlacklisted = !CFG.fightBackBlacklisted;
      saveConfigDebounced();
      _fblBtn.className = CFG.fightBackBlacklisted ? 'on' : 'off';
      log('🛡️ ตีกลับมอน blacklist ที่ตีเรา:', CFG.fightBackBlacklisted ? 'เปิด (ตีกลับ)' : 'ปิด (เคารพ blacklist เด็ดขาด)');
    });
    const _blFleeBtn = root.querySelector('#__assist_t_blacklistflee');
    const refreshBlacklistFleeBtn = () => {
      if (!_blFleeBtn) return;
      _blFleeBtn.className = CFG.blacklistFleeEnabled === true ? 'on' : 'off';
      _blFleeBtn.textContent = '🌀 หนี Blacklist: ' + (CFG.blacklistFleeEnabled === true ? 'ON' : 'OFF');
    };
    refreshBlacklistFleeBtn();
    _blFleeBtn?.addEventListener('click', () => { ASSIST.toggleBlacklistFlee(CFG.blacklistFleeEnabled !== true); refreshBlacklistFleeBtn(); });
    // ---- Fixed Teleport Hotkey Macro ----
    const _tpMacroBtn = root.querySelector('#__assist_t_tpmacro');
    const refreshTeleportMacroBtns = () => {
      if (_tpMacroBtn) { _tpMacroBtn.className = CFG.teleportMacroEnabled === true ? 'on' : 'off'; _tpMacroBtn.textContent = '⌨️ Macro: ' + (CFG.teleportMacroEnabled === true ? 'ON' : 'OFF'); }
    };
    refreshTeleportMacroBtns();
    _tpMacroBtn?.addEventListener('click', () => { ASSIST.toggleTeleportMacro(CFG.teleportMacroEnabled !== true); refreshTeleportMacroBtns(); });
    // ★ populate flee inputs ครั้งเดียวตอนเริ่ม (ไม่ sync ตลอด — กันเด้ง)
    const _fm = root.querySelector('#__assist_fleemaps');
    const _fr = root.querySelector('#__assist_fleeradius');
    if (_fm) _fm.value = (CFG.fleeMaps || []).join(',');
    if (_fr) _fr.value = CFG.fleePlayerRadius;
    const _fcd = root.querySelector('#__assist_fleecd');
    if (_fcd) _fcd.value = CFG.fleeWarpCooldownSec;
    root.querySelector('#__assist_applyfleemap').addEventListener('click', () => {
      const maps = root.querySelector('#__assist_fleemaps').value.split(',').map(s => s.trim()).filter(Boolean);
      const radius = parseInt(root.querySelector('#__assist_fleeradius').value, 10);
      const cdSec = parseInt(root.querySelector('#__assist_fleecd').value, 10);
      CFG.fleeMaps = maps;
      if (!isNaN(radius) && radius >= 0) CFG.fleePlayerRadius = radius;
      if (!isNaN(cdSec) && cdSec >= 0) CFG.fleeWarpCooldownSec = Math.min(30, cdSec);
      saveConfigDebounced();
      log('🏃 หนีผู้เล่น: แผนที่สำรอง', maps.length, 'แผนที่, รัศมี', CFG.fleePlayerRadius, 'ช่อง' + (radius === 0 ? ' (หนีทันที)' : '') + ', คูลดาวน์', CFG.fleeWarpCooldownSec + 's' + (CFG.fleeWarpCooldownSec === 0 ? ' (รัวสุด)' : ''));
    });
    // ---- Combat Flee wires (UI อยู่ใน Combat; logic หนียังทำงานได้แม้ Combat OFF) ----
    const _hpFleePct = root.querySelector('#__assist_hpfleepct');
    if (_hpFleePct) _hpFleePct.value = CFG.hpFleePercent;
    const _hpFleeBtn = root.querySelector('#__assist_t_hpflee');
    const _hpFleeSame = root.querySelector('#__assist_t_hpflee_same');
    const _hpFleeUnstuck = root.querySelector('#__assist_t_hpflee_unstuck');
    const refreshHpFleeBtns = () => {
      if (_hpFleeBtn) { _hpFleeBtn.className = CFG.hpFleeEnabled ? 'on' : 'off'; _hpFleeBtn.textContent = '❤️ HP ต่ำหนี: ' + (CFG.hpFleeEnabled ? 'ON' : 'OFF'); }
      if (_hpFleeSame) _hpFleeSame.className = CFG.hpFleeMode !== 'unstuck' ? 'on' : 'off';
      if (_hpFleeUnstuck) _hpFleeUnstuck.className = CFG.hpFleeMode === 'unstuck' ? 'on' : 'off';
    };
    refreshHpFleeBtns();
    _hpFleeBtn?.addEventListener('click', () => { ASSIST.toggleHpFlee(!CFG.hpFleeEnabled); refreshHpFleeBtns(); });
    _hpFleeSame?.addEventListener('click', () => { ASSIST.setHpFleeMode('sameMap'); refreshHpFleeBtns(); });
    _hpFleeUnstuck?.addEventListener('click', () => { ASSIST.setHpFleeMode('unstuck'); refreshHpFleeBtns(); });
    root.querySelector('#__assist_applyhpflee')?.addEventListener('click', () => {
      const p = parseInt(root.querySelector('#__assist_hpfleepct')?.value, 10);
      if (!isNaN(p)) ASSIST.setHpFleePercent(p);
      refreshHpFleeBtns();
    });
    const _mobFleeBtn = root.querySelector('#__assist_t_mobflee');
    const refreshMobFleeBtn = () => {
      if (!_mobFleeBtn) return;
      _mobFleeBtn.className = CFG.mobFleeEnabled !== false ? 'on' : 'off';
      _mobFleeBtn.textContent = '🏃 หนีมอนรุม: ' + (CFG.mobFleeEnabled !== false ? 'ON' : 'OFF');
    };
    refreshMobFleeBtn();
    _mobFleeBtn?.addEventListener('click', () => { ASSIST.toggleMobFlee(CFG.mobFleeEnabled === false); refreshMobFleeBtn(); });
    root.querySelector('#__assist_applymobflee')?.addEventListener('click', () => {
      const fm = parseInt(root.querySelector('#__assist_fleemob')?.value, 10);
      const fa = parseInt(root.querySelector('#__assist_fleeaggro')?.value, 10);
      const fp = parseInt(root.querySelector('#__assist_fleeprox')?.value, 10);
      if (!isNaN(fm)) ASSIST.setFleeMob(fm);
      if (!isNaN(fa)) ASSIST.setFleeAggro(fa);
      if (!isNaN(fp)) ASSIST.setFleeProximity(fp);
      const fpr = parseInt(root.querySelector('#__assist_fleerprox')?.value, 10);
      if (!isNaN(fpr) && fpr >= 1 && fpr <= 50) { CFG.fleeOnProximityRadius = fpr; saveConfigDebounced(); log('🏃 รัศมีนับมอน flee =', fpr, 'ช่อง'); }
    });
    const _dangerFleeBtn = root.querySelector('#__assist_t_dangerflee');
    const refreshDangerFleeBtn = () => {
      if (!_dangerFleeBtn) return;
      _dangerFleeBtn.className = CFG.dangerFleeEnabled !== false ? 'on' : 'off';
      _dangerFleeBtn.textContent = '🚨 หนีมอนอันตราย: ' + (CFG.dangerFleeEnabled !== false ? 'ON' : 'OFF');
    };
    refreshDangerFleeBtn();
    _dangerFleeBtn?.addEventListener('click', () => { ASSIST.toggleDangerFlee(CFG.dangerFleeEnabled === false); refreshDangerFleeBtn(); });
    root.querySelector('#__assist_applyflee')?.addEventListener('click', () => {
      const fmList = root.querySelector('#__assist_fleemonsters')?.value.trim() || '';
      CFG.fleeMonsters = fmList === '' ? [] : fmList.split(',').map(s => s.trim()).filter(Boolean);
      const fmr = parseInt(root.querySelector('#__assist_fleemonsterradius')?.value, 10);
      if (!isNaN(fmr)) CFG.fleeMonsterRadius = fmr;
      saveConfigDebounced();
      log('🚨 มอนอันตราย:', CFG.fleeMonsters.length ? CFG.fleeMonsters.join(',') : 'ไม่มี', 'ระยะ', CFG.fleeMonsterRadius);
    });
    // ---- rest wires ----
    root.querySelector('#__assist_restbtn').addEventListener('click', () => CFG.restEnabled ? ASSIST.restOff() : ASSIST.restOn());
    root.querySelector('#__assist_respawnbtn').addEventListener('click', () => { CFG.autoRespawnEnabled = !CFG.autoRespawnEnabled; saveConfigDebounced(); log('💀 Auto-Respawn:', CFG.autoRespawnEnabled ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_applyrest').addEventListener('click', () => {
      const hp = parseInt(root.querySelector('#__assist_resthp').value, 10);
      const rsp = parseInt(root.querySelector('#__assist_restsp').value, 10);
      const until = parseInt(root.querySelector('#__assist_restuntil').value, 10);
      const sec = parseInt(root.querySelector('#__assist_restmaxsec').value, 10);
      const delay = parseInt(root.querySelector('#__assist_restdelay').value, 10);
      if (!isNaN(hp)) ASSIST.setRestHp(hp);
      if (!isNaN(rsp) && rsp >= 0) { CFG.restSpPercent = Math.min(rsp, 99); log('🪑 SP% นั่งพัก =', CFG.restSpPercent === 0 ? 'ปิด (ไม่สน SP)' : CFG.restSpPercent + '%'); }
      if (!isNaN(until)) ASSIST.setRestUntil(until);
      if (!isNaN(sec)) ASSIST.setRestMaxSec(sec);
      if (!isNaN(delay) && delay >= 0) ASSIST.setRestDelay(delay);
      saveConfigDebounced();
    });
    // ★ populate rest inputs ครั้งเดียวตอนเริ่ม (เดิมไม่เคย fill — ช่องว่างตลอด)
    const _rhp = root.querySelector('#__assist_resthp'), _run2 = root.querySelector('#__assist_restuntil');
    const _rms = root.querySelector('#__assist_restmaxsec'), _rdl = root.querySelector('#__assist_restdelay');
    const _rsp = root.querySelector('#__assist_restsp');
    if (_rhp) _rhp.value = CFG.restHpPercent;
    if (_rsp) _rsp.value = CFG.restSpPercent != null ? CFG.restSpPercent : 0;
    if (_run2) _run2.value = CFG.restUntilPercent;
    if (_rms) _rms.value = CFG.restMaxSec;
    if (_rdl) _rdl.value = CFG.restDelayMs;
    // ---- sell wires ----
    root.querySelector('#__assist_sellbtn').addEventListener('click', () => CFG.sellEnabled ? ASSIST.sellOff() : ASSIST.sellOn());
    root.querySelector('#__assist_sellnow').addEventListener('click', () => ASSIST.sellNow());
    root.querySelector('#__assist_applysell').addEventListener('click', () => {
      const npcName = root.querySelector('#__assist_sellnpc').value.trim();
      const npcMap = root.querySelector('#__assist_sellmap').value.trim();
      const interval = parseInt(root.querySelector('#__assist_sellinterval').value, 10);
      const sx = parseInt(root.querySelector('#__assist_sellx').value, 10);
      const sy = parseInt(root.querySelector('#__assist_selly').value, 10);
      if (npcName) ASSIST.setSellNpc(npcName, npcMap);
      if (!isNaN(sx) && !isNaN(sy)) ASSIST.setSellNpcPos(sx, sy);
      if (!isNaN(interval)) ASSIST.setSellInterval(interval);
    });
    root.querySelector('#__assist_useselfpos').addEventListener('click', () => {
      if (!ASSIST.useCurrentPosAsSellWarp()) return;
      const mapEl = root.querySelector('#__assist_sellmap');
      const xEl = root.querySelector('#__assist_sellx');
      const yEl = root.querySelector('#__assist_selly');
      if (mapEl) mapEl.value = CFG.sellNpcMap || '';
      if (xEl) xEl.value = CFG.sellNpcX;
      if (yEl) yEl.value = CFG.sellNpcY;
    });
    root.querySelector('#__assist_t_sellfull').addEventListener('click', () => { CFG.sellOnFull = !CFG.sellOnFull; ASSIST.toggleSellOnFull(CFG.sellOnFull); });
    // ---- storage wires ----
    root.querySelector('#__assist_storagebtn').addEventListener('click', () => CFG.storageEnabled ? ASSIST.storageOff() : ASSIST.storageOn());
    root.querySelector('#__assist_depositnow').addEventListener('click', () => ASSIST.depositNow());
    root.querySelector('#__assist_applykafra').addEventListener('click', () => {
      const kn = root.querySelector('#__assist_kafra').value.trim();
      const km = root.querySelector('#__assist_kaframap').value.trim();
      const kx = parseInt(root.querySelector('#__assist_kafrax').value, 10);
      const ky = parseInt(root.querySelector('#__assist_kafray').value, 10);
      const kc = parseInt(root.querySelector('#__assist_kafrachoice').value, 10);
      if (kn) ASSIST.setKafra(kn, km);
      if (!isNaN(kx) && !isNaN(ky)) ASSIST.setKafraPos(kx, ky);
      if (!isNaN(kc)) CFG.kafraChoice = kc;
    });
    root.querySelector('#__assist_usekafrapos').addEventListener('click', () => {
      if (!ASSIST.useCurrentPosAsKafra()) return;
      const mapEl = root.querySelector('#__assist_kaframap');
      const xEl = root.querySelector('#__assist_kafrax');
      const yEl = root.querySelector('#__assist_kafray');
      if (mapEl) mapEl.value = CFG.kafraMap || '';
      if (xEl) xEl.value = CFG.kafraMapX;
      if (yEl) yEl.value = CFG.kafraMapY;
    });
    root.querySelector('#__assist_t_depfull').addEventListener('click', () => { CFG.depositOnFull = !CFG.depositOnFull; ASSIST.toggleDepositOnFull(CFG.depositOnFull); });
    root.querySelector('#__assist_t_depaftersell').addEventListener('click', () => { CFG.depositAfterSell = !CFG.depositAfterSell; ASSIST.toggleDepositAfterSell(CFG.depositAfterSell); });
    updateKafraCancelCaptureUI();
    // ---- auto trade wires (v4.188.7 verified protocol) ----
    root.querySelector('#__assist_trade_accept_all').addEventListener('click', () => {
      CFG.tradeAcceptAll = !CFG.tradeAcceptAll;
      if (CFG.tradeAcceptAll) CFG.tradeRejectAll = false;
      saveConfigDebounced();
      log('🤝 Accept-All Trade:', CFG.tradeAcceptAll ? 'ON' : 'OFF');
    });
    root.querySelector('#__assist_trade_reject_all').addEventListener('click', () => {
      CFG.tradeRejectAll = !CFG.tradeRejectAll;
      if (CFG.tradeRejectAll) CFG.tradeAcceptAll = false;
      saveConfigDebounced();
      log('🚫 Eject-All Trade:', CFG.tradeRejectAll ? 'ON' : 'OFF');
    });
    // ---- nav wires ----
    root.querySelector('#__assist_navrecbtn').addEventListener('click', () => CFG.navRecording ? ASSIST.navRecordOff() : ASSIST.navRecordOn());
    root.querySelector('#__assist_navwanderbtn').addEventListener('click', () => { CFG.navWanderUseNav = !CFG.navWanderUseNav; ASSIST.navToggleWander(CFG.navWanderUseNav); });
    root.querySelector('#__assist_gatwanderbtn').addEventListener('click', () => { CFG.gatWanderEnabled = !(CFG.gatWanderEnabled !== false); saveConfigDebounced(); log('🗺️ GAT wander:', CFG.gatWanderEnabled !== false ? 'เปิด (เดินหามอนตามตาราง .gat)' : 'ปิด'); });
    root.querySelector('#__assist_navmode').addEventListener('change', e => { CFG.navWanderMode = e.target.value; navPatrolReset(); log('🗺️ nav mode =', CFG.navWanderMode); });
    root.querySelector('#__assist_applynav').addEventListener('click', () => {
      const r = parseInt(root.querySelector('#__assist_navradius').value, 10);
      if (!isNaN(r)) ASSIST.navSetMergeRadius(r);
    });
    root.querySelector('#__assist_navexport').addEventListener('click', () => ASSIST.navExport());
    root.querySelector('#__assist_navimport').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => ASSIST.navImport(reader.result);
        reader.readAsText(file);
      };
      inp.click();
    });
    root.querySelector('#__assist_navclear').addEventListener('click', () => {
      if (confirm('ล้างข้อมูล nav ทั้งหมด? (ทุกแมป)')) ASSIST.navClearAll();
    });
    // ---- farm map wires ----
    root.querySelector('#__assist_warptofarm').addEventListener('click', () => ASSIST.warpToFarm());
    root.querySelector('#__assist_t_warpback').addEventListener('click', () => { CFG.warpBackToFarm = !CFG.warpBackToFarm; ASSIST.toggleWarpBack(CFG.warpBackToFarm); });
    root.querySelector('#__assist_usefarmpos').addEventListener('click', () => { ASSIST.useCurrentPosAsFarm(); });
    root.querySelector('#__assist_applyfarm').addEventListener('click', () => {
      const fm = root.querySelector('#__assist_farmmap').value.trim();
      const fx = parseInt(root.querySelector('#__assist_farmx').value, 10);
      const fy = parseInt(root.querySelector('#__assist_farmy').value, 10);
      ASSIST.setFarmMap(fm, !isNaN(fx) ? fx : -999, !isNaN(fy) ? fy : -999);
    });
    // ★★ รายการแมปฟาร์มหมุนวนเมื่อตาย — เพิ่ม/ลบ + ลิสต์
    const renderFarmMapList = () => {
      const listEl = root.querySelector('#__assist_rmaplist');
      if (!listEl) return;
      const escM = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const arr = Array.isArray(CFG.farmMaps) ? CFG.farmMaps : [];
      if (arr.length === 0) { listEl.innerHTML = '<div style="color:#666">(ยังไม่มีแมปในรายการ)</div>'; return; }
      listEl.innerHTML = arr.map((e, i) => {
        const cur = (i === (CFG.farmMapIdx || 0) && CFG.farmMap === e.map);
        return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid #1a1a2a;${cur ? 'background:rgba(76,175,80,.1);border-radius:3px;padding:2px 4px' : ''}">
          <span style="color:${cur ? '#4caf50' : '#888'};width:14px">${cur ? '▶' : (i + 1) + '.'}</span>
          <span style="flex:1;color:#ccc">${escM(e.map)} <span style="color:#666">(${e.x != null && e.x !== -999 ? e.x + ',' + e.y : 'สุ่ม'})</span></span>
          <button data-rmapuse="${i}" style="background:#333;color:#8ab4f8;border:1px solid #444;border-radius:3px;padding:1px 6px;font-size:9px;cursor:pointer;font-family:inherit">ใช้เลย</button>
          <button data-rmapdel="${i}" style="background:#4a2222;color:#ff8a80;border:1px solid #6a3232;border-radius:3px;padding:1px 6px;font-size:9px;cursor:pointer;font-family:inherit">ลบ</button>
        </div>`;
      }).join('');
      listEl.querySelectorAll('button[data-rmapdel]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-rmapdel'), 10);
          CFG.farmMaps.splice(i, 1);
          if ((CFG.farmMapIdx || 0) >= CFG.farmMaps.length) CFG.farmMapIdx = 0;
          saveConfigDebounced();
          log('🗑️ ลบแมปออกจากรายการหมุนวน — เหลือ', CFG.farmMaps.length, 'แมป');
          renderFarmMapList();
        };
      });
      listEl.querySelectorAll('button[data-rmapuse]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-rmapuse'), 10);
          const e = CFG.farmMaps[i];
          if (!e) return;
          CFG.farmMapIdx = i;
          ASSIST.setFarmMap(e.map, (e.x != null && e.x !== '') ? e.x : -999, (e.y != null && e.y !== '') ? e.y : -999);
          renderFarmMapList();
        };
      });
    };
    root.querySelector('#__assist_addrmap').addEventListener('click', () => {
      const rm = root.querySelector('#__assist_rmap').value.trim();
      if (!rm) { log('⚠️ กรอกชื่อแมปก่อนเพิ่ม'); return; }
      const rx = parseInt(root.querySelector('#__assist_rmapx').value, 10);
      const ry = parseInt(root.querySelector('#__assist_rmapy').value, 10);
      if (!Array.isArray(CFG.farmMaps)) CFG.farmMaps = [];
      CFG.farmMaps.push({ map: rm, x: isNaN(rx) ? -999 : rx, y: isNaN(ry) ? -999 : ry });
      saveConfigDebounced();
      log('➕ เพิ่มแมปหมุนวน:', rm, '@(', (isNaN(rx) ? -999 : rx) + ',' + (isNaN(ry) ? -999 : ry) + ') — รวม', CFG.farmMaps.length, 'แมป');
      root.querySelector('#__assist_rmap').value = '';
      renderFarmMapList();
    });
    renderFarmMapList();
    const tBtn = (sel, fn, cfgKey) => root.querySelector(sel).addEventListener('click', () => { CFG[cfgKey] = !CFG[cfgKey]; fn(CFG[cfgKey]); });
    tBtn('#__assist_t_antiks', (v) => ASSIST.toggleAntiKS(v), 'antiKS');
    tBtn('#__assist_t_avoidp', (v) => ASSIST.toggleAvoidPlayers(v), 'avoidOtherPlayers');
    tBtn('#__assist_t_lowhp', (v) => ASSIST.toggleLowestHpFirst(v), 'targetLowestHpFirst');
    tBtn('#__assist_t_normalatk', (v) => ASSIST.toggleNormalAttack(v), 'normalAttackEnabled');
    tBtn('#__assist_t_wander', (v) => ASSIST.toggleWander(v), 'wanderEnabled');
    tBtn('#__assist_t_warpfind', (v) => ASSIST.toggleWarpFind(v), 'warpFindEnabled');
    tBtn('#__assist_t_warpfindwing', (v) => ASSIST.toggleWarpFindFlyWing(v), 'warpFindUseFlyWing');
    tBtn('#__assist_t_warpfindskill', (v) => ASSIST.toggleWarpFindTeleportSkill(v), 'warpFindUseTeleportSkill');
    root.querySelector('#__assist_testwarpfind').addEventListener('click', () => ASSIST.testWarpFind());
    tBtn('#__assist_t_guard', (v) => ASSIST.toggleGuard(v), 'guardEnabled');
    tBtn('#__assist_t_farmondeath', (v) => { saveConfigDebounced(); log('☠️ ตายเปลี่ยนแมปฟาร์ม:', v ? 'เปิด (' + (Array.isArray(CFG.farmMaps) ? CFG.farmMaps.length : 0) + ' แมปในรายการ)' : 'ปิด'); }, 'farmRotateOnDeath');
    // ★ Guard — ใช้พิกัดตัวละครปัจจุบันเป็นจุดยืน
    root.querySelector('#__assist_useguardpos').addEventListener('click', () => {
      if (player.x == null) { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); return; }
      root.querySelector('#__assist_guardx').value = Math.round(player.x);
      root.querySelector('#__assist_guardy').value = Math.round(player.y);
      if (currentMap) root.querySelector('#__assist_guardmap').value = currentMap;
      log('🛡️ จดจุดยืน guard: ', currentMap + ' @(' + Math.round(player.x) + ',' + Math.round(player.y) + ') — กด "ใช้ค่า guard" เพื่อบันทึก');
    });
    root.querySelector('#__assist_applyguard').addEventListener('click', () => {
      const gm = root.querySelector('#__assist_guardmap').value.trim();
      const gx = parseInt(root.querySelector('#__assist_guardx').value, 10);
      const gy = parseInt(root.querySelector('#__assist_guardy').value, 10);
      CFG.guardMap = gm;
      if (!isNaN(gx)) CFG.guardX = gx;
      if (!isNaN(gy)) CFG.guardY = gy;
      guardWasReturning = false;
      saveConfigDebounced();
      log('🛡️ Guard จุดยืน =', gm || '(แมปปัจจุบัน)', '@(', CFG.guardX + ',' + CFG.guardY + ')');
    });
    // ★ populate guard inputs ครั้งเดียว
    const _gm = root.querySelector('#__assist_guardmap'); if (_gm) _gm.value = CFG.guardMap || '';
    const _gx = root.querySelector('#__assist_guardx'); if (_gx) _gx.value = CFG.guardX != null && CFG.guardX > -999 ? CFG.guardX : '';
    const _gy = root.querySelector('#__assist_guardy'); if (_gy) _gy.value = CFG.guardY != null && CFG.guardY > -999 ? CFG.guardY : '';
    tBtn('#__assist_t_warptomon', (v) => ASSIST.toggleWarpToMonster(v), 'warpToMonster');

    root.querySelector('#__assist_resetstats').addEventListener('click', () => ASSIST.resetStats());
    root.querySelector('#__assist_sellnow2').addEventListener('click', () => ASSIST.sellNow());
    root.querySelector('#__assist_clearinv').addEventListener('click', () => {
      inventory.clear(); equipmentSlots.clear(); equipmentList.length = 0; sessionPickups.clear(); invDataVer++;
      log('🎒 ล้างรายการของที่เก็บได้แล้ว');
    });
    // ★ Profile — สร้าง/สลับ/ลบ ชุดการตั้งค่า
    const _profSel = root.querySelector('#__assist_profile_sel');
    const _profName = root.querySelector('#__assist_profile_name');
    function refreshProfileSel() {
      if (!_profSel) return;
      const cur = ASSIST.activeProfile();
      _profSel.innerHTML = ASSIST.listProfiles().map(n =>
        '<option value="' + n.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' + (n === cur ? ' selected' : '') + '>' + (n === cur ? '● ' : '') + n.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>').join('');
    }
    refreshProfileSel();
    root.querySelector('#__assist_profile_save').addEventListener('click', () => {
      const n = ((_profName && _profName.value) || (_profSel && _profSel.value) || '').trim();
      if (ASSIST.saveProfileAs(n)) { if (_profName) _profName.value = ''; refreshProfileSel(); }
    });
    root.querySelector('#__assist_profile_use').addEventListener('click', () => {
      if (ASSIST.switchProfile(_profSel.value)) refreshProfileSel();
    });
    root.querySelector('#__assist_profile_del').addEventListener('click', () => {
      if (ASSIST.deleteProfile(_profSel.value)) refreshProfileSel();
    });
    root.querySelector('#__assist_exportall').addEventListener('click', () => ASSIST.exportAll());
    root.querySelector('#__assist_importall').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => ASSIST.importAll(reader.result);
        reader.readAsText(file);
      };
      inp.click();
    });
    // ★ Reset config กลับเป็น default
    root.querySelector('#__assist_resetconfig').addEventListener('click', () => {
      if (!confirm('รีเซ็ตค่าทั้งหมดกลับเป็น Default?\n\nค่าที่กำหนดเองทั้งหมดจะหายไป\nต้องเข้าเกมใหม่หลักรีเซ็ต')) return;
      try { localStorage.removeItem(CFG_STORAGE_KEY); } catch (_) {}
      log('🔄 รีเซ็ตค่าทั้งหมด — รีเฟรชหน้าเว็บ...');
      setTimeout(() => location.reload(), 1000);
    });
    root.querySelector('#__assist_clearlog').addEventListener('click', () => ASSIST.clearLogs());
    // ★ คัดลอก log — ใช้ navigator.clipboard ถ้าได้ ไม่งั้นใช้ textarea fallback
    root.querySelector('#__assist_copylog').addEventListener('click', (e) => {
      // ★ stopPropagation — กัน Unity ตอบสนองต่อ click นี้
      e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      // ★ คัดลอกตาม toggle ที่เลือกอยู่ใน logbox (กิจกรรม/Debug)
      const _box = root.querySelector('#__assist_logbox');
      const isDbg = _box && _box.dataset.dbg === '1';
      const logs = isDbg ? ASSIST.getDbgLogs() : ASSIST.getLogs();
      if (!logs.length) { log('⚠️ ไม่มี log ให้คัดลอก'); return; }
      const text = logs.map(l => {
        const d = new Date(l.t);
        const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
        return `[${ts}] ${l.msg}`;
      }).join('\n');
      // ★ ใช้ execCommand('copy') แบบ synchronous — ทำทันทีใน click handler
      //   navigator.clipboard.writeText() เป็น async → Unity ขโมย focus ระหว่างรอ → ล้มเงียบ
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;font-size:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      if (ok) log('📋 คัดลอก log แล้ว (' + logs.length + ' บรรทัด) — ไปวางได้เลย');
      else log('❌ คัดลอกไม่สำเร็จ — คลิกที่ logbox + Ctrl+A แล้ว Ctrl+C เอง');
    });
    root.querySelector('#__assist_clearalert')?.addEventListener('click', () => ASSIST.clearImportantLogs());
    root.querySelector('#__assist_chatpausebtn').addEventListener('click', () => ASSIST.toggleChatPauseAlert(!CFG.chatPauseOnIncoming));
    root.querySelector('#__assist_testchatalert').addEventListener('click', () => ASSIST.testChatAlert());
    root.querySelector('#__assist_chatresume').addEventListener('click', () => ASSIST.resumeChatPause());
    const updBtn = root.querySelector('#__assist_updatebtn');
    if (updBtn) updBtn.addEventListener('click', () => {
      if (latestVersion && cmpVer(latestVersion, VERSION) > 0) {
        // ★ v4.189.14: one-click จาก Assist → เปิดหน้า Update ของ Tampermonkey ทันที
        // ไม่ถาม confirm ซ้ำในหน้าเกม (Tampermonkey จะมีหน้าจอยืนยันของ extension เอง)
        ASSIST.update();
        return;
      }
      latestVersion = null;
      versionCheckError = null;
      checkVersion();
    });

    log('🖥️ แสดง panel แล้ว (คลิกที่แถบมุมขวาบนเพื่อเปิด)');
    // ★★ สรุปสถานะ auto-login/refresh ตอนสตาร์ท — ให้เห็นชัดว่า config โหลดครบไหม
    const _alSum = 'Auto-Login: ' + (CFG.autoLoginEnabled ? 'เปิด (โหมด: รหัสที่เกมจำไว้ + Enter + เลือกตัวละครอัตโนมัติ)' : 'ปิด')
      + ' | Auto-Refresh: ' + (CFG.autoRefreshEnabled ? 'เปิด (' + CFG.autoRefreshStallSec + 's)' : 'ปิด');
    log('🤖', _alSum);
    console.log('[ASSIST] 🤖 ' + _alSum);
    // ★★ เกมค้างหน้า splash ("คลิกเริ่มเกม") → ไม่มี WS → คลิกกลางจอให้เอง
    //   (จากทดสอบจริง: ต้องคลิกถึงเริ่มโหลด — ใช้เวลา 21s+ กว่า audio context จะ resume
    //    และ Unity โหลดต่ออีกนาน → ยืดเป็นทุก 8s นานสุด 5 นาที)
    //   หยุดทันทีเมื่อ WS ต่อ (ตอนนั้นถึงจะมีหน้า login ของเกมก็ไม่คลิกแทนแน่นอน)
    if (CFG.autoLoginEnabled) {
      let _splashClicks = 0;
      let _splashStartedAt = Date.now();
      const splashTimer = setInterval(() => {
        const wsOpen = activeWS && activeWS.readyState === 1;
        if (wsOpen || playerId != null || autoLoginPhase === 'failed') {
          clearInterval(splashTimer);
          if (wsOpen) { try { sessionStorage.removeItem('roAssistAlRetry'); } catch (_) {} }   // โหลดสำเร็จ → ลบ retry counter
          return;
        }
        _splashClicks++;
        // ★ ทุก ~30s บอกสถานะ — ให้รู้ว่ายังรอเกมโหลดอยู่ (ไม่ใช่ตายเงียบ)
        if (_splashClicks % 4 === 0) {
          const waited = Math.round((Date.now() - _splashStartedAt) / 1000);
          log('⏳ [auto-login] รอเกมโหลด... ' + waited + 's แล้ว ยังไม่มี WS (คลิกแล้ว ' + _splashClicks + ' ครั้ง)');
        }
        // ★ โหลดพังจริง — ไม่มี WS ใน 3 นาที → refresh แล้วเริ่มใหม่ (สูงสุด 3 รอบ กันวนไม่จบ)
        if (Date.now() - _splashStartedAt > 180000) {
          clearInterval(splashTimer);
          let retry = 0;
          try { retry = parseInt(sessionStorage.getItem('roAssistAlRetry') || '0', 10) || 0; } catch (_) {}
          if (retry >= 3) {
            log('⚠️ [auto-login] เกมไม่ต่อ WS หลัง refresh แล้ว ' + retry + ' รอบ — หยุด (โหลดเองไม่ได้ ลองปิด-เปิดเบราว์เซอร์)');
            return;
          }
          try { sessionStorage.setItem('roAssistAlRetry', String(retry + 1)); } catch (_) {}
          logImportant('flee', '🔄 [auto-login] เกมไม่ต่อ WS ใน 3 นาที → refresh รอบที่ ' + (retry + 1) + '/3');
          setTimeout(() => location.reload(), 1500);
          return;
        }
        try {
          const cv = document.querySelector('canvas') || document.body;
          const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          // ★ Unity WebGL ฟัง pointer events เป็นหลัก — ยิงทั้ง pointer + mouse + click
          const evts = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];
          for (const t of evts) {
            const E = (t.startsWith('pointer')) ? PointerEvent : MouseEvent;
            cv.dispatchEvent(new E(t, { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true }));
          }
          if (_splashClicks <= 5 || _splashClicks % 5 === 0) log('🖱️ [auto-login] ยังไม่มี WS → คลิกกลางจอไล่หน้า splash (ครั้ง', _splashClicks + ')');
        } catch (e) { clearInterval(splashTimer); }
      }, 8000);
      setTimeout(() => clearInterval(splashTimer), 310000);   // หมดเวลาใน ~5 นาที
    }
    // ★★★ KEYBOARD auto-login (พิสูจน์จากการใช้งานจริง): เกมมีระบบจำ user/pass เอง
    //   → แค่ "กด Enter" ที่หน้า login ก็เข้าได้เลย
    //   ⚠️ การ "พิมพ์" user/password เองยังใช้ไม่ได้ (Unity InputField ไม่รับ synthetic
    //   text input) — จะแก้ในเวอร์ชั่นถัดไป ตอนนี้ผู้ใช้ต้องล็อกอินผ่านหน้าเกมเอง
    //   1 ครั้ง (ให้เกมจำรหัสไว้) แล้ว auto-login จะทำงานครบวงจรหลังจากนั้น
    if (CFG.autoLoginEnabled) {
      const kbSleep = (ms) => new Promise(r => setTimeout(r, ms));
      let kbTries = 0;
      const kbTimer = setInterval(async () => {
        const wsOpen = activeWS && activeWS.readyState === 1;
        if (wsOpen || playerId != null || autoLoginPhase === 'failed' || kbTries >= 8) { clearInterval(kbTimer); return; }
        kbTries++;
        try {
          const cv = document.querySelector('canvas') || document.body;
          log('⌨️ [auto-login] กด Enter ที่หน้า login (ใช้รหัสที่เกมจำไว้) ครั้ง', kbTries + '/8');
          cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
          await kbSleep(45);
          cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        } catch (e) {}
        // ถ้าสำเร็จ WS จะเปิดภายใน 2-3s → รอบตรวจถัดไปจะเห็นและหยุดเอง
      }, 20000);
    }
  }

  // ★ MONITOR_HTML — HTML สำหรับ popup window (embed ในสคริปต์ → ไม่ต้องเปิดไฟล์แยก)
  const MONITOR_HTML = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RO Monitor</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#e8e8e8;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.c{max-width:480px;margin:0 auto;padding:12px}.s{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#15171c;border-radius:8px;margin-bottom:10px}.d{width:8px;height:8px;border-radius:50%}.d.on{background:#27ae60;box-shadow:0 0 6px #27ae60}.d.off{background:#e74c3c}.card{background:#15171c;border:1px solid #2a2d35;border-radius:8px;padding:10px;margin-bottom:8px}.card h3{color:#8ab4f8;font-size:11px;text-transform:uppercase;margin-bottom:6px}.g{display:grid;grid-template-columns:1fr 1fr;gap:6px}.st{display:flex;justify-content:space-between;padding:3px 6px;background:#0d1117;border-radius:4px}.st .k{color:#9aa0a6;font-size:11px}.st .v{font-weight:600;font-size:12px}.hb{background:#2a2d35;height:16px;border-radius:8px;overflow:hidden;position:relative;margin-bottom:3px}.hf{height:100%;transition:width .3s;border-radius:8px}.hf.hp{background:linear-gradient(90deg,#e53935,#ef5350)}.hf.sp{background:linear-gradient(90deg,#1976d2,#42a5f5)}.ht{position:absolute;top:0;left:0;right:0;text-align:center;line-height:16px;font-size:10px;color:#fff;font-weight:600;text-shadow:0 0 3px rgba(0,0,0,.8)}.tg{display:flex;flex-wrap:wrap;gap:3px}.tg span{font-size:10px;padding:2px 6px;border-radius:6px;font-weight:600}.on{background:#1b5e20;color:#a5d6a7}.off{background:#4a2020;color:#ef9a9a}.cd{display:flex;justify-content:space-between;padding:2px 6px;font-size:11px;border-radius:3px;background:#0d1117;margin-bottom:2px}.cd.r{color:#27ae60}.cd.w{color:#f39c12}.disc{text-align:center;padding:40px;color:#5f6368}</style></head>
<body><div class="c">
<div class="s"><div class="d off" id="dot"></div><span id="st">รอข้อมูล...</span><span style="margin-left:auto;color:#5f6368;font-size:11px" id="ver"></span></div>
<div id="dash" style="display:none">
<div class="card"><h3>HP / SP</h3><div class="hb"><div class="hf hp" id="hpf" style="width:0"></div><div class="ht" id="hpt">?</div></div><div class="hb"><div class="hf sp" id="spf" style="width:0"></div><div class="ht" id="spt">?</div></div></div>
<div class="card"><h3>ตำแหน่ง</h3><div class="g"><div class="st"><span class="k">พิกัด</span><span class="v" id="pos">?</span></div><div class="st"><span class="k">แมป</span><span class="v" id="map">?</span></div><div class="st"><span class="k">ฟาร์ม</span><span class="v" id="fm">-</span></div><div class="st"><span class="k">สถานะ</span><span class="v" id="state">?</span></div></div></div>
<div class="card"><h3>Combat</h3><div class="g"><div class="st"><span class="k">เป้า</span><span class="v" id="tgt">-</span></div><div class="st"><span class="k">รุม</span><span class="v" id="mob">0</span></div><div class="st"><span class="k">DPS</span><span class="v" id="dps" style="color:#e67e22">0</span></div><div class="st"><span class="k">ASPD</span><span class="v" id="aspd" style="color:#3498db">0</span></div></div></div>
<div class="card"><h3>สถิติ</h3><div class="g"><div class="st"><span class="k">ฆ่า</span><span class="v" id="kills">0</span></div><div class="st"><span class="k">เก็บ</span><span class="v" id="loot">0</span></div><div class="st"><span class="k">EXP/นาที</span><span class="v" id="expmin">0</span></div><div class="st"><span class="k">Zeny/ชม</span><span class="v" id="gr" style="color:#f1c40f">0</span></div><div class="st"><span class="k">เวลา</span><span class="v" id="el">0s</span></div><div class="st"><span class="k">ตาย</span><span class="v" id="dth">0</span></div></div></div>
<div class="card"><h3>ระบบ</h3><div class="tg" id="tg"></div></div>
<div class="card" id="cdcard" style="display:none"><h3>Buff / Skill</h3><div id="cds"></div></div>
</div>
<div id="disc" class="disc"><p style="font-size:36px">🔌</p><p style="margin-top:8px">ยังไม่ได้รับข้อมูล</p></div>
</div>
<script>
function fmt(ms){const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m '+(s%60)+'s';const h=Math.floor(m/60);return h+'h '+(m%60)+'m'}
function N(n){return(n||0).toLocaleString()}
let last=null;
function update(d){last=d;document.getElementById('disc').style.display='none';document.getElementById('dash').style.display='';document.getElementById('dot').className='d on';document.getElementById('st').textContent='🟢 '+new Date(d.t).toLocaleTimeString();document.getElementById('ver').textContent='v'+(d.version||'?');
const hp=d.hpMax>0?(d.hp/d.hpMax*100):0;document.getElementById('hpf').style.width=Math.max(0,Math.min(100,hp))+'%';document.getElementById('hpt').textContent=(d.hp??'?')+' / '+(d.hpMax||'?')+' ('+(hp?hp.toFixed(0):'?')+'%)';
const sp=d.spMax>0?(d.sp/d.spMax*100):0;document.getElementById('spf').style.width=Math.max(0,Math.min(100,sp))+'%';document.getElementById('spt').textContent=(d.sp??'?')+' / '+(d.spMax||'?');
document.getElementById('pos').textContent=d.player?.x!=null?'('+d.player.x.toFixed(0)+','+d.player.y.toFixed(0)+')':'?';document.getElementById('map').textContent=d.map||'?';document.getElementById('fm').textContent=d.farmMap||'-';
let st=d.isDead?'☠️ ตาย':(d.isResting?'🪑 นั่ง':'🟢 ปกติ');if(d.sellState&&d.sellState!=='IDLE')st+=' | 💰'+d.sellState;if(d.storageState&&d.storageState!=='IDLE')st+=' | 🏦'+d.storageState;document.getElementById('state').textContent=st;
const t=d.target;document.getElementById('tgt').textContent=t?t.name+' ('+(t.dist?t.dist.toFixed(1):'?')+')':'-';document.getElementById('mob').textContent=d.mobAttackers||0;
document.getElementById('dps').textContent=d.stats?.dps>0?N(d.stats.dps):'—';document.getElementById('aspd').textContent=d.stats?.aspd>0?d.stats.aspd.toFixed(1):'—';
document.getElementById('kills').textContent=N(d.stats?.kills);document.getElementById('loot').textContent=N(d.stats?.itemsLooted);document.getElementById('expmin').textContent=N(d.stats?.expPerMin);
document.getElementById('gr').textContent=d.stats?.goldRatePerHour>0?N(d.stats.goldRatePerHour)+'z':'—';document.getElementById('el').textContent=fmt(d.stats?.elapsedMs||0);document.getElementById('dth').textContent=d.stats?.deaths||0;
const T=d.toggles||{};const tl=[['loot','📦'],['heal','💉'],['rest','🪑'],['combat','⚔️'],['skill','🔮'],['buff','✨'],['sell','💰'],['storage','🏦']];document.getElementById('tg').innerHTML=tl.map(([k,l])=>'<span class="'+(T[k]?'on':'off')+'">'+l+'</span>').join('');
const cd=[...(d.buffs||[]).map(b=>({n:'✨ '+b.name,r:b.remainingMs})),...(d.skills||[]).map(s=>({n:'🔮 '+s.name,r:s.remainingMs}))];const cc=document.getElementById('cdcard');if(cd.length>0){cc.style.display='';document.getElementById('cds').innerHTML=cd.map(c=>{const rd=c.r<=0;const rs=Math.ceil(c.r/1000);const str=rd?'พร้อม':(rs>=60?Math.floor(rs/60)+'นาที '+(rs%60)+'s':rs+'s');return '<div class="cd '+(rd?'r':'w')+'"><span>'+c.n+'</span><span>'+str+'</span></div>'}).join('')}else cc.style.display='none'}
window.onData=update;
setInterval(()=>{if(last&&Date.now()-last.t>5000){document.getElementById('dot').className='d off';document.getElementById('st').textContent='🔴 ขาดการเชื่อมต่อ';document.getElementById('dash').style.opacity='.4'}else{document.getElementById('dash').style.opacity='1'}},2000);
</script></body></html>`;

  // ★ Monitor — ส่งข้อมูลไป popup window (origin เดียวกับเกม → ไม่มีปัญหา file://)
  let monitorWin = null;   // popup window reference
  let monitorChannel = null;
  try { monitorChannel = new BroadcastChannel('ro-assist-monitor'); } catch (_) {}
  const MONITOR_STORAGE_KEY = 'roAssistMonitorData';
  let lastMonitorSendAt = 0;
  function openMonitor() {
    if (monitorWin && !monitorWin.closed) { monitorWin.focus(); return; }
    monitorWin = window.open('', 'roMonitor', 'width=500,height=700,scrollbars=yes,resizable=yes');
    if (!monitorWin) { log('⚠️ popup ถูกบล็อก — อนุญาต popup สำหรับเว็บนี้'); return; }
    monitorWin.document.write(MONITOR_HTML);
    monitorWin.document.close();
    log('🖥️ เปิด Monitor แล้ว');
  }
  // ★★ Changelog modal — แสดง Update Log ล่าสุดขึ้นก่อน
  // ★★ Log view modal — ดู log 500 บรรทัดล่าสุด (ชิดขวา + เลื่อนได้ + real-time update)
  function openLogViewModal() {
    const old = document.getElementById('__assist_logview_modal');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = '__assist_logview_modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:flex-end;padding-right:10px';
    overlay.innerHTML = `
      <div style="background:#1a1a2e;color:#e8e8e8;border-radius:12px;padding:16px;width:520px;max-width:90vw;height:80vh;display:flex;flex-direction:column;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span id="__assist_logview_title" style="font-size:15px;font-weight:700;color:#82b1ff">📋 Log (0)</span>
          <span>
            <button id="__assist_logview_tab_act" style="background:#2a4a6a;color:#8cf;border:1px solid #4a7ab5;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;margin-right:4px;font-family:inherit">📋 กิจกรรม</button>
            <button id="__assist_logview_tab_dbg" style="background:#333;color:#aaa;border:1px solid #555;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;margin-right:6px;font-family:inherit">🔍 Debug</button>
            <button id="__assist_logview_copy" style="background:#333;color:#aaa;border:1px solid #555;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;margin-right:6px;font-family:inherit">📋 คัดลอกทั้งหมด</button>
            <button id="__assist_logview_close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer">✕</button>
          </span>
        </div>
        <div id="__assist_logview_content" style="flex:1;overflow-y:auto;font-size:10px;line-height:1.5;font-family:Consolas,monospace;padding-right:4px"></div>
      </div>`;
    document.body.appendChild(overlay);
    const content = overlay.querySelector('#__assist_logview_content');
    const titleEl = overlay.querySelector('#__assist_logview_title');
    // ★★ view ปัจจุบัน: 'act' = log กิจกรรม / 'dbg' = debug log (แยก buffer)
    let view = 'act';
    const tabAct = overlay.querySelector('#__assist_logview_tab_act');
    const tabDbg = overlay.querySelector('#__assist_logview_tab_dbg');
    function syncTabStyle() {
      tabAct.style.background = view === 'act' ? '#2a4a6a' : '#333';
      tabAct.style.color = view === 'act' ? '#8cf' : '#aaa';
      tabAct.style.borderColor = view === 'act' ? '#4a7ab5' : '#555';
      tabDbg.style.background = view === 'dbg' ? '#4a2a3a' : '#333';
      tabDbg.style.color = view === 'dbg' ? '#f9c' : '#aaa';
      tabDbg.style.borderColor = view === 'dbg' ? '#a55' : '#555';
    }
    tabAct.onclick = (e) => { e.stopPropagation(); view = 'act'; syncTabStyle(); renderLogs(); };
    tabDbg.onclick = (e) => { e.stopPropagation(); view = 'dbg'; syncTabStyle(); renderLogs(); };

    // ★★ render log lines → reuse for initial + refresh
    function renderLogs() {
      const buf = view === 'dbg' ? dbgBuf : logBuf;
      content.innerHTML = buf.map(l => {
        const d = new Date(l.t);
        const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
        return `<div style="padding:1px 0;border-bottom:1px solid #1a1a2a;word-break:break-word"><span style="color:#555;font-size:9px">[${ts}]</span> <span style="color:${view === 'dbg' ? '#c9b' : '#bbb'}">${(l.msg || '').replace(/</g,'&lt;')}</span></div>`;
      }).join('');
      titleEl.textContent = (view === 'dbg' ? '🔍 Debug Log (' : '📋 Log (') + buf.length + ')';
    }
    syncTabStyle();
    renderLogs();
    content.scrollTop = content.scrollHeight;   // เลื่อนไปล่างสุดครั้งแรก

    // ★★ auto-refresh ทุก 1s — real-time update เหมือน sub-tab Log
    //   เช็ค: ถ้าผู้ใช้เลื่อนขึ้นดู log เก่า → ไม่บังคับเลื่อนลง (auto-scroll เฉพาะเมื่ออยู่ล่างสุด)
    const refreshTimer = setInterval(() => {
      if (!document.body.contains(overlay)) { clearInterval(refreshTimer); return; }   // modal ปิดแล้ว → หยุด
      const wasNearBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 30;
      renderLogs();
      if (wasNearBottom) content.scrollTop = content.scrollHeight;   // อยู่ล่างสุด → เลื่อนตาม
    }, 1000);

    const close = () => { clearInterval(refreshTimer); overlay.remove(); };
    overlay.querySelector('#__assist_logview_close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    overlay.querySelector('#__assist_logview_copy').onclick = (e) => {
      e.stopPropagation();
      // ★ คัดลอกตาม view ที่กำลังดู (กิจกรรม หรือ Debug)
      const buf = view === 'dbg' ? dbgBuf : logBuf;
      const text = buf.map(l => {
        const d = new Date(l.t);
        const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
        return `[${ts}] ${l.msg || ''}`;
      }).join('\n');
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;font-size:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      const btn = overlay.querySelector('#__assist_logview_copy');
      if (ok) { btn.textContent = '✓ คัดลอกแล้ว'; setTimeout(() => btn.textContent = '📋 คัดลอกทั้งหมด', 1500); }
      else btn.textContent = '❌ ไม่สำเร็จ';
    };
    // ★ กัน Unity ขโมย focus
    overlay.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('button')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
    }, true);
  }
  // ★★ INVENTORY POPUP — 3 tab แนวตั้ง (Item/Equip/Etc.) แบบในเกม
  //   grid 10 ช่อง/แถว + icon (บางอันไม่มีรูป → กล่องว่าง) + hover tooltip ชื่อ+desc
  //   Equip เรียงตาม slot ลำดับเกม · Item/Etc เรียงตาม id
  function openInventoryModal() {
    const old = document.getElementById('__assist_inv_modal');
    if (old) { old.remove(); return; }
    const overlay = document.createElement('div');
    overlay.id = '__assist_inv_modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:flex-end;padding-right:10px';
    overlay.innerHTML = `
      <div style="background:#1a1a2e;color:#e8e8e8;border-radius:12px;padding:14px;width:660px;max-width:92vw;max-height:82vh;display:flex;flex-direction:column;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <div id="__assist_inv_hdr" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:move;user-select:none;touch-action:none">
          <span style="font-size:15px;font-weight:700;color:#ffb74d">🎒 Inventory <span id="__assist_inv_count" style="font-size:11px;color:#888"></span></span>
          <span style="display:flex;gap:6px;align-items:center">
            <button id="__assist_inv_sellnow" title="วาร์ปไปขายของกับ NPC ทันที (เหมือนปุ่มใน panel)" style="background:#4a2c14;color:#ffb74d;border:1px solid #7a4a1e;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit">💰 ขายเดี๋ยวนี้</button>
            <button id="__assist_inv_depositnow" title="วาร์ปไปฝากของเข้า Kafra ทันที (เหมือนปุ่มใน panel)" style="background:#14324a;color:#81c784;border:1px solid #1e5a7a;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit">🏦 ฝากเดี๋ยวนี้</button>
            <button id="__assist_inv_close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer">✕</button>
          </span>
        </div>
        <div id="__assist_inv_bulkbar" style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-2px 0 8px 0;font-size:10px;color:#9aa0a6">
          <span style="margin-right:auto">เลือกทั้งหมวด: <b id="__assist_inv_bulkcat" style="color:#ffd54f">Item</b></span>
          <button id="__assist_inv_sellallcat" title="ตั้งไอเทมทั้งหมดที่มีอยู่ในหมวดนี้เป็น ขาย (ยังไม่ขายทันที)" style="background:#4a2c14;color:#ffb74d;border:1px solid #7a4a1e;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:inherit">💰 ขายทั้งหมด</button>
          <button id="__assist_inv_depositallcat" title="ตั้งไอเทมทั้งหมดที่มีอยู่ในหมวดนี้เป็น ฝาก (ยังไม่ฝากทันที)" style="background:#14324a;color:#81c784;border:1px solid #1e5a7a;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:inherit">🏦 ฝากทั้งหมด</button>
        </div>
        <div style="display:flex;gap:8px;flex:1;min-height:0">
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="invtab on" data-tab="usable" style="writing-mode:vertical-rl;text-orientation:mixed;padding:10px 6px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#4a3a1a;color:#ffd54f;min-height:110px">Item</button>
            <button class="invtab" data-tab="equip" style="writing-mode:vertical-rl;text-orientation:mixed;padding:10px 6px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#333;color:#aaa;min-height:110px">Equip</button>
            <button class="invtab" data-tab="etc" style="writing-mode:vertical-rl;text-orientation:mixed;padding:10px 6px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#333;color:#aaa;min-height:110px">Etc.</button>
          </div>
          <div id="__assist_inv_grid" style="flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(10,1fr);gap:4px;align-content:start;padding-right:4px"></div>
        </div>
        <div id="__assist_inv_hint" style="font-size:9px;color:#666;margin-top:6px">★ Equip: ของในถุง (ไม่รวมที่สวมอยู่) · ชื่อ +refine/การ์ด · ฝาก/ขาย/เก็บ/สวม-ถอด อัปเดตสด · คลิก: เก็บ→ขาย→ฝาก · hover ดูรายละเอียด</div>
      </div>`;
    document.body.appendChild(overlay);
    const grid = overlay.querySelector('#__assist_inv_grid');
    const cntEl = overlay.querySelector('#__assist_inv_count');
    const bulkCatEl = overlay.querySelector('#__assist_inv_bulkcat');

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    let invCurTab = 'usable';
    function render(tab) {
      invCurTab = tab;
      if (bulkCatEl) bulkCatEl.textContent = tab === 'usable' ? 'Item' : (tab === 'equip' ? 'Equip' : 'Etc.');
      // ★★ Equip: แสดง "เฉพาะของในถุง" เท่านั้น (ไม่รวมที่สวมอยู่ — ตามผู้ใช้งานต้องการ)
      //   worn จาก login block · สวม/ถอด mid-session อัปเดตผ่าน 0x30 (ชิ้นที่รู้ slot id)
      let items;
      if (tab === 'equip') {
        items = equipmentList.filter(x => !x.worn).map(x => ({ id: x.id, c: 1, card: x.card || 0, refine: x.refine || 0 }));
      } else {
        items = [...inventory.entries()]
          .filter(([id, c]) => c > 0 && itemDB.cats[String(id)] === tab)
          .map(([id, c]) => ({ id, c }));
      }
      if (tab !== 'equip') items.sort((a, b) => a.id - b.id);
      const total = items.reduce((s, x) => s + x.c, 0);
      cntEl.textContent = (tab === 'equip'
        ? 'ในถุง ' + items.length + ' ชิ้น'
        : items.length + ' ชนิด · ' + total.toLocaleString() + ' ชิ้น')
        + (playerWeight != null ? ' · ' + Math.round(playerWeight) + '/' + playerMaxWeight : '');
      grid.innerHTML = items.map(x => {
        const k = String(x.id);
        const name = itemDB.names[k] || ('item_' + x.id);
        const slot = itemDB.slots[k];
        const desc = itemDB.descs[k] || '';
        // ★ equip tab: ชื่อเต็มตามเกม + tooltip นำหน้าด้วยสเตตัส (Attack/Weight/Level/Jobs)
        const nameBar = tab === 'equip'
          ? equipDisplayName(x)
          : name + (slot ? ' [' + slot + ']' : '') + (x.id >= 4001 && x.id <= 4520 ? ' [Card]' : '');
        const descFull = tab === 'equip' ? ((equipStatDesc(x.id) ? equipStatDesc(x.id) + '\n\n' : '') + (desc || '')) : desc;
                const action = getItemAction(x.id);
        const actionBg = action === 'sell' ? 'rgba(230,126,34,.35)' : (action === 'deposit' ? 'rgba(39,174,96,.35)' : '#23262e');
        const actionBorder = action === 'sell' ? '#e67e22' : (action === 'deposit' ? '#27ae60' : '#3a3f4b');
return `<div class="invslot" data-itemid="${x.id}" data-name="${esc(nameBar)}" data-desc="${esc(descFull || '(ไม่มีคำอธิบาย)')}" style="position:relative;aspect-ratio:1;background:${actionBg};border:1px solid ${actionBorder};border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:visible" title="คลิก: เก็บ→ขาย→ฝาก">
          <img src="${itemIconUrl(x.id)}" style="max-width:80%;max-height:80%;image-rendering:pixelated" onerror="this.style.display='none'">
          ${action !== 'keep' ? `<span class="__inv_action" style="position:absolute;top:0;left:0;font-size:8px;background:#000;color:#fff;padding:0 3px;border-radius:3px 0 3px 0;font-weight:bold">${action === 'sell' ? 'ขาย' : 'ฝาก'}</span>` : ''}
          <span style="position:absolute;bottom:0;right:2px;font-size:9px;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000;font-weight:bold">${tab === 'equip' ? (x.refine ? '+' + x.refine : '') : (x.c > 999 ? Math.floor(x.c / 1000) + 'k' : x.c)}</span>
        </div>`;
      }).join('') || '<div style="grid-column:1/-1;color:#666;font-size:11px;padding:20px;text-align:center">(ว่างเปล่า)</div>';
    }
    // ★ tooltip ตาม hover (div เดียว reuse) — ชื่อเป็นแถบ bg + desc ธรรมดา
    let tipEl = null;
    grid.addEventListener('mouseover', (e) => {
      const slot = e.target.closest('.invslot');
      if (!slot) return;
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.style.cssText = 'position:fixed;z-index:1000000;background:#111;border:1px solid #555;border-radius:6px;padding:0;font-size:11px;color:#ddd;max-width:280px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.6);line-height:1.5;overflow:hidden';
        tipEl.innerHTML = '<div class="__inv_name" style="background:#2a4a7a;color:#fff;font-weight:bold;padding:5px 10px"></div><div class="__inv_desc" style="padding:6px 10px;white-space:pre-wrap"></div>';
        document.body.appendChild(tipEl);
      }
      tipEl.querySelector('.__inv_name').textContent = slot.dataset.name || '';
      tipEl.querySelector('.__inv_desc').textContent = slot.dataset.desc || '';
      tipEl.style.display = '';
      const r = slot.getBoundingClientRect();
      tipEl.style.left = Math.min(r.left, innerWidth - 300) + 'px';
      tipEl.style.top = (r.bottom + 6 > innerHeight - 160 ? r.top - 6 - tipEl.offsetHeight : r.bottom + 6) + 'px';
    });
    grid.addEventListener('mouseleave', () => { if (tipEl) tipEl.style.display = 'none'; });

    // ★★ คลิกช่อง = วน toggle เก็บ(เทา)→ขาย(ส้ม)→ฝาก(เขียว) — สีพื้นหลังทันที (เหมือนสถิติ)
    //   ★★ action ผูกกับ itemId → ของซ้ำหลายชิ้น (เช่น แหวน 2 วง) ต้องเปลี่ยนสี+label ทุกช่องพร้อมกัน
    grid.addEventListener('click', (e) => {
      const slot = e.target.closest('.invslot');
      if (!slot) return;
      e.stopPropagation();
      const id = parseInt(slot.dataset.itemid, 10);
      if (!id) return;
      const newAction = cycleItemAction(id);
      const bg = newAction === 'sell' ? 'rgba(230,126,34,.35)' : (newAction === 'deposit' ? 'rgba(39,174,96,.35)' : '#23262e');
      const bd = newAction === 'sell' ? '#e67e22' : (newAction === 'deposit' ? '#27ae60' : '#3a3f4b');
      grid.querySelectorAll('.invslot').forEach(s => {
        if (parseInt(s.dataset.itemid, 10) !== id) return;
        s.style.background = bg; s.style.borderColor = bd;
        // ★ label มุมซ้ายบน — อัปเดต/สร้าง/ลบ ตาม action ใหม่
        let label = s.querySelector('.__inv_action');
        if (newAction === 'keep') { if (label) label.remove(); return; }
        if (!label) {
          label = document.createElement('span');
          label.className = '__inv_action';
          label.style.cssText = 'position:absolute;top:0;left:0;font-size:8px;background:#000;color:#fff;padding:0 3px;border-radius:3px 0 3px 0;font-weight:bold';
          s.appendChild(label);
        }
        label.textContent = newAction === 'sell' ? 'ขาย' : 'ฝาก';
      });
      if (tipEl) tipEl.style.display = 'none';
    });

    // ★★ Bulk action ต่อหมวด — ใช้เฉพาะไอเทมที่มีอยู่ในแท็บปัจจุบัน (ไม่สั่งขาย/ฝากทันที)
    function currentInvTabItemIds() {
      let ids;
      if (invCurTab === 'equip') {
        ids = equipmentList.filter(x => !x.worn).map(x => Number(x.id));
      } else {
        ids = [...inventory.entries()]
          .filter(([id, c]) => c > 0 && itemDB.cats[String(id)] === invCurTab)
          .map(([id]) => Number(id));
      }
      return [...new Set(ids.filter(id => Number.isFinite(id) && id > 0))];
    }
    function setCurrentInvTabAction(action) {
      const ids = currentInvTabItemIds();
      if (!ids.length) {
        log('⚠️ Inventory:', invCurTab, 'ไม่มีไอเทมให้เลือก');
        return;
      }
      const pick = new Set(ids);
      // action ต่อ itemId เลือกได้อย่างเดียว: ลบหมวดนี้ออกจากทั้งสอง list ก่อน
      CFG.sellItemIds = CFG.sellItemIds.filter(id => !pick.has(Number(id)));
      CFG.depositItemIds = CFG.depositItemIds.filter(id => !pick.has(Number(id)));
      if (action === 'sell') CFG.sellItemIds = [...new Set([...CFG.sellItemIds, ...ids])];
      else if (action === 'deposit') CFG.depositItemIds = [...new Set([...CFG.depositItemIds, ...ids])];
      saveConfigDebounced();
      const cat = invCurTab === 'usable' ? 'Item' : (invCurTab === 'equip' ? 'Equip' : 'Etc.');
      log(action === 'sell' ? '💰' : '🏦', cat, action === 'sell' ? '→ เลือกขายทั้งหมด' : '→ เลือกฝากทั้งหมด', ids.length + ' รายการ');
      render(invCurTab);
    }
    overlay.querySelector('#__assist_inv_sellallcat').onclick = (e) => { e.stopPropagation(); setCurrentInvTabAction('sell'); };
    overlay.querySelector('#__assist_inv_depositallcat').onclick = (e) => { e.stopPropagation(); setCurrentInvTabAction('deposit'); };

    overlay.querySelectorAll('.invtab').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        overlay.querySelectorAll('.invtab').forEach(b => { b.style.background = '#333'; b.style.color = '#aaa'; });
        btn.style.background = '#4a3a1a'; btn.style.color = '#ffd54f';
        render(btn.dataset.tab);
      };
    });
    render('usable');   // เริ่มที่ Item

    // ★★ ลากหน้าต่างย้ายอิสระ — จับที่แถบหัวเรื่อง (กดค้างลาก) ปุ่ม ✕ ไม่นับ
    const win = overlay.firstElementChild;
    const hdr = overlay.querySelector('#__assist_inv_hdr');
    let dragSt = null;
    hdr.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;   // ปุ่มต่าง ๆ ในหัวเรื่อง (ขาย/ฝาก/ปิด) ไม่นับเป็นการลาก
      // ★ ตรึงตำแหน่งปัจจุบันก่อนลากครั้งแรก (ถอดจาก flex ชิดขวาของ overlay)
      if (win.style.position !== 'fixed') {
        const r0 = win.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.paddingRight = '0';
        win.style.position = 'fixed';
        win.style.left = r0.left + 'px';
        win.style.top = r0.top + 'px';
        win.style.margin = '0';
      }
      const r = win.getBoundingClientRect();
      dragSt = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { hdr.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    hdr.addEventListener('pointermove', (e) => {
      if (!dragSt) return;
      // กันลากหลุดจอ — เหลือให้เห็นอย่างน้อย 80×40 px
      const nx = Math.max(-win.offsetWidth + 80, Math.min(e.clientX - dragSt.dx, innerWidth - 80));
      const ny = Math.max(0, Math.min(e.clientY - dragSt.dy, innerHeight - 40));
      win.style.left = nx + 'px'; win.style.top = ny + 'px';
    });
    hdr.addEventListener('pointerup', () => { dragSt = null; });
    hdr.addEventListener('pointercancel', () => { dragSt = null; });

    // ★★ live refresh — ข้อมูล inventory/equipment เปลี่ยน (เก็บของ/ฝาก/ถอดคาฟรา/สวมใส่ ฯลฯ)
    //   → render ใหม่เองภายใน 1s (คง scroll ไว้) — เปิด popup ทิ้งไว้ดู real-time ได้
    let invLastVer = invDataVer;
    const invLive = setInterval(() => {
      if (!document.getElementById('__assist_inv_modal')) { clearInterval(invLive); return; }
      if (invDataVer === invLastVer) return;
      invLastVer = invDataVer;
      const st = grid.scrollTop;
      render(invCurTab);
      grid.scrollTop = st;
    }, 1000);

    const close = () => { clearInterval(invLive); if (tipEl) tipEl.remove(); overlay.remove(); };
    overlay.querySelector('#__assist_inv_close').onclick = close;
    // ★★ ปุ่มด่วน — ทำงานเหมือนปุ่มใน panel (sellNow/depositNow ของ ASSIST)
    overlay.querySelector('#__assist_inv_sellnow').onclick = (e) => { e.stopPropagation(); ASSIST.sellNow(); };
    overlay.querySelector('#__assist_inv_depositnow').onclick = (e) => { e.stopPropagation(); ASSIST.depositNow(); };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    // ★ กัน Unity ขโมย click
    overlay.addEventListener('mousedown', (e) => { e.stopPropagation(); }, true);
  }
    function openChangelogModal() {
    const old = document.getElementById('__assist_changelog_modal');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = '__assist_changelog_modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:flex-end;padding-right:10px';
    const versionsHtml = CHANGELOG.map(entry => `
      <div style="margin-bottom:16px">
        <div style="font-size:14px;font-weight:700;color:#ffd54f;border-bottom:1px solid #3a3f4b;padding-bottom:4px;margin-bottom:6px">
          v${entry.v} <span style="font-size:10px;color:#888;font-weight:normal">${entry.d}</span>
          ${entry.v === VERSION ? '<span style="font-size:9px;background:#27ae60;color:#fff;padding:1px 6px;border-radius:8px;margin-left:6px">ปัจจุบัน</span>' : ''}
        </div>
        <ul style="list-style:none;padding:0;margin:0;font-size:11px;line-height:1.8;color:#ccc">
          ${entry.items.map(item => `<li style="padding:1px 0">${item}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    overlay.innerHTML = `
      <div style="background:#1a1a2e;color:#e8e8e8;border-radius:12px;padding:20px;width:480px;max-width:90vw;height:75vh;display:flex;flex-direction:column;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:16px;font-weight:700;color:#ffd54f">📜 Update Log</span>
          <button id="__assist_changelog_close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding-right:6px">${versionsHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#__assist_changelog_close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    // ★ กัน Unity ขโมย focus
    overlay.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('button')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
    }, true);
  }
  function sendMonitorData() {
    const now = nowMs();
    const interval = 1000;
    if (now - lastMonitorSendAt < interval) return;
    lastMonitorSendAt = now;
    const s = ASSIST.getStats();
    const tgt = ASSIST.getTarget();
    const cds = ASSIST.getBuffCountdowns ? ASSIST.getBuffCountdowns() : [];
    const skCds = ASSIST.getSkillCooldowns ? ASSIST.getSkillCooldowns() : [];
    const payload = {
      t: now, version: VERSION,
      hp: hp.cur, hpMax: hp.max, hpPct: hpPct(), weight: playerWeight, weightMax: playerMaxWeight,
      sp: sp.cur, spMax: sp.max,
      player: { x: player.x, y: player.y, name: playerName, id: playerId },
      map: currentMap, farmMap: CFG.farmMap, zeny: playerZeny, gameServer: gameServerUrl,
      target: (() => {
        if (!tgt) return null;
        // ★ resolve entity จริงเพื่อเอา name/hp/hpMax (tgt จาก ASSIST.getTarget() มีแค่ id hex string)
        const tid = parseInt(tgt.id, 16);
        const m = entities.get(tid);
        return { name: (m && m.name) || tgt.id, dist: target ? target.lastDist : null, hp: m ? m.hp : null, hpMax: m ? m.hpMax : null, id: tid };
      })(),
      stats: { kills: s.kills, itemsLooted: s.itemsLooted, expPerMin: s.expPerMin, expGained: s.expGained, baseExpGained: s.baseExpGained, jobExpGained: s.jobExpGained, dps: s.dps, aspd: s.aspd, goldRatePerHour: s.goldRatePerHour, deaths: s.deaths, elapsedMs: s.elapsedMs },
      toggles: { loot: CFG.lootEnabled, heal: CFG.healEnabled, rest: CFG.restEnabled, combat: CFG.combatEnabled, skill: CFG.skillEnabled, buff: CFG.buffEnabled, sell: CFG.sellEnabled, storage: CFG.storageEnabled, warpToBoss: CFG.warpToBoss, warpToMiniBoss: CFG.warpToMiniBoss, fleeFromPlayers: CFG.fleeFromPlayers },
      mobAttackers: getMobAttackerCount(),
      // ★ mobAttackerList — สำหรับแสดงรูปมอน + HP bar ใน monitor (mirror dashboard mobAttackerList)
      mobAttackerList: (() => {
        const nowA = nowMs();
        const out = [];
        const seen = new Set();
        // เป้าหมายปัจจุบันก่อน — ★ resolve entity จริงเพื่อเอา name/hp (tgt.id เป็น hex string)
        if (tgt) {
          const tid = parseInt(tgt.id, 16);
          const m = entities.get(tid);
          out.push({ id: tid, name: (m && m.name) || tgt.id, hp: m ? m.hp : null, hpMax: m ? m.hpMax : null, isTarget: true });
          seen.add(tid);
        }
        for (const [id, t] of mobAttackers) {
          if (seen.has(id)) continue;
          if (nowA - t >= CFG.fleeMobWindowMs) continue;
          const m = entities.get(id);
          if (!m || !m.alive || m.x == null) continue;
          out.push({ id, name: m.name || id.toString(16), hp: m.hp, hpMax: m.hpMax, isTarget: false });
          if (out.length >= 6) break;
        }
        return out;
      })(),
      buffs: cds.map(b => ({ name: b.name, remainingMs: b.remainingMs, itemId: b.itemId })),
      skills: skCds.map(sk => ({ name: sk.name, remainingMs: sk.remainingMs })),
      // ★ inventory — สำหรับแสดงรูป item + ชื่อ + จำนวนใน monitor (เดิม — เก็บไว้กัน compat)
      inventory: [...inventory.entries()].filter(([id, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, count]) => ({ itemId: Number(id), name: itemDisplayName(Number(id)), count })),
      // ★★ sessionLoot — ของที่เก็บได้ใน session นี้ (ล่าสุดก่อน) + action เหมือนแท็บสถิติใน UI
      sessionLoot: [...sessionPickups.entries()]
        .map(([id, at]) => ({ id: Number(id), at, count: inventory.get(Number(id)) || 0 }))
        .filter(x => x.count > 0).sort((a, b) => b.at - a.at).slice(0, 40)
        .map(x => ({ id: x.id, name: itemDisplayName(x.id), count: x.count, action: getItemAction(x.id) })),
      // ★★ invAll — ข้อมูลครบสำหรับ popup 3 แท็บใน monitor (Item/Etc/Equip + action + refine)
      invAll: (() => {
        const out = [];
        for (const [id, c] of inventory.entries()) {
          if (c <= 0) continue;
          const nid = Number(id);
          out.push({ id: nid, n: itemDisplayName(nid), c, a: getItemAction(nid), cat: itemDB.cats[String(nid)] || 'etc' });
        }
        for (const x of equipmentList) {
          if (x.worn) continue;   // แสดงเฉพาะของในถุง (เหมือน UI)
          out.push({ id: x.id, n: equipDisplayName(x), c: 1, a: getItemAction(x.id), cat: 'equip', r: x.refine || 0 });
        }
        return out.slice(0, 400);
      })(),
      isDead: isDead, isResting: isResting,
      sellState: sellState, storageState: storageState,
      // ★ chat history — ส่งแชทล่าสุด 30 ข้อความ
      chatHistory: chatBuf.slice(-30),
      // ★ important log — ส่ง log สำคัญล่าสุด 30 รายการ
      alerts: importantLogBuf.slice(-30),
      // ★★ normal log — ส่ง log ล่าสุด 200 รายการ (สำหรับ Monitor ในเครื่อง)
      logs: logBuf.slice(-500).map(l => ({ t: l.t, m: (l.msg || '').slice(0, 150) })),
      dbgLogs: dbgBuf.slice(-200).map(l => ({ t: l.t, m: (l.msg || '').slice(0, 150) })),
      // ★ map entities — สำหรับแสดง dots บนแผนที่ใน Monitor ในเครื่อง
      mapEntities: (() => {
        const now = nowMs(); const out = [];
        const STALE_MS = 60000;
        // ★★ prioritize: boss > mini boss > monster > warp > NPC > player
        //   เพื่อให้ entities สำคัญโผล่ในแผนที่ก่อน (กันผู้เล่นเยอะกิน slot)
        const priority = (e) => {
          if (e._isBoss) return 0;
          if (e._isMiniBoss) return 1;
          if (e.kind === 1) return 2;       // monster
          if (e._isWarp) return 3;          // warp
          if (e.kind === 2) return 4;       // NPC
          return 5;                         // player (lowest)
        };
        const valid = [];
        for (const e of entities.values()) {
          if (e.id === playerId) continue;
          if (e.x == null || !e.alive) continue;
          if (isStaleId(e.id, now)) continue;
          if (e.kind !== 2) {
            if (!e._lastSeenAt) e._lastSeenAt = now;
            if (now - e._lastSeenAt > STALE_MS) {
              if ((e._isMiniBoss || e._isBoss) && bossAlertedIds.has(e.id)) {
                bossAlertedIds.delete(e.id);
                entities.delete(e.id);
                log('👹 Mini Boss หายไป (ไม่ได้รับตำแหน่ง 60s) — จะ alert ใหม่เมื่อเกิดใหม่');
              }
              continue;
            }
          }
          valid.push(e);
        }
        // ★ sort by priority → important entities first
        valid.sort((a, b) => priority(a) - priority(b));
        for (const e of valid) {
          if (out.length >= 50) break;
          out.push({ id: e.id.toString(16), kind: e.kind || 0, x: e.x, y: e.y, name: e.name || '', hp: e.hp, hpMax: e.hpMax, isBoss: !!e._isBoss, isMiniBoss: !!e._isMiniBoss, isWarp: !!e._isWarp });
        }
        return out;
      })(),
      targetId: target ? target.id.toString(16) : null,
      // ★ ground items — ของที่ตกอยู่บนพื้น (สำหรับแสดงบนแผนที่)
      groundItems: (() => {
        const out = [];
        const now = nowMs();
        for (const d of recentDrops.values()) {
          if (d.x == null) continue;
          // ข้ามของที่เก็บไปแล้ว (ถ้าไม่อยู่ใน queue = เก็บแล้ว)
          if (!queue.has(d.dropId) && !warpQueue.has(d.dropId)) continue;
          out.push({ dropId: d.dropId, itemId: d.itemId, name: itemDisplayName(d.itemId), x: d.x, y: d.y });
          if (out.length >= 30) break;
        }
        return out;
      })(),
    };
    // ★ ส่งผ่าน BroadcastChannel (ถ้ามี) + localStorage (fallback)
    if (monitorChannel) try { monitorChannel.postMessage(payload); } catch (_) {}
    try { localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
    // ★ ส่งตรงเข้า popup window (origin เดียวกัน — ทำงานเสมอ)
    if (monitorWin && !monitorWin.closed) {
      try { if (monitorWin.onData) monitorWin.onData(payload); } catch (_) {}
    }
  }
  // ---------- render loop ----------
  function fmtMs(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }
  function renderUI() {
    const root = document.getElementById('__assist_root');
    if (!root) return;
    const pct = hpPct();
    const pctNum = pct == null ? null : pct;
    const hpText = hp.cur != null ? `${hp.cur}/${hp.max} (${pctNum != null ? pctNum.toFixed(0) : '?'}%)` : 'HP ?';

    // mini-bar
    const hpEl = root.querySelector('.hptext');
    const fill = root.querySelector('.hpfill');
    // version + update button
    const verEl = root.querySelector('[data-version]');
    const updAvail = latestVersion && cmpVer(latestVersion, VERSION) > 0;
    if (verEl) verEl.textContent = 'v' + VERSION + (updAvail ? ' (มีใหม่ v' + latestVersion + ')' : '');
    const updBtn = root.querySelector('#__assist_updatebtn');
    if (updBtn) {
      updBtn.style.display = '';
      updBtn.disabled = !!updateChecking;
      updBtn.style.opacity = updateChecking ? '0.65' : '1';
      if (updateChecking) {
        updBtn.textContent = '⏳ เช็ค...';
        updBtn.title = 'กำลังตรวจเวอร์ชันจาก GitHub';
      } else if (updAvail) {
        updBtn.textContent = '⬆ อัปเดตทันที v' + latestVersion;
        updBtn.title = 'มีเวอร์ชันใหม่: v' + VERSION + ' → v' + latestVersion + ' — คลิกเพื่อเปิดหน้า Update ของ Tampermonkey ทันที';
      } else if (versionCheckError) {
        updBtn.textContent = '⚠ เช็คใหม่';
        updBtn.title = 'เช็คอัปเดตไม่สำเร็จ: ' + versionCheckError;
      } else if (latestVersion) {
        updBtn.textContent = '✅ ล่าสุด v' + latestVersion;
        updBtn.title = 'GitHub และสคริปต์ปัจจุบันเป็นเวอร์ชันเดียวกัน — คลิกเพื่อเช็คใหม่';
      } else {
        updBtn.textContent = '🔄 เช็คอัปเดต';
        updBtn.title = 'เช็คเวอร์ชันล่าสุดจาก GitHub';
      }
    }
    if (hpEl) hpEl.textContent = hpText;
    if (fill) {
      const w = pctNum != null ? Math.max(0, Math.min(100, pctNum)) : 0;
      fill.style.width = w + '%';
      fill.className = 'hpfill' + (w < 25 ? '' : w < 50 ? ' warn' : ' good');
    }
    root.querySelectorAll('.pill').forEach(p => {
      let on, label;
      if (p.hasAttribute('data-loot')) { on = CFG.lootEnabled; label = '📦 Loot'; }
      else if (p.hasAttribute('data-heal')) { on = CFG.healEnabled; label = '💉 Heal'; }
      else if (p.hasAttribute('data-rest')) { on = CFG.restEnabled; label = '🪑 Rest'; }
      else if (p.hasAttribute('data-combat')) { on = CFG.combatEnabled; label = '⚔️ Combat'; }
      else if (p.hasAttribute('data-skill')) { on = CFG.skillEnabled; label = '🔮 Skill'; }
      else if (p.hasAttribute('data-buff')) { on = CFG.buffEnabled; label = '✨ Buff'; }
      else if (p.hasAttribute('data-sell')) { on = CFG.sellEnabled; label = '💰 Sell'; }
      else if (p.hasAttribute('data-storage')) { on = CFG.storageEnabled; label = '🏦 Kafra'; }
      else if (p.hasAttribute('data-flee')) { on = CFG.fleeFromPlayers; label = '🏃 Flee'; }
      else if (p.hasAttribute('data-auto')) { on = CFG.autoLoginEnabled; label = '🤖 Auto'; }
      else return;
      p.className = 'pill ' + (on ? 'on' : 'off');
      p.textContent = label;
    });
    if (isDead) root.querySelector('#__assist_bar').classList.add('__assist_dead');
    else root.querySelector('#__assist_bar').classList.remove('__assist_dead');

    // stats page
    const s = ASSIST.getStats();
    const set = (sel, val) => { const el = root.querySelector(sel); if (el) el.textContent = val; };
    set('[data-hp]', hpText);
    set('[data-pos]', player.x != null ? `(${player.x.toFixed(1)}, ${player.y.toFixed(1)})` : '?');
    // ★ farm map status: แสดงแมปปัจจุบัน + เตือนถ้าอยู่ผิดแมปฟาร์ม
    {
      const farmInfo = CFG.farmMap
        ? (currentMap === CFG.farmMap ? `${currentMap} ✅` : `${currentMap || '?'} ⚠️ (ฟาร์ม: ${CFG.farmMap})`)
        : (currentMap || '?');
      set('[data-farmmap]', farmInfo);
    }
    set('[data-pid]', playerId ? playerId.toString(16) : '?');
    set('[data-state]', chatPauseActive ? '⏸️ Chat Pause' : (isDead ? '☠️ ตาย' : (isResting ? '🪑 นั่งพัก' : (activeWS && activeWS.readyState === 1 ? '🟢 เชื่อมต่อ' : '🔴 ไม่ได้ต่อ'))));
    set('[data-kills]', s.kills);
    set('[data-looted]', s.itemsLooted);
    set('[data-exp]', s.expGained.toLocaleString());
    set('[data-expmin]', s.expPerMin.toLocaleString());
    set('[data-dps]', s.dps > 0 ? s.dps.toLocaleString() : '—');
    set('[data-aspd]', s.aspd > 0 ? s.aspd.toFixed(1) : '—');
    set('[data-goldrate]', s.goldRatePerHour > 0 ? s.goldRatePerHour.toLocaleString() + 'z' : '—');
    set('[data-elapsed]', fmtMs(s.elapsedMs));
    set('[data-deaths]', s.deaths);
    set('[data-zeny]', sessionZeny().toLocaleString() + 'z');
    const itemsEl = root.querySelector('[data-items]');
    if (itemsEl) {
      // ★★ แสดงเฉพาะของที่ "เก็บได้ใน session นี้" เรียงจากเก็บล่าสุด → เก่า
      //   จำนวน = ของจริงที่มีอยู่ตอนนี้ (ลดตามใช้/ขาย/ฝากสำเร็จ — หมดแล้วหายจากลิสต์เอง)
      const invTop = [...sessionPickups.entries()]
        .map(([id, at]) => ({ id: Number(id), at, count: inventory.get(Number(id)) || 0 }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.at - a.at);
      // ★ ยอดรวมเงินจากของที่เก็บได้ — นับเฉพาะของที่ตั้งค่าให้ "ขาย"
      const sellTotal = invTop.reduce((s, x) => getItemAction(x.id) === 'sell' ? s + (itemPrice(x.id) || 0) * x.count : s, 0);
      set('[data-pickupsell]', sellTotal > 0 ? '· ขายได้ ~' + sellTotal.toLocaleString() + 'z' : '');
      itemsEl.innerHTML = invTop.length ? invTop.map(x => {
        const numId = x.id;
        const count = x.count;
        const price = itemPrice(numId);
        const zeny = price ? ` <span style="color:#f1c40f">${(price * count).toLocaleString()}z</span>` : '';
        const icon = itemDB.loaded ? `<img src="${itemIconUrl(numId)}" style="width:16px;height:16px;vertical-align:middle" onerror="this.style.display='none'"> ` : '';
        // ★ toggle 3-state: เก็บ(เทา) / ขาย(ส้ม) / ฝาก(เขียว) — กดวน
        const action = getItemAction(numId);
        const actionLabel = action === 'sell' ? 'ขาย' : (action === 'deposit' ? 'ฝาก' : 'เก็บ');
        const actionColor = action === 'sell' ? '#e67e22' : (action === 'deposit' ? '#27ae60' : '#6b7280');
        const bgColor = action === 'sell' ? 'rgba(230,126,34,.12)' : (action === 'deposit' ? 'rgba(39,174,96,.12)' : 'transparent');
        return `<div style="background:${bgColor};border-radius:3px;padding:2px 4px">${icon}${itemDisplayName(numId)} ×${count}${zeny} <button data-itemaction="${numId}" style="float:right;font-size:10px;color:#fff;background:${actionColor};border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-family:inherit">${actionLabel}</button></div>`;
      }).join('') : '(ยังไม่เก็บอะไรใน session นี้)';
      // wire toggle buttons (วน keep→sell→deposit→keep)
      itemsEl.querySelectorAll('button[data-itemaction]').forEach(btn => {
        btn.onclick = () => { const id = parseInt(btn.getAttribute('data-itemaction'), 10); cycleItemAction(id); };
      });
    }
    // combat stats
    const tgt = ASSIST.getTarget();
    const agg = ASSIST.getAggro();
    set('[data-combat-target]', tgt ? (tgt.id + ' pending:' + tgt.pending) : '(none)');
    set('[data-combat-aggro]', agg.mobAttackers + ' ตี / ' + agg.aggro + ' aggro / ' + agg.monstersNearby + ' รอบ');
    // inventory + sell state
    // ★ inventory — pill mini-bar ใส่ 🎒 นำหน้าเสมอ (เดิม set ทับ icon จนหาย) + แถวสถิติแยกกัน
    const invCountTxt = inventory.size + ' ชนิด' + (inventoryFull ? ' ⚠️เต็ม' : '');
    const invPill = root.querySelector('.pill[data-inventory]');
    if (invPill) invPill.textContent = '🎒 ' + invCountTxt;
    const invRow = root.querySelector('.v[data-inventory]');
    if (invRow) invRow.textContent = invCountTxt;
    set('[data-sellstate]', CFG.sellEnabled ? (sellState === 'IDLE' ? 'ON (รอ trigger)' : sellState) : 'OFF');
    set('[data-storagestate]', CFG.storageEnabled ? (storageState === 'IDLE' ? 'ON (รอ trigger)' : storageState) : 'OFF');

    // config page — ซิงค์ค่าปัจจุบันเข้า input (กันเขียนทับเวลา user กำลังพิมพ์)
    const lootBtn = root.querySelector('#__assist_lootbtn');
    const healBtn = root.querySelector('#__assist_healbtn');
    const warpBtn = root.querySelector('#__assist_warpbtn');
    if (lootBtn) { lootBtn.textContent = 'Loot: ' + (CFG.lootEnabled ? 'ON' : 'OFF'); lootBtn.className = CFG.lootEnabled ? 'on' : 'off'; }
    if (healBtn) { healBtn.textContent = 'Heal: ' + (CFG.healEnabled ? 'ON' : 'OFF'); healBtn.className = CFG.healEnabled ? 'on' : 'off'; }
    if (warpBtn) { warpBtn.textContent = 'วาร์ปไปเก็บของ: ' + (CFG.warpLootEnabled ? 'ON' : 'OFF') + (warpQueue.size ? ` (${warpQueue.size})` : ''); warpBtn.className = CFG.warpLootEnabled ? 'on' : 'off'; }
    const ha = root.querySelector('#__assist_healat');
    if (ha && !isEditing(ha)) ha.value = CFG.healAtPercent;
    const hi = root.querySelector('#__assist_healitems');
    if (hi && !isEditing(hi)) hi.value = CFG.healItems.join(',');
    const hm = root.querySelector('#__assist_healmode');
    if (hm && !isEditing(hm)) hm.value = CFG.healMode;
    // buff config sync + countdown display
    const buffBtn = root.querySelector('#__assist_buffbtn');
    if (buffBtn) { buffBtn.textContent = 'Buff: ' + (CFG.buffEnabled ? 'ON' : 'OFF'); buffBtn.className = CFG.buffEnabled ? 'on' : 'off'; }
    const bvBtn = root.querySelector('#__assist_t_buffvisit');
    if (bvBtn) { bvBtn.textContent = '🔁 ไปรับบัพ: ' + (CFG.buffVisitEnabled ? 'ON' : 'OFF'); bvBtn.className = CFG.buffVisitEnabled ? 'on' : 'off'; }
    const ubBtn = root.querySelector('#__assist_t_unstuckbuff');
    if (ubBtn) { ubBtn.textContent = '🏠 AB Refresh: ' + (CFG.unstuckBuffEnabled ? 'ON' : 'OFF'); ubBtn.className = CFG.unstuckBuffEnabled ? 'on' : 'off'; }
    const ubStatus = root.querySelector('#__assist_unstuckstatus');
    if (ubStatus) {
      const directReady = true;
      const remain = unstuckBuffLastAt ? Math.max(0, Math.ceil((CFG.unstuckBuffIntervalSec * 1000 - (nowMs() - unstuckBuffLastAt)) / 1000)) : CFG.unstuckBuffIntervalSec;
      ubStatus.innerHTML = unstuckBuffAutoFinishPending
        ? ('⏳ AB Auto ครบเวลาแล้ว · ' + (target ? 'กำลังตีมอนตัวล่าสุดให้จบ' : ((queue.size > 0 || warpQueue.size > 0) ? 'กำลังเก็บของตัวล่าสุด' : 'เตรียม Unstuck')) )
        : (!CFG.combatEnabled && unstuckBuffState === 'IDLE' ? ('✅ Direct Unstuck 0x73 พร้อม · ⏸️ รอบ AB Auto รอ Combat ON · ▶ รับบัพตอนนี้ = เริ่มทันที') : ('✅ Direct Unstuck 0x73 พร้อม · state=' + unstuckBuffState + (unstuckBuffState === 'IDLE' && CFG.unstuckBuffEnabled ? ' · Auto รอบถัดไป ~' + remain + 's' : '')));
    }
    const upStatus = root.querySelector('#__assist_unstuckpacketstatus');
    if (upStatus) { upStatus.textContent = ''; upStatus.style.display = 'none'; }
    const bi = root.querySelector('#__assist_buffitems');
    if (bi && !isEditing(bi)) bi.value = (CFG.buffItems || []).map(x => x.itemId + ',' + x.intervalMin).join('\n');
    const cdEl = root.querySelector('#__assist_buffcountdown');
    if (cdEl) {
      if (!CFG.buffItems || !CFG.buffItems.length) {
        cdEl.textContent = '(ยังไม่ตั้ง buff)';
      } else {
        const cds = ASSIST.getBuffCountdowns();
        cdEl.innerHTML = cds.map(c => {
          const icon = itemDB.loaded ? `<img src="${itemIconUrl(c.itemId)}" style="width:14px;height:14px;vertical-align:middle" onerror="this.style.display='none'"> ` : '';
          const remSec = Math.ceil(c.remainingMs / 1000);
          const remStr = remSec >= 60 ? Math.floor(remSec/60) + 'นาที' + (remSec%60 ? ' '+(remSec%60)+'s' : '') : remSec + 's';
          const state = c.remainingMs <= 0 ? '<span style="color:#27ae60">พร้อมใช้</span>' : '<span style="color:#f39c12">' + remStr + '</span>';
          return `<div>${icon}${c.name} <span style="color:#5f6368">(ทุก ${c.intervalMin}นาที)</span> → ${state}</div>`;
        }).join('');
      }
    }
    // skill config sync + countdown display
    const skillBtn = root.querySelector('#__assist_skillbtn');
    if (skillBtn) { skillBtn.textContent = 'Skill: ' + (CFG.skillEnabled ? 'ON' : 'OFF'); skillBtn.className = CFG.skillEnabled ? 'on' : 'off'; }
    const buffOthBtn = root.querySelector('#__assist_t_buffothers');
    if (buffOthBtn) { buffOthBtn.textContent = '🤝 บัพให้คนอื่น: ' + (CFG.buffOthersEnabled ? 'ON' : 'OFF'); buffOthBtn.className = CFG.buffOthersEnabled ? 'on' : 'off'; }
    const skCdEl = root.querySelector('#__assist_skillcountdown');
    if (skCdEl) {
      if (!CFG.skills || !CFG.skills.length) {
        skCdEl.textContent = '(ยังไม่ตั้ง skill — กด "📋 จัดการ skill")';
      } else {
        const cds = ASSIST.getSkillCooldowns();
        const spStr = sp.cur != null ? (sp.max ? ` | SP ${sp.cur}/${sp.max}` : ` | SP ${sp.cur}`) : '';
        skCdEl.innerHTML = cds.map(c => {
          const remSec = Math.ceil(c.remainingMs / 1000);
          const remStr = remSec >= 60 ? Math.floor(remSec/60) + 'นาที' : remSec + 's';
          const state = c.remainingMs <= 0 ? '<span style="color:#27ae60">พร้อม</span>' : '<span style="color:#f39c12">' + remStr + '</span>';
          return `<div>🔮 ${c.name} <span style="color:#5f6368">(#${c.skillId})</span> → ${state}</div>`;
        }).join('') + `<div style="color:#5f6368;margin-top:2px">${spStr}</div>`;
      }
    }
    const lm = root.querySelector('#__assist_lootmode');
    if (lm && !isEditing(lm)) lm.value = CFG.filter.mode;
    const ld = root.querySelector('#__assist_lootdelay');
    if (ld && !isEditing(ld)) ld.value = CFG.lootDelayAfterDropMs;
    const lt = root.querySelector('#__assist_lootthrottle');
    if (lt && !isEditing(lt)) lt.value = CFG.sendThrottleMs;

    // combat config sync
    const combatBtn = root.querySelector('#__assist_combatbtn');
    if (combatBtn) { combatBtn.textContent = 'Combat: ' + (CFG.combatEnabled ? 'ON' : 'OFF'); combatBtn.className = CFG.combatEnabled ? 'on' : 'off'; }
    const syncInput = (sel, val) => { const el = root.querySelector(sel); if (el && !isEditing(el)) el.value = val; };
    const syncToggle = (sel, on) => { const el = root.querySelector(sel); if (el) el.className = on ? 'on' : 'off'; };
    syncInput('#__assist_whitelist', CFG.targetWhitelist.join(','));
    syncInput('#__assist_blacklist', CFG.targetBlacklist.join(','));
    syncInput('#__assist_attackrange', CFG.rangedAttackRange > 0 ? CFG.rangedAttackRange : CFG.attackRange);
    syncInput('#__assist_postcombatdelay', CFG.postCombatDelayMs);
    syncInput('#__assist_fleemob', CFG.fleeOnMobCount);
    syncInput('#__assist_fleeaggro', CFG.fleeOnAggroCount);
    syncToggle('#__assist_t_mobflee', CFG.mobFleeEnabled !== false);
    const _mfb = root.querySelector('#__assist_t_mobflee'); if (_mfb) _mfb.textContent = '🏃 หนีมอนรุม: ' + (CFG.mobFleeEnabled !== false ? 'ON' : 'OFF');
    // rest config sync
    const restBtn = root.querySelector('#__assist_restbtn');
    if (restBtn) { restBtn.textContent = 'Rest: ' + (CFG.restEnabled ? 'ON' : 'OFF') + (isResting ? ' 🪑' : ''); restBtn.className = CFG.restEnabled ? 'on' : 'off'; }
    syncInput('#__assist_resthp', CFG.restHpPercent);
    syncInput('#__assist_restuntil', CFG.restUntilPercent);
    syncInput('#__assist_restmaxsec', CFG.restMaxSec);
    // ★ auto-respawn toggle sync
    const respawnBtn = root.querySelector('#__assist_respawnbtn');
    if (respawnBtn) { respawnBtn.textContent = 'Respawn: ' + (CFG.autoRespawnEnabled ? 'ON' : 'OFF'); respawnBtn.className = CFG.autoRespawnEnabled ? 'on' : 'off'; }
    syncInput('#__assist_fleeprox', CFG.fleeOnProximityCount);
    syncInput('#__assist_fleerprox', CFG.fleeOnProximityRadius);
    syncInput('#__assist_stuckwarp', CFG.stuckWarpOnAbandon);
    syncToggle('#__assist_t_warptoboss', CFG.warpToBoss === true);
    syncToggle('#__assist_t_warptominiboss', CFG.warpToMiniBoss === true);
    syncToggle('#__assist_t_fleeplayers', CFG.fleeFromPlayers === true);
    syncToggle('#__assist_t_fleemode_change', CFG.fleeMode !== 'sameMap');
    syncToggle('#__assist_t_fleemode_same', CFG.fleeMode === 'sameMap');
    syncToggle('#__assist_t_hpflee', CFG.hpFleeEnabled === true);
    const _hpfb = root.querySelector('#__assist_t_hpflee'); if (_hpfb) _hpfb.textContent = '❤️ HP ต่ำหนี: ' + (CFG.hpFleeEnabled ? 'ON' : 'OFF');
    syncToggle('#__assist_t_hpflee_same', CFG.hpFleeMode !== 'unstuck');
    syncToggle('#__assist_t_hpflee_unstuck', CFG.hpFleeMode === 'unstuck');
    syncInput('#__assist_hpfleepct', CFG.hpFleePercent);
    syncToggle('#__assist_t_stepaside', CFG.stepAsideOnAbandon !== false);
    syncToggle('#__assist_t_fightbackbl', CFG.fightBackBlacklisted !== false);
    syncToggle('#__assist_t_blacklistflee', CFG.blacklistFleeEnabled === true);
    const _blfb = root.querySelector('#__assist_t_blacklistflee'); if (_blfb) _blfb.textContent = '🌀 หนี Blacklist: ' + (CFG.blacklistFleeEnabled === true ? 'ON' : 'OFF');
    syncToggle('#__assist_t_tpmacro', CFG.teleportMacroEnabled === true);
    const _tpm = root.querySelector('#__assist_t_tpmacro'); if (_tpm) _tpm.textContent = '⌨️ Macro: ' + (CFG.teleportMacroEnabled === true ? 'ON' : 'OFF');
    // ★ ไม่ sync fleemaps/fleeradius — กันเขียนทับค่าที่กำลังแก้ (Unity แย่ง focus → isEditing คืน false)
    syncToggle('#__assist_t_dangerflee', CFG.dangerFleeEnabled !== false);
    const _dfb = root.querySelector('#__assist_t_dangerflee'); if (_dfb) _dfb.textContent = '🚨 หนีมอนอันตราย: ' + (CFG.dangerFleeEnabled !== false ? 'ON' : 'OFF');
    syncInput('#__assist_fleemonsters', (CFG.fleeMonsters || []).join(','));
    syncInput('#__assist_fleemonsterradius', CFG.fleeMonsterRadius);
    syncToggle('#__assist_t_antiks', CFG.antiKS);
    syncToggle('#__assist_t_normalatk', CFG.normalAttackEnabled !== false);   // ★ โหมดเวทย์ (default เปิดตีปกติ)
    syncInput('#__assist_pickradiuskill', CFG.pickRadiusKill);
    syncToggle('#__assist_t_lootkillpos', CFG.lootUseKillPos);
    syncToggle('#__assist_t_avoidp', CFG.avoidOtherPlayers);
    syncToggle('#__assist_t_lowhp', CFG.targetLowestHpFirst);
    syncToggle('#__assist_t_wander', CFG.wanderEnabled);
    syncToggle('#__assist_t_warpfind', CFG.warpFindEnabled);
    syncToggle('#__assist_t_warpfindwing', CFG.warpFindUseFlyWing);
    syncToggle('#__assist_t_warpfindskill', CFG.warpFindUseTeleportSkill);
    syncToggle('#__assist_t_guard', CFG.guardEnabled);
    syncToggle('#__assist_t_farmondeath', CFG.farmRotateOnDeath);
    syncToggle('#__assist_t_warptomon', CFG.warpToMonster);
    // sell config sync
    const sellBtn = root.querySelector('#__assist_sellbtn');
    if (sellBtn) { sellBtn.textContent = 'Sell: ' + (CFG.sellEnabled ? 'ON' : 'OFF') + (sellState !== 'IDLE' ? ' (' + sellState + ')' : ''); sellBtn.className = CFG.sellEnabled ? 'on' : 'off'; }
    syncInput('#__assist_sellnpc', CFG.sellNpcName);
    syncInput('#__assist_sellmap', CFG.sellNpcMap);
    syncInput('#__assist_sellx', CFG.sellNpcX);
    syncInput('#__assist_selly', CFG.sellNpcY);
    syncInput('#__assist_sellinterval', CFG.sellIntervalMin);
    syncToggle('#__assist_t_sellfull', CFG.sellOnFull);
    // storage config sync
    const storageBtn = root.querySelector('#__assist_storagebtn');
    if (storageBtn) { storageBtn.textContent = 'Storage: ' + (CFG.storageEnabled ? 'ON' : 'OFF') + (storageState !== 'IDLE' ? ' (' + storageState + ')' : ''); storageBtn.className = CFG.storageEnabled ? 'on' : 'off'; }
    syncInput('#__assist_kafra', CFG.kafraName);
    syncInput('#__assist_kaframap', CFG.kafraMap);
    syncInput('#__assist_kafrax', CFG.kafraMapX);
    syncInput('#__assist_kafray', CFG.kafraMapY);
    syncInput('#__assist_kafrachoice', CFG.kafraChoice);
    syncToggle('#__assist_t_depfull', CFG.depositOnFull);
    syncToggle('#__assist_t_depaftersell', CFG.depositAfterSell);
    // ★ auto trade status sync
    const trAcceptBtn = root.querySelector('#__assist_trade_accept_all');
    if (trAcceptBtn) {
      trAcceptBtn.textContent = '✅ Accept-All Trade: ' + (CFG.tradeAcceptAll ? 'ON' : 'OFF');
      trAcceptBtn.className = CFG.tradeAcceptAll ? 'on' : 'off';
    }
    const trRejectBtn = root.querySelector('#__assist_trade_reject_all');
    if (trRejectBtn) {
      trRejectBtn.textContent = '🚫 Eject-All Trade: ' + (CFG.tradeRejectAll ? 'ON' : 'OFF');
      trRejectBtn.className = CFG.tradeRejectAll ? 'on' : 'off';
    }
    // nav config sync + stats display
    const navRecBtn = root.querySelector('#__assist_navrecbtn');
    if (navRecBtn) { navRecBtn.textContent = 'บันทึก: ' + (CFG.navRecording ? 'ON 🔴' : 'OFF'); navRecBtn.className = CFG.navRecording ? 'on' : 'off'; }
    syncToggle('#__assist_navwanderbtn', CFG.navWanderUseNav);
    syncToggle('#__assist_gatwanderbtn', CFG.gatWanderEnabled !== false);
    { // ★ GAT wander status — ปุ่มบอกสถานะข้อมูลแมปปัจจุบัน (มี/ไม่มี)
      const gb = root.querySelector('#__assist_gatwanderbtn');
      if (gb) gb.textContent = 'เดินตาม GAT' + (currentMap && gatCache.has(currentMap) ? ' ✅' : '');
    }
    const nm = root.querySelector('#__assist_navmode');
    if (nm && !isEditing(nm)) nm.value = CFG.navWanderMode;
    syncInput('#__assist_navradius', CFG.navMergeRadius);
    const navStatsEl = root.querySelector('#__assist_navstats');
    if (navStatsEl) {
      const all = ASSIST.navGetAllStats();
      const mapNames = Object.keys(all);
      if (!mapNames.length) {
        navStatsEl.textContent = '(ยังไม่มีข้อมูล — เปิด "บันทึก" แล้วเดินเก็บข้อมูลในแมปที่ต้องการ)';
      } else {
        navStatsEl.innerHTML = mapNames.map(m => {
          const s = all[m];
          const cur = m === currentMap ? ' ✅' : '';
          return `<div>📦 ${m}${cur}: ${s.nodes} nodes, ${s.edges} edges (${s.trail} trail)</div>`;
        }).join('');
      }
    }
    // farm map config sync
    syncInput('#__assist_farmmap', CFG.farmMap);
    syncInput('#__assist_farmx', CFG.farmMapX);
    syncInput('#__assist_farmy', CFG.farmMapY);
    syncToggle('#__assist_t_warpback', CFG.warpBackToFarm);

    // log page (อัปเดตเฉพาะถ้าเปิดอยู่ เพื่อประหยัด)
    const logPage = root.querySelector('.__assist_page[data-page="log"]');
    if (logPage && logPage.classList.contains('active')) {
      const box = root.querySelector('#__assist_logbox');
      // ★ toggle แหล่ง log: กิจกรรม (logBuf) / Debug (dbgBuf)
      const srcAct = root.querySelector('#__assist_logsrc_act');
      const srcDbg = root.querySelector('#__assist_logsrc_dbg');
      if (srcAct && !srcAct._wired) {
        srcAct._wired = true;
        srcAct.onclick = () => { box.dataset.dbg = ''; delete box.dataset.sig; syncLogSrc(); };
        srcDbg.onclick = () => { box.dataset.dbg = '1'; delete box.dataset.sig; syncLogSrc(); };
      }
      function syncLogSrc() {
        const isDbg = box.dataset.dbg === '1';
        srcAct.style.background = isDbg ? '#333' : '#2a4a6a';
        srcAct.style.color = isDbg ? '#aaa' : '#8cf';
        srcAct.style.borderColor = isDbg ? '#555' : '#4a7ab5';
        srcDbg.style.background = isDbg ? '#4a2a3a' : '#333';
        srcDbg.style.color = isDbg ? '#f9c' : '#aaa';
        srcDbg.style.borderColor = isDbg ? '#a55' : '#555';
      }
      syncLogSrc();
      if (box) {
        const isDbg = box.dataset.dbg === '1';
        const logs = isDbg ? ASSIST.getDbgLogs() : ASSIST.getLogs();
        const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
        // ★ rebuild เมื่อจำนวนเปลี่ยน OR log ล่าสุดเปลี่ยน (กันค้างตอน buffer เต็ม 200 แล้ว shift)
        const lastT = logs.length ? logs[logs.length - 1].t : 0;
        const firstT = logs.length ? logs[0].t : 0;
        const sig = logs.length + ':' + firstT + ':' + lastT;
        if (box.dataset.sig !== sig) {
          box.dataset.sig = sig;
          box.innerHTML = logs.map(l => {
            const d = new Date(l.t);
            const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
            return `<div class="logline"><span class="ts">${ts}</span> ${l.msg.replace(/</g,'&lt;')}</div>`;
          }).join('');
          if (wasNearBottom) box.scrollTop = box.scrollHeight;
        }
      }
    }
    const chatPauseBtn = root.querySelector('#__assist_chatpausebtn');
    if (chatPauseBtn) { chatPauseBtn.textContent = '💬 Chat Alert + Pause: ' + (CFG.chatPauseOnIncoming ? 'ON' : 'OFF'); chatPauseBtn.className = CFG.chatPauseOnIncoming ? 'on' : 'off'; }
    const chatResumeBtn = root.querySelector('#__assist_chatresume'); if (chatResumeBtn) { chatResumeBtn.disabled = !chatPauseActive; chatResumeBtn.style.opacity = chatPauseActive ? '1' : '.45'; }
    // ★ alert page (log สำคัญ — card + chat bot)
    const alertPage = root.querySelector('.__assist_page[data-page="alert"]');
    if (alertPage && alertPage.classList.contains('active')) {
      const box = root.querySelector('#__assist_alertbox');
      if (box) {
        const logs = ASSIST.getImportantLogs();
        const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
        const lastT = logs.length ? logs[logs.length - 1].t : 0;
        const firstT = logs.length ? logs[0].t : 0;
        const sig = logs.length + ':' + firstT + ':' + lastT;
        if (box.dataset.sig !== sig) {
          box.dataset.sig = sig;
          box.innerHTML = logs.length ? logs.map(l => {
            const d = new Date(l.t);
            const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
            const color = l.type === 'card' ? '#f1c40f' : (l.type === 'chat' ? '#ef5350' : '#e8e8e8');
            return `<div class="logline" style="color:${color}"><span class="ts">${ts}</span> ${l.msg.replace(/</g,'&lt;')}</div>`;
          }).join('') : '<div style="color:#5f6368;padding:20px;text-align:center">(ยังไม่มี log สำคัญ)</div>';
          if (wasNearBottom) box.scrollTop = box.scrollHeight;
        }
      }
    }
  }

  // ---------- version check + update ----------
  let lastConfigSnapshot = null;
  let lastAutoSaveAt = 0;
  let lastVersionCheckAt = 0;
  let latestVersion = null;          // เวอร์ชั่นล่าสุดจาก GitHub (null = ยังไม่ได้เช็ค)
  let updateChecking = false;
  let versionCheckError = null;
  let versionLastOkAt = 0;
  let versionMismatchWarned = false; // ★ guard @version vs VERSION — เตือนครั้งเดียวพอ
  function parseVersionFromHeader(src) {
    const m = src.match(/@version\s+([\d.]+)/);
    return m ? m[1] : null;
  }
  function cmpVer(a, b) {   // คืน >0 ถ้า a ใหม่กว่า b
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] || 0, db = pb[i] || 0;
      if (da !== db) return da - db;
    }
    return 0;
  }
  async function checkVersion() {
    if (updateChecking) return;
    updateChecking = true;
    versionCheckError = null;
    lastVersionCheckAt = Date.now();
    try {
      // ★★ guard: @version ใน header (ตัวที่ Tampermonkey/self-updater ใช้) ต้องตรง const VERSION
      //   เคยพลาดจริง 2 ครั้ง: const VERSION ค้าง 4.147.1 / @version ค้าง 4.172.0 — ถ้าไม่ตรง
      //   ผู้ใช้จะไม่มีวันได้รับอัปเดตทั้งที่เลขใน UI ขึ้นใหม่แล้ว
      const _hdrVer = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? GM_info.script.version : null;
      if (_hdrVer && _hdrVer !== VERSION && !versionMismatchWarned) {
        versionMismatchWarned = true;
        log('⚠️ @version ใน header =', _hdrVer, 'ไม่ตรง VERSION =', VERSION, '— ลืมอัปเดต header ก่อนปล่อย!');
        console.warn('[ASSIST] ⚠️ @version (' + _hdrVer + ') != VERSION (' + VERSION + ') — อัปเดตให้ตรงกันก่อนปล่อย!');
      }
      const res = await fetch(GITHUB_RAW + '?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const src = await res.text();
      const remote = parseVersionFromHeader(src);
      if (!remote) throw new Error('อ่าน @version จาก GitHub ไม่ได้');
      versionLastOkAt = Date.now();
      {
        latestVersion = remote;
        if (cmpVer(remote, VERSION) > 0) {
          log('🔔 มีเวอร์ชั่นใหม่!', VERSION, '→', remote, '(กดปุ่ม ⬆ อัปเดต หรือ ASSIST.update())');
        } else if (remote !== VERSION && !versionMismatchWarned) {
          // ★ @version บน GitHub ต่ำกว่า VERSION ที่รันอยู่ = header ค้าง (หรือยังไม่ push)
          versionMismatchWarned = true;
          log('⚠️ @version บน GitHub =', remote, 'ต่ำกว่า VERSION =', VERSION, '— ลืมอัปเดต @version หรือยังไม่ push!');
        } else {
          log('✅ เวอร์ชั่นล่าสุดแล้ว (' + VERSION + ')');
        }
      }
    } catch (e) {
      versionCheckError = (e && e.message) ? e.message : String(e || 'unknown error');
      log('❌ เช็คอัปเดตไม่สำเร็จ:', versionCheckError);
      console.warn('[ASSIST] update check failed:', e);
    }
    finally { updateChecking = false; }
  }
  async function doUpdate() {
    log('⬆ กำลังอัปเดต...');
    saveConfig();
    // ★ ตรวจว่ารันใน Tampermonkey หรือ console
    const isTampermonkey = (typeof GM_info !== 'undefined') || (typeof GM !== 'undefined') || (typeof unsafeWindow !== 'undefined');
    if (isTampermonkey) {
      // ★ v4.189.14: เปิด Raw .user.js โดยตรงจาก click ของผู้ใช้
      // Tampermonkey จะ intercept URL และแสดงหน้า Update/Install ของ extension
      // การกดยืนยันในหน้า Tampermonkey ข้ามไม่ได้ด้วย userscript (security boundary)
      const installUrl = GITHUB_RAW + '?v=' + encodeURIComponent(latestVersion || VERSION) + '&ts=' + Date.now();
      log('⬆ เปิดหน้า Update ของ Tampermonkey...');
      const w = window.open(installUrl, '_blank');
      if (!w) {
        log('⚠️ browser บล็อก popup → เปิดหน้า Update ในแท็บปัจจุบันแทน');
        window.location.href = installUrl;
      }
      return;
    }
    // Console: eval โหลดเวอร์ชั่นใหม่แทนที่เลย
    try {
      const res = await fetch(GITHUB_RAW, { cache: 'no-store' });
      if (!res.ok) { log('❌ ดาวน์โหลดล้มเหลว'); return; }
      let src = await res.text();
      try {
        window.__ASSIST = false;
        (0, eval)(src);
        log('✅ อัปเดตสำเร็จ — รบกวน reconnect เกม (ปิด-เปิดหน้า)');
      } catch (e) {
        log('⚠️ eval ล้มเหลว → เปิดลิงก์ raw URL เพื่อ copy เอง');
        latestVersion = null;   // หยุดกระพริบ
        window.open(GITHUB_RAW, '_blank');
      }
    } catch (e) { log('❌ อัปเดตล้มเหลว:', e.message); }
  }

  // ---------- bootstrap UI (รอ DOM ready) ----------
  function startUI() {
    buildUI();
    // ★★ PANEL RESURRECTION — หน้าเกมพังกลางทางแล้วล้าง DOM (เช่น loader retry สร้าง body ใหม่)
    //   = panel ของเราโดนลบไปพร้อมกัน → ตรวจทุก 5s ถ้า root หายไปให้สร้างใหม่
    //   (เคสจริง: (index):124 SyntaxError ใน Object.send ของหน้าเกม → mini-bar หาย)
    let uiRebuilds = 0;
    setInterval(() => {
      if (document.getElementById('__assist_root')) return;
      if (uiRebuilds >= 10) return;   // กันวนสร้างไม่จบ (หน้าพังถาวร — ปล่อย)
      uiRebuilds++;
      try {
        buildUI();
        log('🛠️ panel โดนลบจากหน้าเว็บ (หน้าเกมพัง/ล้าง DOM?) → สร้างใหม่แล้ว (ครั้ง ' + uiRebuilds + ')');
      } catch (e) {}
    }, 5000);
    uiLoop = setInterval(() => {
      renderUI();
      sendMonitorData();   // ★ ส่งไป monitor.html
      // auto-save config ทุก ~5 วิ ถ้าค่าเปลี่ยน
      const now = Date.now();
      if (now - lastAutoSaveAt > 5000) {
        lastAutoSaveAt = now;
        const snap = JSON.stringify(PERSIST_KEYS.map(k => CFG[k]));
        if (snap !== lastConfigSnapshot) { lastConfigSnapshot = snap; saveConfig(); }
      }
      // ตรวจเวอร์ชั่นจาก GitHub ทุก ~10 นาที
      if (!latestVersion && now - lastVersionCheckAt > 600000) {
        lastVersionCheckAt = now;
        checkVersion();
      }
    }, 400);
    // ตรวจเวอร์ชั่นครั้งแรกหลังเข้าเกม 5 วิ
    setTimeout(checkVersion, 5000);
    setTimeout(loadItemDB, 2000);   // โหลด item DB หลังเข้าเกม 2s
  }
  if (document.body) startUI();
  else document.addEventListener('DOMContentLoaded', startUI, { once: true });

  log('✅ ติดตั้งแล้ว — เล่นเกมตามปกติ ระบบจะเก็บของและใช้ยาให้เอง');
  log('   พิมพ์ ASSIST.help() เพื่อดูคำสั่งทั้งหมด, ASSIST.status() เพื่อดูสถานะ');
})();
