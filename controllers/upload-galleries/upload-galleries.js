import 'dotenv/config';

import { AxiosBaseUrl } from '../../config/axios.js';

import { sleep, sendNotificationOnSlack } from '../../src/helpers/common.js';

import { ENDPOINTS } from '../../constants.js';

import CreateGalleriesInUserAccount from '../../helpers/upload-helpers.js';

const axios = AxiosBaseUrl();

(async () => {

  console.log('IN UPLOAD-GALLERIES');

  const {
    csToolEmail,
    csToolPassword,
    userEmail,
    proxy: proxyUrl,
    platform
  } = process.env;

  console.log({
    csToolEmail,
    csToolPassword,
    userEmail,
    platform
  })


  let browser;
  try {
    await CreateGalleriesInUserAccount({
      userEmail,
      platform
    });

    await sleep(10);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
      filterParams: {
        userEmail,
        platform,
        uploadScriptRun: true
      },
      updateParams: {
        running: false,
        completed: true
      }
    });

    process.exit();
  } catch (error) {
    console.log({ error });

    await sendNotificationOnSlack({
      task: 'Upload Galleries Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Called:');
    if (browser) await browser.close();
  }
})();
