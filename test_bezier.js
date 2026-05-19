const fs = require('fs');

function simulate() {
    const start = {x: 0, y: 0};
    const end = {x: 100, y: 0};
    const mid = {x: 50, y: 100};
    const controlX = 2 * mid.x - (start.x + end.x) * 0.5;
    const controlY = 2 * mid.y - (start.y + end.y) * 0.5;
    console.log("Control:", controlX, controlY);
}
simulate();
