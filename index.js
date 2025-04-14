import 'dotenv/config';

import { PLATFORMS } from './constants.js';

const { platform, uploadScript = false } = process.env;

if (platform === PLATFORMS.PIXIESET) {
    import('./controllers/pixie-set/index.js')
    .then(() => {
        console.log('Pixieset Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
}
