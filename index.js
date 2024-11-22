import 'dotenv/config';
import './config/database.js';

import { PLATFORMS } from './constants.js';

const { platform } = process.env;

if (platform === PLATFORMS.PIXIESET) {
    import('./src/pages/pixiset.js')
    .then(() => {
        console.log('Pixieset Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
} else {
    import('./src/pages/pic-time.js')
    .then(() => {
        console.log('Pic Time Module Loaded');
    })
    .catch(err => {
        console.error('Error loading the module:', err);
    });
}
