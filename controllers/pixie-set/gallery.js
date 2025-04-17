import 'dotenv/config';
import pkg from 'lodash';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

import { AxiosBaseUrl } from '../../config/axios.js';

import { ENDPOINTS, PLATFORMS } from '../../constants.js';

const axios = AxiosBaseUrl();

import { GetClientsGallery, PerformLogin } from '../../helpers/pixieset.js';
import {
  parseProxyUrl,
  retryHandler,
  sendNotificationOnSlack
} from '../../helpers/common.js';

const { extend } = pkg;

const {
  PIPELINE_EVENT,
  PROXY_SETTINGS: proxySettings,
  proxy: proxyUrl,
  NODE_ENV
} = process.env;

const {
  accountId,
  uploadAccountId,
} = JSON.parse(PIPELINE_EVENT)

console.log({
  accountId,
  uploadAccountId
});

const startGalleryFetch = async (userEmail, userPassword, browser, filteredCookies, connectConfig) => {
  try {
    await GetClientsGallery({ filteredCookies });
  } catch (err) {
    await browser.close();

    if (err.message === 'UnauthorizedCookies') {
      console.log('Re-authenticating due to cookie expiration...');
      const {
        browser: newBrowser,
        page: newPage,
        filteredCookies: newCookies
      } = await PerformLogin(userEmail, userPassword, connectConfig);

      await GetClientsGallery({ filteredCookies: newCookies });
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
      const res = await retryHandler({
        fn: axios.post,
        args: [ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
          accountId,
          platform: PLATFORMS.PIXIESET,
          uploadScriptAccount: false
        }],
        retries: 10,
        taskName: 'Get Account Info'
      });
      
      account = res.data.account;
    } catch (err) {
      console.log('Account not found or failed to fetch after retries.');
    }

    const connectConfig = {
      userDataDir: null,
      headless: NODE_ENV === 'production' ? true : false,
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

    let {
      email: userEmail,
      password: userPassword
    } = account;

    if (!account?.authorization) {
      console.log('Authorization not found. Starting login process...');
      ({
        browser,
        page,
        filteredCookies
      } = await PerformLogin(userEmail, userPassword, connectConfig));
    } else {
      filteredCookies = account.authorization;
      browser = await puppeteer.launch(connectConfig);
      page = await browser.newPage();
    }

    if (filteredCookies) {
      await startGalleryFetch(userEmail, userPassword, browser, filteredCookies, connectConfig);
    }

    await browser.close();
    process.exit();

  } catch (error) {
    console.error('Error:', error.message);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIXIESET,
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

