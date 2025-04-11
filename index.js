import 'dotenv/config';
import './config/database.js';

import { PLATFORMS } from './constants.js';

const { platform, uploadScript = false } = process.env;

if (uploadScript) {
    import('./src/upload-galleries.js')
    .then(() => {
        console.log('Upload Galleries Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
} else if (platform === PLATFORMS.PIXIESET) {
    import('./controllers/pixie-set/index.js')
    .then(() => {
        console.log('Pixieset Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
} else if (platform === PLATFORMS.PIC_TIME) {
    import('./src/pages/pic-time.js')
    .then(() => {
        console.log('Pic Time Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
} else if (platform === PLATFORMS.SHOOTPROOF) {
    import('./src/pages/shootproof.js')
    .then(() => {
        console.log('Shoot Proof Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
} else if (platform === PLATFORMS.ZENFOLIO) {
    import('./src/pages/zenfolio.js')
    .then(() => {
        console.log('ZenFolio Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
}
