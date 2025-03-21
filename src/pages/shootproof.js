import 'dotenv/config';
import chrome from 'puppeteer-extra';
import os from 'os';

import { UpdateScript } from '../../db-services/script.js';

import { sleep, getCookies, parseProxyUrl, sendNotificationOnSlack, loginMethod, navigateWithRetry, loginToShootProof } from '../helpers/common.js';

import GetAlbumsAndPhotos from '../helpers/shootproof-helpers.js';

import DownloadShootProofPhotos from '../download-services/download-shootproof-photos.js';

(async () => {

  console.log('IN SHOOT-PROOF MODULE');

  const {
    userEmail,
    userPassword,
    proxy: proxyUrl,
    platform,
    downloadPhotos,
    scriptPath
  } = process.env;

  let proxyObject;

  if (proxyUrl) {
    proxyObject = parseProxyUrl(proxyUrl);
  }

  console.log({proxyObject})

  let browser;
  try {
    const rootDirectory = process.cwd();
    const folderPath = `${rootDirectory}/public/sessions/${platform}/${userEmail}`;
    // const folderPath = `${os.homedir()}/Desktop/playwright-automation/public/${userEmail}`;

    console.log('homedir:' , os.homedir())

    console.log({ folderPath });

      const browserOpts = {
        headless: false,
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
    
      const browser = await chrome.launch(browserOpts);
    
      const page = await browser.newPage();
      let authorizationToken;

      if (proxyObject) {
      await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
      console.log('Proxy Authenticated!');
      }

      await navigateWithRetry(page, 'https://studio.shootproof.com');

      if (page.url().includes('/login')) {

        await loginToShootProof({
          page,
          email: userEmail,
          password: userPassword
        });
      }

      const url = page.url();
      const baseUrl =  new URL(url).origin;

      console.log({ baseUrl });

      await navigateWithRetry(page, `${baseUrl}`);

      console.log('Current Url', page.url());

      await page.setRequestInterception(true);

      const requestHandler = async (req) => {
        if (req.url().includes('shootproof.com')) {
          const headers = req.headers();
      
          if (headers.authorization) {
            authorizationToken = headers.authorization;
          }
        }
      
        await req.continue();
      };

      page.on('request', requestHandler);

      while (!authorizationToken) {
        await sleep(10);
        await page.reload();
      }
      
      console.log('Token found:', {
        authorizationToken
      });

      if (!downloadPhotos) {
        await GetAlbumsAndPhotos({
          page,
          userEmail,
          platform,
          baseUrl,
          authorizationToken
         });
      }

      await DownloadShootProofPhotos({
        page,
        authorizationToken,
        userEmail,
        platform
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
  } catch (error) {
    console.log({ error });
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
      task: 'Shoot Proof Automation',
      errorMessage: error?.message || 'Unknown Reason'
    });
  } finally {
    console.log('Finally Block Called:');
    if (browser) await browser.close();
  }
})();
