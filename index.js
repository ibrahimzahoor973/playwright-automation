import 'dotenv/config';

import { PLATFORMS, TASK_TYPES } from './constants.js';

const { platform, taskType } = process.env;

const loadModule = async (modulePath, name) => {
  try {
    await import(modulePath);
    console.log(`${name} Module Loaded`);
  } catch (err) {
    console.error(`Error loading the ${name} module:`, err);
  }
};

if (platform === PLATFORMS.PIXIESET) {
  if (taskType === TASK_TYPES.GALLERY) {
    loadModule('./controllers/pixie-set/gallery.js', 'Pixieset Gallery');
  }
} else if (platform === PLATFORMS.PIC_TIME) {
  if (taskType === TASK_TYPES.GALLERY) {
    loadModule('./controllers/pic-time/gallery.js', 'Pic-Time Gallery');
  }
} else if (platform === PLATFORMS.SHOOTPROOF) {
  if (taskType === TASK_TYPES.GALLERY) {
    loadModule('./controllers/shoot-proof/gallery.js', 'Shootproof Gallery');
  }
} else if (platform === PLATFORMS.ZENFOLIO) {
  if (taskType === TASK_TYPES.GALLERY) {
    loadModule('./controllers/zen-folio/gallery.js', 'Zenfolio Gallery');
  }
} else {
  console.error('Invalid platform or task type');
}
