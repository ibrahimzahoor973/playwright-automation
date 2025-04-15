import 'dotenv/config';
import chrome from 'puppeteer-extra';
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
} from '../../helpers/common.js';

const { extend } = pkg;

const {
  userEmail,
  userPassword,
  userAccountId,
  PROXY_SETTINGS: proxySettings,
  downloadPhotos,
  proxy: proxyUrl,
  scriptPath,
  platform
} = process.env;

console.log({
  userEmail,
  userPassword,
  userAccountId,
});

const performLogin = async (connectConfig, accountId) => {
  const browser = await chrome.launch(connectConfig);    
  const page = await browser.newPage();

  if (proxyObject) {
    await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
    console.log('Proxy Authenticated!');
  }
  
  await navigateWithRetry(page, 'https://us.pic-time.com/professional#dash');

  if (page.url().includes('/login')) {
    await loginMethod({
      page,
      email: userEmail,
      password: userPassword
    });
  }

  await navigateWithEvaluate(page, 'https://galleries.pixieset.com/collections');

  const url = page.url();
  const baseUrl =  new URL(url).origin;

  console.log({ baseUrl });

  await navigateWithRetry(page, `${baseUrl}/professional#dash`);

  console.log('Current Url', page.url());

  const cookies = await page.cookies();

  const filteredCookies = getCookies({ cookies });

  await axios.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    accountId,
    platform,
    authorization: filteredCookies
  });

  return {
    baseUrl,
    filteredCookies
  };
};

const startGalleryFetch = async (accountId, filteredCookies, connectConfig) => {
  try {
    await GetClientsGallery({
      accountId,
      filteredCookies
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
        accountId,
        filteredCookies: newCookies
      });
      await newBrowser.close();
    } else {
      throw err;
    }
  }
};


(async () => {
    console.log('IN PIC-TIME MODULE');

  let browser, page, filteredCookies, accountId, baseUrl;
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
      headless: true,
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      // userDataDir: folderPath,
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--start-maximized',
        `${proxyObject ? `--proxy-server=${proxyObject.host}:${proxyObject.port}` : ''}`
      ]
    };

    console.log({ account });

    accountId = account?._id;

    if (!account?.authorization) {
      console.log('Authorization not found. Starting login process...');
      ({
        baseUrl,
        filteredCookies
      } = await performLogin(connectConfig, accountId));
    } else {
      filteredCookies = account.authorization;
      const connectResult = await connect(connectConfig);
      browser = connectResult.browser;
      page = connectResult.page;
    }

    if (!downloadPhotos) {
      await startGalleryFetch(accountId, filteredCookies, connectConfig);
    }

    await browser.close();
    process.exit();

  } catch (error) {
    console.error('Error:', error.message);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
      filterParams: {
        accountId,
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

