import 'dotenv/config';
import os from 'os';
import chrome from 'puppeteer-extra';


import { AxiosBaseUrl } from '../../config/axios.js';

import { ENDPOINTS } from '../../constants.js';

const axios = AxiosBaseUrl();

import { GetZenFolioAlbums, PerformLogin } from '../../helpers/zen-folio.js';
import {
  parseProxyUrl,
  retryHandler,
  navigateWithRetry,
  sendNotificationOnSlack
} from '../../helpers/common.js';

const {
  accountId,
  uploadAccountId,
  PROXY_SETTINGS: proxySettings,
  proxy: proxyUrl,
  platform
} = process.env;

console.log({
  accountId,
  uploadAccountId
});

const startGalleryFetch = async (
  userEmail,
  userPassword,
  page,
  browser,
  baseUrl,
  authorizationToken,
  connectConfig,
  proxyObject
) => {
  try {
    await GetZenFolioAlbums({
      page,
      baseUrl,
      authorizationToken
    });
  } catch (err) {
    await browser.close();

    if (err.message === 'UnauthorizedCookies') {
      console.log('Re-authenticating due to token expiration...');
      const {
        page: newPage,
        browser: newBrowser,
        baseUrl: newBaseUrl,
        authorizationToken: newAuthorizationToken,
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject);

      await GetZenFolioAlbums({
        page: newPage,
        baseUrl: newBaseUrl,
        authorizationToken: newAuthorizationToken
      });
      await newBrowser.close();
    } else {
      throw err;
    }
  }
};


(async () => {
  let browser, page, authorizationToken, baseUrl;
  try {
    let account;
    try {
      const res = await retryHandler({
        fn: axios.post,
        args: [ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
          accountId,
          platform,
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

    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${userEmail}`;
    // const folderPath = `${os.homedir()}/Desktop/playwright-automation/public/${userEmail}`;

    console.log('homedir:' , os.homedir())

    console.log({ folderPath });

    const connectConfig = {
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--start-maximized',
        proxyObject ? `--proxy-server=${proxyObject.host}:${proxyObject.port}` : ''
      ].filter(Boolean)
    };

    console.log({ account });

    if (!account?.authorization) {
      console.log('Authorization not found. Starting login process...');
      ({
        page,
        browser,
        baseUrl,
        authorizationToken,
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject));
    } else {
      authorizationToken = account.authorization;
      browser = await chrome.launch(connectConfig);
      page = await browser.newPage();

      await navigateWithRetry(page, 'https://app.zenfolio.com');

      console.log('Current Url', page.url());

      const url = page.url();
      baseUrl =  new URL(url).origin;
    
      console.log({ baseUrl });
    
      await navigateWithRetry(page, `${baseUrl}`);
    }

    if (authorizationToken) {
      await startGalleryFetch(
        userEmail,
        userPassword,
        page,
        browser,
        baseUrl,
        authorizationToken,
        connectConfig,
        proxyObject
      );
    }

    await browser.close();
    process.exit();

  } catch (error) {
    console.error('Error:', error.message);

    await axios.post(ENDPOINTS.SCRIPT.UPDATE_SCRIPT, {
      filterParams: {
        accountId,
        platform,
      },
      updateParams: {
        running: false,
        errorMessage: error?.message || 'Unknown Error'
      }
    });

    await sendNotificationOnSlack({
      task: 'ZenFolio Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
    if (browser) await browser.close();
  }
})();

