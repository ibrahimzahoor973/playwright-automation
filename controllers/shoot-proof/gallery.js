import 'dotenv/config';
import os from 'os';
import chrome from 'puppeteer-extra';


import { AxiosBaseUrl } from '../../config/axios.js';

import { ENDPOINTS } from '../../constants.js';

const axios = AxiosBaseUrl();

import { GetShootProofAlbums, PerformLogin } from '../../helpers/shoot-proof.js';
import {
  parseProxyUrl,
  retryHandler,
  navigateWithRetry,
  sendNotificationOnSlack
} from '../../helpers/common.js';

const {
  PIPELINE_EVENT,
  PROXY_SETTINGS: proxySettings,
  proxy: proxyUrl,
  NODE_ENV
} = process.env;

const {
  platform,
  accountId,
  uploadAccountId,
} = JSON.parse(PIPELINE_EVENT)

console.log({
  accountId,
  uploadAccountId
});

const startGalleryFetch = async (
  userEmail,
  userPassword,
  page,
  userAgent,
  browser,
  baseUrl,
  authorizationToken,
  connectConfig,
  proxyObject
) => {
  try {
    await GetShootProofAlbums({
      page,
      userAgent,
      baseUrl,
      userEmail,
      authorizationToken
    });
  } catch (err) {
    await browser.close();

    if (err.message === 'UnauthorizedCookies') {
      console.log('Re-authenticating due to token expiration...');
      const {
        page: newPage,
        userAgent: newUserAgent,
        browser: newBrowser,
        baseUrl: newBaseUrl,
        authorizationToken: newAuthorizationToken,
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject);

      await GetShootProofAlbums({
        page: newPage,
        userAgent: newUserAgent,
        baseUrl: newBaseUrl,
        userEmail,
        authorizationToken: newAuthorizationToken
      });
      await newBrowser.close();
    } else {
      throw err;
    }
  }
};


(async () => {
  let browser, page, userAgent, authorizationToken, baseUrl;
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
      headless: NODE_ENV === 'production' ? true : false,
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      // userDataDir: folderPath,
      args: [
        // '--headless=new',
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
        page,
        userAgent,
        browser,
        baseUrl,
        authorizationToken
      } = await PerformLogin(userEmail, userPassword, connectConfig, proxyObject));
    } else {
      authorizationToken = account.authorization;
      browser = await chrome.launch(connectConfig);

      userAgent = await browser.userAgent();

      page = await browser.newPage();

      await navigateWithRetry(page, 'https://studio.shootproof.com');

      console.log('Current Url', page.url());

      const url = page.url();
      baseUrl =  new URL(url).origin;
    
      console.log({ baseUrl });

      await page.setRequestInterception(true);

      page.on('request', (req) => {
        const headers = {
          ...req.headers(),
          authorization: `Bearer ${authorizationToken}`
        };

        req.continue({ headers });
      });

      await navigateWithRetry(page, `${baseUrl}`);
    }

    if (authorizationToken) {
      await startGalleryFetch(
        userEmail,
        userPassword,
        page,
        userAgent,
        browser,
        baseUrl,
        authorizationToken,
        connectConfig,
        proxyObject,
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
      task: 'Shootproof Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
    if (browser) await browser.close();
  }
})();

