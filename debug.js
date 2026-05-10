const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:8080/character_preview.html');
    
    // Switch to Shogun
    await page.evaluate(() => {
        document.querySelectorAll('.pill-toggle')[1].click(); // Assuming 2nd pill is Shogun
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Cycle weapons until 'dual'
    for(let i=0; i<6; i++) {
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            const weaponBtn = Array.from(btns).find(b => b.innerText.includes('手裏剣') || b.innerText.includes('二刀流') || b.innerText.includes('鎖鎌') || b.innerText.includes('大太刀') || b.innerText.includes('火薬玉') || b.innerText.includes('大槍'));
            if(weaponBtn) weaponBtn.click();
        });
        await new Promise(r => setTimeout(r, 100));
        const isDual = await page.evaluate(() => window._previewWeapon === 'dual');
        if (isDual) break;
    }
    
    // Run debug logic
    const res = await page.evaluate(() => {
        const s = window.shogun || window.game?.shogun;
        if (!s) return 'shogun not found';
        return {
            _subWeaponKey: s._subWeaponKey,
            _keepSubWeaponKey: s._keepSubWeaponKey,
            currentSubWeaponName: s.currentSubWeapon?.name,
            _subTimer: s._subTimer,
            _subAction: s._subAction,
            isAttacking: s.isAttacking,
            actorCurrentSubWeaponName: s.actor?.currentSubWeapon?.name,
            actorSubWeaponAction: s.actor?.subWeaponAction,
            actorSubWeaponTimer: s.actor?.subWeaponTimer,
            actorForceSubWeaponRender: s.actor?.forceSubWeaponRender,
            actorCharacterType: s.actor?.characterType
        };
    });
    console.log(JSON.stringify(res, null, 2));
    await browser.close();
})();
