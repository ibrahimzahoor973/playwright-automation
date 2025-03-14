import 'dotenv/config';
import chrome from 'puppeteer-extra';
import os from 'os';
import '../config/database.js';

import { UpdateScript } from '../db-services/script.js';

import { sleep, getCookies, parseProxyUrl, sendNotificationOnSlack, loginCsTool, navigateWithRetry } from './helpers/common.js';

import CreateGalleriesInUserAccount from './helpers/upload-helpers.js';

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

  let proxyObject;

  if (proxyUrl) {
    proxyObject = parseProxyUrl(proxyUrl);
  }

  console.log({ proxyObject })

  let browser;
  try {
    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${csToolEmail}`;
    // const folderPath = `${os.homedir()}/Desktop/playwright-automation/public/${userEmail}`;

    console.log('homedir:', os.homedir())

    console.log({ folderPath });
    const browserOpts = {
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

    const browser = await chrome.launch(browserOpts);

    const page = await browser.newPage();

    if (proxyObject) {
      await page.authenticate({ username: proxyObject.username, password: proxyObject.password });
      console.log('Proxy Authenticated!');
    }

    await navigateWithRetry(page, 'https://cstool.passgallery.com/!customersupport');

    if (page.url().includes('/login')) {

      await loginCsTool({
        page,
        email: csToolEmail,
        password: csToolPassword
      });
    }

    const url = page.url();
    const baseUrl = new URL(url).origin;

    console.log({ baseUrl });

    await navigateWithRetry(page, `https://cstool.passgallery.com/!customersupport`);

    console.log('Current Url', page.url());

    const cookies = await page.cookies();

    const filteredCookies = getCookies({ cookies });

    await CreateGalleriesInUserAccount({
      filteredCookies,
      userEmail,
      platform
    });

    await browser.close();

    await sleep(10);

    await UpdateScript({
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
