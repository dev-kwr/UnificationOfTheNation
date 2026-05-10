const s = window.shogun || window.game?.shogun;
if (s) {
    console.log('=== DUAL WIELD IDLE DEBUG ===');
    console.log('_subWeaponKey:', s._subWeaponKey);
    console.log('_keepSubWeaponKey:', s._keepSubWeaponKey);
    console.log('currentSubWeapon name:', s.currentSubWeapon?.name);
    console.log('_subTimer:', s._subTimer);
    console.log('_subAction:', s._subAction);
    console.log('isAttacking:', s.isAttacking);
    console.log('actor.currentSubWeapon name:', s.actor?.currentSubWeapon?.name);
    console.log('actor.subWeaponAction:', s.actor?.subWeaponAction);
    console.log('actor.subWeaponTimer:', s.actor?.subWeaponTimer);
    console.log('actor.forceSubWeaponRender:', s.actor?.forceSubWeaponRender);
    console.log('actor.characterType:', s.actor?.characterType);
} else {
    console.log('shogun not found');
}
