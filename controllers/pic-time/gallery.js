import 'dotenv/config';

import { AxiosBaseUrl } from '../../config/axios.js';

import { ENDPOINTS, PLATFORMS } from '../../constants.js';

const axios = AxiosBaseUrl();

import { PerformLogin, SaveClientGalleries } from '../../helpers/pic-time.js';

import {
  parseProxyUrl,
  retryHandler,
  sendNotificationOnSlack
} from '../../helpers/common.js';

const {
  accountId,
  uploadAccountId,
  PROXY_SETTINGS: proxySettings,
  proxy: proxyUrl
} = process.env;

const startGalleryFetch = async (userEmail, userPassword, baseUrl, filteredCookies, connectConfig, proxyObject) => {
  try {
    await SaveClientGalleries({ baseUrl, filteredCookies });
  } catch (err) {
    if (err.message === 'UnauthorizedCookies') {
      console.log('Re-authenticating due to cookie expiration...');

      const {
        baseUrl,
        browser: newBrowser,
        filteredCookies: newCookies
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject);

      await SaveClientGalleries({
        baseUrl,
        filteredCookies: newCookies
      });
      await newBrowser.close();
    } else {
      throw err;
    }
  }
};

(async () => {

  console.log({
    accountId,
    uploadAccountId
  });

  let browser, baseUrl, filteredCookies;
  try {
    let account;
    try {
      const res = await retryHandler({
        fn: axios.post,
        args: [ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
          accountId,
          platform: PLATFORMS.PIC_TIME,
          uploadScriptAccount: false
        }],
        taskName: 'Get Account Info'
      });
      
      account = res.data.account;
    } catch (err) {
      console.log('Account not found or failed to fetch after retries.');
    }

    let proxyObject;

    if (proxyUrl) {
      proxyObject = parseProxyUrl(proxyUrl);
    }

    console.log({proxyObject})

    let {
      email: userEmail,
      password: userPassword
    } = account;

    const connectConfig = {
      headless: true,
      ignoreHTTPSErrors: true,
      defaultViewport: null,
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

    if (!account?.authorization) {
      console.log('Authorization not found. Starting login process...');
      ({
        baseUrl,
        browser,
        filteredCookies,
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject, accountId));
    } else {
      filteredCookies = account.authorization;
      baseUrl = account.baseUrl;

      console.log({ baseUrl });
    }

    if (filteredCookies) {
      await startGalleryFetch(userEmail, userPassword, baseUrl, filteredCookies, connectConfig, proxyObject);
    }

    process.exit();

  } catch (error) {
    console.error('Error:', error.message);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIC_TIME,
      },
      updateParams: {
        running: false,
        errorMessage: error?.message || 'Unknown Error'
      }
    });

    await sendNotificationOnSlack({
      task: 'Pic-time Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
    if (browser) await browser.close();
  }
})();

