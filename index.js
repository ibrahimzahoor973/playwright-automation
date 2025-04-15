import 'dotenv/config';

import { PLATFORMS, TASK_TYPES } from './constants.js';

const { platform, taskType } = process.env;

if (platform === PLATFORMS.PIXIESET) {
    if(taskType === TASK_TYPES.GALLERY) {
        import('./controllers/pixie-set/gallery.js')
        .then(() => {
            console.log('Pixieset Module Loaded');
        })
        .catch(err => {
            console.error('Error loading the pixie-set module:', err);
        });
    }
}
