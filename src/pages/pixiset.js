import 'dotenv/config';
import { connect } from 'puppeteer-real-browser';
import pkg from 'lodash';

import { UpdateScript } from '../../db-services/script.js';

import GetClients from '../helpers/pixieset-helpers.js';
import { sleep, getCookies, parseProxyUrl, sendNotificationOnSlack, pixiesetLoginMethod, navigateWithRetry, navigateWithEvaluate } from '../helpers/common.js';

import DownloadPhotos from '../download-services/download-pixieset-photos.js'

const { extend } = pkg;

const {
  userEmail,
  userPassword,
  PROXY_SETTINGS: proxySettings,
  downloadPhotos,
  proxy: proxyUrl,
  scriptPath,
  platform
} = process.env;

console.log({
  userEmail,
  userPassword
});

(async () => {
  let browser;
  console.log({ sessionDir: `${process.cwd()}/public/sessions/${userEmail}` })

  const connectConfig = {
   userDataDir: 'F:/puppeteer-data',
    headless: false,
    args: [
      // '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process'
    ],

    customConfig: {},

    skipTarget: [],

    fingerprint: true,

    turnstile: true,

    connectOption: {}
  }

  if (proxyUrl) {
    const proxyObject = parseProxyUrl(proxyUrl);
    extend(connectConfig, { proxy: proxyObject });
    console.log(proxyObject);
  }

  connect(connectConfig)
    .then(async (response) => {
      const { browser: webBrowser, page } = response;

      browser = webBrowser;

      await page.setViewport({ width: 1920, height: 1080 });

      await navigateWithRetry(page, 'https://accounts.pixieset.com/login');
      await sleep(30);

      // await page.reload();

      if (page.url().includes('/login')) {
        await pixiesetLoginMethod({
          page,
          email: userEmail,
          password: userPassword
        });
      }

      await sleep(20);

      await navigateWithEvaluate(page, 'https://galleries.pixieset.com/collections');

      await sleep(10);

      const cookies = await page.cookies();

    //filter cookies
    const filteredCookies = getCookies({ cookies });

    // call helper method to scrape the data
    if (!downloadPhotos) {
      await GetClients({ page, filteredCookies, userEmail });
    }
    console.log('calling Download photos');
    await DownloadPhotos({
      filteredCookies,
      userEmail
    });

    await browser.close();

    await UpdateScript({
      filterParams: {
        userEmail,
        platform
      },
      updateParams: {
        running: false,
        completed: true
      }
    });
    process.exit();
    })
    .catch(async (error) => {
      console.log(error.message);
      await UpdateScript({
        filterParams: {
          userEmail,
          platform
        },
        updateParams: {
          running: false,
          errorMessage: error?.message || 'Unknown Error'
        }
      });
      await sendNotificationOnSlack({
        task: 'Pixieset Automation',
        errorMessage: error?.message || 'Unknown Reason'
      });
      if (browser) await browser.close();
    });
})();
