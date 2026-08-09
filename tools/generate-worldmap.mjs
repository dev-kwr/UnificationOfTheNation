// ============================================
// 全体マップ画像を GPT-images(gpt-image-1) で生成して images/world_map.png へ保存する。
//
// 使い方:
//   OPENAI_API_KEY=sk-... node tools/generate-worldmap.mjs
//
// プロンプトは map_generation_prompt.md と同文。構図を変えたいときは
// まず md を直し、この PROMPT にも同じ変更を反映すること(md が正本)。
// 生成後、ノード位置が絵とずれていたら js/stageSelect.js の WORLD_MAP_NODES
// の u,v を微調整する。
// ============================================
import { writeFile } from 'node:fs/promises';

const key = process.env.OPENAI_API_KEY;
if (!key) {
    console.error('[worldmap] OPENAI_API_KEY を設定してください（OpenAI の課金アカウントが必要）');
    process.exit(1);
}

const PROMPT = `和風ゲームのステージセレクト用「全体マップ」を1枚。横長 1536x1024。
夜の日本を描いた絵巻風の古地図。和紙の質感、墨の輪郭線、藍色基調に金のアクセント、落ち着いた水彩。

【最重要・道の描き方】
道は「一本の街道」だけ。左下から右上まで途切れず一本でつながり、S字に蛇行しながら
次の順に通る: (1)月明かりの竹林 → (2)茅葺き屋根の宿場町 → (3)杉と滝の峠道 → (4)城下町。
本道以外の道路は描かない。道同士の交差・環状路・並行する別の道・網目状の小道は禁止。
例外は短い「行き止まりの脇道」を2本だけ:
(a) 宿場町と峠の間から下へ折れ、小さな小判蔵と鳥居で終わる脇道
(b) 峠から上へ折れ、滝のそばの道場で終わる脇道

【最重要・城下町と城の関係】
画面右側は「城郭都市」として一体に描く: 瓦屋根の城下町の家並みの奥(上)に石垣と城門があり、
城門のすぐ上の丘に天守閣がそびえ、天守の背後に大きな満月。
城下町・城門・天守は互いに離さず、町の中に城がある構図にする。
街道は城下町に入り、町並みを抜けて城門へ、門の先の短い坂で天守へと自然に続く。

文字・ラベル・枠・UIは一切描かない。画面の上下15%は空や霞だけにして重要な要素を置かない。
ゲームUIを上に重ねるため、全体のコントラストは控えめに。`;

console.log('[worldmap] gpt-image-1 で生成中…（数十秒かかります）');
const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: PROMPT, size: '1536x1024', quality: 'high' })
});
if (!res.ok) {
    console.error('[worldmap] 生成失敗:', res.status, await res.text());
    process.exit(1);
}
const data = await res.json();
const b64 = data.data?.[0]?.b64_json;
if (!b64) {
    console.error('[worldmap] 画像データが返りませんでした:', JSON.stringify(data).slice(0, 400));
    process.exit(1);
}
const out = new URL('../images/world_map.png', import.meta.url);
await writeFile(out, Buffer.from(b64, 'base64'));
console.log('[worldmap] images/world_map.png を書き出しました。ゲームを再読み込みすると反映されます。');
