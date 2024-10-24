import 'dotenv/config';
import fs from 'fs';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import GetClients, { sleep, getCookies } from '../helpers.js';
import DownloadPhotos from '../download-photos.js';

chromium.use(stealth());

const {
  EMAIL: userEmail,
  PASSWORD: userPassword,
  PROXY_SETTINGS: proxySettings,
  downloadPhotos
} = process.env;


(async () => {
  let browser;
  let context;
  try {
    // launch the browser in non-headless mode
    console.log({
      userEmail,
      proxySettings,
      downloadPhotos
    })
    const {
      ip,
      port,
      userName,
      password
    } = JSON.parse(proxySettings);

    const browserOpts = {
      headless: true,
      proxy: {
        server: `https://${ip}:${port}`,
        username: userName,
        password,
      },
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--start-maximized',
        `--proxy-server=${ip}:${port}`
      ]
    };
    browser = await chromium.launch(browserOpts);

    const context = await browser.newContext();

    //create a new page
    // const page = await context.newPage();

    // go to the pixieset login page
    // await page.goto('https://accounts.pixieset.com/login/', { waitUntil: 'networkidle' });

    await sleep(10);

    // Load cookies from the JSON file
    const sessionCookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));

    // Set the cookies in the context
    await context.addCookies(sessionCookies);
  
    const page = await context.newPage();
  
    // Go to the collections page
    await page.goto('https://galleries.pixieset.com/collections', { waitUntil: 'networkidle' });
  
  
    // After logging in, save cookies
    // const cookies = await context.cookies();
    // await fs.writeFile('cookies.json', JSON.stringify(cookies, null, 2));
  
    // Save local storage
    
    // console.log('Cookies and local storage saved.');

    // console.log('Logged In!');


    //select email & password selectors from the page
    // const email = await page.waitForSelector('#UserLogin_username');
    // const passwordSelector = await page.waitForSelector('#UserLogin_password');

    // // enter email & password
    // await email.type(userEmail, { delay: 300 });

    // await sleep(10);

    // await passwordSelector.type(userPassword, { delay: 400 });

    // // click on login button
    // const loginButton = await page.waitForSelector('#login-button');
    // // await loginButton.hover();
    // // await page.mouse.move(10, 10);
    // // await page.waitForTimeout(1000 + Math.floor(Math.random() * 2000));

    // await loginButton.click();

    await sleep(20);

    console.log('Logged In!');

    // go to collections page
    // await page.goto('https://galleries.pixieset.com/collections');

    // get cookies to authenticate requests
    const cookies = await context.cookies();

    //filter cookies
    const filteredCookies = getCookies({ cookies });

    // call helper method to scrape the data
    if (!downloadPhotos) {
      await GetClients({ page, filteredCookies });
    }
    console.log('calling Download photos');
    await DownloadPhotos({
      filteredCookies
    });
  } catch (err) {
    console.log('An Unexpected Error occurred', err);
  } finally {
    if (browser) await browser.close();
    return;
  }
})();



