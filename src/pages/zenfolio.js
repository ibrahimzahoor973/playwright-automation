import 'dotenv/config';
import chrome from 'puppeteer-extra';
import os from 'os';

import {
  sleep,
  parseProxyUrl,
  sendNotificationOnSlack,
  navigateWithRetry,
  loginToZenFolio
} from '../helpers/common.js';

import { UpdateScript } from '../../db-services/script.js';

import GetAlbumsAndPhotos from '../helpers/zenfolio.js';
import DownloadZenFolioPhotos from '../download-services/download-zenfolio-photos.js';

(async () => {
  console.log('IN ZEN-FOLIO MODULE');

  const {
    userEmail,
    userPassword,
    proxy: proxyUrl,
    platform,
    downloadPhotos,
    scriptPath
  } = process.env;

  const proxyObject = proxyUrl ? parseProxyUrl(proxyUrl) : null;
  console.log({ proxyObject });

  let browser = null;
  try {
    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${userEmail}`;
    
    console.log('Home Directory:', os.homedir());
    console.log({ folderPath });

    const browserOpts = {
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

    browser = await chrome.launch(browserOpts);
    const page = await browser.newPage();

    if (proxyObject) {
      await page.authenticate({
        username: proxyObject.username,
        password: proxyObject.password
      });
      console.log('Proxy Authenticated!');
    }

    await navigateWithRetry(page, 'https://app.zenfolio.com');

    if (page.url().includes('/welcome')) {
      await loginToZenFolio({
        page,
        email: userEmail,
        password: userPassword
      });
    }

    const baseUrl = new URL(page.url()).origin;
    console.log({ baseUrl });

    await navigateWithRetry(page, baseUrl);
    console.log('Current URL:', page.url());

    let authorizationToken = null;
    await page.setRequestInterception(true);

    page.on('request', async (req) => {
      if (req.url().includes('zenfolio.com')) {
        const headers = req.headers();
        if (headers.authorization) authorizationToken = headers.authorization;
      }
      await req.continue();
    });

    while (!authorizationToken) {
      await sleep(10);
      await page.reload();
    }

    console.log('Token found:', { authorizationToken });

    if (!downloadPhotos) {
      await GetAlbumsAndPhotos({
        page,
        userEmail,
        platform,
        baseUrl,
        authorizationToken
       });
    }

    await DownloadZenFolioPhotos({
      authorizationToken,
      userEmail,
      platform
    });

    await browser.close();

    await UpdateScript({
      filterParams: {
        userEmail,
        platform,
        scriptPath
      },
      updateParams: {
        running: false,
        completed: true
      }
    });

    process.exit();
  } catch (error) {
    console.error('Error:', error);

    await UpdateScript({
      filterParams: { userEmail, platform, scriptPath },
      updateParams: {
        running: false,
        errorMessage: error?.message || 'Unknown Error'
      }
    });

    await sendNotificationOnSlack({
      task: 'ZenFolio Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Executed');
    if (browser) await browser.close();
  }
})();
