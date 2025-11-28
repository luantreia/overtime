import Timr from 'timrjs';

const timer = Timr(60, { countdown: true });

console.log('Initial:', timer.getFt());

timer.start();

setTimeout(() => {
    console.log('After 1s:', timer.getFt());
    timer.pause();
    console.log('Paused:', timer.getFt());
    process.exit(0);
}, 1100);
