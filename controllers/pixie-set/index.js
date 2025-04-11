import 'dotenv/config';
import { connect } from 'puppeteer-real-browser';
import pkg from 'lodash';

import { AxiosBaseUrl } from '../../config/axios.js';

import { ENDPOINTS } from '../../constants.js';

const axios = AxiosBaseUrl();

import GetClientsGallery from '../../helpers/pixieset.js';
import {
  sleep,
  getCookies,
  parseProxyUrl,
  sendNotificationOnSlack,
  pixiesetLoginMethod,
  navigateWithRetry,
  navigateWithEvaluate
} from '../../src/helpers/common.js';

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

const performLogin = async (connectConfig) => {
  const { browser, page } = await connect(connectConfig);
  await page.setViewport({ width: 1920, height: 1080 });
  await navigateWithRetry(page, 'https://accounts.pixieset.com/login');
  await sleep(10);

  await pixiesetLoginMethod({
    page,
    email: userEmail,
    password: userPassword
  });
  await sleep(20);

  await navigateWithEvaluate(page, 'https://galleries.pixieset.com/collections');

  await sleep(10);

  const cookies = await page.cookies();
  const filteredCookies = getCookies({ cookies });

  await axios.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    email: userEmail,
    platform,
    authorization: filteredCookies
  });

  return {
    browser,
    page,
    filteredCookies
  };
};

const startGalleryFetch = async (page, filteredCookies, connectConfig) => {
  try {
    await GetClientsGallery({
      page,
      filteredCookies,
      userEmail
    });
  } catch (err) {
    if (err.message === 'UnauthorizedCookies') {
      console.log('Re-authenticating due to cookie expiration...');
      const {
        browser: newBrowser,
        page: newPage,
        filteredCookies: newCookies
      } = await performLogin(connectConfig);

      await GetClientsGallery({
        page: newPage,
        filteredCookies: newCookies,
        userEmail
      });
      await newBrowser.close();
    } else {
      throw err;
    }
  }
};


(async () => {
  let browser, page, filteredCookies;
  try {
    let account;
    try {
      const res = await axios.post(ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
        email: userEmail,
        platform,
        uploadScriptAccount: false
      });
      account = res.data.account;
    } catch (err) {
      console.log('No account found in DB, login required');
    }

    const connectConfig = {
      userDataDir: 'F:/puppeteer-data',
      headless: false,
      args: [
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
    };

    if (proxyUrl) {
      const proxyObject = parseProxyUrl(proxyUrl);
      extend(connectConfig, { proxy: proxyObject });
      console.log(proxyObject);
    }

    console.log({ account });

    if (!account?.authorization) {
      console.log('Authorization not found. Starting login process...');
      ({
        browser,
        page,
        filteredCookies
      } = await performLogin(connectConfig));
    } else {
      filteredCookies = account.authorization;
      const connectResult = await connect(connectConfig);
      browser = connectResult.browser;
      page = connectResult.page;
    }

    if (!downloadPhotos) {
      await startGalleryFetch(page, filteredCookies, connectConfig);
    }

    await browser.close();
    process.exit();

  } catch (error) {
    console.error('Error:', error.message);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
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
  }
})();

