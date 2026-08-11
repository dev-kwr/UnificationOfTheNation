// ============================================
// Unification of the Nation - 寄り道ステージの共通部品
// ============================================
// 小判蔵(bonusStage)と修行道場(trainingStage)は Stage 互換の別クラスだが、
// 「獲得の集約」「浮き文字」「刻限の消化」「固定画面の左端クランプ」は
// 一字一句同じ実装が両方に置かれていた。片方だけ直すと必ず食い違うので、
// ここへ集約する。どちらのクラスからも呼べるよう、第1引数に stage を取る。

// 連続獲得をまとめる時間(秒)。これ以内の獲得は同じ表示へ足し込み、
// 「+1 +1 +1」が重なる代わりに「+3」と育てる。
export const GAIN_MERGE_SEC = 0.35;
// 浮き文字を合流させる距離(px)。近い位置のものは1つにまとめる。
const GAIN_MERGE_DIST = 90;
// 浮き文字の寿命(秒)
export const GAIN_POP_LIFE = 0.9;

// 獲得(小判/討伐)を1か所に集約する。HUD のカウントアップが読む stage.lastGain と、
// 現場から浮く stage.gainPops を同時に更新する。
export function pushGain(stage, value, x, y) {
    if (stage.lastGain && stage.time - stage.lastGain.at < GAIN_MERGE_SEC) {
        stage.lastGain.value += value;
        stage.lastGain.at = stage.time;
    } else {
        stage.lastGain = { value, at: stage.time };
    }
    const near = stage.gainPops.find(
        (p) => p.life > GAIN_POP_LIFE * 0.6 && Math.hypot(p.x - x, p.y - y) < GAIN_MERGE_DIST
    );
    if (near) {
        near.value += value;
        near.life = GAIN_POP_LIFE;
    } else {
        stage.gainPops.push({ x, y, value, life: GAIN_POP_LIFE });
    }
}

// 浮き文字の寿命と上昇。update の先頭で呼ぶ。
export function updateGainPops(stage, deltaTime) {
    for (let i = stage.gainPops.length - 1; i >= 0; i--) {
        const p = stage.gainPops[i];
        p.life -= deltaTime;
        p.y -= deltaTime * 46;
        if (p.life <= 0) stage.gainPops.splice(i, 1);
    }
}

// 浮き文字の描画。色だけ場ごとに変える(蔵=金 / 道場=白)。
export function renderGainPops(ctx, stage, opts = {}) {
    const stroke = opts.stroke || 'rgba(12, 10, 20, 0.85)';
    const fill = opts.fill || '#e6eeff';
    const bigFill = opts.bigFill || fill;
    for (const p of stage.gainPops) {
        const t = Math.max(0, Math.min(1, p.life / GAIN_POP_LIFE));
        const scale = 1 + (1 - t) * 0.25;
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 22px "Helvetica Neue", Arial, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = stroke;
        const label = `+${p.value || 1}`;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = (p.value >= 100) ? bigFill : fill;
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }
}

// 刻限の消化。尽きたら true(＝この update はここで打ち切る)。
export function tickTimeLimit(stage, deltaTime) {
    if (stage._timeUp) return true;
    stage.timeLeft = Math.max(0, stage.timeLeft - deltaTime);
    if (stage.timeLeft <= 0) {
        stage._timeUp = true;
        return true;
    }
    return false;
}

// 固定画面の左端で止める。game 側の「戻りなし」クランプは currentStageNumber に
// 依存する(Stage5帰りだと素通りする)ため、寄り道は自前で閉じる。
export function clampToLeftEdge(player) {
    if (player.x < 0) {
        player.x = 0;
        if (player.vx < 0) player.vx = 0;
    }
}

// ============================================
// 最高記録（難易度別）
// ============================================
// 敵の体力は易0.8倍〜難1.8倍と幅があり、道場の討伐数は同じ土俵で比べられない
// (蔵も敵の妨害の強さが変わる)。記録は `${kind}_${difficultyId}` で分けて持つ。
// 実体は saveGlobal({ sideBest }) の1オブジェクト。読み書きは game 側が行い、
// ここはキーの決め方と旧データの移設だけを受け持つ。

export function sideBestKey(kind, difficultyId) {
    return `${kind}_${difficultyId || 'normal'}`;
}

// 保存済みの記録を正規化する。旧版は難易度を持たない単一値
// (sideBest.bonus / sideBest.training)だったので、「普」の記録として移設する。
// 戻り値の migrated が true なら、記録更新が無くても書き戻す必要がある。
export function normalizeSideBests(raw) {
    const bests = { ...(raw || {}) };
    let migrated = false;
    for (const kind of ['bonus', 'training']) {
        const legacy = bests[kind];
        if (typeof legacy !== 'number') continue;
        const key = sideBestKey(kind, 'normal');
        bests[key] = Math.max(Math.floor(legacy) || 0, Math.floor(bests[key]) || 0);
        delete bests[kind];
        migrated = true;
    }
    return { bests, migrated };
}

export function getSideBest(bests, kind, difficultyId) {
    const v = (bests || {})[sideBestKey(kind, difficultyId)];
    return Math.max(0, Math.floor(v) || 0);
}
