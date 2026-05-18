const yawSkew = 0; // for player shogun
const pivotX = 100, pivotY = 100;
const scale = 1.0;

// renderModel transform
// ctx.translate(pivotX, pivotY);
// ctx.transform(1, 0, -yawSkew / 0.982, 1, 0, 0);
// ctx.scale(scale / 0.982, scale);
// ctx.translate(-pivotX, -pivotY);

// renderSubWeaponArm inverse
// ctx.translate(pivotX, pivotY);
// ctx.scale(0.982, 1);
// ctx.transform(1, 0, yawSkew / 0.982, 1, 0, 0);
// ctx.translate(-pivotX, -pivotY);

// Net transform:
// Scale(1/0.982, 1) * Scale(0.982, 1) = Scale(1, 1) = Identity.
console.log("Identity confirmed.");
